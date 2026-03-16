/**
 * ChatMessageList Component
 *
 * Renders the messages display area including the empty state,
 * message list, streaming response, typing indicator, and stop button.
 */

import { useRef, useEffect, useState, type RefObject } from 'react';
import {
  AI_PERSONALITY,
  EMPTY_STATE_MESSAGES,
  getRandomMessage,
} from '../../utils/aiPersonality';
import type { ChatMessage } from './types';
import { ToolResultRenderer } from './ToolResultRenderer';
import { Brain, User, BookOpen, Link, Pencil } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* SVG icon helpers — small inline 16x16 icons by tool category       */
/* ------------------------------------------------------------------ */

type ToolCategory = 'search' | 'create' | 'memory' | 'code' | 'web' | 'business' | 'calendar' | 'map' | 'email' | 'github' | 'document' | 'nav' | 'misc';

const TOOL_CATEGORY_MAP: Record<string, ToolCategory> = {
  search_ideas: 'search', get_related_ideas: 'search', search_documents: 'search',
  web_search: 'search', find_nearby_places: 'search', ask_inbox: 'search',
  create_idea: 'create', create_meeting: 'create', create_calendar_event: 'create',
  github_create_issue: 'create',
  update_idea: 'create', archive_idea: 'misc', delete_idea: 'misc',
  remember: 'memory', recall: 'memory', memory_introspect: 'memory',
  memory_update: 'memory', memory_delete: 'memory', memory_update_profile: 'memory',
  memory_rethink: 'memory', memory_restructure: 'memory',
  execute_code: 'code', calculate: 'code', synthesize_knowledge: 'code',
  fetch_url: 'web', mcp_call_tool: 'web', mcp_list_tools: 'web',
  github_search: 'github', github_repo_info: 'github', github_list_issues: 'github',
  github_pr_summary: 'github',
  analyze_project: 'code', get_project_summary: 'document', list_project_files: 'document',
  analyze_document: 'document',
  get_revenue_metrics: 'business', get_traffic_analytics: 'business',
  get_seo_performance: 'business', get_system_health: 'business',
  generate_business_report: 'business', identify_anomalies: 'business',
  compare_periods: 'business',
  list_calendar_events: 'calendar',
  draft_email: 'email', inbox_summary: 'email', estimate_travel: 'map',
  get_directions: 'map', get_opening_hours: 'map', optimize_day_route: 'map',
  navigate_to: 'nav', app_help: 'nav',
};

function getToolCategory(name: string): ToolCategory {
  return TOOL_CATEGORY_MAP[name] || 'misc';
}

/** Returns a 16x16 inline SVG element for the given tool category */
function getToolIcon(category: ToolCategory): JSX.Element {
  const props = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (category) {
    case 'search':
      return <svg {...props}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
    case 'create':
      return <svg {...props}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
    case 'memory':
      return <svg {...props}><path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.3 4.8-3.5 6-.3.2-.5.5-.5.9V17h-6v-1.1c0-.4-.2-.7-.5-.9C6.3 13.8 5 11.5 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/><line x1="10" y1="17" x2="10" y2="21"/><line x1="14" y1="17" x2="14" y2="21"/></svg>;
    case 'code':
      return <svg {...props}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
    case 'web':
      return <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
    case 'business':
      return <svg {...props}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
    case 'calendar':
      return <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
    case 'map':
      return <svg {...props}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
    case 'email':
      return <svg {...props}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>;
    case 'github':
      return <svg {...props}><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>;
    case 'document':
      return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
    case 'nav':
      return <svg {...props}><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>;
    case 'misc':
    default:
      return <svg {...props}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>;
  }
}

