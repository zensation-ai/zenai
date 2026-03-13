# ZenAI → Top-Liga AI OS 2026: Implementierungsplan

## Masterplan zur Schließung aller identifizierten Gaps

**Datum:** 2026-03-13
**Basis:** AUDIT-AI-OS-STANDARDS-2026.md
**Strategie:** Inkrementelle Phasen, jede Phase liefert eigenständigen Mehrwert

---

## Übersicht: 10 Phasen, 18 Arbeitspakete

```
Phase 55: MCP Client + Erweiterte MCP Server          (2-3 Wochen)
Phase 56: OAuth 2.1 + JWT + Multi-User Foundation      (3-4 Wochen)
Phase 57: Real-Time Voice (WebRTC + TTS Pipeline)      (3-4 Wochen)
Phase 58: GraphRAG + Hybrid Retrieval                  (2-3 Wochen)
Phase 59: Memory Excellence (Letta-Paradigm)           (2-3 Wochen)
Phase 60: A2A Protocol Foundation                      (2-3 Wochen)
Phase 61: Observability + Queue + Performance          (2-3 Wochen)
Phase 62: Enterprise Security + PWA                    (2-3 Wochen)
Phase 63: Sleep-Time Compute + Context Engineering     (2-3 Wochen)
Phase 64: Agent Identity + LangGraph State Machine     (2-3 Wochen)
```

**Gesamtdauer geschätzt: 22-32 Wochen**

---

## Phase 55: MCP Client + Erweiterte MCP Server

### Ziel
ZenAI wird zum vollwertigen MCP-Teilnehmer: Server UND Client. Externe MCP-Server (Dateisysteme, Datenbanken, APIs) werden konsumierbar.

### 55.1 MCP Client Implementation

**Neue Dateien:**

| Datei | Zweck |
|-------|-------|
| `backend/src/services/mcp/mcp-client.ts` | MCP Client Core — Verbindet zu externen MCP Servern |
| `backend/src/services/mcp/mcp-registry.ts` | Registry für konfigurierte MCP Server |
| `backend/src/services/mcp/mcp-transport.ts` | Transport Layer (Streamable HTTP, stdio, SSE) |
| `backend/src/services/mcp/mcp-tool-bridge.ts` | Bridge: Externe MCP Tools → ZenAI Tool Registry |
| `backend/src/routes/mcp-connections.ts` | CRUD API für MCP Server Connections |
| `frontend/src/components/MCPConnectionsPage.tsx` | UI für MCP Server Management |

**Technische Details:**

```typescript
// mcp-client.ts — Kernarchitektur
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface MCPServerConfig {
  id: string;
  name: string;
  url?: string;               // Für HTTP-basierte Server
  command?: string;            // Für stdio-basierte Server
  args?: string[];
  env?: Record<string, string>;
  transport: 'streamable-http' | 'stdio' | 'sse';
  auth?: {
    type: 'bearer' | 'api-key' | 'oauth';
    token?: string;
    clientId?: string;
    clientSecret?: string;
  };
  enabled: boolean;
  healthCheckInterval: number; // ms
}

class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private configs: MCPServerConfig[];

  async connect(config: MCPServerConfig): Promise<void> {
    const transport = this.createTransport(config);
    const client = new Client({
      name: 'zenai-client',
      version: '1.0.0'
    });
    await client.connect(transport);
    this.clients.set(config.id, client);
    // Register alle Tools vom Server in ZenAI Tool Registry
    await this.syncTools(config.id, client);
  }

  async syncTools(serverId: string, client: Client): Promise<void> {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      toolRegistry.registerExternal({
        name: `mcp_${serverId}_${tool.name}`,
        description: tool.description,
        inputSchema: tool.inputSchema,
        execute: async (args) => client.callTool({
          name: tool.name,
          arguments: args
        })
      });
    }
  }

  async listResources(serverId: string): Promise<Resource[]> {
    const client = this.clients.get(serverId);
    return client?.listResources() ?? [];
  }

  async readResource(serverId: string, uri: string): Promise<ResourceContent> {
    const client = this.clients.get(serverId);
    return client.readResource({ uri });
  }
}
```

**DB Migration:** `phase55_mcp_connections.sql`

```sql
-- Pro Schema: mcp_server_connections
CREATE TABLE IF NOT EXISTS ${schema}.mcp_server_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  transport VARCHAR(50) NOT NULL CHECK (transport IN ('streamable-http', 'stdio', 'sse')),
  url TEXT,
  command TEXT,
  args JSONB DEFAULT '[]',
  env_vars JSONB DEFAULT '{}',  -- Verschlüsselt gespeichert
  auth_type VARCHAR(50),
  auth_config JSONB DEFAULT '{}', -- Verschlüsselt
  enabled BOOLEAN DEFAULT true,
  health_status VARCHAR(20) DEFAULT 'unknown',
  last_health_check TIMESTAMPTZ,
  tool_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Registrierte externe Tools
CREATE TABLE IF NOT EXISTS ${schema}.mcp_external_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES ${schema}.mcp_server_connections(id) ON DELETE CASCADE,
  tool_name VARCHAR(255) NOT NULL,
  description TEXT,
  input_schema JSONB,
  usage_count INTEGER DEFAULT 0,
  avg_latency_ms FLOAT DEFAULT 0,
  last_used TIMESTAMPTZ,
  UNIQUE(server_id, tool_name)
);
```

**API Endpoints:**

```
GET    /api/:context/mcp/servers              — Liste konfigurierter MCP Server
POST   /api/:context/mcp/servers              — MCP Server hinzufügen
PUT    /api/:context/mcp/servers/:id          — Server-Konfiguration ändern
DELETE /api/:context/mcp/servers/:id          — Server entfernen
POST   /api/:context/mcp/servers/:id/connect  — Verbindung herstellen
POST   /api/:context/mcp/servers/:id/disconnect — Verbindung trennen
GET    /api/:context/mcp/servers/:id/tools    — Tools des Servers listen
GET    /api/:context/mcp/servers/:id/resources — Resources des Servers listen
GET    /api/:context/mcp/servers/:id/health   — Health Check
POST   /api/:context/mcp/tools/:toolId/execute — Externes Tool ausführen
```

### 55.2 MCP Server Upgrade

**Änderungen an `mcp-server.ts`:**

```typescript
// Upgrade: MCP SDK statt eigene JSON-RPC Implementierung
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Neue Capabilities:
// 1. Resources (Ideen, Dokumente, Kalender als MCP Resources)
// 2. Prompts (vordefinierte Prompt-Templates)
// 3. Sampling (Server kann Client um Completions bitten)
// 4. Dynamic Tool Registration
// 5. Notifications (Server → Client Push)

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    { uri: 'zenai://ideas/recent', name: 'Recent Ideas', mimeType: 'application/json' },
    { uri: 'zenai://calendar/today', name: 'Today Calendar', mimeType: 'application/json' },
    { uri: 'zenai://memory/facts', name: 'Learned Facts', mimeType: 'application/json' },
    { uri: 'zenai://emails/unread', name: 'Unread Emails', mimeType: 'application/json' },
  ]
}));

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    { name: 'summarize', description: 'Summarize content', arguments: [{ name: 'content', required: true }] },
    { name: 'translate', description: 'Translate text', arguments: [{ name: 'text' }, { name: 'target_lang' }] },
    { name: 'analyze-sentiment', description: 'Sentiment analysis' },
  ]
}));
```

