# KI-AB: Vollständiger Ausführungsplan zur Marktführerschaft

**Ziel**: Echte 10/10 State-of-the-Art AI-Fähigkeiten
**Status**: Ausführungsbereit
**Geschätzte Dauer**: 6-8 Wochen

---

## Übersicht aller Phasen

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      AUSFÜHRUNGSPLAN ÜBERSICHT                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  PHASE 1: Chat + Tools Integration                    [Woche 1-2]       │
│  ├── Chat Mode Detection                                                │
│  ├── Tool-Enabled Response Generation                                   │
│  ├── Neue Tools (remember, recall, etc.)                                │
│  └── API-Erweiterung                                                    │
│                                                                         │
│  PHASE 2: RAG Integration in Chat                     [Woche 2-3]       │
│  ├── Automatische RAG-Aktivierung                                       │
│  ├── RAG-Aware System Prompts                                           │
│  └── Quellenangaben in Responses                                        │
│                                                                         │
│  PHASE 3: Agent + Streaming + Interleaved Thinking    [Woche 3-4]       │
│  ├── ReAct Agent Integration                                            │
│  ├── SSE/WebSocket Streaming                                            │
│  ├── Interleaved Thinking (Beta)                                        │
│  └── Frontend Streaming UI                                              │
│                                                                         │
│  PHASE 4: Vision Integration                          [Woche 4-5]       │
│  ├── Bild-Upload Endpoint                                               │
│  ├── Vision in Response Generation                                      │
│  └── Vision Tools (OCR, Whiteboard)                                     │
│                                                                         │
│  PHASE 5: Tests & Qualitätssicherung                  [Woche 5-6]       │
│  ├── Unit Tests (>80% Coverage)                                         │
│  ├── Integration Tests                                                  │
│  └── E2E Tests                                                          │
│                                                                         │
│  PHASE 6: Topic Enhancement (Einfaches RAPTOR)        [Woche 6-7]       │
│  ├── LLM-generierte Topic Summaries                                     │
│  ├── Overview Endpoint                                                  │
│  └── Collapsed Search über Topics                                       │
│                                                                         │
│  PHASE 7: Dokumentation & Polish                      [Woche 7-8]       │
│  ├── API-Dokumentation (Swagger)                                        │
│  ├── Performance Optimierung                                            │
│  └── Monitoring & Metrics                                               │
│                                                                         │
│  [OPTIONAL] PHASE 8: Vollständiges RAPTOR             [+2-3 Wochen]     │
│  └── Nur wenn >500 Ideen oder explizit gewünscht                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## PHASE 1: Chat + Tools Integration

### Dauer: 5-7 Tage

### 1.1 Chat Mode Detection

**Neue Datei**: `backend/src/services/chat-modes.ts`

```typescript
/**
 * Intelligente Erkennung des optimalen Chat-Modus
 */

export type ChatMode =
  | 'conversation'      // Normale Unterhaltung, kein Tool-Bedarf
  | 'tool_assisted'     // Braucht Tool-Zugriff (Suche, Berechnung)
  | 'agent'             // Komplexe Multi-Step Aufgabe
  | 'rag_enhanced';     // Braucht Wissen aus Ideas

export interface ModeDetectionResult {
  mode: ChatMode;
  confidence: number;
  reasoning: string;
  suggestedTools?: string[];
  suggestedStrategies?: string[];
}

// Pattern-basierte Erkennung
const MODE_PATTERNS = {
  tool_assisted: [
    /such(e|en)\s+(meine|nach|in)/i,           // "Suche meine Ideen"
    /find(e|en)\s/i,                            // "Finde..."
    /wie\s+viele/i,                             // "Wie viele Ideen..."
    /berechn(e|en)/i,                           // "Berechne..."
    /erstell(e|en)\s+(eine?|neue)/i,            // "Erstelle eine Idee"
    /speicher(e|n)/i,                           // "Speichere..."
    /merk(e|en)\s+dir/i,                        // "Merk dir..."
  ],
  agent: [
    /analysiere.*und.*dann/i,                   // Multi-Step
    /vergleiche.*mit/i,                         // Vergleich
    /fasse.*zusammen.*und/i,                    // Synthese
    /recherchiere.*und.*erstelle/i,             // Research + Create
    /gib.*überblick.*über.*alle/i,              // Überblick
  ],
  rag_enhanced: [
    /was\s+(habe|hatte)\s+ich/i,                // "Was habe ich zu X"
    /erinner(e|st)\s+(dich|mich)/i,             // "Erinnerst du dich"
    /basierend\s+auf\s+meinen/i,                // "Basierend auf meinen Ideen"
    /im\s+kontext\s+(meiner|von)/i,             // "Im Kontext meiner..."
    /laut\s+meinen/i,                           // "Laut meinen Notizen"
  ],
};

export function detectChatMode(message: string): ModeDetectionResult {
  // 1. Pattern-basierte Erkennung
  for (const [mode, patterns] of Object.entries(MODE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        return {
          mode: mode as ChatMode,
          confidence: 0.85,
          reasoning: `Pattern matched: ${pattern.source}`,
          suggestedTools: getSuggestedTools(mode as ChatMode, message),
        };
      }
    }
  }

  // 2. Keyword-Analyse
  const keywords = analyzeKeywords(message);
  if (keywords.toolIndicators > 2) {
    return {
      mode: 'tool_assisted',
      confidence: 0.7,
      reasoning: 'Multiple tool indicators found',
      suggestedTools: keywords.suggestedTools,
    };
  }

  // 3. Default: Conversation
  return {
    mode: 'conversation',
    confidence: 0.9,
    reasoning: 'No special patterns detected',
  };
}

function getSuggestedTools(mode: ChatMode, message: string): string[] {
  const tools: string[] = [];

  if (/such|find|ideen/i.test(message)) tools.push('search_ideas');
  if (/erstell|speicher|merk/i.test(message)) tools.push('create_idea');
  if (/berechn/i.test(message)) tools.push('calculate');
  if (/verwandt|verbund|zusammenhang/i.test(message)) tools.push('get_related_ideas');
  if (/bild|foto|screenshot/i.test(message)) tools.push('analyze_image');

  return tools;
}

function analyzeKeywords(message: string): {
  toolIndicators: number;
  suggestedTools: string[];
} {
  let toolIndicators = 0;
  const suggestedTools: string[] = [];

  const toolKeywords = {
    search_ideas: ['ideen', 'notizen', 'suchen', 'finden'],
    create_idea: ['erstellen', 'speichern', 'merken', 'notieren'],
    calculate: ['berechnen', 'rechnen', 'prozent', 'summe'],
    get_related_ideas: ['verwandt', 'ähnlich', 'zusammenhang'],
  };

  for (const [tool, keywords] of Object.entries(toolKeywords)) {
    for (const keyword of keywords) {
      if (message.toLowerCase().includes(keyword)) {
        toolIndicators++;
        if (!suggestedTools.includes(tool)) {
          suggestedTools.push(tool);
        }
      }
    }
  }

  return { toolIndicators, suggestedTools };
}
```

