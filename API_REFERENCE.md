# API Reference - Phase 7: Media & Stories

**Base URL:** `http://localhost:3000`

---

## 📊 Health Check

### GET /api/health

Prüft den Status des Backends und der verbundenen Services.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-05T22:37:19.494Z",
  "responseTime": 23,
  "services": {
    "database": {
      "status": "connected",
      "host": "localhost",
      "database": "personal_ai"
    },
    "ollama": {
      "status": "connected",
      "url": "http://localhost:11434",
      "models": ["nomic-embed-text:latest", "mistral:latest"]
    }
  }
}
```

---

## 📸 Media Endpoints

### POST /api/:context/media

Upload eines Fotos oder Videos mit Context.

**Parameters:**
- `context` (path): `personal` | `work` | `creative` | `strategic`

**Body (multipart/form-data):**
- `media` (file): Foto oder Video
- `caption` (text, optional): Beschreibung des Mediums

**Supported Formats:**
- Images: JPEG, PNG, HEIC
- Videos: MOV, MP4
- Max Size: 100MB

**Example Request:**
```bash
curl -X POST http://localhost:3000/api/personal/media \
  -F "media=@photo.jpg" \
  -F "caption=Erstes Büro 2026"
```

**Response:**
```json
{
  "success": true,
  "mediaId": "550e8400-e29b-41d4-a716-446655440000",
  "mediaType": "photo",
  "filename": "1704477600000-abc123.jpg",
  "context": "personal",
  "processingStatus": "completed",
  "message": "Media uploaded successfully"
}
```

---

### GET /api/all-media

Alle Media-Items abrufen (gefiltert nach Context/Type).

**Query Parameters:**
- `context` (optional): Filter nach Context (`personal`, `work`, etc.)
- `type` (optional): Filter nach Typ (`photo`, `video`)
- `limit` (optional): Anzahl der Ergebnisse (default: 50)

**Example Request:**
```bash
# Alle Media
curl http://localhost:3000/api/all-media

# Nur Fotos aus Personal-Context
curl "http://localhost:3000/api/all-media?context=personal&type=photo"

# Letzte 10 Items
curl "http://localhost:3000/api/all-media?limit=10"
```

**Response:**
```json
{
  "media": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "media_type": "photo",
      "filename": "1704477600000-abc123.jpg",
      "caption": "Erstes Büro 2026",
      "context": "personal",
      "created_at": "2026-01-05T12:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### GET /api/media-file/:id

Einzelnes Media-File herunterladen (Binary).

**Parameters:**
- `id` (path): Media-ID (UUID)

**Example Request:**
```bash
curl http://localhost:3000/api/media-file/550e8400-e29b-41d4-a716-446655440000 \
  --output photo.jpg
```

**Response:**
- Binary file (JPEG, PNG, MOV, etc.)

---

## 📚 Stories Endpoints

### GET /api/stories

Automatisch gruppierte Stories basierend auf semantischer Ähnlichkeit.

**Query Parameters:**
- `query` (optional): Suche nach Thema (z.B. "Firmengründung")
- `minItems` (optional): Mindestanzahl Items pro Story (default: 2)
- `similarityThreshold` (optional): Similarity Score 0-1 (default: 0.7)

**Example Request:**
```bash
# Alle Stories
curl http://localhost:3000/api/stories

# Stories zu "Firmengründung"
curl "http://localhost:3000/api/stories?query=Firmengründung"

# Mit custom Threshold
curl "http://localhost:3000/api/stories?query=Startup&minItems=3&similarityThreshold=0.8"
```

**Response:**
```json
{
  "stories": [
    {
      "id": "generated-uuid",
      "title": "Story: Firmengründung",
      "description": "5 verwandte Inhalte",
      "items": [
        {
          "id": "item-uuid-1",
          "type": "photo",
          "content": "Erstes Büro 2026",
          "media_url": "/api/media-file/item-uuid-1",
          "timestamp": "2026-01-05T12:00:00.000Z"
        },
        {
          "id": "item-uuid-2",
          "type": "audio",
          "content": "Idee für Firmengründung besprechen...",
          "media_url": null,
          "timestamp": "2026-01-05T14:30:00.000Z"
        },
        {
          "id": "item-uuid-3",
          "type": "idea",
          "content": "Business Plan für Startup",
          "media_url": null,
          "timestamp": "2026-01-05T16:00:00.000Z"
        }
      ],
      "created_at": "2026-01-05T12:00:00.000Z",
      "updated_at": "2026-01-05T16:00:00.000Z",
      "item_count": 3
    }
  ],
  "total": 1
}
```

---

## 🎤 Voice Memo Endpoints (Context-Aware)

### POST /api/:context/voice-memo

Audio-Upload mit Context (bestehender Endpoint).

**Parameters:**
- `context` (path): `personal` | `work` | `creative` | `strategic`

**Body (multipart/form-data):**
- `audio` (file): WAV, MP3, M4A

**OR (JSON):**
- `text` (string): Text direkt (ohne Audio)

**Example Request:**
```bash
# Audio Upload
curl -X POST http://localhost:3000/api/personal/voice-memo \
  -F "audio=@recording.wav"

# Text Input
curl -X POST http://localhost:3000/api/work/voice-memo \
  -H "Content-Type: application/json" \
  -d '{"text":"Wichtige Meeting-Notizen..."}'
```

**Response:**
```json
{
  "success": true,
  "context": "personal",
  "persona": "Friendly Personal Assistant",
  "mode": "exploratory",
  "idea": {
    "id": "uuid",
    "title": "Meeting Notes",
    "type": "note",
    "category": "business",
    "priority": "medium",
    "summary": "..."
  },
  "processingTime": 1234
}
```

---

## 📋 Ideas Endpoints (Bestehend)

### GET /api/ideas

Alle Ideen abrufen.

**Response:**
```json
{
  "ideas": [
    {
      "id": "uuid",
      "title": "Neue Feature-Idee",
      "type": "feature",
      "category": "product",
      "priority": "high",
      "summary": "...",
      "created_at": "2026-01-05T12:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

---

## 🔐 Error Responses

Alle Endpoints können folgende Fehler zurückgeben:

### 400 Bad Request
```json
{
  "error": "Invalid context"
}
```

### 404 Not Found
```json
{
  "error": "Media not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to upload media"
}
```

---

## 🧪 Testing

### Quick Health Check
```bash
curl http://localhost:3000/api/health
```

### Upload Test Photo
```bash
# Create test file
echo "test" > test.jpg

# Upload
curl -X POST http://localhost:3000/api/personal/media \
  -F "media=@test.jpg" \
  -F "caption=Test Upload"
```

### Get All Media
```bash
curl http://localhost:3000/api/all-media | jq .
```

### Search Stories
```bash
curl "http://localhost:3000/api/stories?query=test" | jq .
```

---

## 📝 Notes

### Route Priority
Die Reihenfolge der Routes ist wichtig:
1. `/api/all-media` - Specific route (muss vor /:context kommen)
2. `/api/media-file/:id` - Specific route
3. `/api/:context/media` - Dynamic route (später)

### Media Storage
- Uploads: `backend/uploads/media/`
- Filenames: `timestamp-uuid.ext`
- Metadata: PostgreSQL `media_items` Tabelle

### Embeddings
- Model: `nomic-embed-text` (384 Dimensionen)
- Automatic: Bei Caption-Upload
- Similarity Search: Via pgvector (<=> operator)

---

**Version:** Phase 7
**Last Updated:** 5. Januar 2026
