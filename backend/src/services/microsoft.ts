/**
 * Phase 4: Microsoft Graph API Integration
 * Handles Outlook Calendar sync and Microsoft 365 integration
 */

import { v4 as uuidv4 } from 'uuid';
import axios, { AxiosInstance } from 'axios';
import { pool } from '../utils/database';
import { triggerWebhook } from './webhooks';

// Microsoft Graph API endpoints
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
const OAUTH_AUTHORIZE_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const OAUTH_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

// Required scopes for calendar access
const CALENDAR_SCOPES = [
  'Calendars.Read',
  'Calendars.ReadWrite',
  'User.Read'
];

interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string[];
}

interface CalendarEvent {
  id: string;
  externalId: string;
  provider: 'microsoft';
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  location: string | null;
  attendees: Array<{ email: string; name?: string; status?: string }>;
  isOnline: boolean;
  onlineMeetingUrl: string | null;
  organizer: { email: string; name?: string } | null;
  status: 'confirmed' | 'tentative' | 'cancelled';
}

/**
 * Create axios instance with auth headers
 */
function createGraphClient(accessToken: string): AxiosInstance {
  return axios.create({
    baseURL: GRAPH_API_BASE,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Generate OAuth authorization URL
 */
export function getAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: CALENDAR_SCOPES.join(' '),
    state
  });

  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<OAuthTokens> {
  const response = await axios.post(OAUTH_TOKEN_URL, new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const { access_token, refresh_token, expires_in, scope } = response.data;

  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: new Date(Date.now() + expires_in * 1000),
    scopes: scope.split(' ')
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<OAuthTokens> {
  const response = await axios.post(OAUTH_TOKEN_URL, new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const { access_token, refresh_token: new_refresh_token, expires_in, scope } = response.data;

  return {
    accessToken: access_token,
    refreshToken: new_refresh_token || refreshToken,
    expiresAt: new Date(Date.now() + expires_in * 1000),
    scopes: scope.split(' ')
  };
}

/**
 * Store OAuth tokens in database
 */
export async function storeTokens(
  tokens: OAuthTokens,
  userId: string,
  metadata: Record<string, any> = {}
): Promise<string> {
  const id = uuidv4();

  // Remove old tokens for this user/provider
  await pool.query(
    `DELETE FROM oauth_tokens WHERE provider = 'microsoft' AND user_id = $1`,
    [userId]
  );

  await pool.query(
    `INSERT INTO oauth_tokens (id, provider, access_token, refresh_token, expires_at, scopes, user_id, metadata)
     VALUES ($1, 'microsoft', $2, $3, $4, $5, $6, $7)`,
    [id, tokens.accessToken, tokens.refreshToken, tokens.expiresAt, JSON.stringify(tokens.scopes), userId, metadata]
  );

  return id;
}

/**
 * Get valid access token (refresh if needed)
 */
export async function getValidAccessToken(
  clientId: string,
  clientSecret: string,
  userId: string = 'default'
): Promise<string | null> {
  const result = await pool.query(
    `SELECT id, access_token, refresh_token, expires_at
     FROM oauth_tokens
     WHERE provider = 'microsoft' AND user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const token = result.rows[0];

  // Check if token is expired or about to expire (5 min buffer)
  if (new Date(token.expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
    if (!token.refresh_token) {
      return null; // Can't refresh
    }

    try {
      const newTokens = await refreshAccessToken(token.refresh_token, clientId, clientSecret);

      // Update stored tokens
      await pool.query(
        `UPDATE oauth_tokens
         SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW()
         WHERE id = $4`,
        [newTokens.accessToken, newTokens.refreshToken, newTokens.expiresAt, token.id]
      );

      return newTokens.accessToken;
    } catch (error) {
      console.error('Failed to refresh Microsoft token:', error);
      return null;
    }
  }

  return token.access_token;
}

/**
 * Get user profile from Microsoft Graph
 */
export async function getUserProfile(accessToken: string): Promise<{
  id: string;
  displayName: string;
  email: string;
}> {
  const client = createGraphClient(accessToken);
  const response = await client.get('/me');

  return {
    id: response.data.id,
    displayName: response.data.displayName,
    email: response.data.mail || response.data.userPrincipalName
  };
}

/**
 * Fetch calendar events from Microsoft Graph
 */
export async function fetchCalendarEvents(
  accessToken: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    maxResults?: number;
  } = {}
): Promise<CalendarEvent[]> {
  const client = createGraphClient(accessToken);

  const startDate = options.startDate || new Date();
  const endDate = options.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days ahead

  const params = new URLSearchParams({
    startDateTime: startDate.toISOString(),
    endDateTime: endDate.toISOString(),
    $top: String(options.maxResults || 100),
    $orderby: 'start/dateTime',
    $select: 'id,subject,body,start,end,location,attendees,isOnlineMeeting,onlineMeetingUrl,organizer,showAs'
  });

  const response = await client.get(`/me/calendar/calendarView?${params.toString()}`);

  return response.data.value.map((event: any) => ({
    id: uuidv4(),
    externalId: event.id,
    provider: 'microsoft' as const,
    title: event.subject || 'Untitled Event',
    description: event.body?.content || null,
    startTime: new Date(event.start.dateTime + 'Z'),
    endTime: new Date(event.end.dateTime + 'Z'),
    location: event.location?.displayName || null,
    attendees: (event.attendees || []).map((a: any) => ({
      email: a.emailAddress?.address,
      name: a.emailAddress?.name,
      status: a.status?.response
    })),
    isOnline: event.isOnlineMeeting || false,
    onlineMeetingUrl: event.onlineMeetingUrl || null,
    organizer: event.organizer?.emailAddress ? {
      email: event.organizer.emailAddress.address,
      name: event.organizer.emailAddress.name
    } : null,
    status: event.showAs === 'tentative' ? 'tentative' : 'confirmed'
  }));
}

/**
 * Sync calendar events to database
 */
export async function syncCalendarEvents(
  accessToken: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    createMeetings?: boolean;
  } = {}
): Promise<{
  synced: number;
  created: number;
  updated: number;
  meetingsCreated: number;
}> {
  const events = await fetchCalendarEvents(accessToken, options);

  let created = 0;
  let updated = 0;
  let meetingsCreated = 0;

  for (const event of events) {
    // Check if event already exists
    const existing = await pool.query(
      `SELECT id, linked_meeting_id FROM calendar_events
       WHERE external_id = $1 AND provider = 'microsoft'`,
      [event.externalId]
    );

    if (existing.rows.length > 0) {
      // Update existing event
      await pool.query(
        `UPDATE calendar_events
         SET title = $1, description = $2, start_time = $3, end_time = $4,
             location = $5, attendees = $6, is_online = $7, online_meeting_url = $8,
             organizer = $9, status = $10, synced_at = NOW(), updated_at = NOW()
         WHERE external_id = $11 AND provider = 'microsoft'`,
        [
          event.title, event.description, event.startTime, event.endTime,
          event.location, JSON.stringify(event.attendees), event.isOnline,
          event.onlineMeetingUrl, JSON.stringify(event.organizer), event.status,
          event.externalId
        ]
      );
      updated++;
    } else {
      // Insert new event
      let linkedMeetingId = null;

      // Optionally create a meeting entry
      if (options.createMeetings) {
        const meetingId = uuidv4();
        await pool.query(
          `INSERT INTO meetings (id, title, date, duration_minutes, participants, location, meeting_type, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled')`,
          [
            meetingId,
            event.title,
            event.startTime,
            Math.round((event.endTime.getTime() - event.startTime.getTime()) / 60000),
            JSON.stringify(event.attendees.map(a => a.name || a.email)),
            event.location || (event.isOnline ? 'Online' : null),
            event.attendees.length <= 2 ? 'one_on_one' : 'team'
          ]
        );
        linkedMeetingId = meetingId;
        meetingsCreated++;
      }

      await pool.query(
        `INSERT INTO calendar_events
         (id, external_id, provider, title, description, start_time, end_time,
          location, attendees, is_online, online_meeting_url, organizer, status, linked_meeting_id, raw_data)
         VALUES ($1, $2, 'microsoft', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          event.id, event.externalId, event.title, event.description,
          event.startTime, event.endTime, event.location,
          JSON.stringify(event.attendees), event.isOnline, event.onlineMeetingUrl,
          JSON.stringify(event.organizer), event.status, linkedMeetingId, null
        ]
      );
      created++;
    }
  }

  // Update integration status
  await pool.query(
    `UPDATE integrations
     SET last_sync_at = NOW(), sync_status = 'success', error_message = NULL
     WHERE provider = 'microsoft'`
  );

  // Trigger webhook
  await triggerWebhook('calendar.synced', {
    provider: 'microsoft',
    synced: events.length,
    created,
    updated,
    meetingsCreated
  });

  return { synced: events.length, created, updated, meetingsCreated };
}

/**
 * Get upcoming events from synced calendar
 */
export async function getUpcomingEvents(
  hours: number = 24,
  limit: number = 10
): Promise<CalendarEvent[]> {
  const result = await pool.query(
    `SELECT id, external_id, provider, title, description, start_time, end_time,
            location, attendees, is_online, online_meeting_url, organizer, status
     FROM calendar_events
     WHERE start_time BETWEEN NOW() AND NOW() + INTERVAL '${hours} hours'
     AND status != 'cancelled'
     ORDER BY start_time ASC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map(row => ({
    id: row.id,
    externalId: row.external_id,
    provider: row.provider,
    title: row.title,
    description: row.description,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    attendees: row.attendees || [],
    isOnline: row.is_online,
    onlineMeetingUrl: row.online_meeting_url,
    organizer: row.organizer,
    status: row.status
  }));
}

/**
 * Create a calendar event in Microsoft Graph
 */
export async function createCalendarEvent(
  accessToken: string,
  event: {
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    location?: string;
    attendees?: string[];
    isOnline?: boolean;
  }
): Promise<string> {
  const client = createGraphClient(accessToken);

  const eventData = {
    subject: event.title,
    body: event.description ? {
      contentType: 'Text',
      content: event.description
    } : undefined,
    start: {
      dateTime: event.startTime.toISOString().replace('Z', ''),
      timeZone: 'UTC'
    },
    end: {
      dateTime: event.endTime.toISOString().replace('Z', ''),
      timeZone: 'UTC'
    },
    location: event.location ? {
      displayName: event.location
    } : undefined,
    attendees: event.attendees?.map(email => ({
      emailAddress: { address: email },
      type: 'required'
    })),
    isOnlineMeeting: event.isOnline
  };

  const response = await client.post('/me/events', eventData);

  return response.data.id;
}

/**
 * Delete Microsoft integration
 */
export async function disconnectMicrosoft(userId: string = 'default'): Promise<void> {
  await pool.query(
    `DELETE FROM oauth_tokens WHERE provider = 'microsoft' AND user_id = $1`,
    [userId]
  );

  await pool.query(
    `UPDATE integrations SET is_enabled = false, sync_status = 'idle' WHERE provider = 'microsoft'`
  );
}

/**
 * Check if Microsoft is connected
 */
export async function isMicrosoftConnected(userId: string = 'default'): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM oauth_tokens WHERE provider = 'microsoft' AND user_id = $1`,
    [userId]
  );
  return result.rows.length > 0;
}
