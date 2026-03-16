/**
 * ToolResultRenderer Component
 *
 * Renders tool results as rich React components instead of plain text.
 * Maps tool names to specialized renderers for business stats, search results,
 * memory content, calendar events, code output, email previews, and more.
 */

interface ToolResultRendererProps {
  toolName: string;
  result: string;
  success: boolean;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Safely parse JSON, returning null on failure */
function tryParseJSON(str: string): Record<string, unknown> | unknown[] | null {
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Extract a readable value from nested data */
function extractValue(obj: unknown): string {
  if (obj === null || obj === undefined) return '-';
  if (typeof obj === 'number') return obj.toLocaleString('de-DE');
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'boolean') return obj ? 'Ja' : 'Nein';
  return String(obj);
}

/** Truncate string to max length */
function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}

function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/* ------------------------------------------------------------------ */
/* Tool category detection                                             */
/* ------------------------------------------------------------------ */

type RendererType = 'business' | 'search' | 'memory' | 'calendar' | 'map' | 'code' | 'email' | 'create' | 'default';

const TOOL_RENDERER_MAP: Record<string, RendererType> = {
  // Business
  get_revenue_metrics: 'business',
  get_traffic_analytics: 'business',
  get_seo_performance: 'business',
  get_system_health: 'business',
  generate_business_report: 'business',
  identify_anomalies: 'business',
  compare_periods: 'business',
  // Search
  search_ideas: 'search',
  web_search: 'search',
  github_search: 'search',
  search_documents: 'search',
  github_list_issues: 'search',
  find_nearby_places: 'search',
  // Memory
  remember: 'memory',
  recall: 'memory',
  memory_introspect: 'memory',
  // Calendar
  create_calendar_event: 'calendar',
  list_calendar_events: 'calendar',
  // Map
  get_directions: 'map',
  get_opening_hours: 'map',
  optimize_day_route: 'map',
  estimate_travel: 'map',
  // Code
  execute_code: 'code',
  // Email
  draft_email: 'email',
  ask_inbox: 'email',
  inbox_summary: 'email',
  // Create / Update
  create_idea: 'create',
  update_idea: 'create',
  create_meeting: 'create',
  create_task: 'create',
  github_create_issue: 'create',
};

function getRendererType(toolName: string): RendererType {
  return TOOL_RENDERER_MAP[toolName] || 'default';
}

/* ------------------------------------------------------------------ */
/* Specialized renderers                                               */
/* ------------------------------------------------------------------ */

function BusinessRenderer({ data }: { data: Record<string, unknown> }) {
  // Collect top-level key-value pairs that look like metrics
  const entries: Array<{ label: string; value: string }> = [];

  function collectMetrics(obj: Record<string, unknown>, prefix = '') {
    for (const [key, val] of Object.entries(obj)) {
      if (entries.length >= 6) break;
      if (val === null || val === undefined) continue;
      if (typeof val === 'object' && !Array.isArray(val)) {
        collectMetrics(val as Record<string, unknown>, key + '.');
      } else if (typeof val !== 'object') {
        const label = (prefix + key).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        entries.push({ label, value: extractValue(val) });
      }
    }
  }

  collectMetrics(data);

  if (entries.length === 0) return <DefaultRenderer text={JSON.stringify(data, null, 2)} />;

  return (
    <div className="tool-result-stats">
      {entries.map((e, i) => (
        <div key={i} className="tool-result-stat-card">
          <span className="tool-result-stat-label">{e.label}</span>
          <span className="tool-result-stat-value">{e.value}</span>
        </div>
      ))}
    </div>
  );
}

function SearchRenderer({ data }: { data: unknown }) {
  // Try to extract an array of results
  let items: unknown[] = [];
  if (Array.isArray(data)) {
    items = data;
  } else if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    // Look for common result array keys
    for (const key of ['results', 'items', 'ideas', 'documents', 'issues', 'data', 'places']) {
      if (Array.isArray(obj[key])) {
        items = obj[key] as unknown[];
        break;
      }
    }
  }

  if (items.length === 0) {
    return <div className="tool-result-list"><span className="tool-result-list-empty">Keine Ergebnisse gefunden</span></div>;
  }

  const displayItems = items.slice(0, 5);

  return (
    <div className="tool-result-list">
      {displayItems.map((item, i) => {
        const obj = (typeof item === 'object' && item !== null) ? item as Record<string, unknown> : {};
        const title = String(obj.title || obj.name || obj.summary || obj.query || `Ergebnis ${i + 1}`);
        const snippet = String(obj.snippet || obj.description || obj.content || obj.body || '');
        return (
          <div key={i} className="tool-result-list-item">
            <span className="tool-result-list-title">{truncate(title, 80)}</span>
            {snippet && <span className="tool-result-list-snippet">{truncate(snippet, 120)}</span>}
          </div>
        );
      })}
      {items.length > 5 && (
        <span className="tool-result-list-count">+{items.length - 5} weitere</span>
      )}
    </div>
  );
}

