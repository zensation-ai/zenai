/**
 * ToolDisclosure Component
 *
 * Persistent disclosure widget shown after assistant messages that used tools.
 * Collapsed: "N Tools verwendet" with expand chevron.
 * Expanded: list of tool name + duration + status.
 *
 * @module components/GeneralChat/ToolDisclosure
 */

import { useState } from 'react';
import type { ToolCall } from './chatReducer';

// Tool label map (subset — reuse from ChatMessageList for labels)
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
  search_tools: 'Suche Tools',
  memory_promote: 'Foerdere Erinnerung',
  memory_demote: 'Stufe Erinnerung herab',
  memory_forget: 'Vergesse Erinnerung',
};

function getToolLabel(name: string): string {
  return TOOL_LABELS[name] || name.replace(/_/g, ' ');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export interface ToolDisclosureProps {
  toolCalls: ToolCall[];
}

export function ToolDisclosure({ toolCalls }: ToolDisclosureProps) {
  const [expanded, setExpanded] = useState(false);

  if (toolCalls.length === 0) return null;

  const errorCount = toolCalls.filter(t => t.status === 'error').length;
  const totalDuration = toolCalls.reduce((sum, t) => sum + t.duration_ms, 0);

  return (
    <div className="tool-disclosure" role="group" aria-label="Verwendete Tools">
      <button
        type="button"
        className="tool-disclosure-toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls="tool-disclosure-list"
      >
        <span className="tool-disclosure-icon" aria-hidden="true">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
        </span>
        <span className="tool-disclosure-summary">
          {toolCalls.length} Tool{toolCalls.length !== 1 ? 's' : ''} verwendet
          {errorCount > 0 && <span className="tool-disclosure-errors"> ({errorCount} fehlgeschlagen)</span>}
          {totalDuration > 0 && <span className="tool-disclosure-total-time"> &middot; {formatDuration(totalDuration)}</span>}
        </span>
        <span className={`tool-disclosure-chevron${expanded ? ' tool-disclosure-chevron--open' : ''}`} aria-hidden="true">
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </span>
      </button>

      {expanded && (
        <ol id="tool-disclosure-list" className="tool-disclosure-list">
          {toolCalls.map((tc, i) => (
            <li key={i} className={`tool-disclosure-item ${tc.status === 'error' ? 'tool-disclosure-item--error' : ''}`}>
              <span className="tool-disclosure-status" aria-hidden="true">
                {tc.status === 'success' ? (
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--color-success, #22c55e)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--color-error, #ef4444)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                )}
              </span>
              <span className="tool-disclosure-name">{getToolLabel(tc.name)}</span>
              {tc.duration_ms > 0 && (
                <span className="tool-disclosure-duration">{formatDuration(tc.duration_ms)}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
