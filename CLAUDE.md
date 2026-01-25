# KI-AB Project Context

## Deployment URLs

| Service | URL | Notes |
|---------|-----|-------|
| **Frontend (Production)** | https://frontend-mu-six-93.vercel.app/ | Aktive Vercel-Deployment |
| **Backend (Production)** | https://ki-ab-production.up.railway.app | Railway Auto-Deploy auf `main` |
| **Database** | Supabase | PostgreSQL mit pgvector |

## Architecture

- **Frontend**: React + TypeScript (Vite)
- **Backend**: Express.js + TypeScript
- **AI**: Claude API (Primary), Ollama (Fallback)
- **Memory**: HiMeS 4-Layer Architecture
  - Working Memory (aktiver Task-Fokus)
  - Episodic Memory (konkrete Erfahrungen)
  - Short-Term Memory (Session-Kontext)
  - Long-Term Memory (persistentes Wissen)

## Current Phase: 30

Memory Scheduler implementiert:
- Long-Term Consolidation (täglich 2:00 AM)
- Episodic Decay (täglich 3:00 AM)
- Memory Stats Logging (stündlich)

## Key Files

- Backend Entry: `backend/src/main.ts`
- Memory Services: `backend/src/services/memory/`
- General Chat: `backend/src/routes/general-chat.ts`
- Frontend App: `frontend/src/App.tsx`
- Chat Component: `frontend/src/components/GeneralChat.tsx`

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
```
