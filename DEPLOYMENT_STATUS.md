# PersonalAIBrain - Deployment Status & Dokumentation

> **Stand:** 9. Januar 2026
> **Letzte Session:** Railway Deployment + iOS Integration

---

## Aktueller Deployment-Status

### Railway Backend

| Komponente | Status | Details |
|------------|--------|---------|
| **Backend API** | Aktiv | `https://ki-ab-production.up.railway.app` |
| **PostgreSQL** | Aktiv | Ohne pgvector (Railway Standard-PostgreSQL) |
| **Region** | EU | europe-west4 (Amsterdam) - GDPR-konform |
| **Health Check** | Degraded | Databases OK, Ollama/Redis nicht konfiguriert |

### Verbindungsdaten (Referenz)

```
# Railway PostgreSQL (Public Network)
Host: ballast.proxy.rlwy.net
Port: 57221
Database: railway
User: postgres

# API Endpoints
Health: https://ki-ab-production.up.railway.app/api/health
Ideas:  https://ki-ab-production.up.railway.app/api/ideas
```

### iOS App Konfiguration

**Datei:** `ios/PersonalAIBrain/Config/Environment.swift`

```swift
// Production URL für Railway
private static let productionURL: String? = "https://ki-ab-production.up.railway.app"

// Logik:
// - Simulator → localhost:3000
// - Real Device → Railway Production URL
```

---

## Aktuelle Einschränkungen

### 1. Kein pgvector (Semantic Search deaktiviert)

Railway's Standard-PostgreSQL unterstützt die `vector` Extension nicht.

**Auswirkungen:**
- Semantische Suche funktioniert nicht
- Ähnliche Ideen finden nicht verfügbar
- Embedding-basierte Vorschläge deaktiviert

**Workaround:**
- Schema ohne vector-Spalten: `backend/sql/complete_schema_init_no_vector.sql`

**Langfristige Lösung:**
- Migration zu **Supabase** oder **Neon** (beide haben pgvector)
- Oder Railway mit Custom PostgreSQL Image (kostenpflichtiger Plan)

### 2. Ollama nicht verfügbar

Railway hat keinen GPU-Support für Ollama.

**Auswirkungen:**
- KI-Strukturierung von Ideen funktioniert nicht
- Voice Memo Transkription geht, aber keine intelligente Verarbeitung

**Lösung:**
- `OPENAI_API_KEY` als Environment Variable setzen
- Oder externen Ollama-Server konfigurieren

### 3. Redis nicht konfiguriert

**Auswirkungen:**
- Kein Caching
- Rate Limiting auf In-Memory (verliert Status bei Restart)

**Lösung:**
- Railway Redis Service hinzufügen (~$5/Monat)

---

## Implementierte Phasen (Übersicht)

| Phase | Name | Status |
|-------|------|--------|
| 1-7 | Core System | Abgeschlossen |
| 8 | Advanced Knowledge Graph | Abgeschlossen |
| 9-13 | Foundation & Production Readiness | Abgeschlossen |
| 14 | iOS Widgets & Siri | Abgeschlossen |
| 15 | Web-App Dual-Context | Abgeschlossen |
| 16-17 | Sub-Persona System + Archive | Abgeschlossen |
| 18-19 | Export System + Push Notifications | Abgeschlossen |
| 20 | Daily Digest, Analytics Dashboard | Abgeschlossen |
| 21 | Personalization Chat | In Arbeit |

---

## Dateien dieser Session

### Neue Dateien

| Datei | Zweck |
|-------|-------|
| `backend/sql/complete_schema_init.sql` | Vollständiges DB-Schema (mit pgvector) |
| `backend/sql/complete_schema_init_no_vector.sql` | DB-Schema ohne pgvector für Railway |

### Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `backend/src/utils/database.ts` | DATABASE_URL Parsing für Railway |
| `backend/src/utils/database-context.ts` | DATABASE_URL + SSL für Railway internal |
| `backend/Dockerfile` | SQL-Pfad korrigiert |
| `backend/.dockerignore` | tsconfig.json + .ts Dateien nicht mehr ignoriert |
| `ios/.../Environment.swift` | Railway Production URL + Device-Logik |

---

## Nächste Schritte (Empfohlen)

### Kurzfristig

1. **Phase 21 fertigstellen** - Personalization Chat
   - Backend: `backend/src/routes/personalization-chat.ts` (vorhanden)
   - iOS: `ios/PersonalAIBrain/Views/PersonalizationChatView.swift` (vorhanden)
   - SQL: `backend/sql/phase21_personalization_chat.sql` (vorhanden)

2. **Ollama-Alternative einrichten**
   - OpenAI API Key in Railway Environment Variables
   - Backend nutzt dann OpenAI statt lokalem Ollama

### Mittelfristig

3. **pgvector-fähige Datenbank**
   - Option A: Supabase (kostenloser Tier mit pgvector)
   - Option B: Neon (kostenloser Tier mit pgvector)
   - Dann `complete_schema_init.sql` (mit vector) ausführen

4. **Redis für Caching**
   - Railway Redis Service hinzufügen
   - `REDIS_URL` Environment Variable setzen

### Langfristig

5. **CI/CD Pipeline**
   - GitHub Actions für automatische Deployments
   - Siehe `AUSBAUPLAN_2025.md` Phase 12

6. **TestFlight / App Store**
   - iOS App für Distribution vorbereiten
   - Certificates & Provisioning Profiles

---

## Wichtige Befehle

### Datenbank-Schema initialisieren (Railway)

```bash
cd /Users/alexanderbering/Projects/KI-AB/backend

# Mit Node.js (psql nicht nötig)
node -e "
const { Client } = require('pg');
const fs = require('fs');
const client = new Client({
  connectionString: 'postgresql://postgres:PASSWORD@ballast.proxy.rlwy.net:57221/railway',
  ssl: { rejectUnauthorized: false }
});
client.connect()
  .then(() => client.query(fs.readFileSync('sql/complete_schema_init_no_vector.sql', 'utf8')))
  .then(() => console.log('Schema erstellt!'))
  .finally(() => client.end());
"
```

### iOS App auf Gerät deployen

```bash
# In Xcode:
# 1. iPhone per Kabel anschließen
# 2. Oben iPhone als Ziel wählen
# 3. Cmd+R (Build & Run)
```

### Health Check testen

```bash
curl https://ki-ab-production.up.railway.app/api/health | jq
```

---

## Architektur-Überblick

```
┌─────────────────────────────────────────────────────────────┐
│                      iOS App                                 │
│  PersonalAIBrain.app                                        │
│  - SwiftUI Views                                            │
│  - APIService → Railway Backend                             │
│  - Offline Queue (SQLite)                                   │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                Railway (Europe-West)                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Backend Service (Node.js/Express)                    │   │
│  │ - REST API                                           │   │
│  │ - Whisper Integration (optional)                     │   │
│  │ - Ollama/OpenAI Integration (optional)               │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │                                     │
│  ┌─────────────────────▼───────────────────────────────┐   │
│  │ PostgreSQL (ohne pgvector)                           │   │
│  │ - ideas, voice_memos, media_items                    │   │
│  │ - personalization_sessions, chat_messages            │   │
│  │ - digests, analytics_events                          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Notizen für zukünftige Sessions

- **DATABASE_URL** wird automatisch von Railway gesetzt
- Backend erkennt Railway-interne Verbindungen und deaktiviert SSL
- iOS nutzt Production URL nur auf echten Geräten, nicht im Simulator
- Health Check zeigt "degraded" wegen fehlendem Ollama/Redis - das ist OK
- Phase 21 Files existieren aber sind noch nicht committed

---

*Erstellt: 9. Januar 2026*
*Letzte Änderung: 9. Januar 2026*