### 1.2 Tool-Enabled Response Generation

**Änderung**: `backend/src/services/general-chat.ts`

```typescript
// Neue Imports
import { detectChatMode, ChatMode, ModeDetectionResult } from './chat-modes';
import { executeWithTools, toolRegistry } from './claude/tool-use';
import { setToolContext } from './tool-handlers';
import { enhancedRAG } from './enhanced-rag';

// Neue Typen
export interface GenerateOptions {
  enableTools?: boolean;
  enableRAG?: boolean;
  enableAgent?: boolean;
  mode?: 'auto' | ChatMode;
  maxToolIterations?: number;
}

export interface ChatResponseResult {
  response: string;
  mode: ChatMode;
  modeConfidence: number;
  toolsUsed?: Array<{
    name: string;
    input: Record<string, unknown>;
    result: string;
  }>;
  ragResults?: {
    resultsUsed: number;
    topResult?: { title: string; score: number };
  };
  processingTimeMs: number;
}

// Erweiterte generateResponse Funktion
export async function generateResponse(
  sessionId: string,
  userMessage: string,
  contextType: 'personal' | 'work' = 'personal',
  options: GenerateOptions = {}
): Promise<ChatResponseResult> {
  const startTime = Date.now();
  const {
    enableTools = true,
    enableRAG = true,
    mode = 'auto',
    maxToolIterations = 5,
  } = options;

  // 1. Mode Detection
  let detectedMode: ModeDetectionResult;
  if (mode === 'auto') {
    detectedMode = detectChatMode(userMessage);
  } else {
    detectedMode = { mode, confidence: 1.0, reasoning: 'Manual override' };
  }

  logger.info('Chat mode detected', {
    sessionId,
    mode: detectedMode.mode,
    confidence: detectedMode.confidence,
  });

  // 2. Tool Context setzen
  setToolContext(contextType);

  // 3. Basierend auf Mode verarbeiten
  let response: string;
  let toolsUsed: ChatResponseResult['toolsUsed'];
  let ragResults: ChatResponseResult['ragResults'];

  switch (detectedMode.mode) {
    case 'tool_assisted':
      // Tool-basierte Verarbeitung
      const toolResult = await executeWithTools(
        [{ role: 'user', content: userMessage }],
        detectedMode.suggestedTools || ['search_ideas', 'create_idea', 'calculate'],
        {
          systemPrompt: await buildSystemPrompt(sessionId, contextType),
          maxIterations: maxToolIterations,
        }
      );
      response = toolResult.response;
      toolsUsed = toolResult.toolsCalled;
      break;

    case 'rag_enhanced':
      // RAG-enhanced Verarbeitung
      const ragResult = await enhancedRAG.retrieve(userMessage, contextType);
      const ragContext = formatRAGContext(ragResult.results);

      response = await generateWithRAGContext(
        sessionId,
        userMessage,
        ragContext,
        contextType
      );

      ragResults = {
        resultsUsed: ragResult.results.length,
        topResult: ragResult.results[0]
          ? { title: ragResult.results[0].title, score: ragResult.results[0].score }
          : undefined,
      };
      break;

    case 'agent':
      // Für Agent-Mode: siehe Phase 3
      // Fallback zu conversation für jetzt
      response = await generateConversationResponse(sessionId, userMessage, contextType);
      break;

    case 'conversation':
    default:
      // Standard Conversation
      response = await generateConversationResponse(sessionId, userMessage, contextType);
      break;
  }

  return {
    response,
    mode: detectedMode.mode,
    modeConfidence: detectedMode.confidence,
    toolsUsed,
    ragResults,
    processingTimeMs: Date.now() - startTime,
  };
}

// Hilfsfunktionen
async function generateConversationResponse(
  sessionId: string,
  userMessage: string,
  contextType: 'personal' | 'work'
): Promise<string> {
  // Existierende Logik aus generateResponse
  // ...
}

function formatRAGContext(results: EnhancedResult[]): string {
  if (results.length === 0) return '';

  return `[RELEVANTE INFORMATIONEN AUS DEINER WISSENSBASIS]
