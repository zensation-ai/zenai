/**
 * CalDAV Sync Service - Phase 40
 *
 * Bidirectional calendar sync between ZenAI and CalDAV servers (iCloud, etc.)
 * Supports incremental sync via sync tokens and periodic polling.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../utils/database-context';
import { encrypt, decrypt } from '../utils/encryption';
import { logger } from '../utils/logger';
import {
  fetchCalendarEvents,
  fetchChangedEvents,
  createRemoteEvent,
  updateRemoteEvent,
  deleteRemoteEvent,
  eventToICal,
  parseICal,
  type CalDAVCredentials,
  type CalDAVEventData,
} from './caldav-connector';

// ============================================================
// Types
// ============================================================

export interface CalendarAccount {
  id: string;
  provider: string;
  username: string;
  password_encrypted: string;
  display_name: string | null;
  caldav_url: string;
  calendars: CalendarAccountCalendar[];
  is_enabled: boolean;
  sync_interval_minutes: number;
  last_sync_at: string | null;
  last_sync_error: string | null;
  sync_token: string | null;
  context: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CalendarAccountCalendar {
  url: string;
  displayName: string;
  enabled: boolean;
  color?: string;
}

interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: number;
  syncToken?: string;
}

// ============================================================
// Account CRUD
// ============================================================

export async function createCalendarAccount(
  context: AIContext,
  input: {
    provider: string;
    username: string;
    password: string;
    display_name?: string;
    caldav_url?: string;
    calendars?: CalendarAccountCalendar[];
  }
): Promise<CalendarAccount> {
  const id = uuidv4();
  const passwordEncrypted = encrypt(input.password);

  const result = await queryContext(context, `
    INSERT INTO calendar_accounts (
      id, provider, username, password_encrypted, display_name,
      caldav_url, calendars, context, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    RETURNING *
  `, [
    id,
    input.provider,
    input.username,
    passwordEncrypted,
    input.display_name || null,
    input.caldav_url || 'https://caldav.icloud.com',
    JSON.stringify(input.calendars || []),
    context,
  ]);

  logger.info('Calendar account created', {
    id, provider: input.provider, username: input.username, context,
    operation: 'createCalendarAccount',
  });

  return mapAccountRow(result.rows[0]);
}

export async function getCalendarAccounts(context: AIContext): Promise<CalendarAccount[]> {
  const result = await queryContext(context, `
    SELECT * FROM calendar_accounts WHERE context = $1 ORDER BY created_at ASC
  `, [context]);
  return result.rows.map(mapAccountRow);
}

export async function getCalendarAccount(
  context: AIContext,
  id: string
): Promise<CalendarAccount | null> {
  const result = await queryContext(context, `
    SELECT * FROM calendar_accounts WHERE id = $1
  `, [id]);
  return result.rows.length > 0 ? mapAccountRow(result.rows[0]) : null;
}

export async function updateCalendarAccount(
  context: AIContext,
  id: string,
  updates: {
    display_name?: string;
    caldav_url?: string;
    calendars?: CalendarAccountCalendar[];
    is_enabled?: boolean;
    sync_interval_minutes?: number;
    password?: string;
  }
): Promise<CalendarAccount | null> {
  const setClauses: string[] = [];
  const params: (string | number | boolean | null)[] = [];
  let idx = 1;

  if (updates.display_name !== undefined) {
    setClauses.push(`display_name = $${idx++}`);
    params.push(updates.display_name);
  }
  if (updates.caldav_url !== undefined) {
    setClauses.push(`caldav_url = $${idx++}`);
    params.push(updates.caldav_url);
  }
  if (updates.calendars !== undefined) {
    setClauses.push(`calendars = $${idx++}`);
    params.push(JSON.stringify(updates.calendars));
  }
  if (updates.is_enabled !== undefined) {
    setClauses.push(`is_enabled = $${idx++}`);
    params.push(updates.is_enabled);
  }
  if (updates.sync_interval_minutes !== undefined) {
    setClauses.push(`sync_interval_minutes = $${idx++}`);
    params.push(updates.sync_interval_minutes);
  }
  if (updates.password !== undefined) {
    setClauses.push(`password_encrypted = $${idx++}`);
    params.push(encrypt(updates.password));
  }

  if (setClauses.length === 0) {return null;}
  setClauses.push('updated_at = NOW()');

  const result = await queryContext(context, `
    UPDATE calendar_accounts SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *
  `, [...params, id]);

  return result.rows.length > 0 ? mapAccountRow(result.rows[0]) : null;
}

export async function deleteCalendarAccount(context: AIContext, id: string): Promise<boolean> {
  // Remove synced events from this account
  await queryContext(context, `
    DELETE FROM calendar_events WHERE calendar_account_id = $1
  `, [id]);

  const result = await queryContext(context, `
    DELETE FROM calendar_accounts WHERE id = $1 RETURNING id
  `, [id]);

  return result.rows.length > 0;
}

// ============================================================
// Sync Engine
// ============================================================

/**
 * Sync a single calendar account (all enabled calendars)
 */
