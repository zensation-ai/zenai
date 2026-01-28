# ZenAI Project Context

> **ZenAI - Enterprise AI Platform**
> © 2026 Alexander Bering / ZenSation Enterprise Solutions
> https://zensation.ai | https://zensation.app | https://zensation.sh

## Deployment URLs

| Service | URL | Notes |
|---------|-----|-------|
| **Frontend (Production)** | https://frontend-mu-six-93.vercel.app/ | Aktive Vercel-Deployment |
| **Backend (Production)** | https://zenai-production.up.railway.app | Railway Auto-Deploy auf `main` |
| **Database** | Supabase | PostgreSQL mit pgvector |
| **Website** | https://zensation.ai | ZenSation Enterprise Solutions |

## Architecture

- **Frontend**: React + TypeScript (Vite)
- **Backend**: Express.js + TypeScript
- **AI**: Claude API (Primary), Ollama (Fallback)
- **Memory**: HiMeS 4-Layer Architecture
  - Working Memory (aktiver Task-Fokus)
  - Episodic Memory (konkrete Erfahrungen)
  - Short-Term Memory (Session-Kontext)
  - Long-Term Memory (persistentes Wissen)

## Current Phase: 31

### Phase 31 Features (AI State-of-the-Art)

**Chat Modes & Tool Use:**

- Intelligent mode detection (tool_assisted, agent, rag_enhanced, conversation)
- 6 integrated tools: search_ideas, create_idea, remember, recall, calculate, get_related_ideas

**RAG Pipeline:**

- HyDE (Hypothetical Document Embeddings)
- Cross-Encoder Re-ranking
- Confidence scoring and quality metrics

**Streaming:**

- SSE with Extended Thinking support
- Real-time thinking and response display

**Vision Integration:**

- 8 Vision API endpoints
- Image analysis, OCR, idea extraction
- Chat with images support
- Drag-and-drop ImageUpload component

**Topic Enhancement:**

- Keyword extraction (TF-IDF)
- Quality metrics (coherence, separation, density, stability)
- Smart topic assignment
- Topic-aware chat context

**Code Execution Sandbox:**

- Dual-Provider: Docker (local) oder Judge0 (production)
- Unterstützt Python 3.11, Node.js 20, Bash
- Safety-Validator mit 77 Sicherheitschecks
- Resource Limits (CPU, Memory, PIDs, Network)
- Automatische Provider-Auswahl basierend auf Umgebung
- Claude-basierter Code-Generator

**Web Tools:**

- `web_search`: Web-Suche via Brave Search API (Privacy-first, DuckDuckGo Fallback)
- `fetch_url`: URL-Inhalte abrufen und extrahieren (Readability-ähnlich)
- Intelligente Content-Extraktion (Titel, Autor, Datum, Hauptinhalt)
- HTML-zu-Text-Konvertierung mit Noise-Filterung

## Key Files

### Backend

- Entry: `backend/src/main.ts`
- Memory Services: `backend/src/services/memory/`
- Code Execution: `backend/src/services/code-execution/`
- General Chat: `backend/src/routes/general-chat.ts`
- Vision Service: `backend/src/services/claude-vision.ts`
- Vision Routes: `backend/src/routes/vision.ts`
- Code Execution Route: `backend/src/routes/code-execution.ts`
- Chat Modes: `backend/src/services/chat-modes.ts`
- Tool Handlers: `backend/src/services/tool-handlers.ts`
- Web Search: `backend/src/services/web-search.ts`
- URL Fetch: `backend/src/services/url-fetch.ts`
- Enhanced RAG: `backend/src/services/enhanced-rag.ts`
- Topic Enhancement: `backend/src/services/topic-enhancement.ts`
- Streaming: `backend/src/services/claude/streaming.ts`

### Frontend

- App: `frontend/src/App.tsx`
- Chat Component: `frontend/src/components/GeneralChat.tsx`
- Image Upload: `frontend/src/components/ImageUpload.tsx`
- Code Result Component: `frontend/src/components/CodeExecutionResult.tsx`

### Tests

- Backend: `backend/src/__tests__/`
- Frontend: `frontend/src/__tests__/` and `frontend/src/components/__tests__/`

## API Endpoints (Phase 31)

### Vision API

```
GET  /api/vision/status           - Service availability
POST /api/vision/analyze          - Analyze with task
POST /api/vision/extract-text     - OCR extraction
POST /api/vision/extract-ideas    - Extract ideas
POST /api/vision/describe         - Quick description
POST /api/vision/ask              - Q&A about image
POST /api/vision/compare          - Compare images
POST /api/vision/document         - Full document processing
```

