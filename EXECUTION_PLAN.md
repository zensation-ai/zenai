# PersonalAIBrain - Execution Plan

> **Ziel:** Alle offenen Aufgaben strukturiert abarbeiten
> **Erstellt:** 9. Januar 2026
> **Für:** Automatische Abarbeitung in frischem Chat

---

## Anweisung für neuen Chat

```
Lies die Datei /Users/alexanderbering/Projects/KI-AB/EXECUTION_PLAN.md und arbeite
die Tasks der Reihe nach ab. Markiere jeden Task als erledigt [x] wenn du ihn
abgeschlossen hast. Committe nach jedem abgeschlossenen Block.
```

---

## Block 1: Phase 21 - Personalization Chat fertigstellen

**Ziel:** Personalization Chat Feature vollständig implementieren und committen

### Tasks

- [x] **1.1** Prüfe vorhandene Phase 21 Dateien:
  - `backend/sql/phase21_personalization_chat.sql` ✅
  - `backend/src/routes/personalization-chat.ts` ✅
  - `ios/PersonalAIBrain/Services/APIService+Personalization.swift` ✅
  - `ios/PersonalAIBrain/Views/PersonalizationChatView.swift` ✅

- [x] **1.2** SQL-Migration in Railway ausführen:
  ```bash
  # Prüfe ob Tabellen existieren, falls nicht:
  node -e "
  const { Client } = require('pg');
  const fs = require('fs');
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:zPReOyzBdToSLUbanhrehEEfiWXJwPMo@ballast.proxy.rlwy.net:57221/railway',
    ssl: { rejectUnauthorized: false }
  });
  client.connect()
    .then(() => client.query(fs.readFileSync('sql/phase21_personalization_chat.sql', 'utf8')))
    .then(() => console.log('Phase 21 Schema erstellt!'))
    .catch(e => console.log('Fehler oder bereits vorhanden:', e.message))
    .finally(() => client.end());
  "
  ``` ✅ Executed successfully

- [x] **1.3** Backend Route in main.ts registrieren (falls nicht vorhanden):
  ```typescript
  // In backend/src/main.ts prüfen:
  import personalizationChatRouter from './routes/personalization-chat';
  app.use('/api', personalizationChatRouter);
  ``` ✅ Already registered at line 147

- [x] **1.4** iOS View in Navigation einbinden (falls nicht vorhanden) ✅ Added to ProfileView

- [x] **1.5** Testen:
  - Backend: `curl https://ki-ab-production.up.railway.app/api/personalization/start` ✅
  - iOS: PersonalizationChatView navigation ready ✅
  - Note: Ollama not configured (will use OpenAI in Block 2)

- [ ] **1.6** Commit:
  ```bash
  git add -A && git commit -m "Phase 21: Personalization Chat complete

  - Backend routes registered
  - iOS views integrated
  - Database schema applied

  Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
  ```

---

## Block 2: OpenAI API Integration (KI-Funktionen aktivieren)

**Ziel:** OpenAI als Alternative zu Ollama für Ideen-Strukturierung

### Tasks

- [x] **2.1** OpenAI Service erstellen/erweitern:
  - Datei: `backend/src/services/openai.ts` ✅
  - Funktionen: `structureWithOpenAI()`, `generateOpenAIResponse()`, `extractKeywords()` ✅
  - AI Service facade: `backend/src/services/ai.ts` ✅

- [x] **2.2** Environment Variable dokumentieren:
  ```
  OPENAI_API_KEY=sk-...
  OPENAI_MODEL=gpt-4o-mini (oder gpt-4o)
  ``` ✅ Updated in .env.example

- [x] **2.3** AI Service mit Fallback erweitern:
  ```typescript
  // In backend/src/services/ai.ts:
  // Priority: OpenAI → Ollama → Basic fallback
  ``` ✅ Implemented with automatic fallback

- [x] **2.4** Personalization Chat Route anpassen:
  - `backend/src/routes/personalization-chat.ts` ✅
  - OpenAI für fact extraction und response generation ✅
  - Fallback to Ollama wenn OpenAI nicht verfügbar ✅

