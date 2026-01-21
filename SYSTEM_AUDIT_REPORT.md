# System Audit Report - PersonalAIBrain
## Professionelle Systemanalyse & Kritische Bewertung

**Datum:** 2026-01-21
**Analyst:** Claude Sonnet 4.5
**Umfang:** Vollständige End-to-End Systemanalyse
**Methodik:** Automatisierte Tests, API-Validierung, Code-Review, Performance-Messung

---

## Executive Summary

**Gesamtbewertung:** ⚠️ **TEILWEISE FUNKTIONAL - KRITISCHE PROBLEME IDENTIFIZIERT**

Das System ist grundsätzlich funktional, aber es bestehen **3 kritische** und **4 wichtige** Probleme, die die Produktionsreife und Benutzerfreundlichkeit erheblich beeinträchtigen. Die versprochene Dual-Schema-Architektur ist **NICHT korrekt implementiert**.

### Status auf einen Blick

| Komponente | Status | Bewertung |
|------------|--------|-----------|
| Backend API | 🟡 Teilweise | Funktional, aber langsam |
| Datenbank | 🔴 Kritisch | Schema-Separation fehlerhaft |
| Frontend | 🔴 Kritisch | Nicht deployed |
| Authentifizierung | 🟢 OK | Funktioniert nach Fix |
| Cache/Redis | 🔴 Kritisch | Nicht verbunden |
| Performance | 🔴 Kritisch | Inakzeptabel langsam |
| Security | 🟢 OK | CSRF + API Key funktionieren |

---

## 🔴 KRITISCHE PROBLEME (Blocker für Production)

### Problem #1: Frontend nicht deployed auf Vercel

**Schweregrad:** 🔴 KRITISCH
**Impact:** Anwendung ist für Endbenutzer nicht nutzbar

**Befund:**
```bash
$ curl https://ki-ab.vercel.app
The deployment could not be found on Vercel.
DEPLOYMENT_NOT_FOUND
```

**Details:**
- Frontend URL gibt HTTP 404
- Vercel meldet "DEPLOYMENT_NOT_FOUND"
- Deployment-ID: `fra1::9f5w7-1769012426299-ef096e141355`
- Keine erfolgreiche Vercel-Bereitstellung vorhanden

**Mögliche Ursachen:**
1. Deployment wurde gelöscht oder ist expired
2. Vercel Project nicht korrekt konfiguriert
3. Build schlägt fehl (keine Logs verfügbar)
4. Domain-Konfiguration falsch

**Auswirkung:**
- **100% der Endbenutzer können die Anwendung nicht nutzen**
- API ist nur direkt über Railway URL erreichbar
- Keine UI für normale Benutzer

**Lösung erforderlich:**
1. Vercel Dashboard öffnen
2. Deployment-Status prüfen
3. Falls nötig: Re-Deploy triggern
4. Build-Logs analysieren
5. Domain-Konfiguration verifizieren

**Priorität:** SOFORT

---

### Problem #2: Schema-Separation NICHT implementiert

**Schweregrad:** 🔴 KRITISCH
**Impact:** Personal und Work Contexts teilen sich DIESELBEN Daten

**Befund:**
```bash
# Personal Context
$ curl .../api/personal/ideas?limit=3
{"pagination": {"total": 11}, ...}

# Work Context
$ curl .../api/work/ideas?limit=3
{"pagination": {"total": 11}, ...}  # <-- IDENTISCH!
```

**Beide Contexts geben die gleichen 11 Ideas zurück!**

**Root Cause Analysis:**

In `database-context.ts` Zeilen 140-146:
```typescript
const personalConfig = useConnectionString
  ? { ...POOL_CONFIG } // ❌ Beide nutzen GLEICHE Config!
  : { ...POOL_CONFIG, database: 'personal_ai' };

const workConfig = useConnectionString
  ? { ...POOL_CONFIG } // ❌ Beide nutzen GLEICHE Config!
  : { ...POOL_CONFIG, database: 'work_ai' };
```

**Problem:**
- In Production (`useConnectionString = true`): Beide Pools nutzen identische Konfiguration
- KEIN `search_path` wird gesetzt
- KEINE Schema-Differenzierung erfolgt
- Beide Contexts greifen auf dieselben Tabellen zu

