# Supabase Setup Guide

Kompletter Guide für die Migration von Railway PostgreSQL zu Supabase mit pgvector.

## 🎯 Warum Supabase?

- ✅ Eingebaute pgvector Extension für Vector Search
- ✅ Automatische REST & GraphQL APIs
- ✅ Realtime Subscriptions
- ✅ Built-in Auth & Row Level Security
- ✅ Bessere Developer Experience
- ✅ Kostenloser Tier für Production-ready Apps

## 📋 Step 1: Supabase Projekt erstellen

### 1.1 Account & Projekt
```bash
# Gehe zu: https://supabase.com
# 1. Sign up / Log in
# 2. "New Project" klicken
# 3. Projekt-Name: "personal-ai-brain" (oder deinen Namen)
# 4. Database Password: Starkes Passwort generieren (WICHTIG: Speichern!)
# 5. Region: Europe (Frankfurt) für niedrigste Latenz
# 6. "Create new project" klicken (dauert ~2 Minuten)
```

### 1.2 Connection Details finden
Nach Projekt-Erstellung:
```bash
# Settings → Database → Connection String
# Du bekommst mehrere Connection Strings:

# 1. Transaction Mode (für Backend):
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres

# 2. Session Mode (für Migrations):
DIRECT_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres

# 3. Supabase Client URL & Key:
SUPABASE_URL=https://[PROJECT-REF].supabase.co
SUPABASE_ANON_KEY=eyJhbGc...  # Public Key (safe für Frontend)
SUPABASE_SERVICE_KEY=eyJhbGc...  # Secret Key (nur Backend!)
```

## 📋 Step 2: pgvector Extension aktivieren

### 2.1 SQL Editor in Supabase
```sql
-- Gehe zu: SQL Editor (linke Sidebar)
-- Neue Query erstellen und ausführen:

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### 2.2 Verify Vector Support
```sql
-- Test vector operations
SELECT '[1,2,3]'::vector(3);

-- Should return: [1,2,3]
-- Wenn das funktioniert, ist pgvector ready! ✅
```

## 📋 Step 3: Schema Migration

### 3.1 Automatische Migration (empfohlen)
```bash
cd backend

# Environment Variablen setzen (siehe Step 1.2)
export SUPABASE_DB_URL="postgresql://..."
export DATABASE_URL="postgresql://..."  # Deine aktuelle Railway URL

# Migration Script ausführen
npm run migrate:supabase
```

### 3.2 Manuelle Migration (falls notwendig)
```bash
# 1. Railway Daten exportieren
npm run export:data

# 2. Supabase Schema initialisieren
npm run db:init  # Mit SUPABASE_DB_URL

# 3. Daten importieren
npm run import:data
```

## 📋 Step 4: Backend konfigurieren

### 4.1 Environment Variables updaten
```bash
# In Railway oder .env:

# PRIMARY Database (Supabase)
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres

# Supabase Client
SUPABASE_URL=https://[PROJECT-REF].supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...

# Optional: Keep Railway as backup
RAILWAY_DATABASE_URL=postgresql://...
```

### 4.2 Connection Test
```bash
npm run test:db
```

## 📋 Step 5: Semantic Search aktivieren

Das Backend ist bereits vorbereitet! Nach der Migration funktioniert automatisch:

### 5.1 Neue API Endpoints
```typescript
// Semantic Search
GET /api/ideas/search/semantic?query=machine+learning&context=work

// Similar Ideas
GET /api/ideas/:id/similar?limit=5

// Vector-based recommendations
GET /api/ideas/recommendations
```

### 5.2 Testing
```bash
# Semantic Search testen
curl "http://localhost:3000/api/ideas/search/semantic?query=AI&context=work"

# Similar Ideas
curl "http://localhost:3000/api/ideas/IDEA_UUID/similar?limit=5"
```

## 📋 Step 6: Dual-Context Setup (Optional)

Falls du Personal & Work separate halten willst:

```sql
-- Separate Databases für Contexts
CREATE DATABASE personal_ai;
CREATE DATABASE work_ai;

-- Oder: Row Level Security (RLS) mit einem Schema
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personal_context" ON ideas
  FOR ALL
  USING (context = 'personal');

CREATE POLICY "work_context" ON ideas
  FOR ALL
  USING (context = 'work');
```

## 🔍 Monitoring & Debug

### Supabase Dashboard
```bash
# Dashboard → Database → Tables
# - Überprüfe, ob alle Tabellen erstellt wurden
# - Checke Indexes (wichtig für Performance!)

# Dashboard → Database → Extensions
# - Verify pgvector ist enabled

# Dashboard → Logs → Database
# - Slow queries überwachen
# - Fehler checken
```

### Performance Tuning
```sql
-- HNSW Index für schnellere Vector Search
-- (Wird automatisch vom init-db.ts Script erstellt)
CREATE INDEX ideas_embedding_idx
  ON ideas
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Query Performance analysieren
EXPLAIN ANALYZE
SELECT * FROM ideas
ORDER BY embedding <=> '[0.1, 0.2, ...]'::vector(768)
LIMIT 10;
```

## 🎉 Fertig!

Nach diesen Steps hast du:
- ✅ Supabase Projekt mit pgvector
- ✅ Alle Daten migriert
- ✅ Semantic Search funktioniert
- ✅ Vector-basierte "Ähnliche Ideen"
- ✅ Production-ready Setup

## 📞 Support

Bei Problemen:
1. Check Supabase Dashboard Logs
2. Run `npm run test:db`
3. Verify `.env` variables
4. Check pgvector extension: `SELECT * FROM pg_extension;`

## 🔗 Resources

- Supabase Docs: https://supabase.com/docs
- pgvector Guide: https://supabase.com/docs/guides/ai/vector-columns
- Vector Search Tutorial: https://supabase.com/docs/guides/ai/vector-search
