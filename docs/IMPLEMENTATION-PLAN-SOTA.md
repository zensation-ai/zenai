# KI-AB: Marktführerschaft Implementierungsplan

**Ziel**: Echte 10/10 State-of-the-Art KI-Fähigkeiten, produktionsreif und vollständig integriert.

**Datum**: Januar 2026
**Status**: PLAN - Noch nicht implementiert

---

## Executive Summary

### Aktueller Stand (Ehrlich)

| Komponente | Code existiert | Integriert | Genutzt | Tests |
|------------|----------------|------------|---------|-------|
| Tool Use | ✅ | ⚠️ Registriert | ❌ | ❌ |
| ReAct Agent | ✅ | ❌ | ❌ | ❌ |
| Cross-Encoder | ✅ | ✅ intern | ⚠️ nur Search-Tool | ❌ |
| HyDE | ✅ | ✅ intern | ⚠️ nur Search-Tool | ❌ |
| Claude Vision | ✅ | ❌ | ❌ | ❌ |
| Enhanced RAG | ✅ | ✅ | ⚠️ nur Search-Tool | ❌ |
| General Chat | ✅ | ✅ | ✅ | ❌ |

### Zielstand (Nach Implementierung)

| Komponente | Code | Integriert | Genutzt | Tests | Score |
|------------|------|------------|---------|-------|-------|
| Tool Use | ✅ | ✅ Chat + API | ✅ | ✅ | 10/10 |
| ReAct Agent | ✅ | ✅ Complex Tasks | ✅ | ✅ | 10/10 |
| Cross-Encoder | ✅ | ✅ All RAG | ✅ | ✅ | 10/10 |
| HyDE | ✅ | ✅ All RAG | ✅ | ✅ | 10/10 |
| Claude Vision | ✅ | ✅ Media + Chat | ✅ | ✅ | 10/10 |
| Enhanced RAG | ✅ | ✅ All Search | ✅ | ✅ | 10/10 |

---

## Phase 1: General Chat mit Tool Use (Priorität: KRITISCH)

### 1.1 Chat Mode System

**Ziel**: Chat erkennt automatisch, wann Tools nötig sind.

```typescript
// Neue Datei: backend/src/services/chat-modes.ts

export type ChatMode =
  | 'conversation'    // Normale Unterhaltung
  | 'tool_assisted'   // Braucht Tool-Zugriff
  | 'agent'           // Komplexe Multi-Step Aufgabe
  | 'rag_enhanced';   // Braucht Wissen aus Ideas

export interface ModeDetectionResult {
  mode: ChatMode;
  confidence: number;
  reasoning: string;
  suggestedTools?: string[];
}

// Erkennung basierend auf Message-Analyse
export function detectChatMode(message: string): ModeDetectionResult;
```

**Implementierung**:
- [ ] `chat-modes.ts` - Mode-Erkennung
- [ ] Pattern-basierte Erkennung (Regex + Keywords)
- [ ] Claude-basierte Erkennung für unsichere Fälle
- [ ] Confidence-Threshold für automatische Mode-Wahl

### 1.2 Tool-Enabled Chat Response

**Ziel**: `generateResponse` unterstützt Tool Use.

```typescript
// Erweiterung in general-chat.ts

export interface GenerateOptions {
  enableTools?: boolean;
  enableRAG?: boolean;
  enableAgent?: boolean;
  maxToolIterations?: number;
}

export async function generateResponse(
  sessionId: string,
  userMessage: string,
  contextType: 'personal' | 'work',
  options?: GenerateOptions
): Promise<ChatResponseResult>;

export interface ChatResponseResult {
  response: string;
  toolsUsed?: ToolUsageInfo[];
  ragResults?: RAGInfo;
  agentSteps?: AgentStep[];
  mode: ChatMode;
}
```

**Implementierung**:
- [ ] `GenerateOptions` Interface
- [ ] Mode-Detection Integration
- [ ] Tool Use Execution Loop
- [ ] Response mit Metadata

### 1.3 Neue Tools für Chat

**Zusätzliche Tools für vollständige Funktionalität**:

```typescript
// Erweiterte Tool-Definitionen

TOOL_REMEMBER: {
  name: 'remember',
  description: 'Merke dir eine Information für später',
  // → Speichert in Long-Term Memory
}

TOOL_RECALL: {
  name: 'recall',
  description: 'Erinnere dich an frühere Gespräche',
  // → Sucht in Episodic Memory
}

TOOL_SEARCH_WEB: {
  name: 'web_search',
  description: 'Suche im Internet nach aktuellen Informationen',
  // → Web Search Integration
}

TOOL_ANALYZE_IMAGE: {
  name: 'analyze_image',
  description: 'Analysiere ein Bild',
  // → Claude Vision Integration
}

TOOL_CREATE_DRAFT: {
  name: 'create_draft',
  description: 'Erstelle einen Textentwurf',
  // → Draft Generation Service
}
```

