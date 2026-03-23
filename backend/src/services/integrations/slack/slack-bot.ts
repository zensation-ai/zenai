import { v4 as uuidv4 } from 'uuid';
import type { IntegrationEvent } from '../types';
import type { AIContext } from './types';
import { emitSystemEvent } from '../../event-system';
import { queryPublic } from '../../../utils/database-context';
import { logger } from '../../../utils/logger';

// --- Importance Filter ---

const NOISE_PATTERNS = new Set([
  'ok', 'okay', 'danke', 'thanks', 'thx', 'lol', 'lmao',
  '+1', '-1', 'ja', 'nein', 'yes', 'no', 'nice', 'cool',
  'gut', 'good', 'great', 'super', 'top', 'alles klar',
]);

export function isImportantMessage(msg: { text?: string; bot_id?: string }): boolean {
  if (msg.bot_id) {
    return false;
  }
  const text = (msg.text || '').trim();
  if (!text) {
    return false;
  }

  // Noise pattern check
  if (NOISE_PATTERNS.has(text.toLowerCase())) {
    return false;
  }

  // Emoji-only check
  if (/^(?::\w+:\s*)+$/.test(text)) {
    return false;
  }

  // Word count check
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 5) {
    return false;
  }

  return true;
}

// --- Language Detection ---

const GERMAN_WORDS = new Set([
  'der', 'die', 'das', 'und', 'ist', 'ich', 'wir', 'nicht', 'ein', 'eine',
  'haben', 'hat', 'wird', 'auch', 'noch', 'aber', 'dass', 'fuer', 'für',
  'mit', 'auf', 'aus', 'bei', 'nach', 'von', 'zum', 'zur', 'ueber', 'über',
  'bitte', 'danke', 'heute', 'morgen', 'gestern',
]);

export function detectLanguage(text: string): 'de' | 'en' {
  const words = text.toLowerCase().split(/\s+/);
  let germanCount = 0;
  for (const word of words) {
    if (GERMAN_WORDS.has(word)) {
      germanCount++;
    }
  }
  return germanCount >= 2 ? 'de' : 'en';
}

// --- Slash Command Parser ---

const VALID_COMMANDS = new Set(['summarize', 'task', 'remember', 'status', 'context', 'quiet', 'help']);

export function parseSlashCommand(text: string): { command: string; args: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { command: 'help', args: '' };
  }

  const [first, ...rest] = trimmed.split(/\s+/);
  const command = first.toLowerCase();

  if (!VALID_COMMANDS.has(command)) {
    return { command: 'help', args: '' };
  }

  return { command, args: rest.join(' ') };
}

// --- Event Normalization ---

export function normalizeSlackEvent(
  event: Record<string, unknown>,
  userId: string,
  targetContext: AIContext,
): IntegrationEvent {
  const type = event.type as string;
  const channelType = event.channel_type as string | undefined;

  let eventType: string;

  if (type === 'message' && channelType === 'im') {
    eventType = 'integration.slack.dm_received';
  } else if (type === 'message') {
    eventType = 'integration.slack.message_received';
  } else if (type === 'app_mention') {
    eventType = 'integration.slack.mention';
  } else if (type === 'reaction_added') {
    eventType = 'integration.slack.reaction';
  } else if (type === 'channel_created') {
    eventType = 'integration.slack.channel_created';
  } else if (type === 'member_joined_channel') {
    eventType = 'integration.slack.member_joined';
  } else {
    eventType = `integration.slack.${type}`;
  }

  return {
    id: uuidv4(),
    connectorId: 'slack',
    userId,
    type: eventType,
    targetContext,
    payload: event as Record<string, unknown>,
    timestamp: new Date(),
  };
}

// --- Event Emission Helper ---

export async function emitSlackEvent(event: IntegrationEvent): Promise<void> {
  try {
    await emitSystemEvent({
      context: event.targetContext,
      eventType: event.type,
      eventSource: 'slack',
      payload: event.payload,
    });
  } catch (err) {
    logger.error('Failed to emit Slack event', err instanceof Error ? err : undefined, { type: event.type });
  }
}

// --- Webhook Logging ---

export async function logWebhookEvent(
  connectorId: string,
  eventType: string,
  userId: string | null,
  payloadHash: string,
  status: 'received' | 'processed' | 'failed' | 'ignored',
  processingTimeMs: number,
  errorMessage?: string,
): Promise<void> {
  try {
    await queryPublic(
      `INSERT INTO public.integration_webhook_log (connector_id, event_type, user_id, payload_hash, status, processing_time_ms, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [connectorId, eventType, userId, payloadHash, status, processingTimeMs, errorMessage || null],
    );
  } catch (err) {
    logger.error('Failed to log webhook event', err instanceof Error ? err : undefined);
  }
}
