# AI Features Documentation

## Overview

This document covers the State-of-the-Art AI capabilities implemented in the KI-AB Personal AI System. The implementation spans multiple phases and provides a comprehensive AI-powered experience.

---

## Table of Contents

1. [Chat Modes & Tool Use](#chat-modes--tool-use)
2. [RAG (Retrieval-Augmented Generation)](#rag-retrieval-augmented-generation)
3. [Streaming with Extended Thinking](#streaming-with-extended-thinking)
4. [Vision Integration](#vision-integration)
5. [Topic Enhancement](#topic-enhancement)
6. [Memory System (HiMeS)](#memory-system-himes)

---

## Chat Modes & Tool Use

### Intelligent Mode Detection

The system automatically detects the appropriate mode for each user message:

| Mode | Description | Trigger Examples |
|------|-------------|------------------|
| `tool_assisted` | Uses Claude Tool Use for actions | "Suche nach meinen Ideen", "Erstelle eine neue Idee" |
| `agent` | Complex multi-step tasks | "Analysiere alle meine Projekte und erstelle einen Bericht" |
| `rag_enhanced` | Retrieves context from knowledge base | "Was habe ich zu dem Thema notiert?" |
| `conversation` | Simple chat without tools | "Was ist TypeScript?" |

### Available Tools

```typescript
// Search Ideas
{
  name: "search_ideas",
  description: "Searches user's ideas by semantic similarity",
  parameters: { query: string, limit?: number }
}

// Create Idea
{
  name: "create_idea",
  description: "Creates a new idea in the system",
  parameters: { title: string, type: string, summary: string, category?: string, priority?: string }
}

// Remember
{
  name: "remember",
  description: "Stores information in long-term memory",
  parameters: { fact: string, category?: string, confidence?: number }
}

// Recall
{
  name: "recall",
  description: "Retrieves memories related to a query",
  parameters: { query: string }
}

// Calculate
{
  name: "calculate",
  description: "Performs mathematical calculations",
  parameters: { expression: string }
}

// Get Related Ideas
{
  name: "get_related_ideas",
  description: "Finds ideas related to a given idea",
  parameters: { idea_id: string, relationship_types?: string[] }
}
```

### API Endpoints

```
POST /api/chat/sessions/:id/messages
POST /api/chat/quick
```

---

## RAG (Retrieval-Augmented Generation)

### Enhanced RAG Pipeline

The system uses a sophisticated multi-stage retrieval pipeline:

```
User Query
    │
    ▼
┌─────────────────┐
│  HyDE Generator │  ← Generates hypothetical document
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Vector Search   │  ← Semantic similarity search
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Cross-Encoder   │  ← Re-ranks results for relevance
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Context Builder │  ← Formats for LLM prompt
└─────────────────┘
```

### Features

- **HyDE (Hypothetical Document Embeddings)**: Generates a hypothetical answer to improve retrieval
- **Cross-Encoder Re-ranking**: Uses a second model to re-score results
- **Confidence Scoring**: Returns quality metrics for transparency
- **Context Injection**: Seamlessly integrates retrieved context into prompts

### Quality Metrics

```typescript
interface RAGQuality {
  confidence: number;      // 0-1 overall confidence
  methodsUsed: string[];   // ['vector', 'hyde', 'cross_encoder']
  topResultScore: number;  // Best match score
  hydeUsed: boolean;
  crossEncoderUsed: boolean;
  timing: {
    vectorSearch: number;
    hyde: number;
    crossEncoder: number;
    total: number;
  };
}
```

---

## Streaming with Extended Thinking

### Server-Sent Events (SSE)

Real-time streaming with Claude's Extended Thinking feature:

```
POST /api/chat/sessions/:id/messages/stream
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enable_thinking` | boolean | true | Enable Extended Thinking |
| `thinking_budget` | number | 10000 | Max thinking tokens |

### SSE Event Types

```typescript
// Thinking phase
{ event: "thinking_start" }
{ event: "thinking_delta", data: { text: "..." } }
{ event: "thinking_end" }

// Response phase
{ event: "content_start" }
{ event: "content_delta", data: { text: "..." } }
{ event: "done", data: { metadata: {...} } }

// Error handling
{ event: "error", data: { message: "..." } }
```

### Client Example

```javascript
const eventSource = new EventSource(
  `/api/chat/sessions/${sessionId}/messages/stream?enable_thinking=true`
);

eventSource.addEventListener('thinking_delta', (e) => {
  console.log('Thinking:', JSON.parse(e.data).text);
});

eventSource.addEventListener('content_delta', (e) => {
  console.log('Response:', JSON.parse(e.data).text);
});
```

---

## Vision Integration

### Capabilities

- **Image Description**: Detailed natural language descriptions
- **Text Extraction (OCR)**: Extract text from images
- **Idea Extraction**: Extract actionable ideas from whiteboards, notes
- **Image Q&A**: Answer questions about image content
- **Multi-Image Comparison**: Compare and contrast multiple images
- **Document Processing**: Full document analysis with summary

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/vision/status` | GET | Check service availability |
| `/api/vision/analyze` | POST | Analyze with task parameter |
| `/api/vision/extract-text` | POST | OCR text extraction |
| `/api/vision/extract-ideas` | POST | Extract actionable ideas |
| `/api/vision/describe` | POST | Quick image description |
| `/api/vision/ask` | POST | Q&A about image |
| `/api/vision/compare` | POST | Compare multiple images |
| `/api/vision/document` | POST | Full document processing |

### Chat with Images

```
POST /api/chat/sessions/:id/messages/vision
Content-Type: multipart/form-data

Fields:
- images: File[] (1-5 images, max 10MB each)
- message: string (optional question about the image)
- task: string (optional: describe, extract_text, analyze, etc.)
```

### Supported Formats

- JPEG (`image/jpeg`)
- PNG (`image/png`)
- GIF (`image/gif`)
- WebP (`image/webp`)

### Example: Vision in Chat

```javascript
const formData = new FormData();
formData.append('images', imageFile);
formData.append('message', 'Was zeigt dieses Diagramm?');

const response = await fetch(`/api/chat/sessions/${sessionId}/messages/vision`, {
  method: 'POST',
  body: formData,
});
```

---

## Topic Enhancement

### Features

- **Keyword Extraction**: TF-IDF-style keywords from topic members
- **Quality Metrics**: Coherence, separation, density, stability
- **Smart Assignment**: Auto-assign topics to new ideas
- **Similarity Detection**: Find similar topics for merge suggestions
- **Chat Context**: Topic-aware context for better responses

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/topics/enhanced` | GET | Topics with extracted keywords |
| `/api/topics/quality` | GET | Quality metrics for all topics |
| `/api/topics/:id/quality` | GET | Quality for single topic |
| `/api/topics/similar` | GET | Find similar topics |
| `/api/topics/assign/:ideaId` | POST | Smart topic assignment |
| `/api/topics/context` | POST | Get topic context for chat |
| `/api/topics/orphans` | GET | Ideas without topics |

### Quality Metrics

```typescript
interface TopicQualityMetrics {
  topicId: string;
  topicName: string;
  coherence: number;    // How similar ideas within topic are
  separation: number;   // How different from other topics
  density: number;      // Average membership score
  stability: number;    // Average distance to centroid
  overallQuality: number; // Weighted combination
}
```

### Topic Context for Chat

```javascript
// Get relevant topics for a message
const response = await fetch('/api/topics/context', {
  method: 'POST',
  body: JSON.stringify({
    message: 'Wie steht es um meine Projektplanung?',
    context: 'work',
    maxTopics: 3,
    format: 'prompt' // or 'json'
  })
});

// Response includes:
// - relevantTopics: Topics matching the message
// - suggestedIdeas: Related ideas from those topics
```

---

## Memory System (HiMeS)

### 4-Layer Architecture

```
┌─────────────────────────────────────────┐
│           Working Memory                │  ← Active task focus
│    (Prefrontal Cortex - 7±2 items)     │
├─────────────────────────────────────────┤
│           Short-Term Memory             │  ← Session context
│         (Hippocampus Bridge)            │
├─────────────────────────────────────────┤
│           Episodic Memory               │  ← Conversation history
│      (Hippocampus - experiences)        │
├─────────────────────────────────────────┤
│           Long-Term Memory              │  ← Persistent facts
│     (Neocortex - consolidated)          │
└─────────────────────────────────────────┘
```

### Scheduled Maintenance

| Job | Schedule | Description |
|-----|----------|-------------|
| Consolidation | Daily 2:00 AM | Move short-term to long-term |
| Decay | Daily 3:00 AM | Reduce old episodic memories |
| Stats | Hourly | Log memory statistics |

### Integration Points

- **Tool Use**: `remember` and `recall` tools access memory
- **Chat**: Episodic memory stores conversation context
- **RAG**: Long-term facts enhance retrieval

---

## Configuration

### Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://...

# Optional - Memory Scheduler
CRON_TIMEZONE=Europe/Berlin
CONSOLIDATION_SCHEDULE="0 2 * * *"
DECAY_SCHEDULE="0 3 * * *"
ENABLE_MEMORY_CONSOLIDATION=true
ENABLE_MEMORY_DECAY=true

# Optional - AI Settings
CLAUDE_MODEL=claude-sonnet-4-20250514
MAX_TOKENS=4096
TEMPERATURE=0.7
```

---

## Error Handling

All endpoints return consistent error responses:

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input parameters |
| `NOT_FOUND` | 404 | Resource not found |
| `UPLOAD_ERROR` | 400 | File upload failed |
| `AI_ERROR` | 500 | AI service error |
| `RATE_LIMITED` | 429 | Too many requests |

---

## Testing

### Backend Tests

```bash
cd backend
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage
```

### Frontend Tests

```bash
cd frontend
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage
npm run test:ui             # Interactive UI
```

### Test Coverage

| Component | Coverage |
|-----------|----------|
| Vision Service | 95% |
| Chat Modes | 98% |
| Tool Handlers | 80% |
| Vision Routes | 95% |
| ImageUpload | 90% |
| GeneralChat | 85% |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ GeneralChat │  │ ImageUpload │  │ KnowledgeGraph          │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
└─────────┼────────────────┼─────────────────────┼───────────────┘
          │                │                     │
          ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API Layer                                │
│  /api/chat/*    /api/vision/*    /api/topics/*    /api/memory/* │
└─────────────────────────────────────────────────────────────────┘
          │                │                     │
          ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Service Layer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Chat Modes  │  │Claude Vision│  │ Topic Enhancement       │ │
│  │ Tool Use    │  │             │  │                         │ │
│  │ RAG/HyDE    │  │             │  │                         │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                │                     │                │
│         ▼                ▼                     ▼                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Memory System (HiMeS)                    ││
│  │  Working │ Short-Term │ Episodic │ Long-Term                ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Claude API  │  │ PostgreSQL  │  │ pgvector                │ │
│  │ (Anthropic) │  │ + Supabase  │  │ (embeddings)            │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Version History

| Version | Date | Features |
|---------|------|----------|
| Phase 31 | 2025-01 | Vision Integration, Topic Enhancement |
| Phase 30 | 2025-01 | Memory Scheduler, Chat Streaming |
| Phase 29 | 2024-12 | General Chat, Tool Use |
| Phase 8 | 2024-11 | Knowledge Graph, Topic Clustering |

---

## Support

For questions or issues:
- GitHub Issues: https://github.com/Alexander-Bering/KI-AB/issues
- Documentation: `/docs/`