**Package Dependencies:**

```json
{
  "@modelcontextprotocol/sdk": "^1.12.0"
}
```

### 55.3 Frontend: MCP Connections Page

**Neue Komponente:** `MCPConnectionsPage.tsx`

- Tab in Settings Dashboard (9. Tab: "MCP Servers")
- Server-Liste mit Health-Status (grün/gelb/rot)
- "Add Server" Modal mit Transport-Auswahl
- Tool-Browser pro Server
- Resource-Browser pro Server
- Usage Statistics (Calls, Latenz, Errors)

### 55.4 Tests

| Test-Datei | Tests | Fokus |
|------------|-------|-------|
| `mcp-client.test.ts` | ~25 | Client Lifecycle, Tool Sync, Error Handling |
| `mcp-registry.test.ts` | ~15 | Server CRUD, Health Checks |
| `mcp-transport.test.ts` | ~20 | Transport Layer (HTTP, stdio, SSE) |
| `mcp-tool-bridge.test.ts` | ~15 | External → Internal Tool Bridge |
| `mcp-connections.route.test.ts` | ~20 | API Endpoint Tests |

---

## Phase 56: OAuth 2.1 + JWT + Multi-User Foundation

### Ziel
ZenAI wird Multi-User-fähig mit Industry-Standard Authentication.

### 56.1 User Management

**Neue Dateien:**

| Datei | Zweck |
|-------|-------|
| `backend/src/services/auth/user-service.ts` | User CRUD + Profile Management |
| `backend/src/services/auth/jwt-service.ts` | JWT Access + Refresh Token Management |
| `backend/src/services/auth/oauth-providers.ts` | OAuth 2.1 Provider Integration (Google, Microsoft, GitHub) |
| `backend/src/services/auth/session-store.ts` | Persistent Session Store (Redis/PostgreSQL) |
| `backend/src/middleware/jwt-auth.ts` | JWT Middleware (ersetzt/ergänzt API Key Auth) |
| `backend/src/routes/auth.ts` | Auth Endpoints (Login, Register, OAuth Callbacks, Refresh) |
| `frontend/src/components/AuthPage/AuthPage.tsx` | Login/Register UI |
| `frontend/src/components/AuthPage/OAuthButtons.tsx` | SSO Buttons (Google, Microsoft, GitHub) |
| `frontend/src/hooks/useAuth.ts` | Auth State Management |
| `frontend/src/contexts/AuthContext.tsx` | Auth Context Provider |

**DB Migration:** `phase56_auth.sql`

```sql
-- users Tabelle (public Schema, nicht context-spezifisch)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  password_hash VARCHAR(255),          -- NULL bei OAuth-Only Users
  display_name VARCHAR(255),
  avatar_url TEXT,
  auth_provider VARCHAR(50) DEFAULT 'local', -- local, google, microsoft, github
  auth_provider_id VARCHAR(255),       -- OAuth Provider User ID
  mfa_enabled BOOLEAN DEFAULT false,
  mfa_secret VARCHAR(255),             -- TOTP Secret (verschlüsselt)
  role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'owner')),
  preferences JSONB DEFAULT '{}',
  last_login TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions (persistent, nicht in-memory)
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  refresh_token_hash VARCHAR(255) NOT NULL,
  device_info JSONB DEFAULT '{}',
  ip_address INET,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- OAuth State (persistent, nicht in-memory Map!)
CREATE TABLE IF NOT EXISTS public.oauth_states (
  state VARCHAR(255) PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  redirect_uri TEXT,
  code_verifier VARCHAR(255),          -- PKCE
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '10 minutes'
);

-- API Keys (Migration: user_id hinzufügen)
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id);

-- User-Context Zuordnung (welcher User hat Zugriff auf welchen Context)
CREATE TABLE IF NOT EXISTS public.user_contexts (
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  context VARCHAR(50) NOT NULL CHECK (context IN ('personal', 'work', 'learning', 'creative')),
  role VARCHAR(50) DEFAULT 'owner',
  PRIMARY KEY (user_id, context)
);
```

**JWT Architecture:**

```typescript
// jwt-service.ts
interface TokenPair {
  accessToken: string;   // 15 min Lebensdauer
  refreshToken: string;  // 7 Tage Lebensdauer
  expiresIn: number;
}

class JWTService {
  private readonly ACCESS_TOKEN_TTL = '15m';
  private readonly REFRESH_TOKEN_TTL = '7d';

  generateTokenPair(user: User): TokenPair {
    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: this.ACCESS_TOKEN_TTL, algorithm: 'RS256' }
    );
    const refreshToken = crypto.randomBytes(64).toString('hex');
    // Refresh Token Hash in DB speichern (nicht im Token selbst)
    return { accessToken, refreshToken, expiresIn: 900 };
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    // 1. Hash des Refresh Tokens berechnen
    // 2. In user_sessions suchen
    // 3. Prüfen ob expired/revoked
    // 4. Neues Token Pair generieren
    // 5. Alten Refresh Token invalidieren (Rotation)
  }
}
```

**OAuth 2.1 mit PKCE:**

```typescript
// oauth-providers.ts
class OAuthProviderManager {
  private providers: Map<string, OAuthProvider> = new Map();

  constructor() {
    if (process.env.GOOGLE_CLIENT_ID) {
      this.providers.set('google', new GoogleOAuthProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        redirectUri: `${process.env.API_URL}/api/auth/callback/google`
      }));
    }
    // Microsoft, GitHub analog
  }

  getAuthorizationUrl(provider: string): { url: string; state: string; codeVerifier: string } {
    // PKCE: code_verifier → SHA256 → code_challenge
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    const state = crypto.randomBytes(16).toString('hex');
    // State + codeVerifier in DB speichern (nicht in-memory!)
    return { url, state, codeVerifier };
  }
}
```

**Auth API Endpoints:**

```
POST   /api/auth/register                — Email/Password Registration
POST   /api/auth/login                   — Email/Password Login → Token Pair
POST   /api/auth/refresh                 — Refresh Token → New Token Pair
POST   /api/auth/logout                  — Revoke Session
GET    /api/auth/me                      — Current User Profile
PUT    /api/auth/me                      — Update Profile
GET    /api/auth/providers/:provider     — OAuth Authorization URL
GET    /api/auth/callback/:provider      — OAuth Callback Handler
POST   /api/auth/mfa/setup               — MFA Setup (TOTP)
POST   /api/auth/mfa/verify              — MFA Verification
DELETE /api/auth/sessions/:id            — Revoke Specific Session
GET    /api/auth/sessions                — List Active Sessions
```

**Backward Compatibility:**
- API Key Auth bleibt bestehen (für programmatischen Zugriff)
- JWT Auth wird parallel eingeführt
- `jwt-auth.ts` Middleware prüft: JWT Header → API Key Header → Reject
- Bestehende Single-User-Daten werden dem ersten registrierten User zugeordnet

### 56.2 Tests