/** Returns an error X icon (16x16) */
function getErrorIcon(): JSX.Element {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Tool label map                                                      */
/* ------------------------------------------------------------------ */

/** Tool name to German-friendly label */
const TOOL_LABELS: Record<string, string> = {
  search_ideas: 'Durchsuche Gedanken',
  create_idea: 'Erstelle Gedanken',
  update_idea: 'Aktualisiere Gedanken',
  archive_idea: 'Archiviere Gedanken',
  delete_idea: 'Loesche Gedanken',
  get_related_ideas: 'Suche Verbindungen',
  calculate: 'Berechne',
  remember: 'Merke mir das',
  recall: 'Erinnere mich',
  memory_introspect: 'Pruefe Gedaechtnis',
  memory_update: 'Aktualisiere Erinnerung',
  memory_delete: 'Loesche Erinnerung',
  memory_update_profile: 'Aktualisiere Profil',
  memory_rethink: 'Ueberdenke Erinnerung',
  memory_restructure: 'Reorganisiere Gedaechtnis',
  web_search: 'Durchsuche das Web',
  fetch_url: 'Lade Webseite',
  github_search: 'Durchsuche GitHub',
  github_create_issue: 'Erstelle GitHub Issue',
  github_repo_info: 'Lade Repository-Info',
  github_list_issues: 'Liste GitHub Issues',
  github_pr_summary: 'Lade PR-Zusammenfassung',
  analyze_project: 'Analysiere Projekt',
  get_project_summary: 'Lade Projektuebersicht',
  list_project_files: 'Liste Projektdateien',
  execute_code: 'Fuehre Code aus',
  analyze_document: 'Analysiere Dokument',
  search_documents: 'Durchsuche Dokumente',
  synthesize_knowledge: 'Synthetisiere Wissen',
  create_meeting: 'Erstelle Termin',
  navigate_to: 'Navigiere',
  app_help: 'Suche Hilfe',
  get_revenue_metrics: 'Lade Umsatzdaten',
  get_traffic_analytics: 'Lade Traffic-Daten',
  get_seo_performance: 'Pruefe SEO',
  get_system_health: 'Pruefe Systemstatus',
  generate_business_report: 'Erstelle Bericht',
  identify_anomalies: 'Suche Anomalien',
  compare_periods: 'Vergleiche Zeitraeume',
  create_calendar_event: 'Erstelle Kalender-Eintrag',
  list_calendar_events: 'Lade Kalender',
  draft_email: 'Schreibe E-Mail-Entwurf',
  estimate_travel: 'Berechne Reisezeit',
  get_directions: 'Berechne Route',
  get_opening_hours: 'Pruefe Oeffnungszeiten',
  find_nearby_places: 'Suche in der Naehe',
  optimize_day_route: 'Optimiere Tagesroute',
  ask_inbox: 'Durchsuche Posteingang',
  inbox_summary: 'Lade Postfach-Uebersicht',
  mcp_call_tool: 'Rufe externes Tool',
  mcp_list_tools: 'Liste verfuegbare Tools',
};

function getToolLabel(name: string): string {
  return TOOL_LABELS[name] || name.replace(/_/g, ' ');
}

/** Format milliseconds as human-readable duration */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Phase-based AI processing stages shown while waiting for stream */
const AI_PHASES = [
  { label: 'Kontext laden...', icon: <Brain size={14} strokeWidth={1.5} />, delay: 0 },
  { label: 'Erinnerungen durchsuchen...', icon: <BookOpen size={14} strokeWidth={1.5} />, delay: 2000 },
  { label: 'Zusammenhaenge analysieren...', icon: <Link size={14} strokeWidth={1.5} />, delay: 5000 },
  { label: 'Antwort formulieren...', icon: <Pencil size={14} strokeWidth={1.5} />, delay: 8000 },
];

function useAIPhase(active: boolean) {
  const [phase, setPhase] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!active) {
      setPhase(0);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      return;
    }
    // Schedule phase transitions
    timersRef.current = AI_PHASES.slice(1).map((p, i) =>
      setTimeout(() => setPhase(i + 1), p.delay),
    );
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [active]);

  return active ? AI_PHASES[phase] : AI_PHASES[0];
}

/** Shape of a completed tool result with timing and status */
export interface ToolResult {
  name: string;
  result: string;
  duration_ms: number;
  success: boolean;
}

