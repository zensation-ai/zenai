# ZenAI Masterplan: Weg zur Weltklasse-AI-OS

> **Ziel:** Eine der modernsten AI-OS-Anwendungen am Markt
> **Ausgangslage:** Phase 65, 282K LOC, 5.600+ Tests, 696 Tabellen
> **Bewertung:** 8/10 technisch, 6/10 UX-Wahrnehmung
> **Erstellt:** 2026-03-14

---

## Phasen-Uebersicht

| Phase | Name | Fokus | Dauer | Prioritaet |
|-------|------|-------|-------|------------|
| **66** | Security Hardening | RLS, Encryption, Sentry | 3-4 Tage | ERLEDIGT |
| **67** | Performance & Caching | RAG-Cache, DB-Tuning, Query-Optimierung | 3-4 Tage | ERLEDIGT |
| **68** | Design-System Formalisierung | Storybook, Component Library, Design Tokens Export | 5-7 Tage | ERLEDIGT |
| **69** | Proaktive Intelligence UX | Sichtbare KI-Proaktivitaet, Ambient UI, Smart Surfaces | 5-7 Tage | ERLEDIGT |
| **70** | A-RAG: Autonome Retrieval-Strategie | Agent-gesteuerte RAG, Self-Evaluating Retrieval | 4-5 Tage | ERLEDIGT |
| **71** | MCP Ecosystem Hub | Community-Server-Anbindung, Tool-Marketplace UI | 4-5 Tage | ERLEDIGT |
| **72** | Neuroscience Memory 2.0 | Emotional Tagging, Ebbinghaus Decay, Context-Dependent Retrieval | 5-6 Tage | ERLEDIGT |
| **73** | AI Observability (Langfuse) | Prompt-Tracking, Hallucination-Detection, Cost Analytics | 3-4 Tage | ERLEDIGT |
| **74** | Edge/Local Inference Layer | On-Device Intent Classification, Embedding Generation | 5-7 Tage | ERLEDIGT |
| **75** | Plugin/Extension System | Nutzer-erweiterbare Tools, Extension API | 5-7 Tage | ERLEDIGT |

**Gesamt-Dauer:** ~45-55 Arbeitstage (9-11 Wochen)

---

## Phase 66: Security Hardening

**Ziel:** Enterprise-Grade Security ohne Kompromisse. Jeder Pentest-Auditor soll zufrieden sein.

### 66.1 RLS Policies aktivieren

**Problem:** `phase65_rls_policies.sql` existiert, ist aber nicht aktiviert. Application-Level Filtering (`AND user_id = $N`) ist Single Point of Failure.

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `backend/sql/migrations/phase66_enable_rls.sql` | NEU | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` fuer alle 36+ Tabellen in 4 Schemas |
| `backend/src/utils/database-context.ts` | AENDERN | `SET app.current_user_id` bei jeder Query setzen (fuer RLS-Policy Zugriff via `current_setting('app.current_user_id')`) |
| `backend/src/__tests__/integration/rls-enforcement.test.ts` | NEU | Tests: User A kann User B Daten nicht sehen, SYSTEM_USER sieht alles |

**Implementierung:**

```sql
-- Fuer jede Tabelle in jedem Schema:
ALTER TABLE personal.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal.ideas FORCE ROW LEVEL SECURITY;

-- Policy: Nutzer sieht nur eigene Daten
CREATE POLICY user_isolation ON personal.ideas
  USING (user_id = current_setting('app.current_user_id')::uuid
         OR current_setting('app.current_user_id') = '00000000-0000-0000-0000-000000000001');