| Test-Datei | Tests | Fokus |
|------------|-------|-------|
| `user-service.test.ts` | ~30 | User CRUD, Password Hashing, Profile |
| `jwt-service.test.ts` | ~25 | Token Generation, Refresh, Rotation, Expiry |
| `oauth-providers.test.ts` | ~20 | PKCE, State Management, Callback Handling |
| `jwt-auth.middleware.test.ts` | ~20 | Middleware Integration, Fallback zu API Key |
| `auth.route.test.ts` | ~30 | Full Auth Flow E2E |

---

## Phase 57: Real-Time Voice (WebRTC + TTS Pipeline)

### Ziel
Vollwertige Voice-Experience: Sprechen → Verstehen → Denken → Antworten → Sprechen.

### 57.1 Architecture: Cascading Pipeline (STT → LLM → TTS)

**Warum Cascading statt Speech-to-Speech:**
- Flexibilität: Claude als LLM (kein Voice-Modell)
- Kosten: ~10x günstiger als OpenAI Realtime API
- Qualität: ElevenLabs TTS oder Edge-TTS für Sprachausgabe

**Neue Dateien:**

| Datei | Zweck |
|-------|-------|
| `backend/src/services/voice/voice-pipeline.ts` | Orchestrator: STT → LLM → TTS |
| `backend/src/services/voice/tts-service.ts` | Text-to-Speech (ElevenLabs / Edge-TTS / Coqui) |
| `backend/src/services/voice/stt-service.ts` | Speech-to-Text (Whisper / Deepgram) |
| `backend/src/services/voice/webrtc-signaling.ts` | WebRTC Signaling Server |
| `backend/src/services/voice/turn-taking.ts` | Voice Activity Detection + Turn-Taking |
| `backend/src/services/voice/audio-processor.ts` | Audio Chunking, Format Conversion |
| `backend/src/routes/voice.ts` | Voice API Endpoints |
| `frontend/src/components/VoiceChat/VoiceChat.tsx` | Full Voice Chat UI |
| `frontend/src/components/VoiceChat/AudioVisualizer.tsx` | Waveform Visualizer |
| `frontend/src/hooks/useWebRTC.ts` | WebRTC Client Hook |
| `frontend/src/hooks/useVoiceActivity.ts` | VAD Hook |

**Voice Pipeline Architecture:**

```typescript
// voice-pipeline.ts
class VoicePipeline {
  private sttService: STTService;
  private ttsService: TTSService;
  private turnTaking: TurnTakingEngine;

  async processAudioChunk(chunk: Buffer, sessionId: string): Promise<void> {
    // 1. Voice Activity Detection
    const vad = this.turnTaking.detectActivity(chunk);
    if (vad.isSpeaking) {
      this.buffer.append(chunk);
      return;
    }

    // 2. Speech finished → Transcribe
    if (vad.turnComplete) {
      const audio = this.buffer.flush();
      const transcript = await this.sttService.transcribe(audio);

      // 3. Send to LLM (streaming)
      const stream = await this.llmService.streamChat(transcript, sessionId);

      // 4. Stream TTS in Chunks (nicht auf volle Antwort warten)
      let sentenceBuffer = '';
      for await (const token of stream) {
        sentenceBuffer += token;
        if (this.isSentenceEnd(sentenceBuffer)) {
          const audioChunk = await this.ttsService.synthesize(sentenceBuffer);
          this.sendAudioToClient(sessionId, audioChunk);
          sentenceBuffer = '';
        }
      }
    }
  }
}
```

**TTS Service (Multi-Provider):**

```typescript
// tts-service.ts
interface TTSProvider {
  synthesize(text: string, voice: string): Promise<Buffer>;
  streamSynthesize(text: string, voice: string): AsyncIterable<Buffer>;
}

class TTSService {
  private providers: Map<string, TTSProvider> = new Map();

  constructor() {
    // Provider Priorität: ElevenLabs → Edge-TTS → Coqui
    if (process.env.ELEVENLABS_API_KEY) {
      this.providers.set('elevenlabs', new ElevenLabsProvider());
    }
    // Edge-TTS (kostenlos, Microsoft) als Fallback
    this.providers.set('edge-tts', new EdgeTTSProvider());
  }
}
```

**WebRTC Signaling:**

```typescript
// webrtc-signaling.ts — WebSocket-basierter Signaling Server
import { WebSocketServer } from 'ws';

class WebRTCSignaling {
  private wss: WebSocketServer;

  constructor(server: http.Server) {
    this.wss = new WebSocketServer({ server, path: '/ws/voice' });
    this.wss.on('connection', this.handleConnection.bind(this));
  }

  private handleConnection(ws: WebSocket, req: http.IncomingMessage) {
    // Auth via query param token
    // SDP Offer/Answer Exchange
    // ICE Candidate Exchange
    // Audio Stream Processing
  }
}
```

**Voice API Endpoints:**

```
POST   /api/voice/session/start            — Start Voice Session
POST   /api/voice/session/end              — End Voice Session
GET    /api/voice/session/:id/status       — Session Status
POST   /api/voice/tts                      — One-Shot TTS
GET    /api/voice/voices                   — Available TTS Voices
PUT    /api/voice/settings                 — Voice Preferences
WS     /ws/voice                           — WebSocket für WebRTC Signaling
```

**Frontend Voice Chat:**

```typescript
// VoiceChat.tsx — Kernkomponente
const VoiceChat: React.FC = () => {
  const { peerConnection, audioStream, isConnected } = useWebRTC();
  const { isSpeaking, volume } = useVoiceActivity(audioStream);

  return (
    <div className="voice-chat">
      <AudioVisualizer volume={volume} isSpeaking={isSpeaking} />
      <div className="voice-controls">
        <button onClick={toggleMute}>
          {isMuted ? <MicOff /> : <Mic />}
        </button>
        <button onClick={endSession}>
          <PhoneOff />
        </button>
      </div>
      <TranscriptPanel messages={transcript} />
    </div>
  );
};
```

**Environment Variables:**

```bash
ELEVENLABS_API_KEY=...              # Optional: Premium TTS
ELEVENLABS_VOICE_ID=...             # Default Voice
DEEPGRAM_API_KEY=...                # Optional: Alternative STT
VOICE_STT_PROVIDER=whisper          # whisper | deepgram
VOICE_TTS_PROVIDER=edge-tts         # elevenlabs | edge-tts | coqui
```

### 57.2 Tests

| Test-Datei | Tests | Fokus |
|------------|-------|-------|
| `voice-pipeline.test.ts` | ~25 | Pipeline Orchestration, Chunking |
| `tts-service.test.ts` | ~20 | Multi-Provider, Fallback |
| `stt-service.test.ts` | ~15 | Transcription, Language Detection |
| `turn-taking.test.ts` | ~15 | VAD, Silence Detection |
| `voice.route.test.ts` | ~20 | API Endpoints |

---

## Phase 58: GraphRAG + Hybrid Retrieval

### Ziel
Microsoft GraphRAG Pattern implementieren und mit bestehendem Agentic RAG kombinieren.

### 58.1 Graph Building Pipeline

**Neue Dateien:**

| Datei | Zweck |
|-------|-------|
| `backend/src/services/knowledge-graph/graph-builder.ts` | Automatische Graph-Extraktion aus Text |
| `backend/src/services/knowledge-graph/community-summarizer.ts` | Community Detection + hierarchische Summaries |
| `backend/src/services/knowledge-graph/hybrid-retriever.ts` | Hybrid Graph+Vector Retrieval |
| `backend/src/services/knowledge-graph/graph-indexer.ts` | Background Graph Indexing Job |