${results.slice(0, 5).map((r, i) =>
  `${i + 1}. "${r.title}" (Relevanz: ${(r.score * 100).toFixed(0)}%)
   ${r.summary}`
).join('\n\n')}

Nutze diese Informationen wenn relevant für deine Antwort.`;
}

async function generateWithRAGContext(
  sessionId: string,
  userMessage: string,
  ragContext: string,
  contextType: 'personal' | 'work'
): Promise<string> {
  const systemPrompt = await buildSystemPrompt(sessionId, contextType);
  const enhancedPrompt = `${systemPrompt}\n\n${ragContext}`;

  return generateWithConversationHistory(
    enhancedPrompt,
    userMessage,
    await getConversationHistory(sessionId),
    { maxTokens: 2000 }
  );
}
```

### 1.3 Neue Tools

**Erweitern**: `backend/src/services/tool-handlers.ts`

```typescript
// Zusätzliche Tools

// TOOL_REMEMBER - Speichert Information in Long-Term Memory
export const TOOL_REMEMBER: ToolDefinition = {
  name: 'remember',
  description: 'Merke dir eine wichtige Information für später. Nutze dies wenn der Benutzer sagt "merk dir..." oder ähnliches.',
  input_schema: {
    type: 'object',
    properties: {
      information: {
        type: 'string',
        description: 'Die zu merkende Information',
      },
      category: {
        type: 'string',
        description: 'Kategorie (preference, fact, goal, context)',
        enum: ['preference', 'fact', 'goal', 'context'],
      },
    },
    required: ['information'],
  },
};

async function handleRemember(input: Record<string, unknown>): Promise<string> {
  const info = input.information as string;
  const category = (input.category as string) || 'fact';

  // In Long-Term Memory speichern
  await longTermMemory.storePersonalizationFact(
    currentContext,
    category as any,
    info,
    0.9 // High confidence since user explicitly asked
  );

  return `Ich habe mir gemerkt: "${info}"`;
}

// TOOL_RECALL - Sucht in Episodic Memory
export const TOOL_RECALL: ToolDefinition = {
  name: 'recall',
  description: 'Erinnere dich an frühere Gespräche oder Informationen. Nutze dies wenn der Benutzer fragt "erinnerst du dich..." oder ähnliches.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Wonach suchst du in der Erinnerung?',
      },
    },
    required: ['query'],
  },
};

async function handleRecall(input: Record<string, unknown>): Promise<string> {
  const query = input.query as string;

  // In Episodic Memory suchen
  const memories = await episodicMemory.retrieve(query, currentContext, 5);

  if (memories.length === 0) {
    return `Ich habe keine Erinnerungen zu "${query}" gefunden.`;
  }

  return `Hier sind relevante Erinnerungen zu "${query}":\n\n` +
    memories.map((m, i) =>
      `${i + 1}. ${m.trigger.substring(0, 100)}...\n   (${new Date(m.timestamp).toLocaleDateString('de-DE')})`
    ).join('\n\n');
}

// Registrierung erweitern
export function registerAllToolHandlers(): void {
  // Bestehende Tools
  toolRegistry.register(TOOL_SEARCH_IDEAS, handleSearchIdeas);
  toolRegistry.register(TOOL_CREATE_IDEA, handleCreateIdea);
  toolRegistry.register(TOOL_GET_RELATED, handleGetRelated);
  toolRegistry.register(TOOL_CALCULATE, handleCalculate);

  // Neue Tools
  toolRegistry.register(TOOL_REMEMBER, handleRemember);
  toolRegistry.register(TOOL_RECALL, handleRecall);

  logger.info('All tool handlers registered', {
    tools: ['search_ideas', 'create_idea', 'get_related', 'calculate', 'remember', 'recall'],
  });
}
```

### 1.4 API-Erweiterung

**Ändern**: `backend/src/routes/general-chat.ts`

