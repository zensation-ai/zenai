# Erste Schritte mit ZenAI

ZenAI ist eine selbst-gehostete Enterprise AI-Plattform für Wissensarbeit. Diese Anleitung führt durch die lokale Einrichtung und das Produktions-Deployment.

## Voraussetzungen

| Software | Version | Hinweis |
|----------|---------|---------|
| Node.js | 20+ | `node --version` |
| pnpm | 9.15+ | `npm install -g pnpm@9.15.0` |
| PostgreSQL | 15+ | Mit [pgvector](https://github.com/pgvector/pgvector)-Extension |
| Redis | 7+ | Optional, für Caching und Job-Queues |
| Docker | 24+ | Optional, für Code-Execution-Sandbox |

## Schnellstart (Lokale Entwicklung)

### 1. Repository klonen

```bash
git clone https://github.com/zensation-ai/zenai.git
cd zenai
```

### 2. Umgebungsvariablen konfigurieren

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env
```

Mindestens diese Werte in `backend/.env` setzen:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/zenai
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### 3. Dependencies installieren

```bash
pnpm install
```

### 4. Datenbank initialisieren

Sicherstellen, dass PostgreSQL läuft und die pgvector-Extension verfügbar ist:

```bash
# pgvector installieren (falls noch nicht vorhanden)
# macOS: brew install pgvector
# Ubuntu: sudo apt install postgresql-15-pgvector

# Datenbank erstellen
createdb zenai

# pgvector aktivieren
psql zenai -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Schema + Tabellen anlegen (4 Kontexte: operations, finance, people, strategy)
cd backend && npm run db:init
```

### 5. API-Key generieren

```bash
cd backend && npm run create-web-key
```

Den generierten Key als `VITE_API_KEY` in beide `.env`-Dateien eintragen (Backend + Frontend).

### 6. Dev-Server starten

```bash
# Aus dem Root-Verzeichnis:
pnpm dev:web
```

Das startet Backend (Port 3000) und Frontend (Port 5173) parallel via Turbo.

Alternativ einzeln:

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

### 7. Prüfen

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend Health: [http://localhost:3000/api/health/detailed](http://localhost:3000/api/health/detailed)
- API Docs (Swagger): [http://localhost:3000/api-docs](http://localhost:3000/api-docs)

---

## Docker Deployment

ZenAI nutzt ein Multi-Stage Dockerfile (Node 20 Alpine, non-root User, dumb-init).

### Backend-Image bauen

```bash
# Aus dem Root-Verzeichnis (Monorepo-Context nötig):
docker build -t zenai-backend -f Dockerfile .
```

### Backend-Container starten

```bash
docker run -d \
  --name zenai-backend \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e ANTHROPIC_API_KEY="sk-ant-..." \
  -e VITE_API_KEY="ab_live_..." \
  -e NODE_ENV=production \
  zenai-backend
```

### Frontend bauen und deployen

Das Frontend ist eine statische Vite-App:

```bash
cd frontend
VITE_API_URL=https://your-backend-url.com npm run build
# Output in frontend/dist/ -- auf beliebigem Static-Host deployen
```

---

## Produktions-Deployment

ZenAI läuft produktiv auf folgendem Stack:

| Service | Provider | Hinweis |
|---------|----------|---------|
| Backend | [Railway](https://railway.app) | Auto-Deploy von `main` Branch |
| Frontend | [Vercel](https://vercel.com) | Auto-Deploy von `main` Branch |
| Datenbank | [Supabase](https://supabase.com) | PostgreSQL + pgvector |
| Cache | [Railway](https://railway.app) | Redis (optional) |

### Supabase-Datenbank

**Wichtig: Port 6543 verwenden (Transaction Mode Pooler), NICHT Port 5432.**

Port 5432 (Session Mode) erlaubt nur ~1 Verbindung und führt zu Pool-Exhaustion-Crashes.

```env
# Korrekt:
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres

# FALSCH (wird crashen):
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

### Railway (Backend)

1. Neues Projekt auf Railway erstellen
2. GitHub-Repository verbinden (Branch: `main`)
3. Root Directory: `/` (Monorepo-Root, nicht `/backend`)
4. Dockerfile Path: `Dockerfile`
5. Environment Variables setzen (siehe Tabelle unten)
6. Custom Domain konfigurieren

### Vercel (Frontend)

1. Neues Projekt auf Vercel erstellen
2. GitHub-Repository verbinden (Branch: `main`)
3. Root Directory: `frontend`
4. Framework Preset: Vite
5. Environment Variables setzen:

```env
VITE_API_KEY=ab_live_...
VITE_API_URL=https://your-backend.up.railway.app
VITE_SUPABASE_URL=https://[PROJECT-REF].supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

### CORS konfigurieren

In der Backend `.env` die Frontend-Domain(s) freigeben:

```env
ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://yourdomain.com
```

---

## Umgebungsvariablen

### Erforderlich

| Variable | Beschreibung | Beispiel |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL-Verbindung mit pgvector | `postgresql://user:pass@host:6543/db` |
| `ANTHROPIC_API_KEY` | Claude API-Key | `sk-ant-api03-...` |
| `VITE_API_KEY` | App-Authentifizierung (via `npm run create-web-key`) | `ab_live_...` |

### Optional -- AI & LLM

| Variable | Beschreibung | Standard |
|----------|-------------|----------|
| `CLAUDE_MODEL` | Claude-Modell | `claude-sonnet-4-20250514` |
| `MAX_TOKENS` | Max. Antwort-Tokens | `4096` |
| `MISTRAL_API_KEY` | Mistral Cloud-Fallback | -- |
| `OPENAI_API_KEY` | OpenAI-Fallback | -- |
| `OLLAMA_URL` | Lokale LLM-Inferenz | -- |

### Optional -- Server & Cache

| Variable | Beschreibung | Standard |
|----------|-------------|----------|
| `PORT` | Backend-Port | `3000` |
| `NODE_ENV` | Umgebung | `development` |
| `ALLOWED_ORIGINS` | CORS-Origins (kommagetrennt) | `localhost` |
| `REDIS_URL` | Redis für Caching + BullMQ | -- |
| `LOG_LEVEL` | Log-Stufe | `info` |

### Optional -- Websuche

| Variable | Beschreibung |
|----------|-------------|
| `BRAVE_SEARCH_API_KEY` | Brave Search API ([2000 Req/Monat gratis](https://brave.com/search/api/)). Fallback: DuckDuckGo |

### Optional -- Code-Execution

| Variable | Beschreibung | Standard |
|----------|-------------|----------|
| `ENABLE_CODE_EXECUTION` | Sandbox aktivieren | `false` |
| `CODE_EXECUTION_TIMEOUT` | Timeout in ms | `30000` |
| `CODE_EXECUTION_MEMORY_LIMIT` | Speicherlimit | `256m` |
| `JUDGE0_API_KEY` | Judge0 für Produktion | -- |

### Optional -- E-Mail (Resend)

| Variable | Beschreibung |
|----------|-------------|
| `RESEND_API_KEY` | Resend API-Key |
| `RESEND_WEBHOOK_SECRET` | Webhook-Validierung |
| `RESEND_DEFAULT_FROM` | Standard-Absender |

### Optional -- Voice

| Variable | Beschreibung |
|----------|-------------|
| `ELEVENLABS_API_KEY` | ElevenLabs TTS |
| `DEEPGRAM_API_KEY` | Deepgram STT |

### Optional -- Integrationen

| Variable | Beschreibung |
|----------|-------------|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub-Tools (Scopes: `repo`, `read:user`, `read:org`) |
| `GOOGLE_MAPS_API_KEY` | Karten & Navigation |
| `STRIPE_SECRET_KEY` | Stripe-Zahlungen |
| `STRIPE_WEBHOOK_SECRET` | Stripe-Webhooks |
| `GA4_PROPERTY_ID` | Google Analytics 4 |
| `SLACK_CLIENT_ID` | Slack-Integration |

### Optional -- Sicherheit & Monitoring

| Variable | Beschreibung |
|----------|-------------|
| `ENCRYPTION_KEY` | AES-256 Feld-Verschlüsselung |
| `JWT_SECRET` | JWT-Signierung (auto-generiert in Dev) |
| `SENTRY_DSN` | Error-Tracking |

### Optional -- Memory (HiMeS)

| Variable | Beschreibung | Standard |
|----------|-------------|----------|
| `CRON_TIMEZONE` | Zeitzone für Scheduler | `Europe/Berlin` |
| `CONSOLIDATION_SCHEDULE` | Konsolidierungs-Cron | `0 2 * * *` |
| `DECAY_SCHEDULE` | Decay-Cron | `0 3 * * *` |

### Frontend-Variablen

| Variable | Beschreibung | Hinweis |
|----------|-------------|---------|
| `VITE_API_KEY` | Backend-Authentifizierung | Gleicher Key wie im Backend |
| `VITE_API_URL` | Backend-URL | Leer lassen für lokale Entwicklung (Vite Proxy) |
| `VITE_SUPABASE_URL` | Supabase-Projekt-URL | Nur für Produktion mit Supabase Auth |
| `VITE_SUPABASE_ANON_KEY` | Supabase Anon-Key | Nur für Produktion mit Supabase Auth |

---

## API-Key generieren

```bash
cd backend && npm run create-web-key
```

Der generierte Key hat alle drei Scopes: `read`, `write`, `admin`. Den Key in `VITE_API_KEY` in beiden `.env`-Dateien eintragen.

---

## Health Check

```bash
# Einfacher Health Check
curl http://localhost:3000/api/health

# Detaillierter Health Check (alle Services)
curl http://localhost:3000/api/health/detailed
```

Der detaillierte Check zeigt den Status von:
- Datenbank (alle 4 Kontexte)
- Redis-Verbindung
- AI-Provider-Verfügbarkeit
- Queue-Worker-Status

---

## Fehlerbehebung

### `ECONNREFUSED` beim Datenbankzugriff

**Ursache:** PostgreSQL läuft nicht oder falsche `DATABASE_URL`.

```bash
# PostgreSQL-Status prüfen
pg_isready

# Connection testen
psql $DATABASE_URL -c "SELECT 1;"
```

### `pool exhaustion` / `too many clients`

**Ursache:** Falsche Supabase-Portnummer (5432 statt 6543).

**Lösung:** In `DATABASE_URL` Port `6543` (Transaction Mode Pooler) verwenden.

### `pgvector extension not found`

```bash
# Extension installieren
# macOS:
brew install pgvector

# Ubuntu/Debian:
sudo apt install postgresql-15-pgvector

# Dann aktivieren:
psql zenai -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### `VITE_API_KEY` ungültig / 401 Unauthorized

```bash
# Neuen Key generieren
cd backend && npm run create-web-key

# Key in BEIDE .env-Dateien eintragen (backend + frontend)
```

### Frontend kann Backend nicht erreichen (CORS)

Für lokale Entwicklung: `VITE_API_URL` im Frontend leer lassen (nutzt Vite-Proxy).

Für Produktion: `ALLOWED_ORIGINS` im Backend auf die Frontend-Domain setzen.

### Build-Fehler im Monorepo

```bash
# Alles zurücksetzen
pnpm clean
pnpm install

# Shared-Paket zuerst bauen
pnpm --filter @zenai/shared run build

# Dann den Rest
pnpm build
```

### Docker-Build schlägt fehl

Der Docker-Build muss aus dem **Root-Verzeichnis** gestartet werden (nicht aus `/backend`), da das Monorepo-Setup den Workspace-Context braucht:

```bash
# Korrekt:
docker build -t zenai-backend -f Dockerfile .

# FALSCH:
cd backend && docker build .
```

---

## Weitere Ressourcen

- [AI Features & Architektur](../README.md#what-is-zenai)
- [CI/CD Pipeline](CI-CD.md)
- API-Referenz: `http://localhost:3000/api-docs` (Swagger, bei laufendem Server)