**Graph Builder Architecture:**

```typescript
// graph-builder.ts — Automatische Entity/Relation Extraktion
class GraphBuilder {
  async extractFromText(text: string, sourceId: string): Promise<GraphExtractionResult> {
    // 1. Entity Extraction via Claude
    const entities = await this.extractEntities(text);

    // 2. Relation Extraction
    const relations = await this.extractRelations(text, entities);

    // 3. Entity Resolution (Deduplizierung)
    const resolvedEntities = await this.resolveEntities(entities);

    // 4. Graph Update
    await this.upsertToGraph(resolvedEntities, relations, sourceId);

    return { entities: resolvedEntities, relations };
  }

  private async extractEntities(text: string): Promise<Entity[]> {
    const prompt = `Extract all named entities from the following text.
    For each entity, provide:
    - name: The entity name
    - type: One of [person, organization, concept, technology, location, event, product]
    - description: Brief description
    - importance: 1-10

    Return as JSON array.`;

    return this.claude.extract(prompt, text);
  }

  private async extractRelations(text: string, entities: Entity[]): Promise<Relation[]> {
    const prompt = `Given these entities: ${JSON.stringify(entities.map(e => e.name))}
    Extract relationships between them from the text.
    For each relation, provide:
    - source: Entity name
    - target: Entity name
    - type: One of [supports, contradicts, causes, requires, part_of, similar_to, created_by, used_by]
    - description: Brief description
    - strength: 0.0-1.0

    Return as JSON array.`;

    return this.claude.extract(prompt, text);
  }

  private async resolveEntities(entities: Entity[]): Promise<Entity[]> {
    // Embedding-basierte Deduplizierung
    // "JavaScript" und "JS" → gleiche Entity
    // Threshold: Cosine Similarity > 0.92
  }
}
```

**Community Summarizer (GraphRAG Pattern):**

```typescript
// community-summarizer.ts
class CommunitySummarizer {
  async buildCommunitySummaries(context: string): Promise<CommunitySummary[]> {
    // 1. Community Detection (Label Propagation aus graph-reasoning.ts)
    const communities = await this.graphReasoning.detectCommunities(context);

    // 2. Hierarchische Summarisierung
    const summaries: CommunitySummary[] = [];

    for (const community of communities) {
      // Level 0: Einzelne Entity-Beschreibungen
      const entityDescriptions = community.nodes.map(n => n.description);

      // Level 1: Community Summary
      const summary = await this.claude.summarize({
        prompt: `Summarize this knowledge cluster:
          Entities: ${community.nodes.map(n => n.name).join(', ')}
          Key relationships: ${community.edges.map(e => `${e.source} → ${e.type} → ${e.target}`).join('; ')}
          Descriptions: ${entityDescriptions.join(' ')}

          Provide a comprehensive summary of what this knowledge cluster represents,
          key themes, and important connections.`,
      });

      summaries.push({
        communityId: community.id,
        level: 1,
        summary,
        entityCount: community.nodes.length,
        edgeCount: community.edges.length,
        updatedAt: new Date()
      });
    }

    return summaries;
  }
}
```

**Hybrid Retriever:**

```typescript
// hybrid-retriever.ts
class HybridRetriever {
  async retrieve(query: string, context: string): Promise<RetrievalResult[]> {
    // Parallel: 4 Retrieval-Strategien
    const [vectorResults, graphResults, communitySummaries, bm25Results] = await Promise.all([
      // 1. Vector Semantic Search (bestehend)
      this.semanticSearch(query, context),

      // 2. Graph Traversal (Entity → Relations → Connected Entities)
      this.graphTraversal(query, context),

      // 3. Community Summary Search (GraphRAG Pattern)
      this.searchCommunitySummaries(query, context),

      // 4. BM25 Keyword Search (NEU)
      this.bm25Search(query, context)
    ]);

    // Merge + Deduplicate + Rerank
    const merged = this.mergeResults(vectorResults, graphResults, communitySummaries, bm25Results);
    const reranked = await this.crossEncoderRerank(query, merged);

    return reranked;
  }

  private async graphTraversal(query: string, context: string): Promise<RetrievalResult[]> {
    // 1. Entity Extraction aus Query
    const queryEntities = await this.extractQueryEntities(query);

    // 2. Graph Lookup: Matching Entities finden
    const matchedEntities = await this.findMatchingEntities(queryEntities, context);

    // 3. 2-Hop Traversal: Relations + Connected Entities
    const subgraph = await this.traverseGraph(matchedEntities, context, { maxHops: 2 });

    // 4. Subgraph → Text Context
    return this.subgraphToContext(subgraph);
  }
}
```

**DB Migration:** `phase58_graphrag.sql`

```sql
-- Entities Tabelle (zusätzlich zu idea_relations)
CREATE TABLE IF NOT EXISTS ${schema}.knowledge_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(500) NOT NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT,
  importance INTEGER DEFAULT 5,
  embedding vector(1536),
  source_ids UUID[] DEFAULT '{}',  -- Welche Ideas/Dokumente referenzieren diese Entity
  mention_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_embedding ON ${schema}.knowledge_entities
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_entities_type ON ${schema}.knowledge_entities(type);
CREATE INDEX idx_entities_name ON ${schema}.knowledge_entities(name);

-- Entity Relations (dedizierte Graph-Kanten)
CREATE TABLE IF NOT EXISTS ${schema}.entity_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_id UUID REFERENCES ${schema}.knowledge_entities(id) ON DELETE CASCADE,
  target_entity_id UUID REFERENCES ${schema}.knowledge_entities(id) ON DELETE CASCADE,
  relation_type VARCHAR(100) NOT NULL,
  description TEXT,
  strength FLOAT DEFAULT 0.5,
  source_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_entity_id, target_entity_id, relation_type)
);

-- Community Summaries
CREATE TABLE IF NOT EXISTS ${schema}.graph_communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_level INTEGER DEFAULT 1,
  entity_ids UUID[] NOT NULL,
  summary TEXT NOT NULL,
  summary_embedding vector(1536),
  entity_count INTEGER,
  edge_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_communities_embedding ON ${schema}.graph_communities
  USING ivfflat (summary_embedding vector_cosine_ops) WITH (lists = 50);
```

**Integration in Enhanced RAG:**

```typescript
// enhanced-rag.ts — Erweiterung
async enhancedRetrieve(query: string, context: string): Promise<EnhancedResult> {
  const [hydeResults, agenticResults, graphRAGResults] = await Promise.all([
    this.hydeRetrieve(query, context),
    this.agenticRetrieve(query, context),
    this.hybridRetriever.retrieve(query, context) // NEU: GraphRAG
  ]);

  return this.mergeAndRerank(hydeResults, agenticResults, graphRAGResults);
}
```

### 58.2 Tests

| Test-Datei | Tests | Fokus |
|------------|-------|-------|
| `graph-builder.test.ts` | ~25 | Entity/Relation Extraction, Resolution |
| `community-summarizer.test.ts` | ~15 | Community Detection + Summary |
| `hybrid-retriever.test.ts` | ~25 | 4-Strategy Retrieval, Merge, Rerank |
| `graph-indexer.test.ts` | ~10 | Background Indexing Jobs |