export async function syncAccount(
  context: AIContext,
  accountId: string
): Promise<SyncResult> {
  const account = await getCalendarAccount(context, accountId);
  if (!account || !account.is_enabled) {
    throw new Error('Account not found or disabled');
  }

  const credentials = getCredentials(account);
  const totalResult: SyncResult = { created: 0, updated: 0, deleted: 0, errors: 0 };

  const enabledCalendars = account.calendars.filter(c => c.enabled);
  if (enabledCalendars.length === 0) {
    logger.info('No enabled calendars for account', { accountId, operation: 'syncAccount' });
    return totalResult;
  }

  for (const cal of enabledCalendars) {
    try {
      const result = await syncCalendar(context, account, credentials, cal);
      totalResult.created += result.created;
      totalResult.updated += result.updated;
      totalResult.deleted += result.deleted;
      totalResult.errors += result.errors;
      if (result.syncToken) {totalResult.syncToken = result.syncToken;}
    } catch (err) {
      totalResult.errors++;
      logger.error('Calendar sync failed', err instanceof Error ? err : undefined, {
        accountId, calendarUrl: cal.url, operation: 'syncCalendar',
      });
    }
  }

  // Update account sync status
  await queryContext(context, `
    UPDATE calendar_accounts
    SET last_sync_at = NOW(),
        last_sync_error = $1,
        sync_token = $2,
        updated_at = NOW()
    WHERE id = $3
  `, [
    totalResult.errors > 0 ? `${totalResult.errors} Fehler beim Sync` : null,
    totalResult.syncToken || account.sync_token,
    accountId,
  ]);

  logger.info('Account sync completed', {
    accountId, context, ...totalResult, operation: 'syncAccount',
  });

  return totalResult;
}

/**
 * Sync a single calendar within an account
 */
