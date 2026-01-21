# Action Plan - Kritische Probleme beheben

**Datum:** 2026-01-21
**Status:** FIXES BEREIT - DEPLOYMENT ERFORDERLICH
**Priorität:** 🔴 HOCH

---

## 📋 ÜBERSICHT

Die Validierung hat **3 Probleme** identifiziert:
- 🔴 **KRITISCH:** API Keys fehlen in public Schema
- 🟡 **HOCH:** SSL Config Inkonsistenz in database.ts
- 🔵 **NIEDRIG:** Redis Cache nicht verbunden

**Gute Nachricht:** Alle Fixes sind bereits vorbereitet! ✅

---

## 🔧 FIX 1: API Keys in Public Schema

### Problem
- API-Authentifizierung schlägt fehl (401 Unauthorized)
- `api_keys` Tabelle existiert nur in `personal` + `work` Schemas
- Auth-Middleware sucht im `public` Schema

### Lösung
SQL-Script ausführen: [sql/fix-api-keys-public-schema.sql](sql/fix-api-keys-public-schema.sql)

### Schritte

#### 1. SQL Script in Supabase ausführen

```bash
# Öffne Supabase Dashboard
# → SQL Editor
# → Neues Query erstellen
# → Inhalt von sql/fix-api-keys-public-schema.sql einfügen
# → Run
```

**Was macht das Script?**
- ✅ Löscht alte `api_keys` aus personal/work Schemas
- ✅ Erstellt zentrale `api_keys` Tabelle in `public` Schema
- ✅ Setzt Indexes für Performance
- ✅ Gibt Permissions

#### 2. API Key generieren

**Option A: Lokal generieren (EMPFOHLEN)**
```bash
cd backend
npm run generate-api-key
```

Das Script:
- Generiert einen neuen API Key (`ab_live_...`)
- Erstellt bcrypt Hash (sicher!)
- Speichert in Supabase `public.api_keys`
- Zeigt den Key an (NUR EINMAL sichtbar!)

**Option B: Manuell mit bestehendem Key**
```bash
cd backend
# Key-Hash generieren
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('ab_live_79b82fce3605f4622dc612b11bc1afbd300456deac27c6b8', 12).then(console.log)"
```

Dann in Supabase SQL Editor:
```sql
INSERT INTO public.api_keys (key_prefix, key_hash, name, scopes, rate_limit)
VALUES (
    'ab_live_79',
    'GENERATED_HASH_HIER_EINFÜGEN',
    'Frontend Production Key',
    ARRAY['read', 'write'],
    10000
);
```

#### 3. Frontend .env aktualisieren

Falls neuer Key generiert wurde:
```bash
cd frontend
# .env bearbeiten
VITE_API_KEY=ab_live_NEUER_KEY_HIER
```

#### 4. Testen
```bash
curl -X GET "https://ki-ab-production.up.railway.app/api/ideas/personal?limit=1" \
  -H "x-api-key: ab_live_DEIN_KEY"
```

Erwartete Response: `{"ideas": [...], "success": true}`

---

## 🔧 FIX 2: SSL Config in database.ts

### Problem
- `database.ts` hat noch `rejectUnauthorized: true`
- Supabase benötigt `rejectUnauthorized: false`
- Kann zu Connection-Problemen führen