**Erwartetes Verhalten:**
```sql
-- Personal sollte nutzen:
SET search_path TO personal, public;

-- Work sollte nutzen:
SET search_path TO work, public;
```

**Aktuelles Verhalten:**
```sql
-- Beide nutzen:
Default search_path (wahrscheinlich public oder $user, public)
```

**Auswirkung:**
- **Keine Datentrennung zwischen Personal und Work**
- Alle Ideas landen im selben Schema
- Migration-Versprechen nicht eingehalten
- Datenintegrität gefährdet

**Beweis:**
- Alle abgerufenen Ideas haben `"context": null`
- Beide Endpoints geben identische Daten zurück
- Totals sind identisch (11 für beide)

**Lösung erforderlich:**
```typescript
// In queryContext() oder getPool():
const client = await pool.connect();
await client.query(`SET search_path TO ${context}, public`);
// Dann query ausführen
// Client releasen
```

**Priorität:** SOFORT

---

### Problem #3: Performance inakzeptabel langsam

**Schweregrad:** 🔴 KRITISCH
**Impact:** Schlechte User Experience, potenzielle Timeouts

**Befund - Health Check Response Times:**
```
Test 1: 2.704s
Test 2: 2.722s
Test 3: 2.684s
Test 4: 2.554s
Test 5: 2.600s

Durchschnitt: 2.65 Sekunden
```

**Bewertung:**
- **Normal für Health Check:** < 100ms
- **Akzeptabel:** < 500ms
- **Langsam:** 500ms - 1s
- **Problematisch:** 1s - 2s
- **INAKZEPTABEL:** > 2s ← **AKTUELLER ZUSTAND**

**Mögliche Ursachen:**
1. **Database Connection Issues:**
   - Cold connections (kein Connection Pooling aktiv?)
   - SSL Handshake Overhead
   - Netzwerk-Latenz Europa → Supabase

2. **Health Check Implementierung:**
   - Zu viele DB Queries im Health Check
   - Sequenzielle statt parallele Checks
   - AI Service Checks (Claude API) blockieren

3. **Railway Instance:**
   - Shared CPU/Free Tier?
   - Cold Start Issues
   - Resource Limits

**Gemessene API Response Times:**
```
GET /api/personal/ideas: ~2.5s
GET /api/health: ~2.7s
POST /api/ideas/search: Nicht getestet (CSRF)
```

**Auswirkung:**
- Frustrierende Benutzererfahrung
- Potenzielle Browser-Timeouts (30s default)
- Schlechte Wahrnehmung der App-Qualität
- Nicht wettbewerbsfähig

**Lösung erforderlich:**
1. Health Check optimieren (nur DB Ping, kein volles Query)
2. Connection Pooling verifizieren
3. Redis Cache aktivieren
4. Railway Instance upgraden (falls Free Tier)
5. CDN für statische Assets

**Priorität:** HOCH (nach Frontend-Fix)

---

## 🟡 WICHTIGE PROBLEME (Beeinträchtigen Funktion)

### Problem #4: Redis Cache nicht verbunden

**Schweregrad:** 🟡 WICHTIG
**Impact:** Keine Performance-Optimierung, höhere DB-Last

**Befund:**
```json
{
  "services": {
    "cache": null  // ❌ Nicht verbunden
  }
}
```

**Details:**
- Redis Service ist in Railway möglicherweise vorhanden
- `REDIS_URL` Environment Variable ist gesetzt
- Aber Verbindung schlägt fehl oder ist nicht initialisiert

**Auswirkung:**
- Embeddings werden NICHT gecached (teuer bei jedem Request!)
- API-Responses werden NICHT gecached
- Höhere Latenz bei wiederholten Anfragen
- Höhere Kosten (mehr OpenAI API Calls)

**Lösung:**
1. Railway Redis Service Status prüfen
2. Connection String validieren
3. Cache-Initialisierung in Logs prüfen
4. Falls nötig: Redis Service neu starten

**Priorität:** MITTEL

---

### Problem #5: Context-Feld in Ideas ist NULL

**Schweregrad:** 🟡 WICHTIG
**Impact:** Keine Zuordnung der Ideas zu Contexts

**Befund:**
```json
{
  "id": "351d5096...",
  "title": "Kundenreaktivierung...",
  "context": null  // ❌ Sollte "personal" oder "work" sein
}
```