**Implementierung**:
- [ ] Tool-Definitionen erweitern
- [ ] Handler implementieren
- [ ] Memory-Integration
- [ ] Web-Search-Integration (optional, falls gewünscht)

### 1.4 API Erweiterung

**Neue Endpoints**:

```
POST /api/chat/sessions/:id/messages
  Request:
    {
      "message": "string",
      "options": {
        "enableTools": true,
        "enableRAG": true,
        "mode": "auto" | "conversation" | "tool_assisted" | "agent"
      }
    }

  Response:
    {
      "userMessage": {...},
      "assistantMessage": {...},
      "metadata": {
        "mode": "tool_assisted",
        "toolsUsed": [
          {"name": "search_ideas", "input": {...}, "result": "..."}
        ],
        "ragResults": {...},
        "processingTimeMs": 1234
      }
    }
```

**Implementierung**:
- [ ] Request-Schema erweitern
- [ ] Response-Schema erweitern
- [ ] Options-Validierung
- [ ] Swagger-Dokumentation

---

## Phase 2: RAG Integration in Chat (Priorität: HOCH)

### 2.1 Automatische RAG-Aktivierung

**Ziel**: Chat nutzt automatisch RAG wenn relevant.

```typescript
// In general-chat.ts

async function shouldUseRAG(message: string, context: AIContext): Promise<boolean> {
  // Patterns die RAG triggern:
  // - Fragen nach eigenen Ideen
  // - Referenzen auf frühere Gespräche
  // - Themen die in Ideas existieren
  // - Explizite Suche
}

async function enhanceWithRAG(
  message: string,
  context: AIContext
): Promise<RAGEnhancement> {
  const results = await enhancedRAG.retrieve(message, context);
  return {
    relevantIdeas: results.results,
    contextSnippet: formatForPrompt(results),
    confidence: results.confidence,
  };
}
```

**Implementierung**:
- [ ] `shouldUseRAG()` - Intelligente Entscheidung
- [ ] `enhanceWithRAG()` - RAG-Kontext abrufen
- [ ] System-Prompt Enhancement mit RAG-Ergebnissen
- [ ] Quellenangaben in Response

### 2.2 RAG-Aware System Prompt

```typescript
const RAG_ENHANCED_PROMPT = `
[RELEVANTES WISSEN AUS DEINER WISSENSBASIS]
{ragResults}

Nutze dieses Wissen um die Frage zu beantworten.
Wenn du Informationen aus der Wissensbasis verwendest, erwähne es.
`;
```

**Implementierung**:
- [ ] Prompt-Template für RAG-Kontext
- [ ] Dynamische Prompt-Konstruktion
- [ ] Quellenreferenz-Formatierung

---

## Phase 3: ReAct Agent Integration (Priorität: HOCH)

### 3.1 Agent-Modus für komplexe Aufgaben

**Ziel**: Komplexe Aufgaben automatisch mit ReAct lösen.

```typescript
// Patterns die Agent-Modus triggern:
const AGENT_PATTERNS = [
  /analysiere.*und.*dann/i,
  /erstelle.*basierend auf/i,
  /vergleiche.*mit/i,
  /finde.*und.*strukturiere/i,
  /recherchiere.*und.*fasse zusammen/i,
];

async function executeWithAgent(
  sessionId: string,
  message: string,
  context: AIContext
): Promise<AgentResult> {
  const agent = new ReActAgent({
    tools: ['search_ideas', 'create_idea', 'get_related', 'calculate'],
    maxIterations: 8,
    verbose: true,
  });

  return agent.execute({
    description: message,
    aiContext: context,
    context: await getSessionContext(sessionId),
  });
}
```

**Implementierung**:
- [ ] Pattern-Erkennung für Agent-Modus
- [ ] Agent-Konfiguration für Chat-Kontext
- [ ] Schritt-für-Schritt Feedback im Response
- [ ] Fehlerbehandlung und Fallback

### 3.2 Agent Steps in Response

**Transparenz für Benutzer**:

```typescript
interface AgentAwareResponse {
  response: string;
  agentSteps?: {
    step: number;
    type: 'thought' | 'action' | 'observation';
    content: string;
    tool?: string;
  }[];
  summary: string;
}
```

**Implementierung**:
- [ ] Agent-Steps formatieren
- [ ] Zusammenfassung generieren
- [ ] Frontend-ready Response-Format

---

## Phase 4: Vision Integration (Priorität: MITTEL)

### 4.1 Bild-Upload in Chat

**Neuer Endpoint**:

```
POST /api/chat/sessions/:id/messages
  Content-Type: multipart/form-data

  Fields:
    - message: string
    - images[]: File[] (max 5, je max 10MB)
    - options: JSON
```

