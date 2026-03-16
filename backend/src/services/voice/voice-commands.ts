/**
 * Phase 90: Voice Command Parser
 *
 * Parses voice transcripts for structured commands using regex-based patterns.
 * Supports German and English command patterns for common operations.
 */

import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export type VoiceCommandType = 'create_idea' | 'list_tasks' | 'search' | 'navigate' | 'reminder' | 'general';

export interface ParsedVoiceCommand {
  type: VoiceCommandType;
  content: string;
  parameters: Record<string, string>;
  confidence: number;
}

// ===========================================
// Command Patterns
// ===========================================

interface CommandPattern {
  type: VoiceCommandType;
  patterns: RegExp[];
  extractContent: (match: RegExpMatchArray, fullText: string) => string;
  extractParams?: (match: RegExpMatchArray, fullText: string) => Record<string, string>;
  confidence: number;
}

const COMMAND_PATTERNS: CommandPattern[] = [
  // Create idea
  {
    type: 'create_idea',
    patterns: [
      /^(?:erstelle|erstell|neue|neuen?|mach|mache)\s+(?:eine?\s+)?(?:idee|gedanke[n]?|notiz)\s*[:\-]?\s*(.+)/i,
      /^(?:create|new|add)\s+(?:an?\s+)?(?:new\s+)?(?:idea|thought|note)\s*[:\-]?\s*(.+)/i,
      /^(?:idee|gedanke)\s*[:\-]\s*(.+)/i,
      /^(?:idea|note)\s*[:\-]\s*(.+)/i,
      /^(?:merke?\s+(?:dir)?|notiere?)\s*[:\-]?\s*(.+)/i,
    ],
    extractContent: (match) => match[1]?.trim() || '',
    confidence: 0.85,
  },

  // List tasks
  {
    type: 'list_tasks',
    patterns: [
      /^(?:zeige?|zeig)\s+(?:mir\s+)?(?:meine?\s+)?(?:aufgaben|tasks?|todos?|to-dos?)/i,
      /^(?:was\s+(?:steht|sind|habe?\s+ich)\s+)?(?:auf\s+(?:meiner\s+)?(?:liste|agenda))/i,
      /^(?:show|list|display)\s+(?:my\s+)?(?:tasks?|todos?|to-dos?)/i,
      /^(?:welche?\s+)?(?:aufgaben|tasks?)\s+(?:habe?\s+ich|sind\s+offen|stehen\s+an)/i,
      /^(?:meine?\s+)?(?:aufgaben|tasks?|todos?)\s+(?:anzeigen|zeigen|auflisten)/i,
    ],
    extractContent: (_match, fullText) => fullText,
    confidence: 0.9,
  },

  // Search
  {
    type: 'search',
    patterns: [
      /^(?:suche?\s+(?:nach)?|finde?|durchsuche?)\s+(.+)/i,
      /^(?:search|find|look)\s+(?:for\s+)?(.+)/i,
      /^(?:gibt\s+es\s+(?:etwas\s+)?(?:zu|ueber|über))\s+(.+)/i,
      /^(?:was\s+(?:weisst|weißt)\s+du\s+(?:ueber|über))\s+(.+)/i,
    ],
    extractContent: (match) => match[1]?.trim() || '',
    extractParams: (match) => ({ query: match[1]?.trim() || '' }),
    confidence: 0.85,
  },

  // Navigate
  {
    type: 'navigate',
    patterns: [
      /^(?:oeffne|öffne|gehe?\s+zu|geh\s+zu|wechsle?\s+zu|navigiere?\s+zu)\s+(.+)/i,
      /^(?:open|go\s+to|navigate\s+to|switch\s+to)\s+(.+)/i,
      /^(?:zeig(?:e)?\s+(?:mir\s+)?(?:die?\s+)?)(dashboard|chat|gedanken|ideas?|kalender|calendar|einstellungen|settings|dokumente|documents|email|contacts?|kontakte?)/i,
    ],
    extractContent: (match) => match[1]?.trim() || '',
    extractParams: (match) => ({ target: normalizeNavigationTarget(match[1]?.trim() || '') }),
    confidence: 0.85,
  },

  // Reminder
  {
    type: 'reminder',
    patterns: [
      /^(?:erinnere?\s+mich\s+(?:an|dass?|daran))\s+(.+)/i,
      /^(?:remind\s+me\s+(?:to|about|that))\s+(.+)/i,
      /^(?:erinnerung)\s*[:\-]?\s*(.+)/i,
      /^(?:reminder)\s*[:\-]?\s*(.+)/i,
      /^(?:nicht\s+vergessen)\s*[:\-]?\s*(.+)/i,
    ],
    extractContent: (match) => match[1]?.trim() || '',
    confidence: 0.85,
  },
];

// ===========================================
// Navigation Target Normalization
// ===========================================

const NAV_TARGET_MAP: Record<string, string> = {
  // German
  'dashboard': 'dashboard',
  'chat': 'chat',
  'gedanken': 'ideas',
  'ideen': 'ideas',
  'kalender': 'calendar',
  'planer': 'calendar',
  'einstellungen': 'settings',
  'dokumente': 'documents',
  'wissensbasis': 'documents',
  'email': 'email',
  'emails': 'email',
  'kontakte': 'contacts',
  'werkstatt': 'workshop',
  'insights': 'insights',
  'business': 'business',
  'lernen': 'learning',
  'meine ki': 'my-ai',
  // English
  'ideas': 'ideas',
  'calendar': 'calendar',
  'planner': 'calendar',
  'settings': 'settings',
  'documents': 'documents',
  'contacts': 'contacts',
  'workshop': 'workshop',
  'learning': 'learning',
};

function normalizeNavigationTarget(target: string): string {
  // Strip German articles (den, die, das, dem, der, einen, eine, ein)
  const lower = target.toLowerCase().trim()
    .replace(/^(?:den|die|das|dem|der|einen?|ein)\s+/i, '');
  return NAV_TARGET_MAP[lower] || lower;
}

// ===========================================
// Parser
// ===========================================

/**
 * Parse a voice transcript for structured commands.
 * Returns the detected command type, extracted content, and confidence.
 */
export function parseCommand(transcript: string): ParsedVoiceCommand {
  if (!transcript || transcript.trim().length === 0) {
    return {
      type: 'general',
      content: '',
      parameters: {},
      confidence: 0,
    };
  }

  const trimmed = transcript.trim();

  for (const command of COMMAND_PATTERNS) {
    for (const pattern of command.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const content = command.extractContent(match, trimmed);
        const parameters = command.extractParams ? command.extractParams(match, trimmed) : {};

        logger.debug('Voice command parsed', {
          type: command.type,
          confidence: command.confidence,
          contentLength: content.length,
        });

        return {
          type: command.type,
          content,
          parameters,
          confidence: command.confidence,
        };
      }
    }
  }

  // No command pattern matched — treat as general conversation
  return {
    type: 'general',
    content: trimmed,
    parameters: {},
    confidence: 1.0, // High confidence that it's general conversation
  };
}