function MemoryRenderer({ data, text }: { data: Record<string, unknown> | null; text: string }) {
  const content = data
    ? String(data.message || data.content || data.fact || data.memory || data.result || text)
    : text;

  const facts = data && Array.isArray(data.facts) ? (data.facts as unknown[]).slice(0, 4) : null;

  return (
    <div className="tool-result-memory">
      <div className="tool-result-memory-header">
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.3 4.8-3.5 6-.3.2-.5.5-.5.9V17h-6v-1.1c0-.4-.2-.7-.5-.9C6.3 13.8 5 11.5 5 9a7 7 0 0 1 7-7z"/>
          <line x1="9" y1="21" x2="15" y2="21"/>
        </svg>
        <span>Gedaechtnis</span>
      </div>
      <p className="tool-result-memory-text">{truncate(content, 200)}</p>
      {facts && facts.length > 0 && (
        <ul className="tool-result-memory-facts">
          {facts.map((f, i) => {
            const factObj = typeof f === 'object' && f !== null ? f as Record<string, unknown> : {};
            const factText = String(factObj.fact || factObj.content || factObj.text || f);
            return <li key={i}>{truncate(factText, 100)}</li>;
          })}
        </ul>
      )}
    </div>
  );
}

function CalendarRenderer({ data }: { data: unknown }) {
  // Single event or list of events
  let events: unknown[] = [];
  if (Array.isArray(data)) {
    events = data;
  } else if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.events)) {
      events = obj.events as unknown[];
    } else {
      events = [data];
    }
  }

  const displayEvents = events.slice(0, 4);

  return (
    <div className="tool-result-events">
      {displayEvents.map((ev, i) => {
        const obj = typeof ev === 'object' && ev !== null ? ev as Record<string, unknown> : {};
        const title = String(obj.title || obj.summary || obj.name || 'Termin');
        const startRaw = obj.start_time || obj.start || obj.date || obj.starts_at;
        const startStr = startRaw ? formatDateTime(String(startRaw)) : '';
        const location = obj.location ? String(obj.location) : '';
        return (
          <div key={i} className="tool-result-event">
            <div className="tool-result-event-icon">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div className="tool-result-event-body">
              <span className="tool-result-event-title">{truncate(title, 60)}</span>
              {startStr && <span className="tool-result-event-time">{startStr}</span>}
              {location && <span className="tool-result-event-location">{truncate(location, 50)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MapRenderer({ data }: { data: Record<string, unknown> }) {
  const distance = data.distance || data.total_distance;
  const duration = data.duration || data.total_duration || data.travel_time;
  const origin = data.origin || data.from;
  const destination = data.destination || data.to;
  const name = data.name || data.place_name;
  const address = data.address || data.formatted_address;
  const hours = data.opening_hours || data.hours;

  const nameStr = name ? String(name) : '';
  const addressStr = address ? String(address) : '';
  const originStr = origin ? String(origin) : '?';
  const destStr = destination ? String(destination) : '?';
  const hoursStr = hours ? (typeof hours === 'string' ? hours : JSON.stringify(hours)) : '';

  return (
    <div className="tool-result-map">
      <div className="tool-result-map-icon">
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
      <div className="tool-result-map-content">
        {nameStr && <span className="tool-result-map-name">{nameStr}</span>}
        {addressStr && <span className="tool-result-map-address">{addressStr}</span>}
        {Boolean(origin || destination) && (
          <span className="tool-result-map-route">
            {originStr} → {destStr}
          </span>
        )}
        {Boolean(distance || duration) && (
          <span className="tool-result-map-meta">
            {distance ? <span>{extractValue(distance)}</span> : null}
            {distance && duration ? <span> · </span> : null}
            {duration ? <span>{extractValue(duration)}</span> : null}
          </span>
        )}
        {hoursStr && <span className="tool-result-map-hours">{hoursStr}</span>}
      </div>
    </div>
  );
}

function CodeRenderer({ data, text }: { data: Record<string, unknown> | null; text: string }) {
  const output = data ? String(data.output || data.stdout || data.result || text) : text;
  const stderr = data ? String(data.stderr || '') : '';
  const exitCode = data?.exit_code ?? data?.exitCode ?? data?.status;
  const language = data ? String(data.language || '') : '';

  const isSuccess = exitCode === 0 || exitCode === 'success' || exitCode === undefined;

  return (
    <div className="tool-result-code">
      <div className="tool-result-code-header">
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
        </svg>
        {language && <span className="tool-result-code-lang">{language}</span>}
        {exitCode !== undefined && exitCode !== null && (
          <span className={`tool-result-code-exit ${isSuccess ? 'tool-result-code-exit--ok' : 'tool-result-code-exit--err'}`}>
            Exit {String(exitCode)}
          </span>
        )}
      </div>
      <pre className="tool-result-code-output">{truncate(output.trim(), 300)}</pre>
      {stderr && stderr !== 'undefined' && stderr.trim() && (
        <pre className="tool-result-code-stderr">{truncate(stderr.trim(), 150)}</pre>
      )}
    </div>
  );
}

function EmailRenderer({ data }: { data: Record<string, unknown> }) {
  const subjectStr = (data.subject || data.title) ? String(data.subject || data.title) : '';
  const fromStr = (data.from || data.sender) ? String(data.from || data.sender) : '';
  const toStr = (data.to || data.recipient) ? String(data.to || data.recipient) : '';
  const bodyStr = (data.body || data.content || data.preview || data.summary) ? String(data.body || data.content || data.preview || data.summary) : '';
  const countStr = (data.total || data.count || data.unread) ? extractValue(data.total || data.count || data.unread) : '';
  const summaryStr = data.summary ? String(data.summary) : '';

  // Inbox summary style
  if (data.categories || data.summary || countStr) {
    return (
      <div className="tool-result-email">
        <div className="tool-result-email-header">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
          </svg>
          <span>Postfach</span>
          {countStr && <span className="tool-result-email-badge">{countStr}</span>}
        </div>
        {summaryStr && <p className="tool-result-email-body">{truncate(summaryStr, 150)}</p>}
      </div>
    );
  }

  return (
    <div className="tool-result-email">
      <div className="tool-result-email-header">
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
        </svg>
        {subjectStr && <span className="tool-result-email-subject">{truncate(subjectStr, 60)}</span>}
      </div>
      {(fromStr || toStr) && (
        <span className="tool-result-email-meta">
          {fromStr && <span>Von: {truncate(fromStr, 40)}</span>}
          {toStr && <span> An: {truncate(toStr, 40)}</span>}
        </span>
      )}
      {bodyStr && <p className="tool-result-email-body">{truncate(bodyStr, 150)}</p>}
    </div>
  );
}

function CreateRenderer({ data, toolName }: { data: Record<string, unknown>; toolName: string }) {
  const isUpdate = toolName.startsWith('update');
  const titleStr = (data.title || data.name || data.summary || data.subject) ? String(data.title || data.name || data.summary || data.subject) : '';
  const idStr = data.id ? String(data.id).slice(0, 12) : '';
  const msgStr = (data.message || data.status) ? String(data.message || data.status) : '';

  return (
    <div className="tool-result-success">
      <div className="tool-result-success-icon">
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div className="tool-result-success-body">
        <span className="tool-result-success-label">{isUpdate ? 'Aktualisiert' : 'Erstellt'}</span>
        {titleStr && <span className="tool-result-success-title">{truncate(titleStr, 80)}</span>}
        {msgStr && <span className="tool-result-success-msg">{truncate(msgStr, 100)}</span>}
        {idStr && <span className="tool-result-success-id">ID: {idStr}</span>}
      </div>
    </div>
  );
}

function DefaultRenderer({ text }: { text: string }) {
  return <pre className="tool-result-default-text">{truncate(text, 250)}</pre>;
}

/* ------------------------------------------------------------------ */
/* Error fallback                                                      */
/* ------------------------------------------------------------------ */

function ErrorRenderer({ text }: { text: string }) {
  return (
    <div className="tool-result-error-content">
      <span className="tool-result-error-label">Fehler</span>
      <span className="tool-result-error-msg">{truncate(text, 200)}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function ToolResultRenderer({ toolName, result, success }: ToolResultRendererProps) {
  if (!success) {
    return <ErrorRenderer text={result} />;
  }

  const type = getRendererType(toolName);
  const parsed = tryParseJSON(result);

  switch (type) {
    case 'business':
      if (parsed && !Array.isArray(parsed)) return <BusinessRenderer data={parsed} />;
      break;
    case 'search':
      if (parsed) return <SearchRenderer data={parsed} />;
      break;
    case 'memory':
      return <MemoryRenderer data={parsed && !Array.isArray(parsed) ? parsed : null} text={result} />;
    case 'calendar':
      if (parsed) return <CalendarRenderer data={parsed} />;
      break;
    case 'map':
      if (parsed && !Array.isArray(parsed)) return <MapRenderer data={parsed} />;
      break;
    case 'code':
      return <CodeRenderer data={parsed && !Array.isArray(parsed) ? parsed : null} text={result} />;
    case 'email':
      if (parsed && !Array.isArray(parsed)) return <EmailRenderer data={parsed} />;
      break;
    case 'create':
      if (parsed && !Array.isArray(parsed)) return <CreateRenderer data={parsed} toolName={toolName} />;
      break;
  }

  // Default: try formatted JSON, fall back to plain text
  if (parsed) {
    return <DefaultRenderer text={JSON.stringify(parsed, null, 2)} />;
  }
  return <DefaultRenderer text={result} />;
}