**Implementierung**:
- [ ] Multer-Middleware für Bild-Upload
- [ ] Bild-Validierung (Format, Größe)
- [ ] Base64-Konvertierung
- [ ] Integration mit `claudeVision`

### 4.2 Vision in Response Generation

```typescript
async function generateResponseWithVision(
  sessionId: string,
  userMessage: string,
  images: VisionImage[],
  contextType: AIContext
): Promise<ChatResponseResult> {
  // 1. Bilder analysieren
  const imageAnalysis = await claudeVision.analyze(images, 'analyze');

  // 2. Analyse in Kontext einbinden
  const enhancedPrompt = `
    [BILD-ANALYSE]
    ${imageAnalysis.text}

    [BENUTZER-FRAGE]
    ${userMessage}
  `;

  // 3. Response generieren
  return generateResponse(sessionId, enhancedPrompt, contextType);
}
```

**Implementierung**:
- [ ] `generateResponseWithVision()` Funktion
- [ ] Multimodal Message-Handling
- [ ] Bild-Speicherung (optional)
- [ ] OCR-Extraktion für Dokumente

### 4.3 Vision-Tools

```typescript
TOOL_EXTRACT_TEXT: {
  name: 'extract_text_from_image',
  description: 'Extrahiere Text aus einem Bild (OCR)',
}

TOOL_DESCRIBE_IMAGE: {
  name: 'describe_image',
  description: 'Beschreibe was auf einem Bild zu sehen ist',
}

TOOL_EXTRACT_IDEAS_FROM_IMAGE: {
  name: 'extract_ideas_from_image',
  description: 'Extrahiere Ideen/Aufgaben aus einem Whiteboard-Foto',
}
```

**Implementierung**:
- [ ] Tool-Definitionen
- [ ] Handler mit Vision-Service
- [ ] Image-Storage für Tool-Referenzen

---

## Phase 5: Tests (Priorität: KRITISCH)

### 5.1 Unit Tests

```typescript
// backend/tests/services/tool-use.test.ts
describe('Tool Use', () => {
  describe('toolRegistry', () => {
    it('should register tools', () => {});
    it('should execute registered tools', () => {});
    it('should handle missing tools', () => {});
  });

  describe('executeWithTools', () => {
    it('should call tools when needed', () => {});
    it('should respect maxIterations', () => {});
    it('should handle tool errors', () => {});
  });
});

// backend/tests/services/react-agent.test.ts
describe('ReAct Agent', () => {
  it('should complete simple tasks', () => {});
  it('should use tools appropriately', () => {});
  it('should self-correct on errors', () => {});
  it('should stop at maxIterations', () => {});
});

// backend/tests/services/enhanced-rag.test.ts
describe('Enhanced RAG', () => {
  describe('HyDE', () => {
    it('should generate hypothetical documents', () => {});
    it('should improve retrieval for conceptual queries', () => {});
  });

  describe('Cross-Encoder', () => {
    it('should re-rank results', () => {});
    it('should provide relevance explanations', () => {});
  });
});

// backend/tests/services/claude-vision.test.ts
describe('Claude Vision', () => {
  it('should describe images', () => {});
  it('should extract text (OCR)', () => {});
  it('should extract ideas from whiteboards', () => {});
});
```

**Implementierung**:
- [ ] Tool Use Tests
- [ ] ReAct Agent Tests
- [ ] Enhanced RAG Tests
- [ ] Vision Tests
- [ ] Integration Tests

### 5.2 Integration Tests

```typescript
// backend/tests/integration/chat-with-tools.test.ts
describe('Chat with Tools Integration', () => {
  it('should use search_ideas when user asks about their ideas', () => {});
  it('should use create_idea when user wants to save something', () => {});
  it('should use RAG for knowledge questions', () => {});
  it('should use agent for complex multi-step tasks', () => {});
});
```

**Implementierung**:
- [ ] End-to-End Chat Tests
- [ ] Tool Integration Tests
- [ ] Memory Integration Tests

### 5.3 Mock-Setup

```typescript
// backend/tests/mocks/claude.mock.ts
export const mockClaudeClient = {
  messages: {
    create: jest.fn(),
  },
};

// backend/tests/mocks/database.mock.ts
export const mockQuery = jest.fn();
```

**Implementierung**:
- [ ] Claude API Mock
- [ ] Database Mock
- [ ] Tool Handler Mocks

---

## Phase 6: API Dokumentation (Priorität: MITTEL)

### 6.1 Swagger Updates