- [x] **2.5** Health endpoint erweitert:
  - Shows OpenAI configuration status ✅
  - Shows primary AI service (openai/ollama/basic) ✅

- [ ] **2.6** Railway Environment Variable setzen:
  - Railway Dashboard → Variables → OPENAI_API_KEY hinzufügen
  - (User muss eigenen Key eintragen)

- [ ] **2.7** Testen und Commit:
  ```bash
  git add -A && git commit -m "Add OpenAI integration as Ollama alternative

  - OpenAI service for idea structuring
  - Automatic fallback: OpenAI → Ollama → Basic
  - Environment variable OPENAI_API_KEY support

  Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
  ```

---

## Block 3: pgvector Migration (Supabase)

**Ziel:** Semantic Search aktivieren durch Migration zu pgvector-fähiger DB

### Option A: Supabase (Empfohlen - kostenlos)

- [ ] **3.1** Supabase Projekt erstellen:
  - https://supabase.com → New Project
  - Region: Frankfurt (eu-central-1)
  - Notiere: Project URL, anon key, service_role key

- [ ] **3.2** pgvector Extension aktivieren:
  ```sql
  -- In Supabase SQL Editor:
  CREATE EXTENSION IF NOT EXISTS vector;
  ```

- [ ] **3.3** Vollständiges Schema ausführen:
  - `backend/sql/complete_schema_init.sql` (mit vector)

- [ ] **3.4** Daten von Railway migrieren:
  ```bash
  # Export von Railway
  pg_dump "postgresql://postgres:PASSWORD@ballast.proxy.rlwy.net:57221/railway" > backup.sql

  # Import zu Supabase
  psql "postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres" < backup.sql
  ```

- [ ] **3.5** Railway Environment Variables aktualisieren:
  ```
  DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres
  ```

- [ ] **3.6** Embedding-Service aktivieren:
  - `backend/src/services/embedding.ts` prüfen
  - Vector-Indizes erstellen

- [ ] **3.7** Testen:
  - Semantic Search: `POST /api/personal/ideas/search { "query": "test", "semantic": true }`

- [ ] **3.8** Commit:
  ```bash
  git add -A && git commit -m "Migrate to Supabase for pgvector support

  - Semantic search now available
  - Vector embeddings for ideas
  - Similar ideas detection active

  Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
  ```

---

## Block 4: Redis Caching

**Ziel:** Performance-Verbesserung durch Caching

### Tasks

- [ ] **4.1** Railway Redis Service hinzufügen:
  - Railway Dashboard → New Service → Redis
  - Notiere REDIS_URL

- [ ] **4.2** Redis Client konfigurieren:
  ```typescript
  // backend/src/utils/cache.ts
  import Redis from 'ioredis';

  const redis = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL)
    : null;

  export const cache = {
    async get<T>(key: string): Promise<T | null> {
      if (!redis) return null;
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    },
    async set(key: string, value: any, ttl = 300): Promise<void> {
      if (!redis) return;
      await redis.setex(key, ttl, JSON.stringify(value));
    },
    async del(key: string): Promise<void> {
      if (!redis) return;
      await redis.del(key);
    }
  };
  ```

- [ ] **4.3** Ideas Route mit Caching:
  ```typescript
  // GET /api/:context/ideas - mit Cache
  const cacheKey = `ideas:${context}:${page}:${limit}`;
  const cached = await cache.get(cacheKey);
  if (cached) return res.json(cached);
  // ... DB Query ...
  await cache.set(cacheKey, response, 60);
  ```

- [ ] **4.4** Cache Invalidierung bei Änderungen

- [ ] **4.5** Health Check erweitern:
  ```typescript
  // redis status in /api/health
  cache: { status: redis ? 'connected' : 'not_configured' }
  ```

- [ ] **4.6** Commit:
  ```bash
  git add -A && git commit -m "Add Redis caching layer

  - Optional Redis support (graceful degradation)
  - Ideas list caching (60s TTL)
  - Cache invalidation on create/update/delete

  Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
  ```

---

## Block 5: CI/CD Pipeline

**Ziel:** Automatische Tests und Deployments

