# PersonalAIBrain - Railway Deployment Guide

## Voraussetzungen

- [Railway Account](https://railway.app) (GitHub Login)
- Git Repository (GitHub, GitLab oder lokal)

## Deployment-Schritte

### 1. Railway Projekt erstellen

```bash
# Railway CLI installieren (optional)
npm install -g @railway/cli

# Login
railway login
```

Oder über das Web-Dashboard: https://railway.app/dashboard

### 2. PostgreSQL mit pgvector hinzufügen

1. Im Railway Dashboard: **New** → **Database** → **PostgreSQL**
2. Region auswählen: **eu-west** (Frankfurt) für DSGVO
3. Nach Erstellung: **Variables** kopieren (DATABASE_URL)

**pgvector aktivieren:**
```sql
-- In Railway PostgreSQL Console:
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Backend deployen

**Option A: Via GitHub (empfohlen)**
1. **New** → **GitHub Repo** → Repository auswählen
2. Root Directory: `backend`
3. Railway erkennt automatisch das Dockerfile

**Option B: Via CLI**
```bash
cd backend
railway init
railway up
```

### 4. Environment-Variablen setzen

Im Railway Dashboard → Backend Service → **Variables**:

| Variable | Wert | Beschreibung |
|----------|------|--------------|
| `DATABASE_URL` | (auto) | Von PostgreSQL Service verlinkt |
| `PORT` | 3000 | Server Port |
| `NODE_ENV` | production | |
| `JWT_SECRET` | (generieren) | `openssl rand -hex 32` |
| `CORS_ORIGINS` | * | Oder spezifische Origins |

**Wichtig:** DATABASE_URL mit PostgreSQL Service verlinken:
- Variables → **Add Reference** → PostgreSQL → DATABASE_URL

### 5. Datenbank initialisieren

Nach dem ersten Deployment:
```bash
railway run npm run db:init
```

Oder SQL manuell ausführen:
- Railway Dashboard → PostgreSQL → **Query**
- SQL-Dateien aus `backend/src/sql/` ausführen

### 6. Domain konfigurieren

1. Backend Service → **Settings** → **Networking**
2. **Generate Domain** oder eigene Domain hinzufügen
3. URL kopieren: `https://your-app.up.railway.app`

### 7. iOS App konfigurieren

In `ios/PersonalAIBrain/Config/Environment.swift`:
```swift
private static let productionURL: String? = "https://your-app.up.railway.app"
```

## Kosten

| Service | Free Tier | Hobby ($5/Monat) |
|---------|-----------|------------------|
| Compute | 500 Stunden/Monat | Unbegrenzt |
| PostgreSQL | 1GB | 5GB |
| Netzwerk | 100GB | Unbegrenzt |

## Monitoring

- **Logs:** Railway Dashboard → Service → Logs
- **Metrics:** Railway Dashboard → Service → Metrics
- **Health Check:** `https://your-app.up.railway.app/health`

## Troubleshooting

### Build fehlgeschlagen
```bash
# Lokal testen
docker build -t test .
docker run -p 3000:3000 test
```

### Datenbank-Verbindung
- Prüfe DATABASE_URL Variable
- Prüfe ob pgvector Extension aktiviert ist

### CORS-Fehler
- CORS_ORIGINS Variable prüfen
- Für Entwicklung: `*` setzen

## Backup

Railway erstellt automatische Backups. Manuell:
```bash
railway run pg_dump $DATABASE_URL > backup.sql
```
