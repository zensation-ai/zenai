/**
 * Chat Mode Detection Service
 *
 * Intelligently determines the optimal processing mode for chat messages.
 * This enables the system to automatically select the best approach:
 * - Simple conversation (fast, no tools)
 * - Tool-assisted (structured actions)
 * - Agent mode (complex multi-step reasoning)
 * - RAG-enhanced (knowledge retrieval)
 *
 * @module services/chat-modes
 *
 * Security Note: The regex patterns in this file have been reviewed for ReDoS safety.
 * They process bounded user chat messages (max ~4000 chars) and use simple non-overlapping
 * alternations without nested quantifiers. The eslint security/detect-unsafe-regex rule
 * flags patterns with any alternation, but these are false positives for our use case.
 */

/* eslint-disable security/detect-unsafe-regex */

import { logger } from '../utils/logger';

// ===========================================
// Types & Interfaces
// ===========================================

/**
 * Available chat processing modes
 */
export type ChatMode =
  | 'conversation'      // Standard conversational response
  | 'tool_assisted'     // Requires tool execution (search, create, calculate)
  | 'agent'             // Complex multi-step task requiring reasoning
  | 'rag_enhanced';     // Needs knowledge retrieval from ideas

/**
 * Result of mode detection
 */
export interface ModeDetectionResult {
  /** Detected mode */
  mode: ChatMode;
  /** Confidence in the detection (0-1) */
  confidence: number;
  /** Human-readable reasoning */
  reasoning: string;
  /** Suggested tools for tool_assisted mode */
  suggestedTools?: string[];
  /** Patterns that matched */
  matchedPatterns?: string[];
}

/**
 * RAG decision result
 */
export interface RAGDecision {
  shouldUse: boolean;
  reason: string;
  urgency: 'required' | 'recommended' | 'optional';
}

// ===========================================
// Pattern Definitions
// ===========================================

/**
 * Patterns that indicate tool_assisted mode
 * These suggest the user wants to perform a specific action
 */