---

## Phase 59: Memory Excellence

### Ziel
Memory-System auf Letta/Hindsight-Level heben.

### 59.1 Procedural Memory

**Neue Datei:** `backend/src/services/memory/procedural-memory.ts`

```typescript
// Speichert "wie mache ich X?" aus vergangenen Aktionen
class ProceduralMemory {
  async recordProcedure(context: string, procedure: {
    trigger: string;      // "User fragte nach Wetterdaten"
    steps: string[];      // ["web_search aufgerufen", "Ergebnis formatiert", ...]
    tools_used: string[];
    outcome: 'success' | 'partial' | 'failure';
    duration_ms: number;
  }): Promise<void>;

  async recallProcedure(context: string, situation: string): Promise<Procedure[]> {
    // Semantic Search: Ähnliche Situationen finden
    // Return: Bewährte Vorgehensweisen
  }

  async optimizeProcedure(procedureId: string, feedback: {
    useful: boolean;
    improvements?: string;
  }): Promise<void>;
}
```

### 59.2 BM25 Retrieval für Memory

```typescript
// Parallel zu Semantic Search: BM25 für exakte Keyword-Matches
class MemoryBM25 {
  async search(query: string, context: string): Promise<MemoryResult[]> {
    // PostgreSQL ts_rank + to_tsvector für BM25-ähnliches Ranking
    const sql = `
      SELECT *, ts_rank(to_tsvector('german', content), plainto_tsquery('german', $1)) as rank
      FROM ${context}.learned_facts
      WHERE to_tsvector('german', content) @@ plainto_tsquery('german', $1)
      ORDER BY rank DESC
      LIMIT 10
    `;
  }
}
```

### 59.3 Entity Resolution

```typescript
// Aus Hindsight-Architektur: Fakten → Entity-Auflösung
class EntityResolver {
  async resolveFromFact(fact: string): Promise<ResolvedEntity[]> {
    // 1. NER (Named Entity Recognition) via Claude
    // 2. Entity Linking: Neue Entity oder existierende?
    // 3. Embedding-basierte Similarity (> 0.92 = gleiche Entity)
    // 4. Merge mit bestehendem Knowledge Graph
  }
}
```

### 59.4 Memory als MCP Resource

```typescript
// Memory über MCP exponieren (Standard 2026)
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === 'zenai://memory/facts') {
    const facts = await longTermMemory.getRecentFacts(context, 50);
    return { contents: [{ text: JSON.stringify(facts), mimeType: 'application/json' }] };
  }
  if (request.params.uri === 'zenai://memory/working') {
    const items = await workingMemory.getActiveItems(context);
    return { contents: [{ text: JSON.stringify(items), mimeType: 'application/json' }] };
  }
});
```

---

## Phase 60: A2A Protocol Foundation

### Ziel
ZenAI-Agents werden über A2A Protocol erreichbar und können externe Agents aufrufen.

### 60.1 A2A Server Implementation

**Neue Dateien:**

| Datei | Zweck |
|-------|-------|
| `backend/src/services/a2a/a2a-server.ts` | A2A Server Core |
| `backend/src/services/a2a/agent-card.ts` | Agent Card Generator |
| `backend/src/services/a2a/task-manager.ts` | A2A Task Lifecycle |
| `backend/src/services/a2a/a2a-client.ts` | A2A Client (externe Agents aufrufen) |
| `backend/src/routes/a2a.ts` | A2A API Endpoints |

**Agent Card (Discovery):**

```json
{
  "name": "ZenAI Assistant",
  "description": "Enterprise AI Platform with RAG, Memory, and Multi-Agent capabilities",
  "url": "https://ki-ab-production.up.railway.app/api/a2a",
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  },
  "authentication": {
    "schemes": ["bearer"]
  },
  "skills": [
    {
      "id": "research",
      "name": "Deep Research",
      "description": "Multi-agent research with RAG and knowledge graph",
      "inputModes": ["text"],
      "outputModes": ["text"]
    },
    {
      "id": "code-review",
      "name": "Code Review & Analysis",
      "description": "Code analysis, bug detection, and improvement suggestions",
      "inputModes": ["text"],
      "outputModes": ["text"]
    },
    {
      "id": "knowledge-query",
      "name": "Knowledge Base Query",
      "description": "Query personal knowledge base with semantic search",
      "inputModes": ["text"],
      "outputModes": ["text"]
    }
  ]
}
```

**A2A Task Lifecycle:**

```typescript
// task-manager.ts
class A2ATaskManager {
  async createTask(request: A2ATaskRequest): Promise<A2ATask> {
    // Status: submitted → working → completed/failed
    const task = await this.persistTask(request);
    this.processTask(task); // Async
    return task;
  }

  private async processTask(task: A2ATask): Promise<void> {
    await this.updateStatus(task.id, 'working');

    // Route zu internem Agent-System
    const result = await this.agentOrchestrator.execute({
      task: task.message.parts.map(p => p.text).join('\n'),
      strategy: this.mapSkillToStrategy(task.skill)
    });

    // A2A Artifact generieren
    const artifact = {
      parts: [{ type: 'text', text: result.content }],
      metadata: { tokens_used: result.tokensUsed }
    };

    await this.completeTask(task.id, artifact);
  }
}
```

**A2A Endpoints:**

```
GET    /.well-known/agent.json             — Agent Card (Discovery)
POST   /api/a2a/tasks                      — Create Task
GET    /api/a2a/tasks/:id                  — Get Task Status
POST   /api/a2a/tasks/:id/messages         — Send Message to Task
GET    /api/a2a/tasks/:id/stream           — SSE Task Progress
DELETE /api/a2a/tasks/:id                  — Cancel Task
```

---

## Phase 61: Observability + Queue + Performance

### Ziel
Production-Grade Observability und Non-Blocking Processing.

### 61.1 OpenTelemetry Integration

**Neue Datei:** `backend/src/services/observability/tracing.ts`

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter()
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-pg': { enabled: true },
    })
  ]
});
sdk.start();
```

**Custom AI Metrics:**

```typescript
// ai-metrics.ts
const meter = metrics.getMeter('zenai-ai');

const tokenCounter = meter.createCounter('ai.tokens.total', {
  description: 'Total tokens consumed by AI operations'
});

const ragLatency = meter.createHistogram('ai.rag.latency', {
  description: 'RAG retrieval latency in ms'
});

const agentDuration = meter.createHistogram('ai.agent.duration', {
  description: 'Agent execution duration in ms'
});

const toolCallCounter = meter.createCounter('ai.tool.calls', {
  description: 'Tool invocations'
});
```

### 61.2 BullMQ Queue

**Neue Dateien:**

| Datei | Zweck |
|-------|-------|
| `backend/src/services/queue/queue-service.ts` | BullMQ Queue Manager |
| `backend/src/services/queue/workers/agent-worker.ts` | Agent Execution Worker |
| `backend/src/services/queue/workers/graph-worker.ts` | Graph Indexing Worker |
| `backend/src/services/queue/workers/email-worker.ts` | Email Processing Worker |

```typescript
// queue-service.ts
import { Queue, Worker, QueueEvents } from 'bullmq';