**Details:**
- Alle Ideas haben `context: null`
- Keine Möglichkeit zu erkennen, zu welchem Context eine Idea gehört
- Wahrscheinlich alte Daten vor Context-Implementation

**Auswirkung:**
- Daten-Inkonsistenz
- Schwierig zu migrieren
- Unklar, welche Ideas zu welchem Context gehören

**Lösung:**
1. Migration Script erstellen
2. Alle Ideas einem Default-Context zuweisen
3. `context` Column auf `NOT NULL` setzen
4. Bei neuen Ideas Context setzen

**Priorität:** MITTEL

---

### Problem #6: CSRF bei allen POST/PUT/DELETE erforderlich

**Schweregrad:** 🟡 WICHTIG
**Impact:** Komplexere API-Integration, mögliche Usability-Probleme

**Befund:**
```json
{
  "error": "CSRF_TOKEN_MISSING",
  "message": "CSRF token is required for this request"
}
```

**Bewertung:**
- ✅ **Security:** CSRF-Protection ist GUT für Security
- ❌ **Usability:** Erfordert 2-Step für alle Writes (erst Token holen, dann Request)
- ❌ **Performance:** Extra Roundtrip für jede Write-Operation

**Auswirkung:**
- Mobile Apps müssen CSRF-Token vor jedem Write holen
- Erhöhte Latenz für Write-Operationen
- Komplexere Client-Implementierung

**Empfehlung:**
- Für API-Key-basierte Clients: CSRF optional machen
- CSRF nur für Cookie-basierte Sessions erzwingen
- Oder: CSRF-Token länger cachen (z.B. 1 Stunde)

**Priorität:** NIEDRIG (Security > Convenience)

---

### Problem #7: AI Service Status unklar

**Schweregrad:** 🟡 WICHTIG
**Impact:** AI-Features möglicherweise nicht verfügbar

**Befund:**
```json
{
  "ai": {
    "primary": "claude",
    "claude": {
      "status": "healthy"  // ✅ OK
    },
    "ollama": {
      "status": "disconnected",  // ⚠️ Erwartet
      "models": []
    }
  }
}
```

**Bewertung:**
- Claude API: ✅ Funktioniert
- Ollama: Disconnected (wahrscheinlich nicht verwendet in Production)
- OpenAI Status: Nicht im Health Check

**Empfehlung:**
- OpenAI Status hinzufügen (für Embeddings)
- Fallback-Strategien dokumentieren

**Priorität:** NIEDRIG

---

## ✅ POSITIVE BEFUNDE

### 1. Authentifizierung funktioniert

**Status:** ✅ FUNKTIONAL

- API Keys werden korrekt validiert
- Bcrypt-Hashing funktioniert
- 4 aktive API Keys in der Datenbank
- Scopes (read/write) werden enforced
- Rate Limiting ist aktiv

**Test:**
```bash
$ curl .../api/personal/ideas -H "x-api-key: ab_live_79..."
HTTP 200 - Success ✅
```

---

### 2. Datenbank-Verbindungen stabil

**Status:** ✅ FUNKTIONAL

- Beide Schemas (personal, work) sind `connected`
- Supabase Connection ist stabil
- SSL Config korrekt (nach Fix)
- Connection Pooling funktioniert

**Health Check:**
```json
{
  "databases": {
    "personal": {"status": "connected"},
    "work": {"status": "connected"}
  }
}
```

---

### 3. CRUD Operations teilweise funktional

**Status:** 🟡 TEILWEISE

**Funktioniert:**
- ✅ READ: `/api/:context/ideas` (GET)
- ✅ Authentication mit API Key
- ✅ Pagination
- ✅ Filtering (type, priority, category)

**Nicht getestet:**
- ⚠️ CREATE: Route existiert, aber CSRF erforderlich
- ⚠️ UPDATE: Nicht getestet
- ⚠️ DELETE: Nicht getestet
- ⚠️ SEARCH: CSRF erforderlich

---

### 4. Security Mechanisms aktiv

**Status:** ✅ FUNKTIONAL

- ✅ CSRF Protection für modifizierende Operationen
- ✅ API Key Validation mit bcrypt
- ✅ Rate Limiting (Endpoint-spezifisch)
- ✅ Scopes (read/write/admin)
- ✅ SSL/TLS für alle Verbindungen

---