```typescript
// Erweitertes Request/Response Schema

/**
 * POST /api/chat/sessions/:id/messages
 */
generalChatRouter.post('/sessions/:id/messages', apiKeyAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { message, options } = req.body;

  // Validierung
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid session ID');
  }
  if (!message || typeof message !== 'string') {
    throw new ValidationError('Message required');
  }

  // Session prüfen
  const session = await getSession(id);
  if (!session) {
    throw new NotFoundError('Chat session');
  }

  // Options parsen
  const generateOptions: GenerateOptions = {
    enableTools: options?.enableTools ?? true,
    enableRAG: options?.enableRAG ?? true,
    mode: options?.mode ?? 'auto',
    maxToolIterations: options?.maxToolIterations ?? 5,
  };

  // User Message speichern
  const userMsg = await addMessage(id, 'user', message);

  // Response generieren
  const result = await generateResponse(
    id,
    message,
    session.context as 'personal' | 'work',
    generateOptions
  );

  // Assistant Message speichern
  const assistantMsg = await addMessage(id, 'assistant', result.response);

  // Episodic Memory (async)
  recordEpisode(id, message, result.response, session.context).catch(() => {});

  res.json({
    success: true,
    data: {
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      metadata: {
        mode: result.mode,
        modeConfidence: result.modeConfidence,
        toolsUsed: result.toolsUsed,
        ragResults: result.ragResults,
        processingTimeMs: result.processingTimeMs,
      },
    },
  });
}));
```

---

## PHASE 2: RAG Integration in Chat

### Dauer: 3-4 Tage

### 2.1 Automatische RAG-Aktivierung

**Erweitern**: `backend/src/services/chat-modes.ts`

```typescript
// RAG-Entscheidungslogik

export function shouldEnhanceWithRAG(
  message: string,
  mode: ChatMode
): { shouldUse: boolean; reason: string } {
  // Immer RAG bei rag_enhanced mode
  if (mode === 'rag_enhanced') {
    return { shouldUse: true, reason: 'Mode requires RAG' };
  }

  // RAG-Indikatoren
  const ragIndicators = [
    /meine?\s+(ideen?|notizen?|gedanken)/i,
    /basierend\s+auf/i,
    /laut\s+meinen/i,
    /habe\s+ich\s+(schon|bereits|mal)/i,
    /früher\s+(mal|schon)/i,
    /erinner/i,
  ];

  for (const pattern of ragIndicators) {
    if (pattern.test(message)) {
      return { shouldUse: true, reason: `Pattern: ${pattern.source}` };
    }
  }

  // Fragen die Wissen erfordern könnten
  if (/^(was|wie|warum|wann|wo|wer)\s/i.test(message)) {
    // Nur wenn es um persönliche Themen geht
    if (/mein|ich|wir|unser/i.test(message)) {
      return { shouldUse: true, reason: 'Personal knowledge question' };
    }
  }

  return { shouldUse: false, reason: 'No RAG indicators' };
}
```

### 2.2 RAG-Enhanced System Prompt

```typescript
// In general-chat.ts

const RAG_SYSTEM_ENHANCEMENT = `
[DEIN WISSEN ÜBER DEN BENUTZER]
Du hast Zugriff auf die Ideen und Notizen des Benutzers.
Wenn relevante Informationen gefunden wurden, sind sie unten aufgeführt.

Regeln für die Nutzung:
1. Nutze das Wissen wenn es zur Frage passt
2. Zitiere die Quelle: "Laut deiner Idee 'Titel'..."
3. Wenn nichts gefunden wurde, sag es ehrlich
4. Kombiniere dein Allgemeinwissen mit dem persönlichen Wissen

{ragContext}
`;

async function buildEnhancedSystemPrompt(
  basePrompt: string,
  ragResults: EnhancedResult[]
): Promise<string> {
  if (ragResults.length === 0) {
    return basePrompt + '\n\n[Keine relevanten Ideen gefunden]';
  }

  const ragContext = ragResults.slice(0, 5).map((r, i) =>
    `Idee ${i + 1}: "${r.title}"
     Zusammenfassung: ${r.summary}
     Relevanz: ${(r.score * 100).toFixed(0)}%`
  ).join('\n\n');

  return basePrompt + '\n\n' + RAG_SYSTEM_ENHANCEMENT.replace('{ragContext}', ragContext);
}
```

---

## PHASE 3: Agent + Streaming + Interleaved Thinking

### Dauer: 5-7 Tage

### 3.1 Streaming Service

**Neue Datei**: `backend/src/services/claude/streaming.ts`