async function syncCalendar(
  context: AIContext,
  account: CalendarAccount,
  credentials: CalDAVCredentials,
  cal: CalendarAccountCalendar
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, deleted: 0, errors: 0 };

  // 1. Pull remote events
  let remoteEvents: CalDAVEventData[];
  let newSyncToken: string | undefined;

  try {
    if (account.sync_token) {
      const syncResult = await fetchChangedEvents(credentials, cal.url, account.sync_token);
      remoteEvents = syncResult.events;
      newSyncToken = syncResult.newSyncToken;
    } else {
      // Initial full sync - fetch last 6 months + next 12 months
      const start = new Date();
      start.setMonth(start.getMonth() - 6);
      const end = new Date();
      end.setMonth(end.getMonth() + 12);

      remoteEvents = await fetchCalendarEvents(credentials, cal.url, {
        start: start.toISOString(),
        end: end.toISOString(),
      });
    }
  } catch (err) {
    logger.warn('Failed to fetch remote events', {
      calendarUrl: cal.url,
      error: err instanceof Error ? err.message : String(err),
    });
    result.errors++;
    return result;
  }

  result.syncToken = newSyncToken;

  // 2. Get existing local events for this account
  const localEventsResult = await queryContext(context, `
    SELECT id, external_uid, etag, sync_state, updated_at
    FROM calendar_events
    WHERE calendar_account_id = $1 AND status != 'cancelled'
  `, [account.id]);

  const localByUid = new Map<string, {
    id: string; external_uid: string; etag: string; sync_state: string; updated_at: string;
  }>();
  for (const row of localEventsResult.rows) {
    if (row.external_uid) {
      localByUid.set(row.external_uid, {
        id: row.id as string,
        external_uid: row.external_uid as string,
        etag: row.etag as string,
        sync_state: row.sync_state as string,
        updated_at: (row.updated_at as Date).toISOString?.() ?? row.updated_at as string,
      });
    }
  }

  // 3. Process each remote event
  const seenUids = new Set<string>();

  for (const remoteEvent of remoteEvents) {
    const parsed = parseICal(remoteEvent.data);
    if (!parsed) {continue;}

    seenUids.add(parsed.uid);
    const existing = localByUid.get(parsed.uid);

    if (existing) {
      // Update if etag differs
      if (existing.etag !== remoteEvent.etag) {
        try {
          await updateLocalEvent(context, existing.id, parsed, remoteEvent);
          result.updated++;
        } catch (err) {
          logger.warn('Failed to update local event', {
            eventId: existing.id, uid: parsed.uid,
            error: err instanceof Error ? err.message : String(err),
          });
          result.errors++;
        }
      }
    } else {
      // Create new local event
      try {
        await createLocalEvent(context, account.id, parsed, remoteEvent, cal.color);
        result.created++;
      } catch (err) {
        logger.warn('Failed to create local event', {
          uid: parsed.uid,
          error: err instanceof Error ? err.message : String(err),
        });
        result.errors++;
      }
    }
  }

  // 4. Push pending local events to remote (only if full sync or initial)
  if (!account.sync_token) {
    const pendingResult = await queryContext(context, `
      SELECT * FROM calendar_events
      WHERE sync_state = 'pending' AND calendar_account_id = $1
    `, [account.id]);

    for (const row of pendingResult.rows) {
      try {
        const ical = eventToICal({
          id: row.id as string,
          title: row.title as string,
          description: row.description as string | undefined,
          start_time: (row.start_time as Date).toISOString(),
          end_time: row.end_time ? (row.end_time as Date).toISOString() : undefined,
          all_day: row.all_day as boolean,
          location: row.location as string | undefined,
          status: row.status as string,
          rrule: row.rrule as string | undefined,
        });

        const createResult = await createRemoteEvent(
          credentials, cal.url, ical, row.id as string
        );

        await queryContext(context, `
          UPDATE calendar_events
          SET external_uid = $1, etag = $2, sync_state = 'synced', ical_data = $3, updated_at = NOW()
          WHERE id = $4
        `, [row.id, createResult.etag, ical, row.id]);
      } catch (err) {
        logger.warn('Failed to push local event to remote', {
          eventId: row.id,
          error: err instanceof Error ? err.message : String(err),
        });
        result.errors++;
      }
    }
  }

  // 5. Handle deletions (only on full sync, not incremental)
  if (!account.sync_token) {
    for (const [uid, local] of localByUid) {
      if (!seenUids.has(uid)) {
        try {
          await queryContext(context, `
            UPDATE calendar_events SET status = 'cancelled', updated_at = NOW() WHERE id = $1
          `, [local.id]);
          result.deleted++;
        } catch {
          result.errors++;
        }
      }
    }
  }

  return result;
}

/**
 * Create a local event from CalDAV data
 */
async function createLocalEvent(
  context: AIContext,
  accountId: string,
  parsed: NonNullable<ReturnType<typeof parseICal>>,
  remote: CalDAVEventData,
  calendarColor?: string
): Promise<void> {
  const id = uuidv4();
  const statusMap: Record<string, string> = {
    confirmed: 'confirmed', tentative: 'tentative', cancelled: 'cancelled',
  };

  await queryContext(context, `
    INSERT INTO calendar_events (
      id, title, description, event_type, start_time, end_time, all_day,
      location, status, color, context, rrule,
      external_uid, external_provider, calendar_account_id, etag, ical_data, sync_state,
      participants, reminder_minutes, metadata, ai_generated,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, 'appointment', $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, 'icloud', $13, $14, $15, 'synced',
      '[]', '[15]', '{}', false,
      NOW(), NOW()
    )
  `, [
    id, parsed.title, parsed.description || null,
    parsed.start_time, parsed.end_time || null, parsed.all_day,
    parsed.location || null, statusMap[parsed.status || 'confirmed'] || 'confirmed',
    calendarColor || null, context, parsed.rrule || null,
    parsed.uid, accountId, remote.etag, remote.data,
  ]);
}