```

```typescript
// database-context.ts - Bei jeder Query:
async function queryContext(context: string, sql: string, params: any[], userId?: string) {
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO ${context}, public`);
    if (userId) {
      await client.query(`SET app.current_user_id = '${userId}'`);
    }
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}
```

**Akzeptanzkriterien:**
- [ ] RLS auf allen 36+ Tabellen in 4 Schemas aktiviert
- [ ] `queryContext` setzt `app.current_user_id` automatisch
- [ ] User A Query gibt 0 Rows fuer User B Daten zurueck
- [ ] SYSTEM_USER_ID hat Zugriff auf alle Daten
- [ ] Bestehende Tests bleiben gruen (Backward Compat)
- [ ] Neue RLS-Tests (mindestens 15)

---

### 66.2 Field-Level Encryption

**Problem:** Sensible Felder (OAuth Tokens, API Keys, MFA Secrets) im Klartext in DB.

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `backend/src/services/security/field-encryption.ts` | NEU | AES-256-GCM Encrypt/Decrypt mit ENCRYPTION_KEY aus ENV |
| `backend/src/services/auth/user-service.ts` | AENDERN | MFA-Secrets verschluesseln |
| `backend/src/services/auth/session-store.ts` | AENDERN | Refresh-Tokens verschluesseln |
| `backend/src/services/auth/oauth-providers.ts` | AENDERN | OAuth Tokens verschluesseln |
| `backend/src/services/mcp/mcp-registry.ts` | AENDERN | Server-Credentials verschluesseln |
| `backend/sql/migrations/phase66_encryption.sql` | NEU | Spalten-Migration (ggf. TEXT -> BYTEA) |
| `backend/src/__tests__/unit/services/field-encryption.test.ts` | NEU | Encryption Round-Trip Tests |

**Implementierung:**

```typescript
// field-encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (alle base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decrypt(encoded: string): string {
  const [ivB64, tagB64, dataB64] = encoded.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString('utf8') + decipher.final('utf8');
}
```

**Akzeptanzkriterien:**
- [ ] AES-256-GCM Implementierung mit IV + AuthTag
- [ ] OAuth Tokens, MFA Secrets, Refresh Tokens verschluesselt
- [ ] Bestehende Auth-Flows funktionieren (Encrypt on Write, Decrypt on Read)
- [ ] Key-Rotation-Mechanismus dokumentiert
- [ ] Migration fuer bestehende Daten (einmalig re-encrypt)
- [ ] 20+ Tests

---

### 66.3 Sentry Error Tracking

**Problem:** Produktionsfehler unsichtbar. Kein Alerting, kein Error-Grouping, kein Performance-Monitoring.

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `backend/src/services/observability/sentry.ts` | NEU | Sentry SDK Init + Custom Context |
| `backend/src/middleware/errorHandler.ts` | AENDERN | `Sentry.captureException()` bei jedem 5xx |
| `backend/src/main.ts` | AENDERN | `Sentry.init()` + RequestHandler + TracingHandler |
| `frontend/src/services/sentry.ts` | NEU | Frontend Sentry Init |
| `frontend/src/components/ErrorBoundary.tsx` | AENDERN | `Sentry.captureException()` im componentDidCatch |
| `frontend/src/main.tsx` | AENDERN | `Sentry.init()` beim App-Start |

**Akzeptanzkriterien:**
- [ ] Backend: Alle uncaught Exceptions → Sentry
- [ ] Frontend: React ErrorBoundary + unhandledrejection → Sentry
- [ ] User Context (userId, context) an Sentry Events angehaengt
- [ ] Source Maps hochgeladen (Vite Plugin)
- [ ] Performance Tracing aktiviert (Sample Rate 0.1 in Prod)
- [ ] Alert Rules: 5xx Spike, New Error, Performance Degradation

---

## Phase 67: Performance & Caching

**Ziel:** Sub-Sekunden-Responses fuer alle Standard-Operationen. RAG unter 2s.

### 67.1 RAG Result Caching

**Problem:** Jede RAG-Query fuehrt alle 4 Strategien aus (5-10s). Wiederholte/aehnliche Queries profitieren nicht von Cache.

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `backend/src/services/rag-cache.ts` | NEU | Redis-basierter RAG-Cache mit Embedding-Similarity Key |
| `backend/src/services/enhanced-rag.ts` | AENDERN | Cache-Check vor Retrieval, Cache-Write nach Retrieval |
| `backend/src/__tests__/unit/services/rag-cache.test.ts` | NEU | Cache Hit/Miss/Expiry Tests |

**Implementierung:**

```typescript
// rag-cache.ts
interface RAGCacheEntry {
  query: string;
  queryHash: string;
  results: RAGResult[];
  strategy: string;
  confidence: number;
  cachedAt: number;
  ttl: number; // 1h default, 15min fuer zeitkritische Queries
}

class RAGCache {
  private redis: Redis;
  private readonly DEFAULT_TTL = 3600; // 1 Stunde

  async get(queryHash: string, context: string): Promise<RAGCacheEntry | null> {
    const key = `rag:${context}:${queryHash}`;
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async set(entry: RAGCacheEntry, context: string): Promise<void> {
    const key = `rag:${context}:${entry.queryHash}`;
    await this.redis.setex(key, entry.ttl, JSON.stringify(entry));
  }

  // Semantic Cache: Pruefen ob aehnliche Query bereits gecacht
  async findSimilar(embedding: number[], context: string, threshold = 0.95): Promise<RAGCacheEntry | null> {
    // Nutze bestehenden semantic-cache.ts Mechanismus
  }

  async invalidateContext(context: string): Promise<void> {
    const keys = await this.redis.keys(`rag:${context}:*`);
    if (keys.length > 0) await this.redis.del(...keys);
  }
}
```

**Akzeptanzkriterien:**
- [ ] Cache-Hit liefert Ergebnis in <100ms (vs 5-10s ohne Cache)
- [ ] TTL: 1h Standard, 15min fuer zeitkritische Queries
- [ ] Cache-Invalidierung bei neuem Content (Idea erstellt/geaendert)
- [ ] Semantic Similarity Check (>0.95 Cosine → Cache-Hit)
- [ ] Graceful Degradation ohne Redis
- [ ] Cache-Hit-Rate Metrik fuer Observability

---

### 67.2 Database Query Optimierung

**Problem:** N+1 Queries in Idea-Relations, fehlende Composite Indexes auf haeufige Joins.

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `backend/sql/migrations/phase67_performance_indexes.sql` | NEU | Fehlende Indexes auf Chat, Email, Memory Tabellen |
| `backend/src/routes/ideas.ts` | AENDERN | N+1 durch JOIN ersetzen bei Relation-Loading |
| `backend/src/routes/general-chat.ts` | AENDERN | Message-Loading mit Pagination optimieren |
| `backend/src/services/memory/long-term-memory.ts` | AENDERN | Batch-Queries fuer Fact-Loading |

**Neue Indexes:**

```sql
-- Chat-Performance (haeufigste Queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_session_created
  ON {schema}.chat_messages(session_id, created_at DESC);

-- Memory-Performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_learned_facts_user_context
  ON {schema}.learned_facts(user_id, context, confidence DESC);

-- Email-Performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_emails_user_status_date
  ON {schema}.emails(user_id, status, received_at DESC);

-- Knowledge Graph
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entity_relations_source_type
  ON {schema}.entity_relations(source_entity_id, relation_type);
```

**Akzeptanzkriterien:**
- [ ] 0 N+1 Queries in Ideas, Chat, Email Routes
- [ ] Index-Scan auf allen haeufigen WHERE + ORDER BY Kombinationen
- [ ] EXPLAIN ANALYZE: Keine Seq-Scans auf Tabellen >1000 Rows
- [ ] Ideas-Liste: <200ms (vorher: variable)
- [ ] Chat-History: <150ms fuer 100 Messages

---

### 67.3 Connection Pool Monitoring

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `backend/src/utils/database-context.ts` | AENDERN | Pool-Event-Listener (connect, acquire, error, remove) + Metriken |
| `backend/src/services/observability/metrics.ts` | AENDERN | 3 neue Metriken: db.pool.active, db.pool.waiting, db.pool.errors |
| `backend/src/routes/observability.ts` | AENDERN | Pool-Stats im Health-Endpoint |

**Akzeptanzkriterien:**
- [ ] Pool-Auslastung sichtbar in Observability API
- [ ] Alert bei >80% Pool-Auslastung
- [ ] Waiting-Queries Metrik (zeigt Engpass frueh an)

---

## Phase 68: Design-System Formalisierung

**Ziel:** Von 150+ CSS Vars zu einem dokumentierten, wiederverwendbaren Design-System das "AI OS" kommuniziert.

### 68.1 Design Token Export & Documentation

**Problem:** 150+ CSS Vars in `index.css` sind funktional, aber nicht dokumentiert, nicht typisiert, nicht exportierbar.

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `frontend/src/design-system/tokens.ts` | NEU | TypeScript-Export aller Design Tokens |
| `frontend/src/design-system/colors.ts` | NEU | Farbpalette mit semantischen Namen + Dark/Light Varianten |
| `frontend/src/design-system/spacing.ts` | NEU | Spacing-Scale (4px Basis) |
| `frontend/src/design-system/typography.ts` | NEU | Font-Scale + Line-Heights |
| `frontend/src/design-system/shadows.ts` | NEU | Shadow-Definitionen + Glow-Effekte |
| `frontend/src/design-system/animations.ts` | NEU | Transition-Presets + Keyframes |
| `frontend/src/design-system/index.ts` | NEU | Barrel Export |

**Implementierung:**

```typescript
// tokens.ts - Single Source of Truth
export const tokens = {
  color: {
    primary: { base: '#ff6b35', hover: '#ff8555', active: '#e55a25' },
    semantic: {
      success: { base: '#10b981', bg: 'rgba(16,185,129,0.1)' },
      danger:  { base: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
      warning: { base: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
      info:    { base: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
    },
    surface: {
      primary: { light: '#ffffff', dark: '#0a0a0f' },
      secondary: { light: '#f8f9fa', dark: '#12121a' },
      elevated: { light: '#ffffff', dark: '#1a1a2e' },
    },
    glass: {
      bg: 'rgba(255,255,255,0.03)',
      border: 'rgba(255,255,255,0.06)',
      highlight: 'rgba(255,255,255,0.08)',
    }
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 40, '3xl': 48 },
  radius: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, full: 9999 },
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 6px rgba(0,0,0,0.07)',
    lg: '0 10px 15px rgba(0,0,0,0.1)',
    glow: { primary: '0 0 20px rgba(255,107,53,0.3)' },
  },
  transition: {
    fast: '150ms cubic-bezier(0.4,0,0.2,1)',
    base: '250ms cubic-bezier(0.4,0,0.2,1)',
    slow: '400ms cubic-bezier(0.4,0,0.2,1)',
  },
  zIndex: { background: 0, base: 100, dropdown: 300, sticky: 400, modal: 500, popover: 600, toast: 700, tooltip: 800, skipLink: 900 },
} as const;
```

**Akzeptanzkriterien:**
- [ ] Alle 150+ CSS Vars haben TypeScript-Aequivalent
- [ ] Token-Aenderung an einer Stelle propagiert ueberall
- [ ] Dark/Light Mode Tokens korrekt getrennt
- [ ] CSS Vars werden aus TS-Tokens generiert (Single Source of Truth)

---

### 68.2 Core Component Library

**Problem:** 230 TSX-Dateien mit Ad-hoc-Komponenten. Keine wiederverwendbaren Primitives dokumentiert.

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `frontend/src/design-system/components/Button.tsx` | NEU | 5 Varianten (primary, secondary, ghost, danger, glass), 3 Groessen |
| `frontend/src/design-system/components/Input.tsx` | NEU | Text, Textarea, Search mit Label + Error-State |
| `frontend/src/design-system/components/Card.tsx` | NEU | Surface, Glass, Elevated Varianten |
| `frontend/src/design-system/components/Badge.tsx` | NEU | Status, Context, Priority Badges |
| `frontend/src/design-system/components/Modal.tsx` | NEU | Accessible Modal mit Focus-Trap |
| `frontend/src/design-system/components/Tabs.tsx` | NEU | Generische Tab-Komponente (ersetzt 10+ Duplikate) |
| `frontend/src/design-system/components/Toast.tsx` | MIGRIEREN | Bestehende Toast.tsx ins Design-System |
| `frontend/src/design-system/components/Skeleton.tsx` | NEU | Loading-Skeletons fuer alle Content-Typen |
| `frontend/src/design-system/components/EmptyState.tsx` | NEU | Konsistente Empty-States |
| `frontend/src/design-system/components/Avatar.tsx` | NEU | User + AI Avatar |

**Pattern:**

```typescript
// Button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading, icon, children, ...props }: ButtonProps) {
  return (
    <button
      className={`ds-btn ds-btn--${variant} ds-btn--${size} ${loading ? 'ds-btn--loading' : ''}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Spinner size={size} /> : icon}
      {children}
    </button>
  );
}
```

**Akzeptanzkriterien:**
- [ ] 10 Core-Komponenten mit Props-Interface
- [ ] Alle Varianten visuell konsistent mit Neurodesign-Tokens
- [ ] Keyboard-Accessible (Tab, Enter, Escape)
- [ ] ARIA-Labels auf allen interaktiven Elementen
- [ ] Jede Komponente hat mindestens 5 Tests

---

### 68.3 Storybook Setup

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `frontend/.storybook/main.ts` | NEU | Storybook Config (Vite Builder) |
| `frontend/.storybook/preview.ts` | NEU | Global Styles + Theme Provider |
| `frontend/src/design-system/components/*.stories.tsx` | NEU | Stories fuer alle 10 Core-Komponenten |

**Akzeptanzkriterien:**
- [ ] `npm run storybook` startet Storybook auf Port 6006
- [ ] Alle 10 Core-Komponenten mit interaktiven Stories
- [ ] Dark/Light Mode Toggle in Storybook
- [ ] Controls fuer alle Props

---

## Phase 69: Proaktive Intelligence UX

**Ziel:** Die KI-Intelligenz SICHTBAR machen. Der Nutzer soll spueren, dass ZenAI mitdenkt.

### 69.1 Smart Suggestion Surface

**Problem:** Proactive Engine (Phase 54) laeuft im Hintergrund, aber der Nutzer sieht fast nichts davon.

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `frontend/src/components/SmartSurface/SmartSurface.tsx` | NEU | Kontextabhaengige Vorschlags-Leiste am oberen Rand jeder Seite |
| `frontend/src/components/SmartSurface/SmartSurface.css` | NEU | Glassmorphism + Slide-In Animation |
| `frontend/src/components/SmartSurface/SuggestionCard.tsx` | NEU | Einzelne Vorschlags-Karte (dismiss, accept, snooze) |
| `frontend/src/hooks/useSmartSuggestions.ts` | NEU | SSE-Subscription auf Proactive Engine + lokaler State |
| `backend/src/services/smart-suggestions.ts` | NEU | Aggregiert Proactive Events zu nutzerfreundlichen Vorschlaegen |
| `backend/src/routes/smart-suggestions.ts` | NEU | GET /api/:context/suggestions (aktive Vorschlaege) |

**Suggestion-Typen:**

```typescript
type SuggestionType =
  | 'connection_discovered'    // "Deine Idee X hat Verbindung zu Y"
  | 'task_reminder'            // "Aufgabe X ist morgen faellig"
  | 'email_followup'           // "Du hast seit 3 Tagen nicht auf X geantwortet"
  | 'knowledge_insight'        // "Sleep Compute hat 2 neue Muster entdeckt"
  | 'context_switch'           // "Du arbeitest an Work-Themen, aber bist im Personal-Context"
  | 'meeting_prep'             // "Meeting in 30min - hier sind relevante Notizen"
  | 'learning_opportunity'     // "Basierend auf deinem Interesse an X: neues Thema Y"
  | 'contradiction_alert';     // "Fakt X widerspricht Fakt Y"
```

**UX-Design:**

```
+------------------------------------------------------------------+
| SmartSurface (max 3 Karten, horizontal scrollbar auf Mobile)     |
| +------------------+ +------------------+ +------------------+   |
| | Connection Found | | Meeting in 30min | | 2 neue Muster    |   |
| | Idee A <-> B     | | Prep: 3 Notizen  | | aus Sleep Compute |   |
| | [Ansehen] [x]    | | [Oeffnen] [x]    | | [Details] [x]    |   |
| +------------------+ +------------------+ +------------------+   |
+------------------------------------------------------------------+
```

**Akzeptanzkriterien:**
- [ ] SmartSurface auf allen Seiten sichtbar (wenn Vorschlaege vorhanden)
- [ ] SSE-Connection zum Proactive Engine Stream
- [ ] Max 3 Vorschlaege gleichzeitig (Prioritaet-basiert)
- [ ] Dismiss → 24h Cooldown fuer aehnliche Vorschlaege
- [ ] Accept → Navigation zur relevanten Seite/Aktion
- [ ] Snooze → 1h/4h/Morgen Optionen
- [ ] Glassmorphism-Design konsistent mit Neurodesign
- [ ] Mobile: horizontaler Scroll

---

### 69.2 Sleep Compute Insights Dashboard

**Problem:** Sleep-Time Compute ist ein genuiner Differenziator, aber der Nutzer sieht nie was passiert.

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `frontend/src/components/InsightsDashboard/SleepInsights.tsx` | NEU | Visualisierung der naechtlichen KI-Arbeit |
| `frontend/src/components/InsightsDashboard/SleepInsights.css` | NEU | Timeline + Discovery Cards |
| `backend/src/routes/sleep-compute.ts` | AENDERN | Neuer Endpoint: GET /api/:context/sleep-compute/discoveries |
| `backend/src/services/memory/sleep-compute.ts` | AENDERN | Discovery-Logging (was wurde konsolidiert, entdeckt, optimiert) |

**UX-Konzept:**

```
Sleep Compute Insights
━━━━━━━━━━━━━━━━━━━━━

Letzte Nacht hat deine KI:

  Konsolidierung          Entdeckungen           Optimierung
  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
  │ 12 Episoden  │       │ 3 Verbindung │       │ 2 Prozeduren │
  │ → 4 Fakten   │       │   entdeckt   │       │   verbessert │
  │              │       │              │       │              │
  │ "Projekt X   │       │ "Marketing   │       │ "Email-      │
  │  nutzt immer │       │  Strategie   │       │  Workflow    │
  │  Pattern Y"  │       │  aehnelt     │       │  schneller"  │
  └──────────────┘       │  Strategie Z"│       └──────────────┘
                         └──────────────┘

  Widerspruech erkannt: 1
  "Fakt A (Maerz) widerspricht Fakt B (Januar)"
  [Aufloesen] [Ignorieren]
```

**Akzeptanzkriterien:**
- [ ] Neuer Tab "KI-Nacht" in Insights Dashboard
- [ ] Timeline der letzten 7 Nacht-Zyklen
- [ ] Discovery Cards mit Aktion (ansehen, aufloesen, ignorieren)
- [ ] Widerspruch-Aufloesung direkt aus UI
- [ ] Konsolidierungs-Statistik (Episoden → Fakten Ratio)

---

### 69.3 Ambient Context Indicator

**Problem:** User weiss nicht, was die KI gerade "weiss" / als Kontext nutzt.

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `frontend/src/components/layout/ContextIndicator.tsx` | NEU | Kleines Widget in TopBar: zeigt aktiven KI-Kontext |
| `frontend/src/components/layout/ContextIndicator.css` | NEU | Kompakte Glassmorphism-Anzeige |
| `backend/src/routes/context-rules.ts` | AENDERN | Neuer Endpoint: GET /api/:context/context-v2/active |

**UX:**

```
TopBar: [...] [Context: Work | 3 Fakten | 2 Prozeduren | Meeting in 1h] [...]
```

Klick oeffnet Detail-Panel:
- Aktive Working Memory Items
- Geladene Long-Term Facts
- Relevante Prozeduren
- Anstehende Events

**Akzeptanzkriterien:**
- [ ] Context-Indicator in TopBar sichtbar
- [ ] Zeigt aktuellen Schema-Context + geladene Memory-Items
- [ ] Klick oeffnet Detail-Panel (Popover, kein Modal)
- [ ] Updates bei Context-Switch

---

## Phase 70: A-RAG - Autonome Retrieval-Strategie

**Ziel:** RAG 2.0 — Der Agent entscheidet selbst welche Retrieval-Strategie optimal ist, statt feste Pipeline.

### 70.1 Retrieval Strategy Agent

**Problem:** Aktuell feste Pipeline (HyDE → Cross-Encoder → GraphRAG). A-RAG (Feb 2026 SOTA) laesst den Agent autonom entscheiden.

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `backend/src/services/arag/strategy-agent.ts` | NEU | Claude-basierter Meta-Agent der Retrieval-Plan erstellt |
| `backend/src/services/arag/retrieval-interfaces.ts` | NEU | 3 hierarchische Interfaces: Keyword, Semantic, ChunkRead |
| `backend/src/services/arag/strategy-evaluator.ts` | NEU | Self-Evaluation nach Retrieval (Confidence + Completeness) |
| `backend/src/services/enhanced-rag.ts` | AENDERN | A-RAG als neue Top-Level-Strategie |
| `backend/src/__tests__/unit/services/arag.test.ts` | NEU | Strategy-Selection + Evaluation Tests |

**Architektur:**

```
Query ──→ Strategy Agent ──→ Retrieval Plan ──→ Execute ──→ Self-Evaluate
              │                    │                            │
              │  "Fuer diese       │  1. BM25 Keywords         │  "Confidence 0.4,
              │   Query brauche    │  2. Semantic Top-10        │   brauche mehr
              │   ich zuerst       │  3. Graph 2-Hop            │   Kontext"
              │   Keywords,        │  4. Cross-Encode            │        │
              │   dann Graph"      │                            ▼        │
              │                    │                     Retry mit       │
              │                    │                     erweitertem     │
              │                    │                     Retrieval-Plan  │
```

**Implementierung:**

```typescript
// strategy-agent.ts
interface RetrievalPlan {
  steps: RetrievalStep[];
  reasoning: string;
  expectedConfidence: number;
}

interface RetrievalStep {
  interface: 'keyword' | 'semantic' | 'chunk_read' | 'graph' | 'community';
  params: Record<string, any>;
  dependsOn?: number; // Index des vorherigen Steps
}

async function planRetrieval(query: string, context: string): Promise<RetrievalPlan> {
  // Claude Meta-Agent entscheidet basierend auf:
  // 1. Query-Komplexitaet (einfach, multi-hop, vergleichend, temporal)
  // 2. Verfuegbare Datenquellen (Facts, Graph, Communities)
  // 3. Historische Performance pro Strategie
}
```

**Akzeptanzkriterien:**
- [ ] Strategy Agent waehlt aus 5+ Retrieval-Interfaces
- [ ] Multi-Step Plans fuer komplexe Queries (z.B. Vergleiche)
- [ ] Self-Evaluation nach Retrieval mit Retry bei <0.6 Confidence
- [ ] Max 3 Iterations (verhindert Endlosschleifen)
- [ ] Fallback auf feste Pipeline bei Agent-Fehler
- [ ] Strategy-Performance-Logging fuer kontinuierliche Verbesserung
- [ ] A/B-Metrik: A-RAG vs feste Pipeline Confidence-Vergleich

---

### 70.2 Iterative Retrieval mit Feedback Loop

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `backend/src/services/arag/iterative-retriever.ts` | NEU | Fuehrt Plan schrittweise aus, evaluiert nach jedem Step |
| `backend/src/services/rag-feedback.ts` | AENDERN | A-RAG Strategy Tracking in Analytics |

**Akzeptanzkriterien:**
- [ ] Jeder Retrieval-Step hat Zwischenergebnis-Evaluation
- [ ] Fruehes Abbrechen bei hoher Confidence (>0.9) → Performance-Gewinn
- [ ] Eskalation bei niedriger Confidence → mehr Retrieval-Steps
- [ ] Analytics: Steps-pro-Query, Confidence-pro-Step, Latenz-pro-Strategy

---

## Phase 71: MCP Ecosystem Hub

**Ziel:** Von 30 Built-in Tools zu 100+ verfuegbaren Tools durch Community-Server-Anbindung.

### 71.1 MCP Server Discovery & Auto-Connect

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `backend/src/services/mcp/mcp-discovery.ts` | NEU | Crawlt MCP Registry, findet passende Server |
| `backend/src/services/mcp/mcp-auto-config.ts` | NEU | Automatische Konfiguration populaerer Server (Slack, GitHub, Linear, Google Drive) |
| `backend/src/routes/mcp-connections.ts` | AENDERN | Discovery-Endpoint: GET /api/:context/mcp/discover |
| `frontend/src/components/MCPConnectionsPage.tsx` | AENDERN | Discovery-Tab mit Server-Katalog |

**Prioritaere MCP Server:**

| Server | Zweck | Prioritaet |
|--------|-------|------------|
| **Slack** | Team-Kommunikation | HOCH |
| **Google Drive/Docs** | Dokument-Integration | HOCH |
| **GitHub** (offiziell) | Code-Repository | HOCH |
| **Linear** | Projektmanagement | MITTEL |
| **Notion** | Knowledge Base | MITTEL |
| **Google Calendar** | Kalender-Sync | MITTEL |
| **Figma** | Design-Integration | NIEDRIG |
| **HubSpot** | CRM | NIEDRIG |

**Akzeptanzkriterien:**
- [ ] MCP Registry Suche funktioniert
- [ ] Top-8 Server haben One-Click-Setup
- [ ] Server-Health wird nach Verbindung ueberwacht
- [ ] Tool-Bridge erstellt automatisch qualifizierte Tool-Namen
- [ ] Frontend zeigt Katalog mit Beschreibung + Setup-Anleitung

---

### 71.2 Tool Marketplace UI

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `frontend/src/components/MCPConnectionsPage/ToolMarketplace.tsx` | NEU | Grid-Ansicht aller verfuegbaren + installierten Tools |
| `frontend/src/components/MCPConnectionsPage/ToolMarketplace.css` | NEU | Card-Grid mit Status-Badges |
| `frontend/src/components/MCPConnectionsPage/ServerSetupWizard.tsx` | NEU | Schritt-fuer-Schritt Setup fuer neue Server |

**Akzeptanzkriterien:**
- [ ] Grid-Ansicht: installiert (gruen), verfuegbar (blau), premium (gold)
- [ ] Filter: Kategorie, Status, Beliebtheit
- [ ] Setup-Wizard fuer Server die Credentials benoetigen
- [ ] Usage-Statistiken pro Tool (Aufrufe, Latenz, Fehlerrate)

---

## Phase 72: Neuroscience Memory 2.0

**Ziel:** Memory-System neurowissenschaftlich korrekt weiterentwickeln. Differenziator verstaerken.

### 72.1 Emotional Tagging (Amygdala-Modulation)

**Wissenschaftlicher Hintergrund:** Im Gehirn werden emotional bedeutsame Erinnerungen staerker konsolidiert (Amygdala moduliert Hippocampus). Erinnerungen mit hoher emotionaler Ladung ueberleben Decay besser.

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `backend/src/services/memory/emotional-tagger.ts` | NEU | Sentiment + Arousal + Valence Scoring via Claude |
| `backend/src/services/memory/episodic-memory.ts` | AENDERN | Emotional Score auf jede Episode |
| `backend/src/services/memory/sleep-compute.ts` | AENDERN | Konsolidierung gewichtet nach Emotional Score |
| `backend/sql/migrations/phase72_emotional_memory.sql` | NEU | emotional_score, arousal, valence Spalten |

**Implementierung:**

```typescript
// emotional-tagger.ts
interface EmotionalTag {
  sentiment: number;    // -1 bis +1 (negativ bis positiv)
  arousal: number;      // 0 bis 1 (ruhig bis aufgeregt)
  valence: number;      // 0 bis 1 (unangenehm bis angenehm)
  significance: number; // 0 bis 1 (unwichtig bis lebenswichtig)
  // Konsolidierungs-Gewicht = (arousal * 0.4 + significance * 0.6)
}

// Sleep Compute aendert sich:
// Vorher: Konsolidiere nach Haeufigkeit
// Nachher: Konsolidiere nach (Haeufigkeit * 0.5 + EmotionalWeight * 0.5)
```

**Akzeptanzkriterien:**
- [ ] Jede neue Episode erhaelt Emotional Tag (async, non-blocking)
- [ ] Konsolidierungs-Gewicht: `frequency * 0.5 + emotional_weight * 0.5`
- [ ] Hoch-emotionale Fakten haben 3x laengere Decay-Halbwertszeit
- [ ] Emotional Score sichtbar in Memory Transparency UI

---

### 72.2 Ebbinghaus Decay Curve

**Wissenschaftlicher Hintergrund:** Menschliches Vergessen folgt einer exponentiellen Kurve, nicht linear. Spaced Repetition verstaerkt Erinnerungen optimal.

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `backend/src/services/memory/ebbinghaus-decay.ts` | NEU | Exponentieller Decay + Spaced Repetition Scheduling |
| `backend/src/services/memory/long-term-memory.ts` | AENDERN | linearen Decay durch Ebbinghaus ersetzen |
| `backend/src/services/memory/sleep-compute.ts` | AENDERN | Spaced Repetition Candidates in Pre-Loading |

**Implementierung:**

```typescript
// ebbinghaus-decay.ts
// R = e^(-t/S) wobei:
// R = Retention (0-1)
// t = Zeit seit letztem Abruf
// S = Stability (waechst mit jedem erfolgreichen Abruf)

function calculateRetention(lastAccess: Date, stability: number): number {
  const t = (Date.now() - lastAccess.getTime()) / (1000 * 60 * 60 * 24); // Tage
  return Math.exp(-t / stability);
}

function updateStability(currentStability: number, retrievalSuccess: boolean): number {
  if (retrievalSuccess) {
    // SM-2 Algorithmus (SuperMemo)
    return currentStability * 2.5;
  }
  return currentStability * 0.5;
}

// Spaced Repetition: Fakten die bald unter Threshold fallen → Pre-Load
function getRepetitionCandidates(facts: Fact[], threshold = 0.3): Fact[] {
  return facts.filter(f => {
    const retention = calculateRetention(f.lastAccessed, f.stability);
    return retention < threshold + 0.1 && retention > threshold - 0.1;
  });
}
```

**Akzeptanzkriterien:**
- [ ] Decay folgt `R = e^(-t/S)` statt linear
- [ ] Stability waechst bei jedem erfolgreichen Abruf (SM-2 Algorithmus)
- [ ] Spaced Repetition Candidates in Sleep Compute Pre-Loading
- [ ] Fakten unter 0.1 Retention → Archivieren (nicht loeschen)
- [ ] Retention-Visualisierung in Memory Dashboard

---

### 72.3 Context-Dependent Retrieval

**Wissenschaftlicher Hintergrund:** Encoding Specificity Principle — Fakten werden besser erinnert wenn der Abruf-Kontext dem Speicher-Kontext aehnelt.

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `backend/src/services/memory/context-enrichment.ts` | NEU | Speichert Kontext-Metadaten bei Fact-Encoding |
| `backend/src/services/memory/long-term-memory.ts` | AENDERN | Context-Match als Retrieval-Boost |
| `backend/sql/migrations/phase72_context_retrieval.sql` | NEU | encoding_context JSONB Spalte auf learned_facts |

**Kontext-Dimensionen:**

```typescript
interface EncodingContext {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number; // 0-6
  taskType: string;  // z.B. 'research', 'writing', 'planning'
  activeTools: string[]; // Tools die gerade genutzt wurden
  relatedEntities: string[]; // Entitaeten im Gespraech
  emotionalState: EmotionalTag;
}

// Retrieval-Boost: Cosine-Similarity zwischen Encoding-Context und aktuellem Context
// Boost = 1.0 + (contextSimilarity * 0.3)  // Max 30% Boost
```

**Akzeptanzkriterien:**
- [ ] Jeder neue Fakt speichert Encoding-Context
- [ ] Retrieval-Score wird um Context-Match geboostet (max 30%)
- [ ] Time-of-Day und Task-Type als primaere Match-Dimensionen
- [ ] A/B-Vergleich: Context-Boosted vs Standard Retrieval Relevanz

---

## Phase 73: AI Observability (Langfuse-Integration)

**Ziel:** Volle Sichtbarkeit in KI-Qualitaet, Kosten und Hallucinations.

### 73.1 Langfuse Integration

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `backend/src/services/observability/langfuse.ts` | NEU | Langfuse Client Init + Trace/Span/Generation Helpers |
| `backend/src/services/claude/streaming.ts` | AENDERN | Langfuse Trace pro Chat-Message |
| `backend/src/services/enhanced-rag.ts` | AENDERN | Langfuse Span pro RAG-Query |
| `backend/src/services/agent-orchestrator.ts` | AENDERN | Langfuse Trace pro Agent-Execution |
| `backend/src/services/tool-handlers.ts` | AENDERN | Langfuse Span pro Tool-Call |

**Was wird getrackt:**

| Event | Langfuse-Typ | Daten |
|-------|-------------|-------|
| Chat-Message | Trace | Input, Output, Tokens, Latenz, Model |
| RAG-Query | Span | Strategy, Results, Confidence, Latenz |
| Tool-Call | Span | Tool-Name, Input, Output, Duration |
| Agent-Step | Span | Agent-Type, Task, Result, Tokens |
| Generation | Generation | Prompt, Completion, Token-Count, Cost |

**Akzeptanzkriterien:**
- [ ] Jede Chat-Message erzeugt Langfuse-Trace
- [ ] RAG-Queries als Spans mit Confidence Score
- [ ] Token-Kosten pro User/Session/Tag sichtbar
- [ ] Prompt-Versioning ueber Langfuse Prompt Management
- [ ] Evaluation Datasets fuer RAG-Qualitaet
- [ ] Graceful Degradation wenn Langfuse nicht erreichbar

---

### 73.2 Hallucination Detection

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `backend/src/services/observability/hallucination-detector.ts` | NEU | Post-Generation Check auf Fakten-Konsistenz |
| `backend/src/services/claude/streaming.ts` | AENDERN | Optional Hallucination-Check nach Response |

**Implementierung:**

```typescript
// hallucination-detector.ts
interface HallucinationCheck {
  score: number;          // 0-1 (0 = sicher korrekt, 1 = sicher halluziniert)
  flaggedClaims: string[];
  groundedClaims: string[];
  unverifiable: string[];
}

async function checkHallucination(
  response: string,
  retrievedContext: string[],
  query: string
): Promise<HallucinationCheck> {
  // 1. Extrahiere Fakten-Claims aus Response
  // 2. Vergleiche mit retrievedContext (Entailment Check)
  // 3. Flagge Claims die nicht im Context begruendet sind
}
```

**Akzeptanzkriterien:**
- [ ] Score 0-1 pro Response
- [ ] Flagged Claims werden in Langfuse geloggt
- [ ] Optional: Warning an User bei Score >0.7
- [ ] Dashboard: Hallucination-Rate ueber Zeit
- [ ] Async-Check (blockiert nicht die Response-Auslieferung)

---

## Phase 74: Edge/Local Inference Layer

**Ziel:** Latenz-kritische Operationen lokal ausfuehren. Privacy-sensitive Daten nie an Cloud senden.

### 74.1 WebLLM Integration (Browser-basiert)

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `frontend/src/services/local-inference.ts` | NEU | WebLLM Init + Model-Loading + Inference API |
| `frontend/src/hooks/useLocalInference.ts` | NEU | React Hook fuer lokale Inference |
| `frontend/src/workers/inference-worker.ts` | NEU | Web Worker fuer Background-Inference |

**Use Cases fuer lokale Inference:**

| Use Case | Modell | Latenz Cloud | Latenz Lokal |
|----------|--------|-------------|--------------|
| Intent Classification | SmolLM2 135M | 500ms | 50ms |
| Quick Autocomplete | Phi-4-mini 3.8B | 800ms | 200ms |
| Embedding Generation | all-MiniLM-L6 | 300ms | 30ms |
| Sentiment Analysis | SmolLM2 360M | 400ms | 80ms |
| Text Summarization (kurz) | Phi-4-mini 3.8B | 1200ms | 400ms |

**Implementierung:**

```typescript
// local-inference.ts
import { CreateMLCEngine } from '@mlc-ai/web-llm';

class LocalInference {
  private engine: MLCEngine | null = null;
  private available = false;

  async init(modelId = 'SmolLM2-135M-Instruct-q4f16_1') {
    try {
      this.engine = await CreateMLCEngine(modelId, {
        initProgressCallback: (progress) => {
          console.log(`Model loading: ${progress.text}`);
        }
      });
      this.available = true;
    } catch {
      console.warn('WebLLM not available, falling back to cloud');
      this.available = false;
    }
  }

  async classifyIntent(query: string): Promise<'chat' | 'search' | 'action' | 'code'> {
    if (!this.available) return this.cloudFallback(query);
    // Lokale Inference mit SmolLM2
  }
}
```

**Akzeptanzkriterien:**
- [ ] Modell wird beim ersten App-Load im Hintergrund heruntergeladen
- [ ] Intent Classification in <100ms (lokal)
- [ ] Graceful Fallback auf Cloud wenn WebGPU nicht verfuegbar
- [ ] Model-Cache in IndexedDB (kein Re-Download)
- [ ] Memory-Usage <500MB
- [ ] Funktioniert auf Chrome 120+, Edge 120+, Safari 18+

---

### 74.2 Offline-First Chat (mit lokalem Modell)

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `frontend/src/services/offline-chat.ts` | NEU | Lokales Chat-Interface bei Offline |
| `frontend/src/components/GeneralChat/GeneralChat.tsx` | AENDERN | Offline-Detection + Local Model Fallback |
| `frontend/public/sw.js` | AENDERN | v4: Chat-Nachrichten Offline-Queue |

**Akzeptanzkriterien:**
- [ ] Bei Offline: lokales Modell antwortet (reduzierte Qualitaet, aber funktional)
- [ ] Offline-Nachrichten werden gequeued und bei Reconnect synchronisiert
- [ ] Klare UI-Anzeige: "Offline-Modus: Antworten von lokalem Modell"
- [ ] Kein Datenverlust bei Verbindungsabbruch

---

## Phase 75: Plugin/Extension System

**Ziel:** Nutzer und Entwickler koennen ZenAI erweitern. Network-Effect fuer Wachstum.

### 75.1 Extension API

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `backend/src/services/extensions/extension-api.ts` | NEU | Extension Lifecycle (install, enable, disable, uninstall) |
| `backend/src/services/extensions/extension-sandbox.ts` | NEU | Sandboxed Execution fuer Extension Code |
| `backend/src/services/extensions/extension-registry.ts` | NEU | Extension Metadata + Versioning |
| `backend/src/routes/extensions.ts` | NEU | Extension CRUD + Marketplace API |
| `backend/sql/migrations/phase75_extensions.sql` | NEU | extensions, extension_permissions, extension_logs Tabellen |

**Extension-Typen:**

```typescript
interface Extension {
  id: string;
  name: string;
  version: string;
  type: 'tool' | 'widget' | 'theme' | 'integration' | 'agent';
  permissions: ExtensionPermission[];
  entryPoint: string; // JS/TS Datei
  manifest: {
    displayName: string;
    description: string;
    author: string;
    icon: string;
    category: string;
    minZenAIVersion: string;
  };
}

type ExtensionPermission =
  | 'read:ideas'
  | 'write:ideas'
  | 'read:memory'
  | 'write:memory'
  | 'read:chat'
  | 'network:outbound'
  | 'ui:widget'
  | 'tools:register';
```

**Akzeptanzkriterien:**
- [ ] Extension Manifest Format dokumentiert
- [ ] Sandboxed Execution (kein Zugriff auf Filesystem/Env)
- [ ] Permission-System: Nutzer genehmigt Berechtigungen bei Install
- [ ] Extension kann Tools registrieren (erscheinen in Chat)
- [ ] Extension kann Widgets registrieren (erscheinen in Dashboard)
- [ ] Rate-Limiting pro Extension
- [ ] Audit-Log fuer Extension-Aktionen

---

### 75.2 Extension Marketplace UI

**Dateien:**

| Datei | Aktion | Details |
|-------|--------|---------|
| `frontend/src/components/ExtensionMarketplace/ExtensionMarketplace.tsx` | NEU | Browse + Install + Manage Extensions |
| `frontend/src/components/ExtensionMarketplace/ExtensionCard.tsx` | NEU | Einzelne Extension mit Install-Button |
| `frontend/src/components/ExtensionMarketplace/ExtensionDetail.tsx` | NEU | Detail-Seite mit Permissions, Reviews, Changelog |
| `frontend/src/components/SettingsDashboard.tsx` | AENDERN | Neuer Tab "Extensions" |

**Akzeptanzkriterien:**
- [ ] Kategorie-Filter: Tools, Widgets, Themes, Integrations, Agents
- [ ] Install/Uninstall mit Permission-Dialog
- [ ] Extension-Settings pro installierter Extension
- [ ] Deaktivieren ohne Deinstallieren
- [ ] Versioning + Auto-Update Hinweis

---

## Querschnitts-Anforderungen (gelten fuer ALLE Phasen)

### Testing

| Phase | Minimum neue Tests | Test-Typen |
|-------|-------------------|------------|
| 66 | 50 | Integration (RLS), Unit (Encryption), E2E (Auth Flow) |
| 67 | 30 | Unit (Cache), Integration (Index Perf), Benchmark |
| 68 | 60 | Component (Storybook), Snapshot, Accessibility |
| 69 | 40 | Integration (SSE), Component (SmartSurface), E2E |
| 70 | 35 | Unit (Strategy Agent), Integration (Retrieval), Benchmark |
| 71 | 30 | Integration (MCP Discovery), Component (Marketplace) |
| 72 | 40 | Unit (Ebbinghaus, Emotional), Integration (Consolidation) |
| 73 | 25 | Integration (Langfuse), Unit (Hallucination Detector) |
| 74 | 35 | Unit (WebLLM), Integration (Offline), Browser Compat |
| 75 | 45 | Integration (Sandbox), Security (Permissions), E2E |

### Performance-Budgets

| Metrik | Aktuell | Ziel Phase 67 | Ziel Phase 74 |
|--------|---------|---------------|---------------|
| RAG-Query | 5-10s | <2s (Cache Hit: <100ms) | <2s |
| Chat-Response (First Token) | ~1.5s | <1s | <500ms (lokal) |
| Ideas-Liste | variable | <200ms | <200ms |
| Page Load (LCP) | ~2.5s | <2s | <1.5s |
| Offline Functionality | Keine | Keine | Basis-Chat + Read |

### Security Checkliste (pro Phase)

- [ ] Keine neuen SQL Injections (parameterized queries)
- [ ] Keine neuen XSS (React auto-escape + DOMPurify)
- [ ] Neue Endpoints haben Auth-Middleware
- [ ] Neue Daten haben user_id Filter
- [ ] Sensible Daten verschluesselt (ab Phase 66)
- [ ] Rate-Limiting auf neuen Endpoints
- [ ] Audit-Log fuer sicherheitsrelevante Aktionen

### CLAUDE.md Update (pro Phase)

Nach jeder Phase:
- [ ] Neue Dateien dokumentiert
- [ ] Neue API-Endpoints dokumentiert
- [ ] Changelog-Eintrag mit Tabellen
- [ ] Phase-Nummer aktualisiert
- [ ] Test-Zahlen aktualisiert

---

## Erfolgsmetriken

| Metrik | Aktuell | Nach Phase 75 | Weltklasse |
|--------|---------|---------------|------------|
| **Tests** | 5.600 | 6.000+ | >5.000 |
| **Code Coverage** | unbekannt | >80% | >85% |
| **Lighthouse Score** | unbekannt | >90 | >95 |
| **RAG Accuracy** | gut | gemessen + tracked | >90% P@5 |
| **Agent Success Rate** | unbekannt | tracked via Langfuse | >85% |
| **Memory Consolidation** | funktional | emotional + Ebbinghaus | neurowiss. korrekt |
| **Offline Capability** | keine | Basis-Chat + Read | Vollstaendig |
| **MCP Tools** | 30 | 80+ | 100+ |
| **Design-System** | 150 CSS Vars | Storybook + Tokens | Dokumentiert |
| **Security** | App-Level | RLS + Encryption | SOC2-ready |
| **Error Tracking** | Logs only | Sentry + Langfuse | Full Observability |
| **Latenz (Intent)** | ~500ms Cloud | <100ms lokal | <50ms |

---

## Abhaengigkeiten zwischen Phasen

```
Phase 66 (Security) ──→ ALLE weiteren Phasen (Voraussetzung)
Phase 67 (Performance) ──→ Phase 70 (A-RAG braucht schnellen Cache)
Phase 68 (Design-System) ──→ Phase 69 (Proaktive UX nutzt Komponenten)
Phase 68 (Design-System) ──→ Phase 71 (Marketplace UI)
Phase 68 (Design-System) ──→ Phase 75 (Extension Marketplace)
Phase 69 (Proaktive UX) ──→ Phase 72 (Neuroscience liefert bessere Vorschlaege)
Phase 70 (A-RAG) ──→ Phase 73 (Langfuse misst A-RAG Performance)
Phase 73 (Langfuse) ──→ Phase 74 (Misst Local vs Cloud Qualitaet)
```

**Kritischer Pfad:** 66 → 67 → 68 → 69 → 70 → 73

---

## Reihenfolge-Zusammenfassung

```
Woche 1-2:   Phase 66 (Security) + Phase 67 (Performance)     [parallel moeglich]
Woche 2-4:   Phase 68 (Design-System)
Woche 4-5:   Phase 69 (Proaktive Intelligence UX)
Woche 5-6:   Phase 70 (A-RAG)
Woche 6-7:   Phase 71 (MCP Ecosystem)
Woche 7-8:   Phase 72 (Neuroscience Memory 2.0)
Woche 8-9:   Phase 73 (AI Observability)
Woche 9-10:  Phase 74 (Edge/Local Inference)
Woche 10-11: Phase 75 (Plugin System)
```

**Phase 66 + 67 koennen parallel laufen** (Security = DB/Backend, Performance = Caching/Queries — keine Konflikte).
**Phase 68 ist der laengste Einzelblock** und Voraussetzung fuer alles UX-bezogene danach.