```typescript
/**
 * Streaming für Extended Thinking und Tool Use
 */

import Anthropic from '@anthropic-ai/sdk';
import { getClaudeClient, CLAUDE_MODEL } from './client';
import { logger } from '../../utils/logger';

// Event Types
export type StreamEvent =
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; content: string }
  | { type: 'thinking_end' }
  | { type: 'tool_use_start'; tool: string }
  | { type: 'tool_use_input'; input: string }
  | { type: 'tool_result'; result: string }
  | { type: 'response_start' }
  | { type: 'response_delta'; content: string }
  | { type: 'response_end' }
  | { type: 'error'; message: string };

export interface StreamOptions {
  maxTokens?: number;
  thinkingBudget?: number;
  enableTools?: boolean;
  tools?: Anthropic.Tool[];
  interleaved?: boolean;  // Interleaved Thinking Beta
}

/**
 * Stream Extended Thinking Response
 */
export async function* streamWithThinking(
  systemPrompt: string,
  userMessage: string,
  options: StreamOptions = {}
): AsyncGenerator<StreamEvent> {
  const client = getClaudeClient();
  const {
    maxTokens = 4096,
    thinkingBudget = 10000,
    interleaved = true,
  } = options;

  try {
    // Headers für Interleaved Thinking Beta
    const headers: Record<string, string> = {};
    if (interleaved) {
      headers['anthropic-beta'] = 'interleaved-thinking-2025-05-14';
    }

    const stream = await client.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      thinking: {
        type: 'enabled',
        budget_tokens: thinkingBudget,
      },
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }, { headers });

    let inThinking = false;
    let inResponse = false;

    for await (const event of stream) {
      switch (event.type) {
        case 'content_block_start':
          if (event.content_block.type === 'thinking') {
            inThinking = true;
            yield { type: 'thinking_start' };
          } else if (event.content_block.type === 'text') {
            inResponse = true;
            yield { type: 'response_start' };
          }
          break;

        case 'content_block_delta':
          if (event.delta.type === 'thinking_delta') {
            yield { type: 'thinking_delta', content: event.delta.thinking };
          } else if (event.delta.type === 'text_delta') {
            yield { type: 'response_delta', content: event.delta.text };
          }
          break;

        case 'content_block_stop':
          if (inThinking) {
            inThinking = false;
            yield { type: 'thinking_end' };
          } else if (inResponse) {
            inResponse = false;
            yield { type: 'response_end' };
          }
          break;
      }
    }
  } catch (error) {
    logger.error('Streaming error', error instanceof Error ? error : undefined);
    yield { type: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Stream with Tool Use + Interleaved Thinking
 */
export async function* streamWithToolsAndThinking(
  systemPrompt: string,
  userMessage: string,
  tools: Anthropic.Tool[],
  toolExecutor: (name: string, input: any) => Promise<string>,
  options: StreamOptions = {}
): AsyncGenerator<StreamEvent> {
  const client = getClaudeClient();
  const { maxTokens = 4096, thinkingBudget = 10000 } = options;

  let messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage }
  ];

  let iterations = 0;
  const maxIterations = 5;

  while (iterations < maxIterations) {
    iterations++;

    const stream = await client.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      thinking: {
        type: 'enabled',
        budget_tokens: thinkingBudget,
      },
      system: systemPrompt,
      messages,
      tools,
    }, {
      headers: {
        'anthropic-beta': 'interleaved-thinking-2025-05-14'
      }
    });

    let currentContent: Anthropic.ContentBlock[] = [];
    let hasToolUse = false;

    for await (const event of stream) {
      // Yield thinking/response events
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'thinking') {
          yield { type: 'thinking_start' };
        } else if (event.content_block.type === 'text') {
          yield { type: 'response_start' };
        } else if (event.content_block.type === 'tool_use') {
          hasToolUse = true;
          yield { type: 'tool_use_start', tool: event.content_block.name };
        }
      }

      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'thinking_delta') {
          yield { type: 'thinking_delta', content: event.delta.thinking };
        } else if (event.delta.type === 'text_delta') {
          yield { type: 'response_delta', content: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          yield { type: 'tool_use_input', input: event.delta.partial_json };
        }
      }

      if (event.type === 'content_block_stop') {
        if (event.index !== undefined) {
          // Speichere den Block
        }
        yield { type: 'thinking_end' }; // or response_end based on context
      }

      if (event.type === 'message_delta') {
        // Message complete
      }
    }

    // Wenn kein Tool-Use, sind wir fertig
    if (!hasToolUse) {
      break;
    }

    // Tool-Calls ausführen
    const finalResponse = await stream.finalMessage();
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of finalResponse.content) {
      if (block.type === 'tool_use') {
        const result = await toolExecutor(block.name, block.input);
        yield { type: 'tool_result', result };

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }
    }

    // Messages für nächste Iteration
    messages = [
      ...messages,
      { role: 'assistant', content: finalResponse.content },
      { role: 'user', content: toolResults },
    ];
  }
}
```

### 3.2 SSE Endpoint

**Erweitern**: `backend/src/routes/general-chat.ts`

