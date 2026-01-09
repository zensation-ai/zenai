# 🚀 Semantic Search API Endpoints

## ✅ Alle aktiven Endpoints

### 1. **GET /api/ideas**
Liste aller Ideas mit Pagination
```bash
curl "https://ki-ab-production.up.railway.app/api/ideas?limit=20&offset=0"
```

### 2. **POST /api/ideas/search**
Semantic Search mit pgvector
```bash
curl -X POST "https://ki-ab-production.up.railway.app/api/ideas/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "AI productivity features", "limit": 10, "threshold": 0.5}'
```

**Response:**
```json
{
  "ideas": [...],
  "searchType": "supabase-function",
  "performance": {
    "totalMs": 150,
    "embeddingMs": 80,
    "searchMs": 70,
    "resultsFound": 5
  }
}
```

### 3. **GET /api/ideas/recommendations**
Personalisierte Empfehlungen basierend auf User Profile
```bash
curl "https://ki-ab-production.up.railway.app/api/ideas/recommendations?limit=10"
```

**Response:**
```json
{
  "ideas": [...],
  "personalized": true,
  "processingTime": 45
}
```

### 4. **GET /api/ideas/:id/similar**
Ähnliche Ideas basierend auf einer bestimmten Idea
```bash
curl "https://ki-ab-production.up.railway.app/api/ideas/{uuid}/similar?limit=5"
```

**Response:**
```json
{
  "ideas": [...],
  "sourceIdeaId": "uuid",
  "processingTime": 32
}
```

### 5. **GET /api/ideas/:id**
Einzelne Idea abrufen
```bash
curl "https://ki-ab-production.up.railway.app/api/ideas/{uuid}"
```

## 🔧 Features

✅ **HNSW Vector Index** - Blitzschnelle Similarity Search
✅ **Supabase Functions** - Optimierte Database-Level Search
✅ **Redis Caching** - Embeddings werden 7 Tage gecached
✅ **Text Fallback** - Funktioniert auch ohne Embeddings
✅ **Personalization** - Nutzt User Interest Embeddings

## 📊 Performance

- **Vector Search:** ~50-100ms (mit HNSW Index)
- **Embedding Generation:** ~50-200ms (gecached in Redis)
- **Total Response Time:** ~150-300ms

## 🎯 iOS App Integration

Die iOS App ist bereits konfiguriert:
- Production URL: `https://ki-ab-production.up.railway.app`
- Alle Endpoints sofort verfügbar
- Keine Änderungen nötig

## 🚀 Next Steps

1. **Erstelle Ideas** - Die App ist bereit, nutze die Voice Memos
2. **Semantic Search testen** - Sobald Ideas mit Embeddings vorhanden sind
3. **Personalization nutzen** - User Profile lernt automatisch