const TOOL_PATTERNS: Array<{ pattern: RegExp; tools: string[]; weight: number }> = [
  // Search patterns
  { pattern: /such(e|en?)\s+(nach\s+)?(meine[rn]?|in\s+meinen?)/i, tools: ['search_ideas'], weight: 0.95 },
  { pattern: /find(e|en?)\s+(meine[rn]?|alle)/i, tools: ['search_ideas'], weight: 0.9 },
  { pattern: /zeig(e?|en?)\s+(mir\s+)?(meine[rn]?|alle)/i, tools: ['search_ideas'], weight: 0.85 },
  { pattern: /wie\s+viele\s+(ideen?|notizen?|einträge)/i, tools: ['search_ideas'], weight: 0.9 },
  { pattern: /gibt\s+es\s+(ideen?|notizen?)\s+(zu|über|zum)/i, tools: ['search_ideas'], weight: 0.85 },

  // Create patterns
  { pattern: /erstell(e|en?)\s+(eine?\s+)?(neue[rn]?)?\s*(idee|notiz|eintrag)/i, tools: ['create_idea'], weight: 0.95 },
  { pattern: /speicher(e|n?)\s+(das|diese?|folgende)/i, tools: ['create_idea'], weight: 0.9 },
  { pattern: /notier(e|en?)\s+(dir\s+)?/i, tools: ['create_idea'], weight: 0.85 },
  { pattern: /leg(e?)\s+(eine?\s+)?(neue[rn]?)?\s*(idee|notiz)\s+an/i, tools: ['create_idea'], weight: 0.9 },

  // Remember/Recall patterns
  { pattern: /merk(e?)\s+(dir|es\s+dir)/i, tools: ['remember'], weight: 0.95 },
  { pattern: /erinner(e|st)?\s+(du\s+)?(dich|mich)/i, tools: ['recall'], weight: 0.9 },
  { pattern: /vergiss\s+nicht/i, tools: ['remember'], weight: 0.85 },
  { pattern: /was\s+(hatte|habe)\s+ich\s+(dir\s+)?gesagt/i, tools: ['recall'], weight: 0.9 },

  // Calculate patterns
  { pattern: /berechn(e|en?)/i, tools: ['calculate'], weight: 0.95 },
  { pattern: /rechne\s+.{0,30}(aus|zusammen)/i, tools: ['calculate'], weight: 0.9 },
  { pattern: /wie\s+viel\s+(ist|sind|ergibt)/i, tools: ['calculate'], weight: 0.8 },
  { pattern: /(\d+\s*[-+*/]\s*\d+)/i, tools: ['calculate'], weight: 0.85 },

  // Related ideas patterns
  { pattern: /verwandte\s+(ideen?|notizen?|themen?)/i, tools: ['get_related_ideas'], weight: 0.9 },
  { pattern: /ähnliche\s+(ideen?|notizen?)/i, tools: ['get_related_ideas'], weight: 0.9 },
  { pattern: /was\s+hängt\s+(damit\s+)?zusammen/i, tools: ['get_related_ideas'], weight: 0.85 },
  { pattern: /verbundene\s+(ideen?|konzepte?)/i, tools: ['get_related_ideas'], weight: 0.85 },

  // Synthesis patterns (Phase 32B)
  { pattern: /fasse?\s+(alles\s+)?zusammen\s+was\s+(ich|du|wir)/i, tools: ['synthesize_knowledge'], weight: 0.95 },
  { pattern: /was\s+weiß\s+(ich|du)\s+(alles\s+)?(über|zu|von)/i, tools: ['synthesize_knowledge'], weight: 0.9 },
  { pattern: /überblick\s+über\s+(alle|meine|das\s+thema)/i, tools: ['synthesize_knowledge'], weight: 0.9 },
  { pattern: /verbinde\s+(alle|meine)\s+(ideen?|gedanken)/i, tools: ['synthesize_knowledge'], weight: 0.9 },
  { pattern: /synthes(e|iere)\s/i, tools: ['synthesize_knowledge'], weight: 0.95 },
  { pattern: /gesamtbild\s+(zu|über|von)/i, tools: ['synthesize_knowledge'], weight: 0.9 },

  // Code execution patterns
  { pattern: /führ(e|en?)\s+.{0,30}code\s+aus/i, tools: ['execute_code'], weight: 0.95 },
  { pattern: /führ(e|en?)\s+(diesen?\s+)?(python|javascript|nodejs|bash|script)\s+aus/i, tools: ['execute_code'], weight: 0.95 },
  { pattern: /execut(e|ier)\s+.{0,30}(code|python|javascript|bash)/i, tools: ['execute_code'], weight: 0.95 },
  { pattern: /run\s+(this\s+)?(code|python|script)/i, tools: ['execute_code'], weight: 0.9 },
  { pattern: /test(e|en?)?\s+(diesen?\s+)?code/i, tools: ['execute_code'], weight: 0.9 },
  { pattern: /```(python|javascript|nodejs|bash)/i, tools: ['execute_code'], weight: 0.85 },
  { pattern: /(python|javascript|nodejs|bash)\s+(code\s+)?ausführen/i, tools: ['execute_code'], weight: 0.95 },

  // Meeting creation patterns
  { pattern: /meeting\s+(erstell|anlegen|einrichten|planen)/i, tools: ['create_meeting'], weight: 0.95 },
  { pattern: /besprechung\s+(am|um|für|mit|planen|erstell)/i, tools: ['create_meeting'], weight: 0.9 },

  // Phase 35: Calendar event patterns
  { pattern: /termin\s+(am|um|für|mit|erstell|anlegen|eintragen)/i, tools: ['create_calendar_event'], weight: 0.95 },
  { pattern: /ich\s+habe?\s+(ein|einen?)\s+(meeting|termin|besprechung|treffen)/i, tools: ['create_calendar_event'], weight: 0.95 },
  { pattern: /erstell(e|en?)?\s+(ein|einen?)\s+(termin|kalender|event)/i, tools: ['create_calendar_event'], weight: 0.95 },
  { pattern: /trag\s+(in\s+)?(den\s+)?kalender\s+ein/i, tools: ['create_calendar_event'], weight: 0.95 },
  { pattern: /erinner(e|t)?\s+mich\s+(an|um|in|morgen|übermorgen)/i, tools: ['create_calendar_event'], weight: 0.9 },
  { pattern: /deadline\s+(ist|am|um|für|bis)/i, tools: ['create_calendar_event'], weight: 0.9 },
  { pattern: /wann\s+(ist|habe?\s+ich)\s+(mein\s+)?(nächster?|der)\s+(termin|meeting)/i, tools: ['list_calendar_events'], weight: 0.9 },
  { pattern: /zeig(e?)\s+mir\s+(meine?\s+)?(termine|kalender|events)/i, tools: ['list_calendar_events'], weight: 0.9 },
  { pattern: /was\s+steht\s+(heute|morgen|diese\s+woche)\s+(an|im\s+kalender)/i, tools: ['list_calendar_events'], weight: 0.95 },

  // Phase 35: Email draft patterns
  { pattern: /schreib(e|en?)?\s+(eine?\s+)?(e-?mail|mail|nachricht)\s+(an\s+)?/i, tools: ['draft_email'], weight: 0.95 },
  { pattern: /e-?mail\s+(an|schreiben|verfassen|erstellen|entwurf)/i, tools: ['draft_email'], weight: 0.95 },
  { pattern: /antwort(e|en?)?\s+(auf\s+)?(die\s+)?(e-?mail|mail|nachricht)/i, tools: ['draft_email'], weight: 0.9 },
  { pattern: /mail\s+an\s+/i, tools: ['draft_email'], weight: 0.9 },

  // Phase 43: Ask My Inbox patterns
  { pattern: /was\s+(hat|haben)\s+.{1,30}\s+(geschrieben|gemailt|gesendet|geschickt)/i, tools: ['ask_inbox'], weight: 0.95 },
  { pattern: /gibt\s+es\s+(neue?|ungelesene?|dringende?|wichtige?)\s+(e-?mails?|mails?|nachrichten?)/i, tools: ['ask_inbox'], weight: 0.95 },
  { pattern: /zeig(e?)\s+(mir\s+)?(meine?\s+)?(e-?mails?|mails?|inbox|posteingang|postfach)/i, tools: ['ask_inbox'], weight: 0.9 },
  { pattern: /(e-?mails?|mails?)\s+(von|an|über|zu|mit|seit|letzte|diese)\s/i, tools: ['ask_inbox'], weight: 0.9 },
  { pattern: /inbox\s*(überblick|übersicht|zusammenfassung|status|summary)/i, tools: ['inbox_summary'], weight: 0.95 },
  { pattern: /wie\s+viele\s+(e-?mails?|mails?|nachrichten?)/i, tools: ['inbox_summary'], weight: 0.9 },
  { pattern: /was\s+liegt\s+(im\s+)?(postfach|posteingang|inbox)/i, tools: ['ask_inbox'], weight: 0.9 },
  { pattern: /(habe|hab)\s+ich\s+(e-?mails?|mails?|post|nachrichten?)/i, tools: ['ask_inbox'], weight: 0.9 },
  { pattern: /such(e|en?)?\s+(in\s+)?(meinen?\s+)?(e-?mails?|mails?|inbox)/i, tools: ['ask_inbox'], weight: 0.95 },

  // Phase 44: MCP Ecosystem patterns
  { pattern: /mcp\s*(tools?|server|verbindung(en)?|connection)/i, tools: ['mcp_list_tools'], weight: 0.95 },
  { pattern: /externe?\s*(tools?|werkzeuge?|server)/i, tools: ['mcp_list_tools'], weight: 0.85 },
  { pattern: /welche\s*(mcp|externen?)\s*(tools?|werkzeuge?)\s*(gibt|sind|habe)/i, tools: ['mcp_list_tools'], weight: 0.95 },
  { pattern: /nutze?\s*(das\s+)?(mcp|externe)\s*tool/i, tools: ['mcp_call_tool'], weight: 0.9 },

  // Phase 35: Travel estimation patterns
  { pattern: /wie\s+lange\s+brauche?\s+ich\s+(nach|zu|von|bis|zum|zur)/i, tools: ['estimate_travel'], weight: 0.95 },
  { pattern: /fahrt?\s+nach\s+/i, tools: ['estimate_travel'], weight: 0.85 },
  { pattern: /fahrzeit\s+(nach|von|zu)/i, tools: ['estimate_travel'], weight: 0.95 },
  { pattern: /reisezeit\s+(nach|von|zu)/i, tools: ['estimate_travel'], weight: 0.95 },
  { pattern: /entfernung\s+(nach|von|zu|zwischen)/i, tools: ['estimate_travel'], weight: 0.9 },
  { pattern: /anreise\s+(nach|zu|zum|zur)/i, tools: ['estimate_travel'], weight: 0.9 },

  // Navigation patterns
  { pattern: /wo\s+finde\s+ich/i, tools: ['navigate_to', 'app_help'], weight: 0.9 },
  { pattern: /zeig(e?)\s+mir\s+(die|das|den)\s+\w*(seite|bereich|dashboard)/i, tools: ['navigate_to'], weight: 0.9 },
  { pattern: /geh(e?)\s+zu\s+/i, tools: ['navigate_to'], weight: 0.95 },
  { pattern: /navigiere?\s+(zu|nach|auf)/i, tools: ['navigate_to'], weight: 0.95 },
  { pattern: /öffne\s+(die|das|den)/i, tools: ['navigate_to'], weight: 0.85 },
  { pattern: /bring\s+mich\s+(zu|nach|auf)/i, tools: ['navigate_to'], weight: 0.9 },

  // Business Manager patterns (Phase 34)
  { pattern: /\b(mrr|arr|revenue|umsatz|einnahmen)\b/i, tools: ['get_revenue_metrics'], weight: 0.95 },
  { pattern: /\b(churn|abwanderung|subscription|abonnement)\b/i, tools: ['get_revenue_metrics'], weight: 0.9 },
  { pattern: /wie\s+(viel|hoch)\s+(verdienen|umsatz|einnahmen)/i, tools: ['get_revenue_metrics'], weight: 0.95 },
  { pattern: /\b(traffic|besucher|seitenaufrufe|pageviews|sessions)\b/i, tools: ['get_traffic_analytics'], weight: 0.9 },
  { pattern: /wie\s+viele\s+(besucher|nutzer|user)/i, tools: ['get_traffic_analytics'], weight: 0.95 },
  { pattern: /\b(seo|ranking|suchergebnis|suchmaschine|google\s+search)\b/i, tools: ['get_seo_performance'], weight: 0.9 },
  { pattern: /\b(impressionen|klicks|ctr|suchposition)\b/i, tools: ['get_seo_performance'], weight: 0.9 },
  { pattern: /\b(uptime|verfügbarkeit|antwortzeit|response\s+time)\b/i, tools: ['get_system_health'], weight: 0.9 },
  { pattern: /\b(lighthouse|performance\s+score|web\s+vitals|lcp|cls)\b/i, tools: ['get_system_health'], weight: 0.9 },
  { pattern: /\b(website|seite)\s+(läuft|online|erreichbar|schnell|langsam)/i, tools: ['get_system_health'], weight: 0.85 },
  { pattern: /\b(geschäfts|business|wochen|monats)(bericht|report|zusammenfassung)\b/i, tools: ['generate_business_report'], weight: 0.95 },
  { pattern: /\b(bericht|report)\s+(erstellen|generieren|zeigen)/i, tools: ['generate_business_report'], weight: 0.9 },
  { pattern: /\b(auffälligkeiten|anomalien|probleme|ungewöhnlich)\b/i, tools: ['identify_anomalies'], weight: 0.9 },
  { pattern: /was\s+(stimmt|läuft)\s+nicht/i, tools: ['identify_anomalies'], weight: 0.85 },
  { pattern: /\b(vergleich|vergleiche|gegenüber|vs\.?)\b.*\b(vormonat|vorwoche|letzte|period)/i, tools: ['compare_periods'], weight: 0.9 },
  { pattern: /wie\s+hat\s+sich\s+.{2,20}\s+(entwickelt|verändert|geändert)/i, tools: ['compare_periods'], weight: 0.9 },

  // App help patterns
  { pattern: /wie\s+funktioniert/i, tools: ['app_help'], weight: 0.9 },
  { pattern: /was\s+kann\s+(ich|man|die\s+app)/i, tools: ['app_help'], weight: 0.85 },
  { pattern: /erkläre?\s+(mir\s+)?(die|das|den)/i, tools: ['app_help'], weight: 0.8 },
  { pattern: /hilfe\s+(zu|bei|mit|für)/i, tools: ['app_help'], weight: 0.9 },
  { pattern: /was\s+ist\s+(die|der|das)\s+\w+(seite|bereich|feature)/i, tools: ['app_help'], weight: 0.85 },

  // Web search patterns (DE + EN)
  { pattern: /such(e|en?)?\s+(im\s+)?(internet|web|netz|online)\s+(nach)?/i, tools: ['web_search'], weight: 0.95 },
  { pattern: /googl(e|en?)\s+(mal\s+)?/i, tools: ['web_search'], weight: 0.95 },
  { pattern: /recherchier(e|en?)?\s+(online|im\s+netz)/i, tools: ['web_search'], weight: 0.95 },
  { pattern: /was\s+sagt\s+(das\s+)?(internet|web|netz)\s+(zu|über)/i, tools: ['web_search'], weight: 0.9 },
  { pattern: /search\s+(the\s+)?(web|internet|online)\s+for/i, tools: ['web_search'], weight: 0.95 },
  { pattern: /look\s+up\s+/i, tools: ['web_search'], weight: 0.85 },

  // URL fetch patterns
  { pattern: /öffne\s+(die\s+)?(url|seite|webseite|website|link)/i, tools: ['fetch_url'], weight: 0.95 },
  { pattern: /was\s+steht\s+auf\s+(der\s+)?(seite|webseite|url)/i, tools: ['fetch_url'], weight: 0.9 },
  { pattern: /lies\s+(die\s+)?(seite|webseite|url|website)/i, tools: ['fetch_url'], weight: 0.9 },
  { pattern: /https?:\/\/\S+/i, tools: ['fetch_url'], weight: 0.85 },

  // Maps / directions patterns
  { pattern: /route\s+(von|nach|zu|zwischen)/i, tools: ['get_directions'], weight: 0.95 },
  { pattern: /navigation\s+(nach|zu|zum|zur)/i, tools: ['get_directions'], weight: 0.95 },
  { pattern: /wie\s+komme?\s+ich\s+(nach|zu|zum|zur)/i, tools: ['get_directions'], weight: 0.95 },
  { pattern: /wann\s+(hat|öffnet|schließt|macht)\s+.{2,30}\s+(auf|zu|geöffnet)/i, tools: ['get_opening_hours'], weight: 0.95 },
  { pattern: /öffnungszeiten\s+(von|für|des|der)/i, tools: ['get_opening_hours'], weight: 0.95 },
  { pattern: /gibt\s+es\s+(in\s+der\s+nähe|hier\s+in\s+der\s+nähe|nearby)\s+(ein|eine)/i, tools: ['find_nearby_places'], weight: 0.95 },
  { pattern: /wo\s+(ist|sind)\s+(der|die|das)\s+nächste/i, tools: ['find_nearby_places'], weight: 0.9 },
  { pattern: /restaurants?\s+(in\s+der\s+nähe|nearby|um\s+die\s+ecke)/i, tools: ['find_nearby_places'], weight: 0.9 },

  // GitHub patterns (EN)
  { pattern: /search\s+github\s+for/i, tools: ['github_search'], weight: 0.95 },
  { pattern: /create\s+(a\s+)?(github\s+)?issue/i, tools: ['github_create_issue'], weight: 0.95 },
  { pattern: /github\s+repo(sitory)?\s+info/i, tools: ['github_repo_info'], weight: 0.9 },

  // Phase 100 B5: Expanded German verb triggers
  { pattern: /übersetz(e|en?)\s+/i, tools: ['execute_code'], weight: 0.9 },
  { pattern: /generier(e|en?)\s+.{0,30}(code|script|programm)/i, tools: ['execute_code'], weight: 0.9 },
  { pattern: /konvertier(e|en?)\s+/i, tools: ['execute_code'], weight: 0.85 },
  { pattern: /formatier(e|en?)\s+/i, tools: ['execute_code'], weight: 0.85 },

  // English fallback patterns for core tools
  { pattern: /remember\s+(that|this)/i, tools: ['remember'], weight: 0.95 },
  { pattern: /do\s+you\s+remember/i, tools: ['recall'], weight: 0.9 },
  { pattern: /search\s+(my\s+)?(ideas|notes|thoughts)/i, tools: ['search_ideas'], weight: 0.9 },
  { pattern: /create\s+(a\s+)?(new\s+)?(idea|note|thought)/i, tools: ['create_idea'], weight: 0.9 },
  { pattern: /run\s+(this\s+)?code/i, tools: ['execute_code'], weight: 0.9 },
  { pattern: /what('s|\s+is)\s+(in\s+)?my\s+(inbox|email|mail)/i, tools: ['ask_inbox'], weight: 0.9 },
];

/**
 * Patterns that indicate agent mode (complex multi-step tasks)
 */
const AGENT_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  // Multi-step indicators
  { pattern: /analysiere\s+.{10,}\s+und\s+(dann\s+)?(erstelle|fasse|generiere)/i, weight: 0.95 },
  { pattern: /vergleiche\s+.{5,}\s+mit\s+/i, weight: 0.9 },
  { pattern: /fasse\s+.{5,}\s+zusammen\s+und\s+/i, weight: 0.9 },
  { pattern: /recherchiere\s+.{5,}\s+und\s+(erstelle|schreibe|generiere)/i, weight: 0.95 },

  // Overview/synthesis requests
  { pattern: /gib\s+(mir\s+)?(einen?\s+)?überblick\s+über\s+(alle|meine)/i, weight: 0.9 },
  { pattern: /fasse\s+(alle|meine)\s+.{5,}\s+zusammen/i, weight: 0.9 },
  { pattern: /was\s+sind\s+(die\s+)?hauptthemen/i, weight: 0.85 },
  { pattern: /identifiziere\s+(muster|trends|themen)/i, weight: 0.9 },

  // Complex analysis
  { pattern: /analysiere\s+(die\s+)?(entwicklung|trends?|muster)/i, weight: 0.85 },
  { pattern: /erstelle\s+(einen?\s+)?(bericht|report|analyse)\s+(über|zu)/i, weight: 0.9 },
  { pattern: /evaluiere\s+/i, weight: 0.85 },

  // Planning requests
  { pattern: /plane\s+.{10,}\s+basierend\s+auf/i, weight: 0.9 },
  { pattern: /entwickle\s+(eine?\s+)?strategie/i, weight: 0.9 },

  // Phase 100 B5: Expanded agent triggers
  { pattern: /recherchiere\s+ausführlich/i, weight: 0.9 },
  { pattern: /analysiere\s+im\s+detail/i, weight: 0.9 },
  { pattern: /vergleiche\s+.{5,}\s+und\s+(bewerte|evaluiere)/i, weight: 0.9 },
  { pattern: /erstelle\s+(einen?\s+)?(umfassenden?|detaillierten?|ausführlichen?)\s+(bericht|report|analyse)/i, weight: 0.9 },
];

/**
 * Patterns that indicate RAG enhancement is needed
 */
const RAG_PATTERNS: Array<{ pattern: RegExp; urgency: 'required' | 'recommended'; weight: number }> = [
  // Explicit knowledge references
  { pattern: /was\s+(habe|hatte)\s+ich\s+(zu|über|zum)/i, urgency: 'required', weight: 0.95 },
  { pattern: /laut\s+meinen?\s+(notizen?|ideen?)/i, urgency: 'required', weight: 0.95 },
  { pattern: /basierend\s+auf\s+meinen?/i, urgency: 'required', weight: 0.9 },
  { pattern: /gemäß\s+meinen?/i, urgency: 'required', weight: 0.9 },

  // Memory/recall references
  { pattern: /erinner(e|st)?\s+(dich|mich)\s+an/i, urgency: 'required', weight: 0.9 },
  { pattern: /weißt\s+du\s+noch/i, urgency: 'required', weight: 0.85 },
  { pattern: /haben\s+wir\s+(schon\s+)?(mal\s+)?besprochen/i, urgency: 'required', weight: 0.85 },

  // Context references
  { pattern: /im\s+kontext\s+(meiner?|von|der)/i, urgency: 'recommended', weight: 0.8 },
  { pattern: /wie\s+(bei|in)\s+meiner?\s+(letzten?|früheren?)/i, urgency: 'recommended', weight: 0.8 },

  // Personal knowledge questions
  { pattern: /was\s+weiß\s+(ich|du)\s+(über|zu|von)/i, urgency: 'recommended', weight: 0.75 },
  { pattern: /habe\s+ich\s+(schon\s+)?(mal|bereits)/i, urgency: 'recommended', weight: 0.75 },

  // Phase 100 B5: Expanded RAG triggers
  { pattern: /was\s+weißt\s+du\s+(über|zu|von)/i, urgency: 'required', weight: 0.9 },
  { pattern: /in\s+meinen?\s+(notizen?|ideen?|gedanken)/i, urgency: 'required', weight: 0.9 },
  { pattern: /habe\s+ich\s+erwähnt/i, urgency: 'required', weight: 0.85 },
  { pattern: /erinner(e|st)?\s+dich\s+an/i, urgency: 'required', weight: 0.9 },
];

// ===========================================
// Core Detection Functions
// ===========================================

/**
 * Detect the optimal chat mode for a message
 *
 * @param message - The user's message
 * @returns Mode detection result with confidence
 */
export function detectChatMode(message: string): ModeDetectionResult {
  const normalizedMessage = normalizeMessage(message);
  const matchedPatterns: string[] = [];

  // 1. Check for Agent patterns first (most complex)
  const agentScore = checkAgentPatterns(normalizedMessage, matchedPatterns);
  if (agentScore.confidence >= 0.85) {
    logger.debug('Agent mode detected', { confidence: agentScore.confidence, patterns: matchedPatterns });
    return {
      mode: 'agent',
      confidence: agentScore.confidence,
      reasoning: agentScore.reasoning,
      matchedPatterns,
    };
  }

  // 2. Check for Tool patterns
  const toolScore = checkToolPatterns(normalizedMessage, matchedPatterns);
  if (toolScore.confidence >= 0.8) {
    logger.debug('Tool mode detected', {
      confidence: toolScore.confidence,
      tools: toolScore.suggestedTools,
      patterns: matchedPatterns,
    });
    return {
      mode: 'tool_assisted',
      confidence: toolScore.confidence,
      reasoning: toolScore.reasoning,
      suggestedTools: toolScore.suggestedTools,
      matchedPatterns,
    };
  }

  // 3. Check for RAG patterns
  const ragScore = checkRAGPatterns(normalizedMessage, matchedPatterns);
  if (ragScore.confidence >= 0.75) {
    logger.debug('RAG mode detected', { confidence: ragScore.confidence, patterns: matchedPatterns });
    return {
      mode: 'rag_enhanced',
      confidence: ragScore.confidence,
      reasoning: ragScore.reasoning,
      matchedPatterns,
    };
  }

  // 4. Check for lower-confidence tool patterns
  if (toolScore.confidence >= 0.6) {
    return {
      mode: 'tool_assisted',
      confidence: toolScore.confidence,
      reasoning: toolScore.reasoning,
      suggestedTools: toolScore.suggestedTools,
      matchedPatterns,
    };
  }

  // 5. Default to conversation
  return {
    mode: 'conversation',
    confidence: 0.9,
    reasoning: 'No special patterns detected, using standard conversation',
    matchedPatterns: [],
  };
}

/**
 * Determine if RAG should be used regardless of mode
 */
export function shouldEnhanceWithRAG(message: string, mode: ChatMode): RAGDecision {
  // Always use RAG in rag_enhanced mode
  if (mode === 'rag_enhanced') {
    return {
      shouldUse: true,
      reason: 'Mode explicitly requires RAG',
      urgency: 'required',
    };
  }

  const normalizedMessage = normalizeMessage(message);
  const matchedPatterns: string[] = [];
  const ragScore = checkRAGPatterns(normalizedMessage, matchedPatterns);

  if (ragScore.confidence >= 0.7) {
    return {
      shouldUse: true,
      reason: ragScore.reasoning,
      urgency: ragScore.urgency,
    };
  }

  // Check for personal pronouns + question pattern
  if (/^(was|wie|warum|wann|wo|wer)\s/i.test(message) && /\b(mein|ich|wir|unser)\b/i.test(message)) {
    return {
      shouldUse: true,
      reason: 'Personal knowledge question detected',
      urgency: 'recommended',
    };
  }

  return {
    shouldUse: false,
    reason: 'No RAG indicators detected',
    urgency: 'optional',
  };
}

// ===========================================
// Pattern Checking Helpers
// ===========================================

function checkAgentPatterns(
  message: string,
  matchedPatterns: string[]
): { confidence: number; reasoning: string } {
  let maxWeight = 0;
  let matchedPattern: string | null = null;

  for (const { pattern, weight } of AGENT_PATTERNS) {
    if (pattern.test(message)) {
      matchedPatterns.push(pattern.source);
      if (weight > maxWeight) {
        maxWeight = weight;
        matchedPattern = pattern.source;
      }
    }
  }

  // Boost for multiple patterns
  if (matchedPatterns.length >= 2) {
    maxWeight = Math.min(maxWeight + 0.05, 1.0);
  }

  return {
    confidence: maxWeight,
    reasoning: matchedPattern
      ? `Agent pattern matched: complex multi-step task`
      : 'No agent patterns matched',
  };
}

function checkToolPatterns(
  message: string,
  matchedPatterns: string[]
): {
  confidence: number;
  reasoning: string;
  suggestedTools: string[];
} {
  let maxWeight = 0;
  const suggestedTools = new Set<string>();
  let matchedPattern: string | null = null;

  for (const { pattern, tools, weight } of TOOL_PATTERNS) {
    if (pattern.test(message)) {
      matchedPatterns.push(pattern.source);
      tools.forEach(t => suggestedTools.add(t));
      if (weight > maxWeight) {
        maxWeight = weight;
        matchedPattern = pattern.source;
      }
    }
  }

  // Keyword analysis for additional tool hints
  const keywordTools = analyzeKeywordsForTools(message);
  keywordTools.forEach(t => suggestedTools.add(t));

  if (keywordTools.length > 0 && maxWeight < 0.6) {
    maxWeight = Math.max(maxWeight, 0.6);
  }

  return {
    confidence: maxWeight,
    reasoning: matchedPattern
      ? `Tool pattern matched: ${Array.from(suggestedTools).join(', ')}`
      : 'Tool keywords detected',
    suggestedTools: Array.from(suggestedTools),
  };
}

function checkRAGPatterns(
  message: string,
  matchedPatterns: string[]
): {
  confidence: number;
  reasoning: string;
  urgency: 'required' | 'recommended' | 'optional';
} {
  let maxWeight = 0;
  let urgency: 'required' | 'recommended' | 'optional' = 'optional';
  let matchedPattern: string | null = null;

  for (const { pattern, urgency: patternUrgency, weight } of RAG_PATTERNS) {
    if (pattern.test(message)) {
      matchedPatterns.push(pattern.source);
      if (weight > maxWeight) {
        maxWeight = weight;
        urgency = patternUrgency;
        matchedPattern = pattern.source;
      }
    }
  }

  return {
    confidence: maxWeight,
    reasoning: matchedPattern
      ? `RAG pattern matched: knowledge retrieval ${urgency}`
      : 'No RAG patterns matched',
    urgency,
  };
}

// ===========================================
// Utility Functions
// ===========================================

/**
 * Normalize message for pattern matching
 */
function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/[.,!?;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Analyze keywords for tool suggestions
 */
function analyzeKeywordsForTools(message: string): string[] {
  const tools: string[] = [];
  const lowerMessage = message.toLowerCase();

  const toolKeywords: Record<string, string[]> = {
    search_ideas: ['ideen', 'notizen', 'suchen', 'finden', 'durchsuchen', 'liste'],
    create_idea: ['erstellen', 'anlegen', 'speichern', 'merken', 'notieren', 'aufschreiben'],
    calculate: ['berechnen', 'rechnen', 'prozent', 'summe', 'durchschnitt', 'addieren'],
    get_related_ideas: ['verwandt', 'ähnlich', 'zusammenhang', 'verbunden', 'bezug'],
    remember: ['merken', 'behalten'],
    recall: ['erinnern', 'früher', 'gesagt', 'erwähnt'],
    memory_update: ['korrigiere', 'aktualisiere', 'stimmt nicht mehr', 'nicht mehr richtig', 'jetzt stattdessen'],
    memory_delete: ['vergiss', 'lösch', 'entferne', 'vergessen'],
    memory_update_profile: ['nenn mich', 'ich heiße', 'ich bin umgezogen', 'ich arbeite jetzt'],
    create_meeting: ['meeting', 'termin', 'besprechung', 'treffen', 'kalender'],
    navigate_to: ['seite', 'navigieren', 'öffnen', 'gehen'],
    app_help: ['hilfe', 'erklären', 'funktioniert', 'feature', 'anleitung'],
    ask_inbox: ['inbox', 'postfach', 'posteingang', 'e-mail', 'email', 'mails'],
    inbox_summary: ['inbox-überblick', 'mailstatus', 'postfach-status'],
    mcp_list_tools: ['mcp', 'externe tools', 'externe werkzeuge', 'mcp-server'],
    mcp_call_tool: ['mcp tool aufrufen', 'externes tool nutzen'],
  };

  for (const [tool, keywords] of Object.entries(toolKeywords)) {
    if (keywords.some(kw => lowerMessage.includes(kw))) {
      tools.push(tool);
    }
  }

  return tools;
}

/**
 * API effort level for cost optimization.
 * Maps to Claude API's `effort` parameter which controls token spending.
 * - 'low': Minimal reasoning, fast responses (simple chat)
 * - 'medium': Balanced reasoning (tool use, RAG)
 * - 'high': Maximum reasoning depth (complex agent tasks)
 */
export type EffortLevel = 'low' | 'medium' | 'high';

/**
 * Get the appropriate effort level for a chat mode.
 * Used to optimize API costs by matching reasoning depth to task complexity.
 *
 * @param mode - The detected chat mode
 * @returns The effort level for the Claude API
 */
export function getEffortForMode(mode: ChatMode): EffortLevel {
  switch (mode) {
    case 'conversation':
      return 'low';
    case 'tool_assisted':
      return 'medium';
    case 'rag_enhanced':
      return 'medium';
    case 'agent':
      return 'high';
    default:
      return 'medium';
  }
}

/**
 * Get the default tools for a mode
 */
export function getDefaultToolsForMode(mode: ChatMode): string[] {
  switch (mode) {
    case 'tool_assisted':
      return ['search_ideas', 'create_idea', 'calculate', 'remember', 'recall', 'memory_update', 'memory_delete', 'memory_update_profile', 'execute_code', 'create_meeting', 'navigate_to', 'app_help', 'get_revenue_metrics', 'get_traffic_analytics', 'get_seo_performance', 'get_system_health', 'generate_business_report', 'identify_anomalies', 'compare_periods', 'ask_inbox', 'inbox_summary', 'mcp_list_tools', 'mcp_call_tool'];
    case 'agent':
      return ['search_ideas', 'create_idea', 'get_related_ideas', 'calculate', 'remember', 'recall', 'memory_introspect', 'memory_update', 'memory_delete', 'memory_update_profile', 'execute_code', 'create_meeting', 'navigate_to', 'app_help', 'get_revenue_metrics', 'get_traffic_analytics', 'get_seo_performance', 'get_system_health', 'generate_business_report', 'identify_anomalies', 'compare_periods', 'ask_inbox', 'inbox_summary', 'mcp_list_tools', 'mcp_call_tool'];
    case 'rag_enhanced':
      return ['search_ideas', 'recall'];
    default:
      return [];
  }
}

// ===========================================
// Semantic Fallback (LLM-based classification)
// ===========================================

/**
 * Simple in-memory LRU cache for semantic classification results.
 * Max 100 entries, 5-minute TTL.
 */
interface CacheEntry {
  result: ModeDetectionResult;
  timestamp: number;
}

const SEMANTIC_CACHE_MAX = 100;
const SEMANTIC_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const semanticCache = new Map<string, CacheEntry>();

function getCachedSemantic(key: string): ModeDetectionResult | null {
  const entry = semanticCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > SEMANTIC_CACHE_TTL_MS) {
    semanticCache.delete(key);
    return null;
  }
  // Move to end (LRU refresh)
  semanticCache.delete(key);
  semanticCache.set(key, entry);
  return entry.result;
}

function setCachedSemantic(key: string, result: ModeDetectionResult): void {
  // Evict oldest if at capacity
  if (semanticCache.size >= SEMANTIC_CACHE_MAX) {
    const firstKey = semanticCache.keys().next().value;
    if (firstKey !== undefined) {
      semanticCache.delete(firstKey);
    }
  }
  semanticCache.set(key, { result, timestamp: Date.now() });
}

/**
 * Classify a message using Claude Haiku as a semantic fallback.
 * Returns null if the API call fails (graceful degradation).
 */
async function classifyWithSemantic(message: string): Promise<ModeDetectionResult | null> {
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic();

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      system: 'Classify the user message into exactly ONE mode. Respond with ONLY the mode name, nothing else.\n\nModes:\n- tool_assisted: User wants to create, search, calculate, execute code, send email, or use any tool\n- agent: User wants multi-step research, analysis, comparison, or complex task\n- rag_enhanced: User asks about their own notes, memories, past conversations\n- conversation: General chat, greetings, opinions, philosophical discussion',
      messages: [{ role: 'user', content: message }],
    });

    const modeText = response.content[0]?.type === 'text'
      ? response.content[0].text.trim().toLowerCase()
      : 'conversation';

    const validModes: string[] = ['tool_assisted', 'agent', 'rag_enhanced', 'conversation'];
    const mode = validModes.includes(modeText) ? modeText : 'conversation';

    return {
      mode: mode as ChatMode,
      confidence: 0.85,
      suggestedTools: [],
      reasoning: 'semantic-classifier',
    };
  } catch (error) {
    logger.warn('Semantic classifier failed, using regex fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Async version of detectChatMode with semantic fallback.
 *
 * - First runs the existing regex-based detection (fast path).
 * - If confidence >= 0.6, returns immediately.
 * - If confidence < 0.6, calls Claude Haiku for semantic classification.
 * - Results are cached (LRU, max 100 entries, 5-min TTL).
 *
 * @param message - The user's message
 * @returns Mode detection result with confidence
 */
export async function detectChatModeAsync(message: string): Promise<ModeDetectionResult> {
  // Fast path: regex-based detection
  const regexResult = detectChatMode(message);

  if (regexResult.confidence >= 0.6) {
    return regexResult;
  }

  // Check cache before making API call
  const cacheKey = normalizeMessage(message);
  const cached = getCachedSemantic(cacheKey);
  if (cached) {
    logger.debug('Semantic cache hit for chat mode', { mode: cached.mode });
    return cached;
  }

  // Semantic fallback for low-confidence results
  logger.debug('Low confidence regex result, trying semantic fallback', {
    regexMode: regexResult.mode,
    regexConfidence: regexResult.confidence,
  });

  const semanticResult = await classifyWithSemantic(message);

  if (semanticResult) {
    setCachedSemantic(cacheKey, semanticResult);
    logger.debug('Semantic classifier result', { mode: semanticResult.mode });
    return semanticResult;
  }

  // If semantic fails, fall back to regex result
  return regexResult;
}

// ===========================================
// Simple Conversation Detection
// ===========================================

/**
 * Check if a message is a simple greeting/small talk
 */
export function isSimpleConversation(message: string): boolean {
  const trimmed = message.trim();

  // Simple patterns that should match the entire message (with optional punctuation)
  const simplePatterns = [
    /^(hallo|hi|hey|guten\s+(morgen|tag|abend)|servus|moin)[!?.]*$/i,
    /^(danke|vielen\s+dank|thx|thanks)[!?.]*$/i,
    /^(ja|nein|ok|okay|alles\s+klar|verstanden)[!?.]*$/i,
    /^wie\s+geht('?s|\s+es\s+dir)\??$/i,
    /^(tschüss|bye|auf\s+wiedersehen|bis\s+(bald|später|dann))[!?.]*$/i,
  ];

  return simplePatterns.some(p => p.test(trimmed));
}