```typescript
import { streamWithThinking, streamWithToolsAndThinking, StreamEvent } from '../services/claude/streaming';

/**
 * GET /api/chat/sessions/:id/stream
 * Server-Sent Events für Streaming Response
 */
generalChatRouter.get('/sessions/:id/stream', apiKeyAuth, async (req, res) => {
  const { id } = req.params;
  const message = req.query.message as string;
  const enableTools = req.query.enableTools !== 'false';

  // Validierung
  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }
  if (!message) {
    return res.status(400).json({ error: 'Message required' });
  }

  // Session prüfen
  const session = await getSession(id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // User Message speichern
  await addMessage(id, 'user', message);
  setToolContext(session.context as AIContext);

  // Stream starten
  const systemPrompt = await buildSystemPrompt(id, session.context as AIContext);
  let fullResponse = '';

  try {
    let generator: AsyncGenerator<StreamEvent>;

    if (enableTools) {
      const tools = toolRegistry.getDefinitions() as Anthropic.Tool[];
      generator = streamWithToolsAndThinking(
        systemPrompt,
        message,
        tools,
        async (name, input) => toolRegistry.execute(name, input),
        { thinkingBudget: 15000 }
      );
    } else {
      generator = streamWithThinking(systemPrompt, message, { thinkingBudget: 10000 });
    }

    for await (const event of generator) {
      // Event senden
      res.write(`data: ${JSON.stringify(event)}\n\n`);

      // Response sammeln
      if (event.type === 'response_delta') {
        fullResponse += event.content;
      }
    }

    // Finale Message
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);

    // Assistant Message speichern (async)
    addMessage(id, 'assistant', fullResponse).catch(console.error);
    recordEpisode(id, message, fullResponse, session.context).catch(() => {});

  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream failed' })}\n\n`);
  }

  res.end();
});
```

### 3.3 ReAct Agent Integration

**Erweitern**: `backend/src/services/general-chat.ts`

```typescript
import { ReActAgent, AgentResult } from './react-agent';

// In generateResponse, case 'agent':

case 'agent':
  const agentResult = await executeAgentMode(
    sessionId,
    userMessage,
    contextType
  );
  response = agentResult.answer;

  // Agent Steps als Metadata
  return {
    response,
    mode: 'agent',
    modeConfidence: detectedMode.confidence,
    agentSteps: agentResult.steps.map(s => ({
      type: s.type,
      content: s.content.substring(0, 200),
    })),
    processingTimeMs: Date.now() - startTime,
  };

async function executeAgentMode(
  sessionId: string,
  message: string,
  context: AIContext
): Promise<AgentResult> {
  const agent = new ReActAgent({
    tools: ['search_ideas', 'create_idea', 'get_related_ideas', 'calculate', 'remember', 'recall'],
    maxIterations: 8,
    temperature: 0.3,
    verbose: true,
  });

  return agent.execute({
    description: message,
    aiContext: context,
    context: await getSessionContextSummary(sessionId),
  });
}
```

---

## PHASE 4: Vision Integration

### Dauer: 4-5 Tage

### 4.1 Bild-Upload Middleware

```typescript
// backend/src/middleware/upload.ts

import multer from 'multer';
import { ValidationError } from './errorHandler';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;

const storage = multer.memoryStorage();

export const imageUpload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError(`Invalid file type: ${file.mimetype}`));
    }
  },
});
```

### 4.2 Vision Chat Endpoint

```typescript
// In general-chat.ts routes

import { imageUpload } from '../middleware/upload';
import { claudeVision, bufferToVisionImage, VisionImage } from '../services/claude-vision';

/**
 * POST /api/chat/sessions/:id/messages/vision
 * Chat mit Bild-Input
 */
generalChatRouter.post(
  '/sessions/:id/messages/vision',
  apiKeyAuth,
  imageUpload.array('images', 5),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { message } = req.body;
    const files = req.files as Express.Multer.File[];

    // Validierung
    if (!files || files.length === 0) {
      throw new ValidationError('At least one image required');
    }

    // Session prüfen
    const session = await getSession(id);
    if (!session) {
      throw new NotFoundError('Chat session');
    }

    // Bilder konvertieren
    const images: VisionImage[] = files.map(file =>
      bufferToVisionImage(file.buffer, file.mimetype as ImageMediaType)
    );

    // Vision-Analyse
    const visionResult = await claudeVision.analyze(images, 'analyze', {
      context: message || 'Analysiere dieses Bild',
    });

    // Response generieren mit Vision-Kontext
    const enhancedMessage = message
      ? `${message}\n\n[Bild-Analyse]\n${visionResult.text}`
      : `Beschreibe was du auf dem Bild siehst:\n\n${visionResult.text}`;

    const result = await generateResponse(
      id,
      enhancedMessage,
      session.context as 'personal' | 'work',
      { mode: 'conversation' }
    );

    // Messages speichern
    await addMessage(id, 'user', `[Bild-Upload] ${message || 'Bild-Analyse'}`);
    await addMessage(id, 'assistant', result.response);

    res.json({
      success: true,
      data: {
        response: result.response,
        visionAnalysis: visionResult.text,
        imageCount: images.length,
      },
    });
  })
);
```

### 4.3 Vision Tool

```typescript
// In tool-handlers.ts

export const TOOL_ANALYZE_IMAGE: ToolDefinition = {
  name: 'analyze_image',
  description: 'Analysiere ein Bild das der Benutzer hochgeladen hat.',
  input_schema: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'Was soll analysiert werden?',
        enum: ['describe', 'extract_text', 'extract_ideas'],
      },
      question: {
        type: 'string',
        description: 'Spezifische Frage zum Bild (optional)',
      },
    },
    required: ['task'],
  },
};