### Code Execution API

```
POST /api/code/execute            - Generate and execute code
POST /api/code/run                - Run pre-written code
POST /api/code/validate           - Validate code safety
GET  /api/code/health             - Service health check
GET  /api/code/languages          - Available languages
```

### Topic Enhancement API

```
GET  /api/topics/enhanced         - Topics with keywords
GET  /api/topics/quality          - All quality metrics
GET  /api/topics/:id/quality      - Single topic quality
GET  /api/topics/similar          - Similar topics
POST /api/topics/assign/:ideaId   - Smart assignment
POST /api/topics/context          - Chat context
GET  /api/topics/orphans          - Unassigned ideas
```

### Chat API (Enhanced)

```
POST /api/chat/sessions/:id/messages         - Send message
POST /api/chat/sessions/:id/messages/stream  - SSE streaming
POST /api/chat/sessions/:id/messages/vision  - Message with images
POST /api/chat/quick                         - Quick chat
```

## Environment Variables (Backend)

```bash
# Required
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-ant-...

# Optional - Memory Scheduler
CRON_TIMEZONE=Europe/Berlin
CONSOLIDATION_SCHEDULE="0 2 * * *"
DECAY_SCHEDULE="0 3 * * *"
ENABLE_MEMORY_CONSOLIDATION=true
ENABLE_MEMORY_DECAY=true

# Optional - AI Settings
CLAUDE_MODEL=claude-sonnet-4-20250514
MAX_TOKENS=4096

# Optional - Code Execution (Local Docker)
ENABLE_CODE_EXECUTION=true
CODE_EXECUTION_TIMEOUT=30000
CODE_EXECUTION_MEMORY_LIMIT=256m
CODE_SANDBOX_DIR=/tmp/code-sandbox
EXECUTOR_PROVIDER=docker              # or 'judge0' to force specific provider

# Optional - Code Execution (Production Judge0)
JUDGE0_API_KEY=your-rapidapi-key      # Required for production
JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com
JUDGE0_RAPIDAPI_HOST=judge0-ce.p.rapidapi.com

# Optional - Web Search (Brave Search API)
BRAVE_SEARCH_API_KEY=your-brave-api-key  # Falls nicht gesetzt: DuckDuckGo Fallback
```

## Testing

```bash
# Backend
cd backend && npm test

# Frontend
cd frontend && npm test
```

## Documentation

- AI Features: `docs/AI-FEATURES.md`
- API Docs: `/api-docs` (Swagger)

## Changelog

### 2026-01-28: Web Tools Integration

**Neue Features:**

- `web_search` Tool: Web-Suche via Brave Search API
  - Privacy-first Alternative zu Google
  - DuckDuckGo Fallback ohne API-Key
  - Konfigurierbare Ergebnis-Anzahl

- `fetch_url` Tool: URL-Inhalte abrufen
  - Intelligente Content-Extraktion (Readability-ähnlich)
  - Metadata: Titel, Autor, Datum, Beschreibung
  - Noise-Filterung (Ads, Navigation, Footer)
  - Word Count und Lesezeit-Schätzung

**Neue Dateien:**
- `backend/src/services/web-search.ts`
- `backend/src/services/url-fetch.ts`
- `backend/src/__tests__/web-search.test.ts`
- `backend/src/__tests__/url-fetch.test.ts`

---

### 2026-01-26: Code Execution Production Deployment

**Problem gelöst:** Route-Reihenfolge-Konflikt

- Context-aware Routes (`/api/:context/...`) fingen `/api/code/*` ab
- Lösung: `codeExecutionRouter` vor context-aware Routes registrieren

**Judge0 Integration:**

- RapidAPI Judge0 CE als Production Provider
- Timeout-Limits angepasst (CPU: 15s, Wall: 25s) für Free Tier
- Automatische Provider-Auswahl (Judge0 in Production, Docker lokal)

**Neue Dateien:**

- `backend/src/services/code-execution/executor-provider.ts` - Provider Interface
- `backend/src/services/code-execution/judge0-executor.ts` - Judge0 API Client
- `backend/src/services/code-execution/executor-factory.ts` - Factory Pattern

**Getestet und funktioniert:**

```bash
curl https://ki-ab-production.up.railway.app/api/code/health
# → {"available":true,"enabled":true,"provider":"judge0"}

curl -X POST /api/code/execute -d '{"task":"Calculate Fibonacci","language":"python"}'
# → Generiert und führt Code aus
```