### Tasks

- [ ] **5.1** GitHub Actions Workflow erstellen:
  ```yaml
  # .github/workflows/ci.yml
  name: CI/CD

  on:
    push:
      branches: [main]
    pull_request:
      branches: [main]

  jobs:
    test-backend:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: '20'
        - run: cd backend && npm ci
        - run: cd backend && npm run build
        - run: cd backend && npm test

    deploy:
      needs: test-backend
      if: github.ref == 'refs/heads/main'
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - name: Deploy to Railway
          run: echo "Railway auto-deploys from GitHub"
  ```

- [ ] **5.2** Branch Protection aktivieren:
  - GitHub → Settings → Branches → Add rule
  - Require PR reviews
  - Require status checks

- [ ] **5.3** Commit:
  ```bash
  git add -A && git commit -m "Add CI/CD pipeline with GitHub Actions

  - Automated testing on push/PR
  - Build verification
  - Railway auto-deploy on main

  Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
  ```

---

## Block 6: iOS TestFlight Vorbereitung

**Ziel:** App für TestFlight/App Store Distribution vorbereiten

### Tasks

- [ ] **6.1** Bundle Identifier prüfen:
  - Xcode → Target → General → Bundle Identifier
  - Format: `com.yourname.PersonalAIBrain`

- [ ] **6.2** App Store Connect Setup:
  - https://appstoreconnect.apple.com
  - Neue App erstellen
  - Bundle ID registrieren

- [ ] **6.3** Certificates & Provisioning:
  - Apple Developer Account
  - Distribution Certificate
  - App Store Provisioning Profile

- [ ] **6.4** Info.plist ergänzen:
  - Privacy descriptions (Microphone, Camera, etc.)
  - App Transport Security für HTTPS

- [ ] **6.5** Archive erstellen:
  - Xcode → Product → Archive
  - Distribute App → TestFlight

- [ ] **6.6** Dokumentation aktualisieren:
  ```bash
  git add -A && git commit -m "iOS: TestFlight preparation

  - Bundle identifier configured
  - Privacy descriptions added
  - Distribution settings ready

  Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
  ```

---

## Block 7: Dokumentation & Cleanup

**Ziel:** Projekt dokumentieren und aufräumen

### Tasks

- [ ] **7.1** README.md aktualisieren:
  - Setup-Anleitung
  - Environment Variables
  - Deployment-Guide

- [ ] **7.2** AUSBAUPLAN_2025.md aktualisieren:
  - Alle Phasen als abgeschlossen markieren
  - Neue Phase 22+ planen (falls gewünscht)

- [ ] **7.3** Unused Code entfernen:
  - Alte Migrations-Dateien prüfen
  - Auskommentierter Code entfernen

- [ ] **7.4** Environment.example erstellen:
  ```
  # backend/.env.example
  DATABASE_URL=
  OPENAI_API_KEY=
  REDIS_URL=
  NODE_ENV=development
  ```

- [ ] **7.5** Final Commit:
  ```bash
  git add -A && git commit -m "Documentation and cleanup

  - Updated README with setup guide
  - Environment example files
  - Code cleanup

  Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
  ```

---

## Priorisierte Reihenfolge

| Priorität | Block | Aufwand | Nutzen |
|-----------|-------|---------|--------|
| 1 | Block 1: Phase 21 | 30 min | Feature-Completion |
| 2 | Block 2: OpenAI | 1h | KI-Funktionen |
| 3 | Block 3: pgvector | 1-2h | Semantic Search |
| 4 | Block 4: Redis | 30 min | Performance |
| 5 | Block 5: CI/CD | 30 min | Automatisierung |
| 6 | Block 6: TestFlight | 1h | Distribution |
| 7 | Block 7: Docs | 30 min | Wartbarkeit |

---

## Hinweise

- **Nach jedem Block:** `git push origin main`
- **Bei Fehlern:** Fehler dokumentieren, dann weitermachen
- **Railway Redeploy:** Passiert automatisch bei Push
- **iOS Rebuild:** Nach Backend-Änderungen App neu bauen

---

*Plan erstellt: 9. Januar 2026*