/**
 * Update a local event from CalDAV data
 */
async function updateLocalEvent(
  context: AIContext,
  localId: string,
  parsed: NonNullable<ReturnType<typeof parseICal>>,
  remote: CalDAVEventData
): Promise<void> {
  await queryContext(context, `
    UPDATE calendar_events SET
      title = $1, description = $2, start_time = $3, end_time = $4,
      all_day = $5, location = $6, status = $7, rrule = $8,
      etag = $9, ical_data = $10, sync_state = 'synced', updated_at = NOW()
    WHERE id = $11
  `, [
    parsed.title, parsed.description || null,
    parsed.start_time, parsed.end_time || null,
    parsed.all_day, parsed.location || null,
    parsed.status || 'confirmed', parsed.rrule || null,
    remote.etag, remote.data, localId,
  ]);
}

// ============================================================
// Sync Scheduler
// ============================================================

let syncInterval: NodeJS.Timeout | null = null;
const SYNC_CHECK_INTERVAL = 60_000; // Check every minute

export function startCalDAVScheduler(): void {
  if (syncInterval) {return;}

  syncInterval = setInterval(async () => {
    try {
      await runScheduledSync();
    } catch (err) {
      logger.error('CalDAV scheduled sync error', err instanceof Error ? err : undefined);
    }
  }, SYNC_CHECK_INTERVAL);

  logger.info('CalDAV sync scheduler started', { checkInterval: SYNC_CHECK_INTERVAL });
}

export function stopCalDAVScheduler(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    logger.info('CalDAV sync scheduler stopped');
  }
}