// Note: Bilder müssen separat über Vision-Endpoint hochgeladen werden
// Tool greift auf Session-gespeicherte Bilder zu
```

---

## PHASE 5: Tests & Qualitätssicherung

### Dauer: 5-6 Tage

### 5.1 Test-Struktur

```
backend/tests/
├── unit/
│   ├── services/
│   │   ├── chat-modes.test.ts
│   │   ├── tool-use.test.ts
│   │   ├── react-agent.test.ts
│   │   ├── enhanced-rag.test.ts
│   │   ├── cross-encoder-rerank.test.ts
│   │   ├── hyde-retrieval.test.ts
│   │   └── claude-vision.test.ts
│   └── utils/
│       └── ...
├── integration/
│   ├── chat-with-tools.test.ts
│   ├── chat-with-rag.test.ts
│   ├── chat-streaming.test.ts
│   └── chat-vision.test.ts
└── mocks/
    ├── claude.mock.ts
    └── database.mock.ts
```

### 5.2 Beispiel Unit Tests

```typescript
// backend/tests/unit/services/chat-modes.test.ts

import { detectChatMode, shouldEnhanceWithRAG } from '../../../src/services/chat-modes';

describe('Chat Mode Detection', () => {
  describe('detectChatMode', () => {
    it('should detect tool_assisted for search queries', () => {
      const result = detectChatMode('Suche meine Ideen zum Thema KI');
      expect(result.mode).toBe('tool_assisted');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.suggestedTools).toContain('search_ideas');
    });

    it('should detect agent mode for complex multi-step queries', () => {
      const result = detectChatMode('Analysiere meine letzten 10 Ideen und fasse sie zusammen');
      expect(result.mode).toBe('agent');
    });

    it('should detect rag_enhanced for knowledge questions', () => {
      const result = detectChatMode('Was habe ich zu dem Thema Business Development notiert?');
      expect(result.mode).toBe('rag_enhanced');
    });

    it('should default to conversation for simple messages', () => {
      const result = detectChatMode('Wie geht es dir heute?');
      expect(result.mode).toBe('conversation');
    });
  });

  describe('shouldEnhanceWithRAG', () => {
    it('should return true for rag_enhanced mode', () => {
      const result = shouldEnhanceWithRAG('test', 'rag_enhanced');
      expect(result.shouldUse).toBe(true);
    });

    it('should return true for personal knowledge questions', () => {
      const result = shouldEnhanceWithRAG('Was habe ich zu KI notiert?', 'conversation');
      expect(result.shouldUse).toBe(true);
    });

    it('should return false for general questions', () => {
      const result = shouldEnhanceWithRAG('Was ist die Hauptstadt von Frankreich?', 'conversation');
      expect(result.shouldUse).toBe(false);
    });
  });
});
```

### 5.3 Integration Tests

```typescript
// backend/tests/integration/chat-with-tools.test.ts