interface ChatMessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  thinkingContent: string;
  sending: boolean;
  activeToolName: string | null;
  toolResults: ToolResult[];
  renderContent: (content: string, messageId?: string) => React.ReactNode;
  messagesEndRef: RefObject<HTMLDivElement>;
  onStopGenerating?: () => void;
}

function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChatMessageList({
  messages,
  isStreaming,
  streamingContent,
  thinkingContent,
  sending,
  activeToolName,
  toolResults,
  renderContent,
  messagesEndRef,
  onStopGenerating,
}: ChatMessageListProps) {
  // Phase-based AI status messages
  const aiPhase = useAIPhase(sending && !isStreaming);

  // Track which tool pill is expanded (by index)
  const [expandedToolIdx, setExpandedToolIdx] = useState<number | null>(null);

  // Reset expanded tool when streaming ends
  useEffect(() => {
    if (!isStreaming) setExpandedToolIdx(null);
  }, [isStreaming]);

  // Stabilize thinking message to prevent flickering on every re-render
  const thinkingMessageRef = useRef<string>('');
  useEffect(() => {
    if (sending && !isStreaming) {
      thinkingMessageRef.current = getRandomMessage('thinking');
    }
  }, [sending, isStreaming]);


  return (
    <div className="chat-messages" role="log" aria-label="Chat-Nachrichten">
      {messages.length === 0 ? (
        <div className="chat-empty neuro-empty-state neuro-human-fade-in" role="status" aria-label="Leerer Chat - Beginne eine Unterhaltung">
          <div className="chat-empty-avatar neuro-breathing" aria-hidden="true"><Brain size={32} strokeWidth={1.5} /></div>
          <h3 className="chat-empty-title neuro-empty-title">{EMPTY_STATE_MESSAGES.chat.title}</h3>
          <p className="chat-empty-description neuro-empty-description">{EMPTY_STATE_MESSAGES.chat.description}</p>
          <span className="chat-empty-hint neuro-empty-encouragement">{EMPTY_STATE_MESSAGES.chat.encouragement}</span>
          <div className="chat-empty-name">
            <span>Ich bin {AI_PERSONALITY.name}</span>
          </div>
        </div>
      ) : (
        <>
          {messages.map(message => (
            <div
              key={message.id}
              className={`chat-message ${message.role} neuro-human-fade-in`}
              role="article"
              aria-label={`Nachricht von ${message.role === 'assistant' ? AI_PERSONALITY.name : 'Dir'}`}
            >
              <div className="chat-message-avatar" title={message.role === 'assistant' ? AI_PERSONALITY.name : 'Du'} aria-hidden="true">
                {message.role === 'assistant' ? <Brain size={18} strokeWidth={1.5} /> : <User size={18} strokeWidth={1.5} />}
              </div>
              <div className="chat-message-content">
                <div className="chat-message-header">
                  <span className="chat-message-name">
                    {message.role === 'assistant' ? AI_PERSONALITY.name : 'Du'}
                  </span>
                  <span className="chat-message-time">{formatTime(message.createdAt)}</span>
                </div>
                <div className="chat-message-text">
                  {renderContent(message.content, message.id)}
                </div>
              </div>
            </div>
          ))}
          {/* Streaming response - shows content as it arrives (including empty state while waiting for first delta) */}
          {isStreaming && (
            <div className="chat-message assistant neuro-human-fade-in streaming" role="status" aria-live="polite">
              <div className="chat-message-avatar" title={AI_PERSONALITY.name} aria-hidden="true"><Brain size={18} strokeWidth={1.5} /></div>
              <div className="chat-message-content">
                <div className="chat-message-header">
                  <span className="chat-message-name">{AI_PERSONALITY.name}</span>
                  <span className="chat-message-status streaming-indicator">schreibt...</span>
                </div>
                {thinkingContent && (
                  <div className="chat-thinking-block" aria-label="KI denkt nach">
                    <span className="thinking-label">Denke nach...</span>
                    <span className="thinking-preview">{thinkingContent.length > 100 ? `${thinkingContent.slice(0, 100)}...` : thinkingContent}</span>
                  </div>
                )}
                {/* Tool activity: completed tools + active tool */}
                {(toolResults.length > 0 || activeToolName) && (
                  <div className="chat-tool-activity" aria-label="KI nutzt Werkzeuge">
                    {toolResults.map((tr, i) => {
                      const label = getToolLabel(tr.name);
                      const category = getToolCategory(tr.name);
                      const isExpanded = expandedToolIdx === i;
                      const pillClass = tr.success
                        ? 'chat-tool-pill chat-tool-pill--done'
                        : 'chat-tool-pill chat-tool-pill--error';
                      return (
                        <div key={i} className="chat-tool-pill-wrapper">
                          <button
                            type="button"
                            className={pillClass}
                            onClick={() => setExpandedToolIdx(isExpanded ? null : i)}
                            aria-expanded={isExpanded}
                            aria-label={`${label} ${tr.success ? 'abgeschlossen' : 'fehlgeschlagen'}${tr.duration_ms ? ` in ${formatDuration(tr.duration_ms)}` : ''}`}
                          >
                            <span className="chat-tool-icon" aria-hidden="true">
                              {tr.success ? getToolIcon(category) : getErrorIcon()}
                            </span>
                            {label}
                            {tr.duration_ms > 0 && (
                              <span className="chat-tool-duration">{formatDuration(tr.duration_ms)}</span>
                            )}
                            {tr.success ? (
                              <span className="chat-tool-check" aria-hidden="true">
                                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              </span>
                            ) : (
                              <span className="chat-tool-error-badge" aria-hidden="true">!</span>
                            )}
                            <span className={`chat-tool-chevron${isExpanded ? ' chat-tool-chevron--open' : ''}`} aria-hidden="true">
                              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                            </span>
                          </button>
                          {isExpanded && tr.result && (
                            <div className={`chat-tool-result${tr.success ? '' : ' chat-tool-result--error'}`}>
                              <ToolResultRenderer toolName={tr.name} result={tr.result} success={tr.success} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {activeToolName && (() => {
                      const label = getToolLabel(activeToolName);
                      const category = getToolCategory(activeToolName);
                      return (
                        <span className="chat-tool-pill chat-tool-pill--active" aria-label={`${label} laeuft`}>
                          <span className="chat-tool-icon" aria-hidden="true">{getToolIcon(category)}</span>
                          {label}
                          <span className="chat-tool-spinner" aria-hidden="true" />
                        </span>
                      );
                    })()}
                  </div>
                )}
                <div className="chat-message-text">
                  {streamingContent ? renderContent(streamingContent) : null}
                  <span className="streaming-cursor" aria-hidden="true">{'\u258B'}</span>
                </div>
              </div>
            </div>
          )}
          {/* Phase-based AI processing indicator */}
          {sending && !isStreaming && (
            <div className="chat-message assistant neuro-human-fade-in" role="status" aria-live="polite">
              <div className="chat-message-avatar neuro-breathing" title={AI_PERSONALITY.name} aria-hidden="true"><Brain size={18} strokeWidth={1.5} /></div>
              <div className="chat-message-content">
                <div className="chat-message-header">
                  <span className="chat-message-name">{AI_PERSONALITY.name}</span>
                  <span className="chat-message-status ai-phase-label">
                    <span className="ai-phase-icon" aria-hidden="true">{aiPhase.icon}</span>
                    {aiPhase.label}
                  </span>
                </div>
                <div className="typing-indicator neuro-typing" aria-label={aiPhase.label}>
                  <span className="neuro-typing-dot"></span>
                  <span className="neuro-typing-dot"></span>
                  <span className="neuro-typing-dot"></span>
                </div>
              </div>
            </div>
          )}
          {/* Stop generating button */}
          {(isStreaming || (sending && !isStreaming)) && onStopGenerating && (
            <div className="chat-stop-generating">
              <button
                type="button"
                className="chat-stop-btn neuro-focus-ring"
                onClick={onStopGenerating}
                aria-label="Generierung stoppen"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
                Stoppen
              </button>
            </div>
          )}
          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  );
}