async function runScheduledSync(): Promise<void> {
  const contexts: AIContext[] = ['personal', 'work', 'learning', 'creative'];

  for (const ctx of contexts) {
    try {
      const accounts = await queryContext(ctx, `
        SELECT id FROM calendar_accounts
        WHERE is_enabled = true
          AND (last_sync_at IS NULL OR last_sync_at < NOW() - (sync_interval_minutes || ' minutes')::interval)
      `, []);

      for (const row of accounts.rows) {
        try {
          await syncAccount(ctx, row.id as string);
        } catch (err) {
          logger.warn('Scheduled sync failed for account', {
            accountId: row.id, context: ctx,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch {
      // Schema might not exist yet, ignore
    }
  }
}

/**
 * Push a local event change to the remote CalDAV server
 */
export async function pushEventToRemote(
  context: AIContext,
  eventId: string
): Promise<boolean> {
  const eventResult = await queryContext(context, `
    SELECT e.*, a.username, a.password_encrypted, a.caldav_url, a.calendars
    FROM calendar_events e
    JOIN calendar_accounts a ON e.calendar_account_id = a.id
    WHERE e.id = $1
  `, [eventId]);

  if (eventResult.rows.length === 0) {return false;}
  const row = eventResult.rows[0];

  const credentials: CalDAVCredentials = {
    serverUrl: row.caldav_url as string,
    username: row.username as string,
    password: decrypt(row.password_encrypted as string),
  };

  const calendarsJson = typeof row.calendars === 'string'
    ? JSON.parse(row.calendars) : row.calendars;
  const enabledCal = (calendarsJson as CalendarAccountCalendar[]).find(c => c.enabled);
  if (!enabledCal) {return false;}

  const ical = eventToICal({
    id: row.external_uid as string || row.id as string,
    title: row.title as string,
    description: row.description as string | undefined,
    start_time: (row.start_time as Date).toISOString(),
    end_time: row.end_time ? (row.end_time as Date).toISOString() : undefined,
    all_day: row.all_day as boolean,
    location: row.location as string | undefined,
    status: row.status as string,
    rrule: row.rrule as string | undefined,
  });

  try {
    if (row.external_uid && row.etag) {
      // Update existing remote event
      const updateResult = await updateRemoteEvent(
        credentials,
        `${enabledCal.url}${row.external_uid}.ics`,
        ical,
        row.etag as string
      );

      await queryContext(context, `
        UPDATE calendar_events SET etag = $1, ical_data = $2, sync_state = 'synced', updated_at = NOW()
        WHERE id = $3
      `, [updateResult.etag, ical, eventId]);
    } else {
      // Create new remote event
      const createResult = await createRemoteEvent(
        credentials, enabledCal.url, ical, row.id as string
      );

      await queryContext(context, `
        UPDATE calendar_events
        SET external_uid = $1, etag = $2, ical_data = $3, sync_state = 'synced', updated_at = NOW()
        WHERE id = $4
      `, [row.id, createResult.etag, ical, eventId]);
    }

    return true;
  } catch (err) {
    logger.warn('Failed to push event to remote', {
      eventId, error: err instanceof Error ? err.message : String(err),
    });

    await queryContext(context, `
      UPDATE calendar_events SET sync_state = 'pending', updated_at = NOW() WHERE id = $1
    `, [eventId]);

    return false;
  }
}

/**
 * Delete a remote event
 */
export async function deleteEventFromRemote(
  context: AIContext,
  eventId: string
): Promise<boolean> {
  const eventResult = await queryContext(context, `
    SELECT e.external_uid, e.etag, a.username, a.password_encrypted, a.caldav_url, a.calendars
    FROM calendar_events e
    JOIN calendar_accounts a ON e.calendar_account_id = a.id
    WHERE e.id = $1 AND e.external_uid IS NOT NULL
  `, [eventId]);

  if (eventResult.rows.length === 0) {return false;}
  const row = eventResult.rows[0];

  const credentials: CalDAVCredentials = {
    serverUrl: row.caldav_url as string,
    username: row.username as string,
    password: decrypt(row.password_encrypted as string),
  };

  const calendarsJson = typeof row.calendars === 'string'
    ? JSON.parse(row.calendars) : row.calendars;
  const enabledCal = (calendarsJson as CalendarAccountCalendar[]).find(c => c.enabled);
  if (!enabledCal) {return false;}

  return deleteRemoteEvent(
    credentials,
    `${enabledCal.url}${row.external_uid}.ics`,
    row.etag as string
  );
}

// ============================================================
// Helpers
// ============================================================

function getCredentials(account: CalendarAccount): CalDAVCredentials {
  return {
    serverUrl: account.caldav_url,
    username: account.username,
    password: decrypt(account.password_encrypted),
  };
}

function mapAccountRow(row: Record<string, unknown>): CalendarAccount {
  const calendarsRaw = row.calendars;
  let calendars: CalendarAccountCalendar[] = [];
  if (typeof calendarsRaw === 'string') {
    try { calendars = JSON.parse(calendarsRaw); } catch { /* empty */ }
  } else if (Array.isArray(calendarsRaw)) {
    calendars = calendarsRaw as CalendarAccountCalendar[];
  }

  return {
    id: row.id as string,
    provider: row.provider as string,
    username: row.username as string,
    password_encrypted: row.password_encrypted as string,
    display_name: row.display_name as string | null,
    caldav_url: row.caldav_url as string,
    calendars,
    is_enabled: row.is_enabled as boolean,
    sync_interval_minutes: row.sync_interval_minutes as number,
    last_sync_at: row.last_sync_at ? ((row.last_sync_at as Date).toISOString?.() ?? row.last_sync_at as string) : null,
    last_sync_error: row.last_sync_error as string | null,
    sync_token: row.sync_token as string | null,
    context: row.context as string,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>) || {},
    created_at: (row.created_at as Date).toISOString?.() ?? row.created_at as string,
    updated_at: (row.updated_at as Date).toISOString?.() ?? row.updated_at as string,
  };
}