class QueueService {
  private queues: Map<string, Queue> = new Map();

  constructor() {
    const connection = { url: process.env.REDIS_URL };

    this.queues.set('agent-execution', new Queue('agent-execution', { connection }));
    this.queues.set('graph-indexing', new Queue('graph-indexing', { connection }));
    this.queues.set('email-processing', new Queue('email-processing', { connection }));
    this.queues.set('memory-consolidation', new Queue('memory-consolidation', { connection }));
  }

  async enqueue(queueName: string, jobName: string, data: unknown, opts?: JobOptions): Promise<Job> {
    const queue = this.queues.get(queueName);
    return queue.add(jobName, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      ...opts
    });
  }
}
```

### 61.3 Distributed Rate Limiting

```typescript
// Redis-backed Rate Limiter (statt In-Memory Fallback)
import { RateLimiterRedis } from 'rate-limiter-flexible';

const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  points: 100,         // Requests
  duration: 60,        // Per Minute
  blockDuration: 60,   // Block für 1 Minute bei Überschreitung
  keyPrefix: 'rl',
});
```

---

## Phase 62: Enterprise Security + PWA

### 62.1 Data-at-Rest Encryption

```typescript
// encryption-service.ts
class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';

  // Verschlüsselt sensitive Felder vor DB-Write
  encrypt(plaintext: string): { ciphertext: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.getKey(), iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return {
      ciphertext: encrypted,
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex')
    };
  }

  private getKey(): Buffer {
    // Key aus KMS oder Environment Variable
    return Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
  }
}
```

### 62.2 PWA Configuration

**Neue Dateien:**

| Datei | Zweck |
|-------|-------|
| `frontend/public/manifest.json` | PWA Manifest |
| `frontend/src/sw.ts` | Service Worker |
| `frontend/vite.config.ts` | VitePWA Plugin |

```json
// manifest.json
{
  "name": "ZenAI",
  "short_name": "ZenAI",
  "description": "Enterprise AI Platform",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#6366f1",
  "background_color": "#0f172a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

```typescript
// Service Worker: Cache-First für Static Assets, Network-First für API
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({ cacheName: 'api-cache', networkTimeoutSeconds: 3 })
);

registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({ cacheName: 'image-cache' })
);
```

---

## Phase 63: Sleep-Time Compute + Advanced Context Engineering

### Ziel
ZenAI-Agents verarbeiten Informationen proaktiv im Idle und optimieren Context Assembly dynamisch.

### 63.1 Sleep-Time Compute Engine

**Neue Dateien:**

| Datei | Zweck |
|-------|-------|
| `backend/src/services/memory/sleep-compute.ts` | Background Memory Processing |
| `backend/src/services/memory/memory-rewriter.ts` | Proaktives Memory Rewriting |
| `backend/src/services/queue/workers/sleep-worker.ts` | BullMQ Worker für Background Jobs |

**Architecture (Letta-Paradigm):**

```typescript
// sleep-compute.ts
class SleepComputeEngine {
  // Wird per Cron oder Event ausgelöst wenn System idle ist
  async runSleepCycle(context: string): Promise<SleepCycleResult> {
    const results: SleepCycleResult = { processed: 0, insights: [], memoryUpdates: [] };

    // 1. Episodic Memory Consolidation
    //    Ähnliche Episoden zusammenfassen → Long-Term Facts
    const recentEpisodes = await this.episodicMemory.getUnconsolidated(context, 50);
    const patterns = await this.findPatterns(recentEpisodes);
    for (const pattern of patterns) {
      await this.longTermMemory.storeFact(context, {
        content: pattern.insight,
        confidence: pattern.confidence,
        source: 'sleep_compute',
        decay_class: pattern.confidence > 0.8 ? 'slow_decay' : 'normal_decay'
      });
      results.insights.push(pattern);
    }

    // 2. Memory Contradiction Detection
    //    Widersprüchliche Fakten identifizieren und auflösen
    const contradictions = await this.detectContradictions(context);
    for (const contradiction of contradictions) {
      // Neueres Faktum gewinnt, älteres wird downgraded
      await this.resolveContradiction(context, contradiction);
    }

    // 3. Working Memory Pre-Loading
    //    Basierend auf Tageszeit + Wochentag + User-Patterns
    //    relevante Fakten in Working Memory laden
    const predictedNeeds = await this.predictUserNeeds(context);
    for (const need of predictedNeeds) {
      await this.workingMemory.preload(context, need);
    }

    // 4. Procedural Memory Optimization
    //    Erfolgreiche Tool-Chains identifizieren
    const toolChains = await this.analyzeToolUsage(context);
    for (const chain of toolChains) {
      if (chain.successRate > 0.8) {
        await this.proceduralMemory.recordOptimalChain(context, chain);
      }
    }

    // 5. Entity Graph Maintenance
    //    Neue Entities aus kürzlichen Interaktionen extrahieren
    const unprocessedContent = await this.getUnprocessedContent(context);
    for (const content of unprocessedContent) {
      await this.graphBuilder.extractFromText(content.text, content.sourceId);
    }

    return results;
  }

  private async predictUserNeeds(context: string): Promise<PredictedNeed[]> {
    // Analyse: Wann fragt der User typischerweise was?
    // Montag morgen → Work Tasks
    // Freitag abend → Personal Projekte
    // Nach Meeting → Meeting Notes
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();

    const patterns = await this.queryContext(context, `
      SELECT content, COUNT(*) as freq,
             EXTRACT(DOW FROM created_at) as dow,
             EXTRACT(HOUR FROM created_at) as hour
      FROM ${context}.episodic_memories
      WHERE EXTRACT(DOW FROM created_at) = $1
        AND ABS(EXTRACT(HOUR FROM created_at) - $2) < 2
      GROUP BY content, dow, hour
      ORDER BY freq DESC LIMIT 10
    `, [dayOfWeek, hour]);

    return patterns.rows.map(row => ({
      content: row.content,
      frequency: row.freq,
      confidence: Math.min(row.freq / 10, 1.0)
    }));
  }
}
```

**Scheduling:**

```typescript
// Integration mit bestehenden Cron-Jobs
// backend/src/main.ts
import { SleepComputeEngine } from './services/memory/sleep-compute';

// Jede Stunde wenn System idle (< 5 Requests in letzten 10 Min)
const sleepSchedule = cron.schedule('0 * * * *', async () => {
  if (await isSystemIdle()) {
    for (const context of ['personal', 'work', 'learning', 'creative']) {
      await queueService.enqueue('memory-consolidation', 'sleep-cycle', { context });
    }
  }
});
```

### 63.2 Advanced Context Engineering

**Neue Datei:** `backend/src/services/context-engine-v2.ts`

```typescript
// ML-basierte Domain Classification (statt Regex)
class ContextEngineV2 {
  // Ersetze Regex durch Embedding-basierte Classification
  async classifyDomain(query: string): Promise<{ domain: ContextDomain; confidence: number }> {
    // 1. Query Embedding generieren
    const queryEmbedding = await this.generateEmbedding(query);

    // 2. Gegen Domain-Centroid-Embeddings vergleichen
    const domainScores = await this.queryContext('personal', `
      SELECT domain, 1 - (centroid_embedding <=> $1::vector) as similarity
      FROM public.domain_centroids
      ORDER BY similarity DESC
    `, [queryEmbedding]);

    return {
      domain: domainScores.rows[0].domain,
      confidence: domainScores.rows[0].similarity
    };
  }

  // Multi-Model Routing: Verschiedene Modelle für verschiedene Tasks
  async selectModel(domain: ContextDomain, complexity: number): Promise<ModelConfig> {
    // Simple Queries → Haiku (schnell, günstig)
    // Complex Reasoning → Sonnet (balanced)
    // Critical Decisions → Opus (maximum quality)
    if (complexity < 0.3) return { model: 'claude-haiku-4-5-20251001', maxTokens: 2048 };
    if (complexity < 0.7) return { model: 'claude-sonnet-4-6', maxTokens: 4096 };
    return { model: 'claude-opus-4-6', maxTokens: 8192 };
  }

  // Minimum Viable Context (MVC): Nur so viel Context wie nötig
  async assembleMinimalContext(query: string, context: string): Promise<AssembledContext> {
    const domain = await this.classifyDomain(query);
    const model = await this.selectModel(domain.domain, await this.estimateComplexity(query));

    // Token Budget basierend auf Model + Complexity
    const totalBudget = model.maxTokens * 0.6; // 60% für Context, 40% für Response

    // Prioritized Context Sources
    const sources = await this.getActiveRules(context, domain.domain);
    let usedTokens = 0;
    const contextParts: ContextPart[] = [];

    for (const source of sources.sort((a, b) => b.priority - a.priority)) {
      if (usedTokens >= totalBudget) break;
      const data = await this.executeDataSource(source, context, query);
      const tokens = this.estimateTokens(data);
      if (usedTokens + tokens <= totalBudget) {
        contextParts.push({ source: source.name, data, tokens });
        usedTokens += tokens;
      }
    }

    return { parts: contextParts, totalTokens: usedTokens, model, domain };
  }
}
```

**DB Migration:** `phase63_sleep_compute.sql`

```sql
-- Domain Centroids für ML-basierte Classification
CREATE TABLE IF NOT EXISTS public.domain_centroids (
  domain VARCHAR(50) PRIMARY KEY,
  centroid_embedding vector(1536),
  sample_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sleep Compute Tracking
CREATE TABLE IF NOT EXISTS ${schema}.sleep_compute_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_type VARCHAR(50) NOT NULL,
  processed_items INTEGER DEFAULT 0,
  insights_generated INTEGER DEFAULT 0,
  contradictions_resolved INTEGER DEFAULT 0,
  memory_updates INTEGER DEFAULT 0,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Procedural Memory
CREATE TABLE IF NOT EXISTS ${schema}.procedural_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_pattern TEXT NOT NULL,
  steps JSONB NOT NULL,
  tools_used TEXT[] DEFAULT '{}',
  success_rate FLOAT DEFAULT 0,
  execution_count INTEGER DEFAULT 0,
  avg_duration_ms FLOAT DEFAULT 0,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_procedural_embedding ON ${schema}.procedural_memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
```

---

## Phase 64: Agent Identity + LangGraph-Style State Machine

### Ziel
Agents als First-Class Identities mit Graph-basiertem Workflow Management.

### 64.1 Agent Identity System

**Neue Dateien:**

| Datei | Zweck |
|-------|-------|
| `backend/src/services/agents/agent-identity.ts` | Agent Identity Management |
| `backend/src/services/agents/agent-permissions.ts` | Scoped Access Control per Agent |
| `backend/src/services/agents/agent-runtime-guard.ts` | Runtime Guardrails |

```typescript
// agent-identity.ts
interface AgentIdentity {
  id: string;
  name: string;
  role: 'researcher' | 'writer' | 'reviewer' | 'coder' | 'custom';
  model: string;                    // Welches LLM
  permissions: AgentPermission[];   // Welche Tools/Daten erlaubt
  maxTokenBudget: number;           // Token-Limit pro Execution
  maxExecutionTime: number;         // Timeout
  trustLevel: 'low' | 'medium' | 'high';
  governancePolicy: string;        // Welche Governance-Policy gilt
  createdBy: string;               // User ID
}

interface AgentPermission {
  resource: string;     // 'tools.*', 'tools.web_search', 'data.emails', etc.
  actions: ('read' | 'write' | 'execute')[];
  conditions?: {
    maxCallsPerMinute?: number;
    requiresApproval?: boolean;
    allowedContexts?: string[];
  };
}

class AgentIdentityService {
  async createAgent(identity: AgentIdentity): Promise<AgentIdentity> {
    // Persist in DB
    // Generate Agent-specific API credentials
    // Register with Governance System
  }

  async validateAction(agentId: string, action: AgentAction): Promise<ValidationResult> {
    const identity = await this.getIdentity(agentId);

    // 1. Permission Check
    const hasPermission = this.checkPermission(identity, action);
    if (!hasPermission) return { allowed: false, reason: 'insufficient_permissions' };

    // 2. Rate Limit Check
    const withinLimits = await this.checkRateLimit(agentId, action);
    if (!withinLimits) return { allowed: false, reason: 'rate_limited' };

    // 3. Governance Check (High-Impact Actions)
    if (identity.trustLevel === 'low' || action.impactLevel === 'high') {
      const approval = await this.governanceService.requestApproval({
        agentId,
        action: action.type,
        details: action.details,
        riskLevel: action.impactLevel
      });
      if (approval.status !== 'approved') {
        return { allowed: false, reason: 'governance_pending', approvalId: approval.id };
      }
    }

    return { allowed: true };
  }
}
```

### 64.2 LangGraph-Style State Machine

**Neue Dateien:**

| Datei | Zweck |
|-------|-------|
| `backend/src/services/agents/agent-graph.ts` | Graph-basierte Agent Workflows |
| `backend/src/services/agents/state-machine.ts` | State Machine Engine |
| `backend/src/services/agents/graph-nodes.ts` | Reusable Graph Nodes |

```typescript
// agent-graph.ts — LangGraph-inspirierte Architektur
interface GraphNode {
  id: string;
  type: 'agent' | 'tool' | 'condition' | 'human_review';
  config: {
    agentRole?: string;
    toolName?: string;
    condition?: (state: WorkflowState) => string; // Returns next node ID
  };
}

interface GraphEdge {
  from: string;
  to: string;
  condition?: string; // Label für bedingten Übergang
}

class AgentGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: GraphEdge[] = [];

  addNode(node: GraphNode): this { this.nodes.set(node.id, node); return this; }
  addEdge(edge: GraphEdge): this { this.edges.push(edge); return this; }

  async execute(state: WorkflowState): Promise<WorkflowResult> {
    let currentNode = this.getStartNode();

    while (currentNode) {
      // Checkpoint State
      await this.checkpointService.save(state.executionId, currentNode.id, state);

      switch (currentNode.type) {
        case 'agent':
          state = await this.executeAgent(currentNode, state);
          break;
        case 'tool':
          state = await this.executeTool(currentNode, state);
          break;
        case 'condition':
          // Supervisor Pattern: Condition entscheidet nächsten Node
          const nextNodeId = currentNode.config.condition!(state);
          currentNode = this.nodes.get(nextNodeId)!;
          continue;
        case 'human_review':
          // Pause + Governance Approval Request
          state = await this.requestHumanReview(currentNode, state);
          break;
      }

      // Progress Event emittieren
      this.emitProgress(state.executionId, currentNode.id, state);

      // Nächsten Node finden
      currentNode = this.getNextNode(currentNode.id, state);
    }

    return { state, completedAt: new Date() };
  }
}

// Beispiel: Research + Review + Publish Workflow
const researchWorkflow = new AgentGraph()
  .addNode({ id: 'classify', type: 'condition', config: {
    condition: (state) => state.complexity > 0.7 ? 'deep_research' : 'quick_research'
  }})
  .addNode({ id: 'deep_research', type: 'agent', config: { agentRole: 'researcher' } })
  .addNode({ id: 'quick_research', type: 'agent', config: { agentRole: 'researcher' } })
  .addNode({ id: 'write', type: 'agent', config: { agentRole: 'writer' } })
  .addNode({ id: 'review', type: 'agent', config: { agentRole: 'reviewer' } })
  .addNode({ id: 'quality_gate', type: 'condition', config: {
    condition: (state) => state.reviewScore > 0.8 ? 'publish' : 'revise'
  }})
  .addNode({ id: 'revise', type: 'agent', config: { agentRole: 'writer' } })
  .addNode({ id: 'human_approval', type: 'human_review', config: {} })
  .addNode({ id: 'publish', type: 'tool', config: { toolName: 'create_idea' } })
  .addEdge({ from: 'classify', to: 'deep_research', condition: 'complex' })
  .addEdge({ from: 'classify', to: 'quick_research', condition: 'simple' })
  .addEdge({ from: 'deep_research', to: 'write' })
  .addEdge({ from: 'quick_research', to: 'write' })
  .addEdge({ from: 'write', to: 'review' })
  .addEdge({ from: 'review', to: 'quality_gate' })
  .addEdge({ from: 'quality_gate', to: 'publish', condition: 'pass' })
  .addEdge({ from: 'quality_gate', to: 'revise', condition: 'fail' })
  .addEdge({ from: 'revise', to: 'review' }) // Loop zurück
  .addEdge({ from: 'publish', to: 'human_approval' });
```

**DB Migration:** `phase64_agent_identity.sql`

```sql
-- Agent Identities
CREATE TABLE IF NOT EXISTS public.agent_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]',
  max_token_budget INTEGER DEFAULT 10000,
  max_execution_time_ms INTEGER DEFAULT 120000,
  trust_level VARCHAR(20) DEFAULT 'medium',
  governance_policy_id UUID,
  created_by UUID,
  enabled BOOLEAN DEFAULT true,
  execution_count INTEGER DEFAULT 0,
  success_rate FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent Workflow Graphs (gespeicherte Workflows)
CREATE TABLE IF NOT EXISTS public.agent_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  graph_definition JSONB NOT NULL,  -- Nodes + Edges
  created_by UUID,
  usage_count INTEGER DEFAULT 0,
  avg_duration_ms FLOAT DEFAULT 0,
  success_rate FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent Action Logs (für Rate Limiting + Audit)
CREATE TABLE IF NOT EXISTS public.agent_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.agent_identities(id),
  action_type VARCHAR(100) NOT NULL,
  resource VARCHAR(255),
  result VARCHAR(20) NOT NULL CHECK (result IN ('allowed', 'denied', 'pending')),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_actions_agent ON public.agent_action_logs(agent_id, created_at DESC);
CREATE INDEX idx_agent_actions_type ON public.agent_action_logs(action_type, created_at DESC);
```

### 64.3 Tests

| Test-Datei | Tests | Fokus |
|------------|-------|-------|
| `agent-identity.test.ts` | ~25 | Identity CRUD, Credential Generation |
| `agent-permissions.test.ts` | ~20 | Permission Checking, Rate Limiting |
| `agent-graph.test.ts` | ~30 | Graph Execution, Conditional Routing, Loops |
| `state-machine.test.ts` | ~15 | State Checkpointing, Resume |
| `sleep-compute.test.ts` | ~25 | Sleep Cycle, Pattern Detection, Pre-loading |
| `context-engine-v2.test.ts` | ~20 | Embedding Classification, Model Routing, MVC |

---

## Zusammenfassung: Erwartetes Ergebnis nach allen 10 Phasen

| Dimension | Vorher | Nachher | Delta |
|-----------|--------|---------|-------|
| **RAG Pipeline** | 8/10 | 9.5/10 | +1.5 |
| **Memory Architecture** | 7/10 | 9.5/10 | +2.5 |
| **Multi-Agent System** | 7/10 | 9.5/10 | +2.5 |
| **MCP Integration** | 5/10 | 9/10 | +4 |
| **A2A Protocol** | 0/10 | 7/10 | +7 |
| **Real-Time Voice** | 2/10 | 8/10 | +6 |
| **Authentication/Identity** | 4/10 | 9/10 | +5 |
| **E2E Encryption** | 1/10 | 8/10 | +7 |
| **Observability** | 5/10 | 9/10 | +4 |
| **Edge/Local AI** | 1/10 | 3/10 | +2 |
| **GraphRAG** | 3/10 | 8.5/10 | +5.5 |
| **Governance/Trust** | 6/10 | 8.5/10 | +2.5 |
| **Real-Time Collaboration** | 0/10 | 2/10 | +2 |
| **Offline-First** | 2/10 | 7/10 | +5 |
| **Performance/Scaling** | 4/10 | 7.5/10 | +3.5 |
| **Context Engineering** | 5/10 | 9/10 | +4 |
| **Sleep-Time Compute** | 0/10 | 8/10 | +8 |
| **Agent Identity** | 3/10 | 8.5/10 | +5.5 |

**Durchschnitt: 3.4/10 → 8.1/10 (+4.7 Punkte)**

### Neue Dependencies (geschätzt)

```json
{
  "@modelcontextprotocol/sdk": "^1.12.0",
  "bullmq": "^5.x",
  "jsonwebtoken": "^9.x",
  "@opentelemetry/sdk-node": "^1.x",
  "@opentelemetry/auto-instrumentations-node": "^0.x",
  "rate-limiter-flexible": "^5.x",
  "edge-tts": "^1.x",
  "workbox-precaching": "^7.x",
  "workbox-routing": "^7.x",
  "workbox-strategies": "^7.x",
  "vite-plugin-pwa": "^0.x"
}
```

### Geschätzte Test-Expansion

| Phase | Neue Tests |
|-------|-----------|
| Phase 55 (MCP) | ~95 |
| Phase 56 (Auth) | ~125 |
| Phase 57 (Voice) | ~95 |
| Phase 58 (GraphRAG) | ~75 |
| Phase 59 (Memory) | ~60 |
| Phase 60 (A2A) | ~70 |
| Phase 61 (Observability) | ~45 |
| Phase 62 (Security+PWA) | ~40 |
| Phase 63 (Sleep+Context) | ~45 |
| Phase 64 (Agent Identity+Graph) | ~90 |
| **Gesamt** | **~740 neue Tests** |

**Projektion: 3611 + 740 = ~4351 Tests**