### Lösung
✅ **BEREITS GEFIXT!** [backend/src/utils/database.ts:18-28](backend/src/utils/database.ts#L18-L28)

### Schritte

#### 1. Änderungen commiten und pushen

```bash
git add backend/src/utils/database.ts backend/package.json backend/generate-api-key.ts
git commit -m "fix: SSL config for Supabase in database.ts

- Update SSL configuration to match database-context.ts
- Add Supabase detection (rejectUnauthorized: false)
- Add generate-api-key script for secure key generation

Issue #24"
git push origin main
```

#### 2. Railway Auto-Deploy abwarten
- Railway erkennt den Push automatisch
- Build + Deploy dauert ca. 2-3 Minuten
- Status prüfen: https://railway.app/dashboard

#### 3. Deployment verifizieren
```bash
# Health Check nach Deployment
curl https://ki-ab-production.up.railway.app/api/health | jq
```

---

## 🔧 FIX 3: Redis Cache

### Problem
- Redis ist nicht verbunden (`"cache": null`)
- Performance-Optimierung fehlt

### Diagnose

#### 1. Redis Service Status prüfen
```bash
# In Railway Dashboard
# → Projekt öffnen
# → Redis Service auswählen
# → Status prüfen (Running?)
```

#### 2. Connection String validieren
Railway sollte automatisch `REDIS_URL` setzen.

Prüfen:
```bash
# In Railway Dashboard
# → Backend Service
# → Variables Tab
# → REDIS_URL suchen
```

Erwartetes Format:
```
redis://default:PASSWORD@HOST:PORT
```

#### 3. Connection testen

Falls Redis existiert:
```bash
cd backend
npm run test:redis
```

**Falls Redis fehlt:**
- Redis Service in Railway hinzufügen
- `REDIS_URL` wird automatisch gesetzt
- Backend neu deployen

---

## ✅ CHECKLISTE

### Sofort (Kritisch)

- [ ] SQL Script `fix-api-keys-public-schema.sql` in Supabase ausführen
- [ ] API Key generieren mit `npm run generate-api-key`
- [ ] API Key in `frontend/.env` eintragen (falls neu)
- [ ] API-Authentifizierung testen

### Deployment (Hoch)

- [ ] Git commit + push (database.ts, package.json, generate-api-key.ts)
- [ ] Railway Auto-Deploy abwarten
- [ ] Health Check nach Deployment verifizieren

### Optional (Niedrig)

- [ ] Redis Service Status prüfen
- [ ] Connection String validieren
- [ ] Redis testen mit `npm run test:redis`

---

## 📊 ERWARTETE ERGEBNISSE

### Nach Fix 1 (API Keys)

**Vorher:**
```bash
$ curl -H "x-api-key: ab_live_..." https://...railway.app/api/ideas/personal
{"error":"Authentication error","message":"Failed to validate API key"}
```

**Nachher:**
```bash
$ curl -H "x-api-key: ab_live_..." https://...railway.app/api/ideas/personal
{"ideas": [...], "total": 10, "success": true}
```

### Nach Fix 2 (SSL Config)

**Vorher:**
- Mögliche Connection Timeouts
- Sporadische 500 Errors

**Nachher:**
- Stabile Verbindungen
- Keine SSL-Fehler in Logs

### Nach Fix 3 (Redis)

**Vorher:**
```json
{"cache": null}
```

**Nachher:**
```json
{"cache": {"connected": true, "keys": 42, "memory": "1.2M"}}
```

---

## 🚀 DEPLOYMENT-REIHENFOLGE

### Phase 1: Database Fix (KRITISCH)
1. SQL Script in Supabase ausführen (5 Minuten)
2. API Key generieren (2 Minuten)
3. Testen (2 Minuten)

**Total:** ~10 Minuten

### Phase 2: Code Fix (HOCH)
1. Git commit + push (1 Minute)
2. Railway Auto-Deploy (2-3 Minuten)
3. Verifizieren (1 Minute)

**Total:** ~5 Minuten

### Phase 3: Redis (OPTIONAL)
1. Service prüfen (2 Minuten)
2. Falls nötig: Redis hinzufügen (5 Minuten)
3. Testen (2 Minuten)

**Total:** ~10 Minuten (falls nötig)

---

## 📝 NOTIZEN

### Warum api_keys in public Schema?

**Vorher (falsch):**
- `personal.api_keys` - separate Keys für personal
- `work.api_keys` - separate Keys für work
- Problem: Auth-Middleware weiß nicht, in welchem Schema er suchen soll

**Nachher (richtig):**
- `public.api_keys` - ein zentraler Key für beide Contexts
- User kann denselben Key für personal + work nutzen
- Auth ist context-unabhängig (wie es sein sollte!)

### Sicherheitshinweise

1. **API Key Generation:**
   - Nutze IMMER bcrypt für Hashing (nicht SHA256!)
   - Keys nur EINMAL anzeigen
   - Nie im Klartext speichern

2. **SSL Config:**
   - `rejectUnauthorized: false` ist OK für Supabase
   - Managed Service = vertrauenswürdig
   - Für self-hosted: `true` verwenden!

3. **Redis:**
   - Falls nicht benötigt: Graceful fallback aktiv
   - Keine kritische Abhängigkeit
   - Nur Performance-Boost

---

## 🆘 TROUBLESHOOTING

### "API Key still not working"

1. Prüfe, ob SQL Script erfolgreich war:
```sql
SELECT COUNT(*) FROM public.api_keys;
```
Erwartete Anzahl: > 0

2. Prüfe Key-Prefix:
```sql
SELECT key_prefix FROM public.api_keys;
```
Sollte mit Key aus `.env` übereinstimmen (erste 10 Zeichen)

3. Prüfe Logs:
```bash
# In Railway Dashboard
# → Backend Service
# → Deployments Tab
# → Latest Deployment
# → View Logs
```

### "Railway Deploy fails"

1. Prüfe Build Logs
2. TypeScript Fehler?
3. Environment Variables gesetzt?

### "Redis not connecting"

1. Ist Redis Service deployed?
2. Ist `REDIS_URL` gesetzt?
3. Firewall/Network Issues?

Fallback: Redis ist optional - System funktioniert ohne!

---

## 📞 SUPPORT

Falls Probleme auftreten:

1. **Prüfe zuerst:**
   - Supabase SQL Editor Errors
   - Railway Build Logs
   - Browser Console (Frontend)

2. **Logs sammeln:**
   - Railway Backend Logs
   - Browser Network Tab
   - Supabase Logs

3. **Health Check:**
```bash
curl https://ki-ab-production.up.railway.app/api/health | jq
```

---

**Erstellt von:** Claude Sonnet 4.5
**Issue Reference:** #24 - fix database and language
**Related Docs:**
- [VALIDATION_REPORT.md](VALIDATION_REPORT.md)
- [INFRASTRUCTURE_REVIEW.md](INFRASTRUCTURE_REVIEW.md)
- [MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md)