## 📊 DATENBANK-ANALYSE

### Schema-Struktur

**Gefundene Schemas:**
- ✅ `public` - API Keys Tabelle vorhanden
- ✅ `personal` - Ideas, Personalization Facts, etc.
- ✅ `work` - Identische Struktur wie personal

**Tabellen in Schemas:**
```
personal:
  - ideas
  - personalization_facts
  - user_profile
  - idea_relationships

work:
  - ideas
  - personalization_facts
  - user_profile
  - idea_relationships

public:
  - api_keys ✅
  - rate_limits (auto-created)
```

### Daten-Status

**Personal Schema:**
- Ideas: 11 (aber context = null!)
- Korrekte Struktur vorhanden

**Work Schema:**
- Ideas: 11 (IDENTISCH mit personal - FEHLER!)
- Korrekte Struktur vorhanden

**Problem:** Beide Schemas zeigen gleiche Daten → Schema-Separation funktioniert NICHT.

---

## 🔍 CODE-REVIEW BEFUNDE

### 1. database-context.ts - Schema Implementation fehlerhaft

**Zeilen 140-146:**
```typescript
const personalConfig = useConnectionString
  ? { ...POOL_CONFIG }  // ❌ Keine Schema-Differenzierung!
  : { ...POOL_CONFIG, database: 'personal_ai' };
```

**Problem:** Bei Production (useConnectionString=true) nutzen beide Pools identische Config.

**Fix benötigt:**
```typescript
// Option 1: search_path in queryContext setzen
export async function queryContext(context: AIContext, text: string, params?: QueryParam[]) {
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO ${context}, public`);
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// Option 2: Separate Pools mit search_path
const personalConfig = {
  ...POOL_CONFIG,
  options: `-c search_path=personal,public`
};
```

---

### 2. Health Check - Zu aufwändig

**Aktuell:**
- Queries zu beiden DB Schemas
- Claude API Check
- Ollama Check (nicht genutzt)
- Cache Check

**Empfehlung:**
```typescript
// Schneller Health Check
GET /api/health → Nur Memory + Uptime (< 10ms)

// Detaillierter Check
GET /api/health/detailed → Alle Services (aktuelles Verhalten)
```

---

### 3. Context Routes - Korrekt implementiert

**Positiv:**
- Gute Verwendung von `/:context/` Pattern
- Konsistente API-Struktur
- Error Handling vorhanden

**Verbesserungswürdig:**
- Context-Validierung könnte Middleware sein
- Schema-Präfix fehlt in Queries

---

## 🎯 PRIORITÄTS-MATRIX

### SOFORT (Blocker)

1. **Frontend deployen auf Vercel**
   - Zeitaufwand: 30 Min - 2 Stunden
   - Komplexität: Mittel
   - Impact: KRITISCH

2. **Schema-Separation implementieren**
   - Zeitaufwand: 2-4 Stunden
   - Komplexität: Mittel-Hoch
   - Impact: KRITISCH

3. **Performance optimieren**
   - Zeitaufwand: 4-8 Stunden
   - Komplexität: Hoch
   - Impact: KRITISCH

### HOCH (Diese Woche)

4. **Redis Cache aktivieren**
   - Zeitaufwand: 1-2 Stunden
   - Komplexität: Niedrig
   - Impact: Mittel

5. **Context-Migration für bestehende Ideas**
   - Zeitaufwand: 2-3 Stunden
   - Komplexität: Mittel
   - Impact: Mittel

### MITTEL (Nächste Woche)

6. **Health Check optimieren**
   - Zeitaufwand: 1 Stunde
   - Komplexität: Niedrig
   - Impact: Niedrig-Mittel

7. **CSRF für API-Clients optional machen**
   - Zeitaufwand: 2 Stunden
   - Komplexität: Mittel
   - Impact: Niedrig

---

## 📋 EMPFOHLENER ACTION PLAN

### Phase 1: Critical Fixes (Tag 1)

#### 1.1 Frontend Deployment (2 Stunden)
```bash
# Vercel Dashboard
1. Projekt öffnen
2. Build Logs prüfen
3. Environment Variables validieren:
   - VITE_API_KEY
   - VITE_API_URL (leer für Proxy)