```yaml
# Neue Endpoints dokumentieren
/api/chat/sessions/{id}/messages:
  post:
    summary: Send message with AI capabilities
    requestBody:
      content:
        application/json:
          schema:
            type: object
            properties:
              message:
                type: string
              options:
                type: object
                properties:
                  enableTools:
                    type: boolean
                  enableRAG:
                    type: boolean
                  mode:
                    type: string
                    enum: [auto, conversation, tool_assisted, agent]
    responses:
      200:
        description: AI response with metadata
```

**Implementierung**:
- [ ] Swagger-Schemas aktualisieren
- [ ] Beispiele hinzufügen
- [ ] Response-Schemas dokumentieren

---

## Phase 7: Performance & Monitoring (Priorität: MITTEL)

### 7.1 Metrics

```typescript
// Neue Metriken tracken
interface AIMetrics {
  chatResponses: {
    total: number;
    withTools: number;
    withRAG: number;
    withAgent: number;
  };
  toolUsage: Record<string, number>;
  ragPerformance: {
    avgRetrievalTimeMs: number;
    avgRelevanceScore: number;
  };
  agentPerformance: {
    avgIterations: number;
    successRate: number;
  };
}
```

**Implementierung**:
- [ ] Metrics Collection
- [ ] Dashboard Endpoint
- [ ] Logging Enhancements

### 7.2 Caching

```typescript
// Caching für häufige Operationen
- RAG-Ergebnisse cachen (TTL: 5min)
- Tool-Ergebnisse cachen (wo sinnvoll)
- Embedding-Cache erweitern
```

**Implementierung**:
- [ ] RAG Result Cache
- [ ] Embedding Cache Optimization
- [ ] Cache Invalidation

---

## Implementierungs-Reihenfolge

### Sprint 1: Foundation (Woche 1)
1. ✅ Chat Mode Detection
2. ✅ Tool-Enabled generateResponse
3. ✅ Basic Unit Tests

### Sprint 2: RAG (Woche 2)
1. ✅ RAG Integration in Chat
2. ✅ RAG-Aware Prompts
3. ✅ RAG Tests

### Sprint 3: Agent (Woche 3)
1. ✅ ReAct Agent in Chat
2. ✅ Agent Steps Response
3. ✅ Agent Tests

### Sprint 4: Vision (Woche 4)
1. ✅ Bild-Upload Endpoint
2. ✅ Vision in Response
3. ✅ Vision Tools & Tests

### Sprint 5: Polish (Woche 5)
1. ✅ Integration Tests
2. ✅ API Dokumentation
3. ✅ Performance Optimization
4. ✅ Final Review

---

## Technische Entscheidungen

### Warum dieses Design?

1. **Mode Detection statt Always-On**
   - Spart API-Kosten
   - Schnellere Responses bei einfachen Fragen
   - Bessere UX

2. **Transparente Tool-Nutzung**
   - Benutzer sieht welche Tools verwendet wurden
   - Nachvollziehbarkeit
   - Debugging-freundlich

3. **Graceful Degradation**
   - Falls Tool/RAG/Agent fehlschlägt → Fallback zu Basic Chat
   - System bleibt immer funktional

4. **Kein Hype**
   - Kein Multi-Agent (Over-Engineering)
   - Kein GraphRAG (vorhandener KG reicht)
   - Kein RAPTOR (zu komplex, wenig ROI)

---

## Erfolgskriterien

### Funktional
- [ ] Chat beantwortet Tool-Fragen korrekt
- [ ] RAG liefert relevante Ergebnisse
- [ ] Agent löst komplexe Aufgaben
- [ ] Vision analysiert Bilder korrekt

### Qualität
- [ ] >80% Test Coverage für neue Services
- [ ] <2s Response Time für normale Chats
- [ ] <10s Response Time für Agent-Tasks
- [ ] Keine kritischen Fehler in Production

### Nutzung
- [ ] Alle neuen Services von Chat genutzt
- [ ] Kein toter Code mehr
- [ ] API vollständig dokumentiert

---

## Dateien die erstellt/geändert werden

### Neue Dateien
```
backend/src/services/chat-modes.ts
backend/tests/services/tool-use.test.ts
backend/tests/services/react-agent.test.ts
backend/tests/services/enhanced-rag.test.ts
backend/tests/services/claude-vision.test.ts
backend/tests/integration/chat-with-tools.test.ts
backend/tests/mocks/claude.mock.ts
```

### Geänderte Dateien
```
backend/src/services/general-chat.ts      (Hauptänderungen)
backend/src/routes/general-chat.ts        (API Erweiterung)
backend/src/services/tool-handlers.ts     (Neue Tools)
backend/src/services/claude/tool-use.ts   (Tool-Definitionen)
backend/src/utils/swagger.ts              (Dokumentation)
```

---

## Nächster Schritt

**Bereit zur Implementierung von Phase 1?**

Ich werde mit `chat-modes.ts` und der Integration in `general-chat.ts` beginnen.