describe('Chat with Tools Integration', () => {
  let sessionId: string;

  beforeAll(async () => {
    // Setup: Create test session
    const session = await createSession('personal');
    sessionId = session.id;

    // Seed test data
    await seedTestIdeas('personal');
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  it('should use search_ideas tool when user asks about their ideas', async () => {
    const result = await generateResponse(
      sessionId,
      'Suche meine Ideen zum Thema Testing',
      'personal',
      { enableTools: true }
    );

    expect(result.mode).toBe('tool_assisted');
    expect(result.toolsUsed).toBeDefined();
    expect(result.toolsUsed?.some(t => t.name === 'search_ideas')).toBe(true);
  });

  it('should create an idea when user explicitly asks', async () => {
    const result = await generateResponse(
      sessionId,
      'Erstelle eine neue Idee: Automatisierte Tests sind wichtig',
      'personal',
      { enableTools: true }
    );

    expect(result.toolsUsed?.some(t => t.name === 'create_idea')).toBe(true);
  });
});
```

---

## PHASE 6: Topic Enhancement (Einfaches RAPTOR)

### Dauer: 3-4 Tage

### 6.1 Topic Summary Generation

```typescript
// backend/src/services/topic-summary.ts

/**
 * LLM-generierte Zusammenfassungen für existierende Topics
 * Einfachere Alternative zu vollem RAPTOR
 */

export interface TopicWithSummary {
  id: string;
  name: string;
  description: string;
  summary: string;           // NEU: LLM-generiert
  ideaCount: number;
  topIdeas: Array<{
    id: string;
    title: string;
    score: number;
  }>;
  keywords: string[];
  lastUpdated: Date;
}

export async function generateTopicSummaries(
  context: AIContext
): Promise<TopicWithSummary[]> {
  // 1. Existierende Topics laden
  const topics = await loadTopicsWithIdeas(context);

  // 2. Für jeden Topic Summary generieren
  const summaries: TopicWithSummary[] = [];

  for (const topic of topics) {
    // Top 5 Ideen für Summary
    const topIdeas = topic.ideas
      .sort((a, b) => b.membershipScore - a.membershipScore)
      .slice(0, 5);

    // LLM Summary
    const summary = await generateClaudeResponse(
      'Du fasst Themencluster zusammen.',
      `Thema: ${topic.name}
       Beschreibung: ${topic.description}

       Top-Ideen:
       ${topIdeas.map(i => `- ${i.title}: ${i.summary}`).join('\n')}

       Erstelle eine 2-3 Satz Zusammenfassung des Themas.`,
      { maxTokens: 150, temperature: 0.3 }
    );

    summaries.push({
      id: topic.id,
      name: topic.name,
      description: topic.description,
      summary,
      ideaCount: topic.ideas.length,
      topIdeas: topIdeas.map(i => ({ id: i.id, title: i.title, score: i.membershipScore })),
      keywords: extractKeywords(summary),
      lastUpdated: new Date(),
    });
  }

  // 3. In DB speichern
  await storeTopicSummaries(summaries, context);

  return summaries;
}
```

### 6.2 Overview Endpoint

```typescript
// backend/src/routes/topics.ts

/**
 * GET /api/:context/topics/overview
 * Gibt einen Überblick über alle Themen mit Summaries
 */
router.get('/overview', apiKeyAuth, asyncHandler(async (req, res) => {
  const { context } = req.params;

  // Cached Summaries laden oder generieren
  let summaries = await loadCachedTopicSummaries(context);

  if (!summaries || summaries.length === 0) {
    summaries = await generateTopicSummaries(context);
  }

  // High-Level Summary
  const overallSummary = await generateOverallSummary(summaries);

  res.json({
    success: true,
    data: {
      overallSummary,
      topicCount: summaries.length,
      totalIdeas: summaries.reduce((sum, t) => sum + t.ideaCount, 0),
      topics: summaries,
    },
  });
}));
```

---

## PHASE 7: Dokumentation & Polish

### Dauer: 3-4 Tage

### 7.1 Swagger Updates

```yaml
# Neue Schemas und Endpoints dokumentieren

components:
  schemas:
    ChatMessageOptions:
      type: object
      properties:
        enableTools:
          type: boolean
          default: true
        enableRAG:
          type: boolean
          default: true
        mode:
          type: string
          enum: [auto, conversation, tool_assisted, agent, rag_enhanced]
          default: auto

    ChatResponseMetadata:
      type: object
      properties:
        mode:
          type: string
        modeConfidence:
          type: number
        toolsUsed:
          type: array
          items:
            $ref: '#/components/schemas/ToolUsage'
        ragResults:
          $ref: '#/components/schemas/RAGResults'
        processingTimeMs:
          type: integer
```

### 7.2 Performance Monitoring

```typescript
// backend/src/services/ai-metrics.ts

export interface AIMetrics {
  chatResponses: {
    total: number;
    byMode: Record<ChatMode, number>;
    avgProcessingTimeMs: Record<ChatMode, number>;
  };
  toolUsage: {
    total: number;
    byTool: Record<string, number>;
    avgExecutionTimeMs: Record<string, number>;
  };
  ragPerformance: {
    queries: number;
    avgResultCount: number;
    avgConfidence: number;
    avgRetrievalTimeMs: number;
  };
  streamingStats: {
    sessions: number;
    avgDurationMs: number;
    avgTokensStreamed: number;
  };
}

export async function getAIMetrics(
  context: AIContext,
  timeRange: 'day' | 'week' | 'month' = 'day'
): Promise<AIMetrics> {
  // Aggregiere Metriken aus ai_activity_log
  // ...
}
```

---

## Zeitplan Zusammenfassung

| Phase | Dauer | Kumulativ |
|-------|-------|-----------|
| Phase 1: Chat + Tools | 5-7 Tage | 1 Woche |
| Phase 2: RAG Integration | 3-4 Tage | 1.5 Wochen |
| Phase 3: Agent + Streaming | 5-7 Tage | 2.5 Wochen |
| Phase 4: Vision | 4-5 Tage | 3.5 Wochen |
| Phase 5: Tests | 5-6 Tage | 4.5 Wochen |
| Phase 6: Topic Enhancement | 3-4 Tage | 5.5 Wochen |
| Phase 7: Docs & Polish | 3-4 Tage | 6.5 Wochen |
| **Gesamt** | **28-37 Tage** | **~6-8 Wochen** |

---

## Erfolgs-Kriterien

### Funktional
- [ ] Chat erkennt automatisch den optimalen Mode
- [ ] Tools werden korrekt aufgerufen und Ergebnisse integriert
- [ ] RAG liefert relevante Ergebnisse und zitiert Quellen
- [ ] Agent löst komplexe Multi-Step Aufgaben
- [ ] Streaming zeigt Echtzeit-Fortschritt
- [ ] Vision analysiert Bilder korrekt

### Qualität
- [ ] >80% Test Coverage für neue Services
- [ ] <2s Time-to-First-Token bei Streaming
- [ ] <5s Response Time für normale Chats
- [ ] <15s Response Time für Agent-Tasks
- [ ] Keine kritischen Fehler in Production

### Nutzung
- [ ] Alle Services von Chat genutzt (kein toter Code)
- [ ] API vollständig dokumentiert
- [ ] Metrics Dashboard verfügbar

---

## Bereit zur Ausführung?

Der Plan ist vollständig. Ich kann jetzt mit **Phase 1: Chat + Tools Integration** beginnen.