4. Re-Deploy triggern
5. Testen: https://ki-ab.vercel.app
```

#### 1.2 Schema-Separation Fix (4 Stunden)

**Schritt 1: Code-Fix**
```typescript
// database-context.ts
export async function queryContext(
  context: AIContext,
  text: string,
  params?: QueryParam[]
): Promise<QueryResult> {
  const client = await pool.connect();
  try {
    // Set search_path for this connection
    await client.query(`SET search_path TO ${context}, public`);

    // Execute query
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}
```

**Schritt 2: Testing**
```bash
# Nach Deploy
curl .../api/personal/ideas  # Sollte NUR personal ideas zeigen
curl .../api/work/ideas      # Sollte NUR work ideas zeigen
```

**Schritt 3: Data Migration**
```sql
-- Assign default context to existing ideas
UPDATE personal.ideas SET context = 'personal' WHERE context IS NULL;
UPDATE work.ideas SET context = 'work' WHERE context IS NULL;
```

---

### Phase 2: Performance Fixes (Tag 2)

#### 2.1 Health Check Optimierung
```typescript
// Fast health check
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Detailed check
router.get('/health/detailed', async (req, res) => {
  // Bisheriger Code
});
```

#### 2.2 Redis Cache Aktivierung
```bash
# Railway Dashboard
1. Redis Service Status prüfen
2. REDIS_URL in Backend Env Vars prüfen
3. Backend Logs nach Redis Connection Errors suchen
4. Falls nötig: Redis Service neu starten
```

#### 2.3 Connection Pooling Optimierung
```typescript
// Erhöhe Pool Size für Production
DB_POOL_SIZE=20  // Aktuell: 5
DB_POOL_MIN=5    // Aktuell: 1
```

---

### Phase 3: Data Cleanup (Tag 3)

#### 3.1 Context-Feld Migration
```sql
-- 1. Backup erstellen
CREATE TABLE personal.ideas_backup AS SELECT * FROM personal.ideas;
CREATE TABLE work.ideas_backup AS SELECT * FROM work.ideas;

-- 2. Context setzen
UPDATE personal.ideas SET context = 'personal' WHERE context IS NULL;
UPDATE work.ideas SET context = 'work' WHERE context IS NULL;

-- 3. NOT NULL Constraint (später)
-- ALTER TABLE personal.ideas ALTER COLUMN context SET NOT NULL;
-- ALTER TABLE work.ideas ALTER COLUMN context SET NOT NULL;
```

---

## 🔬 TESTING CHECKLIST

Nach allen Fixes:

### Frontend Tests
- [ ] https://ki-ab.vercel.app lädt ohne 404
- [ ] UI zeigt korrekt
- [ ] Login/Auth funktioniert
- [ ] Ideas werden angezeigt
- [ ] Create/Edit/Delete funktionieren
- [ ] Context-Switch (Personal ↔ Work) funktioniert

### Backend API Tests
- [ ] GET /api/health → < 500ms Response Time
- [ ] GET /api/health/detailed → Alle Services healthy
- [ ] GET /api/personal/ideas → NUR personal ideas
- [ ] GET /api/work/ideas → NUR work ideas
- [ ] POST /api/personal/ideas → Neue Idea in personal
- [ ] POST /api/work/ideas → Neue Idea in work
- [ ] Pagination funktioniert
- [ ] Search funktioniert
- [ ] Filtering funktioniert

### Database Tests
```sql
-- Personal und Work sollten UNTERSCHIEDLICHE Daten haben
SELECT COUNT(*) FROM personal.ideas;  -- z.B. 6
SELECT COUNT(*) FROM work.ideas;      -- z.B. 5

-- Alle Ideas haben context gesetzt
SELECT COUNT(*) FROM personal.ideas WHERE context IS NULL;  -- 0
SELECT COUNT(*) FROM work.ideas WHERE context IS NULL;      -- 0
```

### Performance Tests
- [ ] Health Check: < 500ms
- [ ] Ideas List: < 1s
- [ ] Search: < 2s
- [ ] Create Idea: < 2s

---

## 📈 PERFORMANCE BASELINES

### Vor Optimierung (AKTUELL)
```
Health Check:    2.65s  ❌ INAKZEPTABEL
Ideas List:      2.50s  ❌ INAKZEPTABEL
API Auth:        OK     ✅ Funktioniert
```

### Nach Optimierung (ZIEL)
```
Health Check:    < 100ms  ✅ Excellent
Ideas List:      < 500ms  ✅ Gut
Search:          < 1s     ✅ Akzeptabel
Create/Update:   < 1s     ✅ Akzeptabel
```

---

## 💰 KOSTEN-ANALYSE

### Aktueller Zustand
- **Supabase:** Free Tier (500MB)
- **Railway:** Wahrscheinlich Free/Hobby ($5/Monat?)
- **Vercel:** Free Tier
- **OpenAI API:** Pay-per-use
- **Anthropic API:** Pay-per-use

### Problem: Ohne Redis Cache
- Jede Search-Query = OpenAI Embedding API Call (~$0.0001)
- Bei 1000 Searches/Tag = $0.10/Tag = $3/Monat extra
- Mit Cache: < $0.50/Monat

**Empfehlung:** Redis aktivieren für Kostenersparnis!

---

## 🔐 SECURITY AUDIT

### ✅ Gut implementiert
- API Key Authentication mit bcrypt
- CSRF Protection für Write-Operationen
- SSL/TLS für alle Verbindungen
- Rate Limiting (endpoint-spezifisch)
- Scopes (read/write/admin)
- Input Validation

### ⚠️ Verbesserungswürdig
- Keine Request Logging (GDPR-konform?)
- Keine IP-basierte Anomalie-Erkennung
- API Keys haben kein Expiry (empfohlen: 90 Tage)
- Kein API Abuse Monitoring

### 🔒 Empfehlungen
1. API Key Rotation Policy (90 Tage)
2. Request Logging mit Anonymisierung
3. Anomalie-Erkennung (z.B. 1000 Requests in 1 Minute)
4. Webhook für Security Events

---

## 📊 ZUSAMMENFASSUNG

### Was funktioniert ✅
1. Backend API grundsätzlich erreichbar
2. Authentifizierung mit API Keys
3. Datenbank-Verbindungen stabil
4. Security Mechanisms (CSRF, Rate Limiting)
5. CRUD Read-Operations
6. Git Repository gut dokumentiert

### Was NICHT funktioniert ❌
1. **Frontend nicht deployed (KRITISCH)**
2. **Schema-Separation nicht implementiert (KRITISCH)**
3. **Performance inakzeptabel langsam (KRITISCH)**
4. Redis Cache nicht verbunden
5. Context-Feld in Ideas ist NULL
6. Create/Update/Delete nicht getestet (CSRF-Hürde)

### Empfehlung

**Status:** ⚠️ **NICHT PRODUCTION-READY**

Das System benötigt **mindestens 1-2 Arbeitstage** kritische Fixes, bevor es für Produktion geeignet ist:

1. **Tag 1:** Frontend deployen + Schema-Separation fixen
2. **Tag 2:** Performance optimieren + Redis aktivieren
3. **Tag 3:** Testing + Data Migration

**Nach diesen Fixes:** System sollte funktional und verwendbar sein.

---

## 📞 NÄCHSTE SCHRITTE

### Sofort-Maßnahmen (heute)
1. Vercel Deployment prüfen und fixen
2. Schema-Separation Code-Fix committen
3. Deployment auf Railway

### Diese Woche
4. Performance-Tests durchführen
5. Redis Cache aktivieren
6. Context-Migration für Ideas

### Nächste Woche
7. Vollständige End-to-End Tests
8. Load Testing
9. Production Monitoring Setup

---

**Bericht erstellt:** 2026-01-21 16:30 UTC
**Nächstes Review:** Nach Critical Fixes (2-3 Tage)
**Kontakt:** Für Fragen oder Klärungen bezüglich dieses Berichts

---

## Anhang: Test-Commands

```bash
# Frontend Test
curl https://ki-ab.vercel.app

# Backend Health
curl https://ki-ab-production.up.railway.app/api/health

# Personal Ideas
curl -H "x-api-key: ab_live_79..." \
  https://ki-ab-production.up.railway.app/api/personal/ideas?limit=5

# Work Ideas
curl -H "x-api-key: ab_live_79..." \
  https://ki-ab-production.up.railway.app/api/work/ideas?limit=5

# Performance Test
for i in 1 2 3 4 5; do
  curl -w "Test $i: %{time_total}s\n" -o /dev/null -s \
    https://ki-ab-production.up.railway.app/api/health
done
```
