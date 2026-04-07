# ZenAI Project Context

> **ZenAI - Enterprise AI Platform**
> An open-source, self-hostable AI operating system for knowledge work.

## Deployment

ZenAI is designed to be self-hosted. Configure your deployment via environment variables.

Copy `.env.example` to `.env` and configure your credentials. See the [Getting Started guide](docs/getting-started.md) for detailed setup instructions.

**Required services:**
- PostgreSQL database with pgvector extension (4 schemas)
- Node.js 20+ runtime
- Redis (optional, for caching and job queues)

## Architecture

- **Frontend**: React + TypeScript (Vite)
- **Backend**: Express.js + TypeScript
- **AI**: Claude API (Primary), Mistral (Cloud Fallback), Ollama (Local Fallback)
- **Database**: PostgreSQL + pgvector
  - 4 Contexts: `personal`, `work`, `learning`, `creative`
  - Schema-Isolation per Context via `SET search_path TO {context}, public`
  - ~95 Tables per Schema (full parity)
  - `queryContext(context, sql, params)` for correct schema routing
- **Memory**: HiMeS 4-Layer Architecture
  - Working Memory (active task focus)
  - Episodic Memory (concrete experiences)
  - Short-Term Memory (session context)
  - Long-Term Memory (persistent knowledge)

## Current Phase: 145

### Phase 31 Features (AI State-of-the-Art)

**Chat Modes & Tool Use:**

- Intelligent mode detection (tool_assisted, agent, rag_enhanced, conversation)
- 52 integrated tools across 14 categories (see Tools section below)
- Tool Search Tool: on-demand tool discovery (saves 40-50% context window)
- Tool-use visualization: inline activity pills during streaming (Phase 76)

**RAG Pipeline:**

- HyDE (Hypothetical Document Embeddings) with 5s timeout
- Cross-Encoder Re-ranking with structured fallback
- Confidence scoring (4-component: topScore, avgScore, variance, diversity)
- Contextual Retrieval (Anthropic method, +67% retrieval accuracy)
- Self-RAG Critique (auto-reformulate at confidence < 0.5)
- Dynamic RAG weights (score-based instead of fixed 0.4/0.6)
- Content-hash deduplication (SHA-256)
- Embedding Drift Detection (BullMQ worker, >10% threshold)
- Query size limit (10K chars)

**Streaming:**

- SSE with Extended Thinking support
- Real-time thinking and response display

**Vision Integration:**

- 8 Vision API endpoints
- Image analysis, OCR, idea extraction
- Chat with images support
- Drag-and-drop ImageUpload component

**Topic Enhancement:**

- Keyword extraction (TF-IDF)
- Quality metrics (coherence, separation, density, stability)
- Smart topic assignment
- Topic-aware chat context

**Code Execution Sandbox:**

- `execute_code`: Claude-Tool for secure code execution in chat
- Dual-Provider: Docker (local) or Judge0 (production)
- Supports Python 3.11, Node.js 20, Bash
- Safety-Validator with 77 security checks
- Resource Limits (CPU, Memory, PIDs, Network)
- Automatic provider selection based on environment

**Web Tools:**

- `web_search`: Web search via Brave Search API (Privacy-first, DuckDuckGo Fallback)
- `fetch_url`: Fetch and extract URL content (Readability-like)
- Intelligent content extraction (title, author, date, main content)
- HTML-to-text conversion with noise filtering

**GitHub Integration:**

- `github_search`: Repository search on GitHub
- `github_create_issue`: Create issues from conversations
- `github_repo_info`: Fetch repository details
- `github_list_issues`: List repository issues
- `github_pr_summary`: Pull request summaries

**Project/Workspace Context:**

- `analyze_project`: Comprehensive project analysis
- `get_project_summary`: Quick project overview
- `list_project_files`: Show project structure
- Detection of 11 project types (TypeScript, Python, Rust, Go, etc.)
- Framework detection (React, Express, Django, etc.)
- Pattern detection (Testing, Docker, CI/CD, Architecture)

**Voice Input:**

- VoiceInput component in chat interface
- MediaRecorder API for browser-native recording
- Whisper transcription via backend
- transcribeOnly mode for direct chat integration

**Artifacts System:**

- ArtifactPanel for Code, Markdown, Mermaid, CSV
- Automatic extraction from AI responses
- Syntax highlighting with Prism
- Copy/Download functionality
- Large code blocks (>15 lines) as Artifacts

### AI Tools (60 registered)

| Category | Tools |
|----------|-------|
| **Core Ideas** | `search_ideas`, `create_idea`, `update_idea`, `archive_idea`, `delete_idea`, `get_related_ideas` |
| **Memory** | `remember`, `recall`, `memory_introspect`, `memory_update`, `memory_delete`, `memory_update_profile`, `memory_promote`, `memory_demote`, `memory_forget` |
| **Meta** | `search_tools` (on-demand tool discovery) |
| **Web** | `web_search` (Brave/DDG), `fetch_url` |
| **GitHub** | `github_search`, `github_create_issue`, `github_repo_info`, `github_list_issues`, `github_pr_summary` |
| **Project Context** | `analyze_project`, `get_project_summary`, `list_project_files` |
| **Code Execution** | `execute_code` (Python/Node.js/Bash) |
| **Documents** | `analyze_document`, `search_documents`, `synthesize_knowledge` |
| **Assistant** | `create_meeting`, `navigate_to`, `app_help`, `calculate` |
| **Business** | `get_revenue_metrics`, `get_traffic_analytics`, `get_seo_performance`, `get_system_health`, `generate_business_report`, `identify_anomalies`, `compare_periods` |
| **Calendar/Email** | `create_calendar_event`, `list_calendar_events`, `draft_email`, `estimate_travel` |
| **Maps** | `get_directions`, `get_opening_hours`, `find_nearby_places`, `optimize_day_route` |
| **Email Intelligence** | `ask_inbox`, `inbox_summary` |
| **MCP Ecosystem** | `mcp_call_tool`, `mcp_list_tools` |

## Route Registration (Module System)

- Routes are registered via modules in `backend/src/modules/` (NOT directly in main.ts)
- Each module implements `Module` interface: `registerRoutes(app)` + optional `onStartup()`
- Module index: `backend/src/modules/index.ts` registers all modules
- To add a new route: create route file, import in appropriate module's `index.ts`
- 35 modules: agents, analytics, auth, browser, business, calendar, canvas, chat, code, contacts, core-routes, curiosity, documents, email, extensions, feedback-adaptive, finance, governance, ideas, inbox, knowledge, learning, mcp, memory, misc, observability, planner, predictions, proactive, project-context, search, security, sleep, voice

## Quality Audit Checklist (for new phases)

- Verify new route files have `/:context/` prefix (not bare `/status`)
- Verify new components are imported somewhere (check for orphans with `grep -r "ComponentName" frontend/src/`)
- Verify `initialTab` casts in `App.tsx` include ALL tabs from the component's TABS array
- Verify new routes are registered in the correct module in `backend/src/modules/*/index.ts`

## Key Files

### Backend

- Entry: `backend/src/main.ts`
- Memory Services: `backend/src/services/memory/`
- Code Execution: `backend/src/services/code-execution/`
- General Chat: `backend/src/routes/general-chat.ts`
- Vision Service: `backend/src/services/claude-vision.ts`
- Vision Routes: `backend/src/routes/vision.ts`
- Code Execution Route: `backend/src/routes/code-execution.ts`
- Chat Modes: `backend/src/services/chat-modes.ts`
- Tool Handlers: `backend/src/services/tool-handlers.ts`
- Web Search: `backend/src/services/web-search.ts`
- URL Fetch: `backend/src/services/url-fetch.ts`
- GitHub Service: `backend/src/services/github.ts`
- Project Context: `backend/src/services/project-context.ts`
- Project Context Routes: `backend/src/routes/project-context.ts`
- Enhanced RAG: `backend/src/services/enhanced-rag.ts`
- Topic Enhancement: `backend/src/services/topic-enhancement.ts`
- Streaming: `backend/src/services/claude/streaming.ts`
- Thinking Budget: `backend/src/services/claude/thinking-budget.ts`
- Thinking Management: `backend/src/services/thinking-management.ts`
- RAG Feedback: `backend/src/services/rag-feedback.ts`
- RAG Query Decomposition: `backend/src/services/rag-query-decomposition.ts`
- Graph Reasoning: `backend/src/services/knowledge-graph/graph-reasoning.ts`
- Tasks Service: `backend/src/services/tasks.ts`
- Tasks Routes: `backend/src/routes/tasks.ts`
- Projects Service: `backend/src/services/projects.ts`
- Projects Routes: `backend/src/routes/projects.ts`
- Resend Service: `backend/src/services/resend.ts`
- Email CRUD Service: `backend/src/services/email.ts`
- Email AI Service: `backend/src/services/email-ai.ts`
- Email Routes: `backend/src/routes/email.ts`
- Email Webhooks: `backend/src/routes/email-webhooks.ts`
- Browser Routes: `backend/src/routes/browser.ts`
- Browser Memory: `backend/src/services/browsing-memory.ts`
- Contacts Routes: `backend/src/routes/contacts.ts`
- Finance Routes: `backend/src/routes/finance.ts`
- Screen Memory Routes: `backend/src/routes/screen-memory.ts`
- Unified Inbox Routes: `backend/src/routes/unified-inbox.ts`
- Maps Routes: `backend/src/routes/maps.ts`
- Google Maps Service: `backend/src/services/google-maps.ts`
- Location Cache: `backend/src/services/location-cache.ts`
- Canvas Routes: `backend/src/routes/canvas.ts`
- Canvas Service: `backend/src/services/canvas.ts`
- Agent Orchestrator: `backend/src/services/agent-orchestrator.ts`
- Agent Base Class: `backend/src/services/agents/base-agent.ts`
- Researcher Agent: `backend/src/services/agents/researcher.ts`
- Writer Agent: `backend/src/services/agents/writer.ts`
- Reviewer Agent: `backend/src/services/agents/reviewer.ts`
- Coder Agent: `backend/src/services/agents/coder.ts`
- Agent Teams Routes: `backend/src/routes/agent-teams.ts`
- Shared Memory: `backend/src/services/memory/shared-memory.ts`
- Governance Service: `backend/src/services/governance.ts`
- Governance Routes: `backend/src/routes/governance.ts`
- Context Engine: `backend/src/services/context-engine.ts`
- Context Rules Routes: `backend/src/routes/context-rules.ts`
- Event System: `backend/src/services/event-system.ts`
- Proactive Decision Engine: `backend/src/services/proactive-decision-engine.ts`
- Proactive Engine Routes: `backend/src/routes/proactive-engine.ts`
- Agent Checkpoints: `backend/src/services/agent-checkpoints.ts`
- MCP Client SDK: `backend/src/services/mcp/mcp-client.ts`
- MCP Transport: `backend/src/services/mcp/mcp-transport.ts`
- MCP Registry: `backend/src/services/mcp/mcp-registry.ts`
- MCP Tool Bridge: `backend/src/services/mcp/mcp-tool-bridge.ts`
- MCP Server (Internal): `backend/src/services/mcp-server.ts`
- MCP Connections Routes: `backend/src/routes/mcp-connections.ts`
- Auth Routes: `backend/src/routes/auth.ts`
- JWT Auth Middleware: `backend/src/middleware/jwt-auth.ts`
- User Service: `backend/src/services/auth/user-service.ts`
- JWT Service: `backend/src/services/auth/jwt-service.ts`
- OAuth Providers: `backend/src/services/auth/oauth-providers.ts`
- Session Store: `backend/src/services/auth/session-store.ts`
- Voice Pipeline: `backend/src/services/voice/voice-pipeline.ts`
- STT Service: `backend/src/services/voice/stt-service.ts`
- TTS Service: `backend/src/services/voice/tts-service.ts`
- Voice Signaling: `backend/src/services/voice/webrtc-signaling.ts`
- Turn-Taking Engine: `backend/src/services/voice/turn-taking.ts`
- Audio Processor: `backend/src/services/voice/audio-processor.ts`
- Voice Realtime Routes: `backend/src/routes/voice-realtime.ts`
- Graph Builder: `backend/src/services/knowledge-graph/graph-builder.ts`
- Community Summarizer: `backend/src/services/knowledge-graph/community-summarizer.ts`
- Hybrid Retriever: `backend/src/services/knowledge-graph/hybrid-retriever.ts`
- Graph Indexer: `backend/src/services/knowledge-graph/graph-indexer.ts`
- Procedural Memory: `backend/src/services/memory/procedural-memory.ts`
- Memory BM25: `backend/src/services/memory/memory-bm25.ts`
- Entity Resolver: `backend/src/services/memory/entity-resolver.ts`
- Memory MCP Resources: `backend/src/services/memory/memory-mcp-resources.ts`
- Memory Procedures Routes: `backend/src/routes/memory-procedures.ts`
- A2A Server: `backend/src/services/a2a/a2a-server.ts`
- Agent Card: `backend/src/services/a2a/agent-card.ts`
- A2A Task Manager: `backend/src/services/a2a/task-manager.ts`
- A2A Client: `backend/src/services/a2a/a2a-client.ts`
- A2A Routes: `backend/src/routes/a2a.ts`
- GraphRAG Routes: `backend/src/routes/graphrag.ts`
- Tracing Service: `backend/src/services/observability/tracing.ts`
- Metrics Service: `backend/src/services/observability/metrics.ts`
- Job Queue: `backend/src/services/queue/job-queue.ts`
- Queue Workers: `backend/src/services/queue/workers.ts`
- Tracing Middleware: `backend/src/middleware/tracing.ts`
- Observability Routes: `backend/src/routes/observability.ts`
- RBAC Middleware: `backend/src/middleware/rbac.ts`
- Audit Logger: `backend/src/services/security/audit-logger.ts`
- Field Encryption: `backend/src/services/security/field-encryption.ts`
- Advanced Rate Limiting: `backend/src/services/security/rate-limit-advanced.ts`
- Security Routes: `backend/src/routes/security.ts`
- Request Context (AsyncLocalStorage): `backend/src/utils/request-context.ts`
- Sentry Backend: `backend/src/services/observability/sentry.ts`
- Sentry Frontend: `frontend/src/services/sentry.ts`
- RAG Cache: `backend/src/services/rag-cache.ts`
- Sleep Compute Engine: `backend/src/services/memory/sleep-compute.ts`
- Context Engine V2: `backend/src/services/context-engine-v2.ts`
- Sleep Worker: `backend/src/services/queue/workers/sleep-worker.ts`
- Sleep Compute Routes: `backend/src/routes/sleep-compute.ts`
- Agent Identity Service: `backend/src/services/agents/agent-identity.ts`
- Agent Graph (LangGraph): `backend/src/services/agents/agent-graph.ts`
- Workflow Store: `backend/src/services/agents/workflow-store.ts`
- Agent Identity Routes: `backend/src/routes/agent-identity.ts`
- A-RAG Strategy Agent: `backend/src/services/arag/strategy-agent.ts`
- A-RAG Iterative Retriever: `backend/src/services/arag/iterative-retriever.ts`
- MCP Discovery: `backend/src/services/mcp/mcp-discovery.ts`
- MCP Auto-Config: `backend/src/services/mcp/mcp-auto-config.ts`
- Emotional Tagger: `backend/src/services/memory/emotional-tagger.ts`
- Ebbinghaus Decay: `backend/src/services/memory/ebbinghaus-decay.ts`
- AI Trace Service: `backend/src/services/observability/ai-trace.ts`
- AI Traces Routes: `backend/src/routes/ai-traces.ts`
- Smart Suggestions: `backend/src/services/smart-suggestions.ts`
- Smart Suggestions Routes: `backend/src/routes/smart-suggestions.ts`
- Extension Registry: `backend/src/services/extensions/extension-registry.ts`
- Extension Sandbox: `backend/src/services/extensions/extension-sandbox.ts`
- Extensions Routes: `backend/src/routes/extensions.ts`
- Contextual Retrieval: `backend/src/services/contextual-retrieval.ts`
- Embedding Drift: `backend/src/services/embedding-drift.ts`
- Tool Search: `backend/src/services/tool-handlers/tool-search.ts`
- Memory Management Tools: `backend/src/services/tool-handlers/memory-management.ts`
- Idea Tools: `backend/src/services/tool-handlers/idea-tools.ts`
- Memory Recall Tools: `backend/src/services/tool-handlers/memory-recall-tools.ts`
- Assistant Tools: `backend/src/services/tool-handlers/assistant-tools.ts`
- Ideas Route Handlers: `backend/src/routes/ideas-handlers.ts`
- General Chat Handlers: `backend/src/routes/general-chat-handlers.ts`
- LTM Search: `backend/src/services/memory/ltm-search.ts`
- LTM Consolidation: `backend/src/services/memory/ltm-consolidation.ts`
- Memory Query Router: `backend/src/services/memory/memory-query-router.ts`
- Memory Stats: `backend/src/services/memory/memory-stats.ts`
- Request Timeout: `backend/src/middleware/request-timeout.ts`
- Error Sanitization: `backend/src/utils/sanitize-error.ts`
- Safe JSON Stringify: `backend/src/utils/safe-stringify.ts`
- Mistral Service: `backend/src/services/mistral.ts`
- Curiosity Routes: `backend/src/routes/curiosity.ts`
- Predictions Routes: `backend/src/routes/predictions.ts`
- Feedback/Adaptive Routes: `backend/src/routes/feedback-adaptive.ts`
- FSRS Review Routes: `backend/src/routes/fsrs-review.ts`
- Self-Improvement Routes: `backend/src/routes/self-improvement.ts`
- Cognitive Health: `backend/src/services/metacognition/cognitive-health.ts`

### Frontend

- App: `frontend/src/App.tsx`
- Navigation Config: `frontend/src/navigation.ts` (Single Source of Truth)
- Page Types: `frontend/src/types/idea.ts` (Page union type)
- Layout: `frontend/src/components/layout/AppLayout.tsx`
- Sidebar: `frontend/src/components/layout/Sidebar.tsx`
- Chat Page: `frontend/src/components/ChatPage.tsx`
- Ideas Page: `frontend/src/components/IdeasPage.tsx` (4 Tabs)
- Workshop: `frontend/src/components/AIWorkshop.tsx` (3 Tabs)
- Insights: `frontend/src/components/InsightsDashboard.tsx` (3 Tabs)
- Planner: `frontend/src/components/PlannerPage/PlannerPage.tsx` (4 Tabs)
- Documents: `frontend/src/components/DocumentVaultPage/DocumentVaultPage.tsx` (3 Tabs)
- Business: `frontend/src/components/BusinessDashboard.tsx` (8 Tabs)
- Learning: `frontend/src/components/LearningDashboard.tsx`
- My AI: `frontend/src/components/MyAIPage.tsx` (3 Tabs)
- Settings: `frontend/src/components/SettingsDashboard.tsx` (7 Tabs)
- Dashboard: `frontend/src/components/Dashboard.tsx`
- Chat Component: `frontend/src/components/GeneralChat/GeneralChat.tsx`
- Image Upload: `frontend/src/components/ImageUpload.tsx`
- Artifact Panel: `frontend/src/components/ArtifactPanel.tsx`
- Command Palette: `frontend/src/components/CommandPalette.tsx`
- Email Page: `frontend/src/components/EmailPage/EmailPage.tsx`
- Browser Page: `frontend/src/components/BrowserPage/BrowserPage.tsx`
- Contacts Page: `frontend/src/components/ContactsPage/ContactsPage.tsx`
- Finance Page: `frontend/src/components/FinancePage/FinancePage.tsx`
- Screen Memory: `frontend/src/components/ScreenMemoryPage/ScreenMemoryPage.tsx`
- Canvas Page: `frontend/src/components/CanvasPage.tsx`
- Hub Page: `frontend/src/components/HubPage.tsx`
- Agent Teams Page: `frontend/src/components/AgentTeamsPage.tsx`
- Governance Dashboard: `frontend/src/components/GovernanceDashboard.tsx`
- MCP Connections Page: `frontend/src/components/MCPConnectionsPage.tsx`
- Auth Page: `frontend/src/components/AuthPage/AuthPage.tsx`
- OAuth Buttons: `frontend/src/components/AuthPage/OAuthButtons.tsx`
- Auth Context: `frontend/src/contexts/AuthContext.tsx`
- Voice Chat: `frontend/src/components/VoiceChat/VoiceChat.tsx`
- Audio Visualizer: `frontend/src/components/VoiceChat/AudioVisualizer.tsx`
- WebRTC Hook: `frontend/src/hooks/useWebRTC.ts`
- Voice Activity Hook: `frontend/src/hooks/useVoiceActivity.ts`
- PWA Hook: `frontend/src/hooks/usePWA.ts`
- Design System: `frontend/src/design-system/` (Tokens, 10 Components)
- Smart Surface: `frontend/src/components/SmartSurface/SmartSurface.tsx`
- Sleep Insights: `frontend/src/components/InsightsDashboard/SleepInsights.tsx`
- Context Indicator: `frontend/src/components/layout/ContextIndicator.tsx`
- Tool Marketplace: `frontend/src/components/ToolMarketplace.tsx`
- Server Setup Wizard: `frontend/src/components/ServerSetupWizard.tsx`
- Extension Marketplace: `frontend/src/components/ExtensionMarketplace/ExtensionMarketplace.tsx`
- Sentry (Frontend): `frontend/src/services/sentry.ts`
- Local Inference: `frontend/src/services/local-inference.ts`
- Offline Chat: `frontend/src/services/offline-chat.ts`
- Local Inference Hook: `frontend/src/hooks/useLocalInference.ts`
- Smart Suggestions Hook: `frontend/src/hooks/useSmartSuggestions.ts`
- Chat State Machine: `frontend/src/components/GeneralChat/chatReducer.ts`
- Error Handler: `frontend/src/utils/error-handler.ts`
- Chat Config: `frontend/src/config/chat.ts`
- Page Skeletons: `frontend/src/components/skeletons/PageSkeletons.tsx`
- Chat Content Renderer: `frontend/src/components/GeneralChat/ChatContentRenderer.tsx`
- System Admin Page: `frontend/src/components/SystemAdminPage/` (6 files)
- Procedural Memory Panel: `frontend/src/components/ProceduralMemoryPanel/` (7 files)
- Agent Teams Page: `frontend/src/components/AgentTeamsPage/` (3 files)
- Cognitive Data Hooks: `frontend/src/hooks/queries/useCognitiveData.ts`
- Cognitive Overview: `frontend/src/components/MyAIPage/CognitiveOverview.tsx`
- Curiosity Panel: `frontend/src/components/MyAIPage/CuriosityPanel.tsx`
- Prediction Panel: `frontend/src/components/MyAIPage/PredictionPanel.tsx`
- Review Queue Panel: `frontend/src/components/MyAIPage/ReviewQueuePanel.tsx`
- Improvement Panel: `frontend/src/components/MyAIPage/ImprovementPanel.tsx`

### CLI

- Entry Point: `cli/src/index.ts`
- Agent Loop: `cli/src/agent-loop.ts`
- Filesystem Tools: `cli/src/filesystem-tools.ts`
- Backend Bridge: `cli/src/backend-bridge.ts`
- Context Management: `cli/src/context.ts`
- Terminal UI: `cli/src/ui/terminal-ui.ts`
- Types: `cli/src/types.ts`

### Tests

- Backend: `backend/src/__tests__/`
- Frontend: `frontend/src/__tests__/` and `frontend/src/components/__tests__/`
- CLI: `cli/src/__tests__/`

## API Endpoints (Phase 145)

### Tasks API

```
GET    /api/:context/tasks                    - List tasks (filter: project_id, status, priority, due_before, due_after)
GET    /api/:context/tasks/gantt              - Gantt data (tasks + dependencies + projects)
GET    /api/:context/tasks/:id                - Single task with dependencies
POST   /api/:context/tasks                    - Create task
PUT    /api/:context/tasks/:id                - Update task
DELETE /api/:context/tasks/:id                - Cancel task
POST   /api/:context/tasks/reorder            - Kanban reorder (body: { status, taskIds })
GET    /api/:context/tasks/:id/dependencies   - Get dependencies
POST   /api/:context/tasks/:id/dependencies   - Add dependency
DELETE /api/:context/tasks/:id/dependencies/:depId - Remove dependency
POST   /api/:context/tasks/from-idea/:ideaId  - Convert idea to task
```

### Projects API

```
GET    /api/:context/projects         - List with task counts
GET    /api/:context/projects/:id     - Project with task summary
POST   /api/:context/projects         - Create project
PUT    /api/:context/projects/:id     - Update project
DELETE /api/:context/projects/:id     - Archive project
```

### Calendar-Meeting API

```
POST /api/:context/calendar/events/:id/start-meeting  - Create meeting + link to event
GET  /api/:context/calendar/events/:id/meeting         - Get meeting + notes for event
POST /api/:context/calendar/events/:id/meeting/notes   - Add audio/transcript -> AI structures
```

### Email API

```
GET    /api/:context/emails              - List emails (filter: status, direction, category, search)
GET    /api/:context/emails/stats        - Unread count, category breakdown
GET    /api/:context/emails/:id          - Single email (marks as read)
GET    /api/:context/emails/:id/thread   - Thread view
POST   /api/:context/emails              - Create draft
PUT    /api/:context/emails/:id          - Update draft
POST   /api/:context/emails/:id/send     - Send draft
POST   /api/:context/emails/send         - Compose & send new email
POST   /api/:context/emails/:id/reply    - Reply to email
POST   /api/:context/emails/:id/forward  - Forward email
PATCH  /api/:context/emails/:id/status   - Change status
PATCH  /api/:context/emails/:id/star     - Toggle star
POST   /api/:context/emails/batch        - Bulk actions
DELETE /api/:context/emails/:id          - Move to trash
GET    /api/:context/emails/accounts     - List accounts
POST   /api/:context/emails/accounts     - Create account
POST   /api/:context/emails/:id/ai/process           - Trigger AI processing
GET    /api/:context/emails/:id/ai/reply-suggestions  - AI reply suggestions
GET    /api/:context/emails/:id/thread/ai/summary     - Thread AI summary
POST   /api/webhooks/resend              - Inbound email webhook
```

### Vision API

```
GET  /api/vision/status           - Service availability
POST /api/vision/analyze          - Analyze with task
POST /api/vision/extract-text     - OCR extraction
POST /api/vision/extract-ideas    - Extract ideas
POST /api/vision/describe         - Quick description
POST /api/vision/ask              - Q&A about image
POST /api/vision/compare          - Compare images
POST /api/vision/document         - Full document processing
```

### Code Execution API

```
POST /api/code/execute            - Generate and execute code
POST /api/code/run                - Run pre-written code
POST /api/code/validate           - Validate code safety
GET  /api/code/health             - Service health check
GET  /api/code/languages          - Available languages
```

### Topic Enhancement API

```
GET  /api/topics/enhanced         - Topics with keywords
GET  /api/topics/quality          - All quality metrics
GET  /api/topics/:id/quality      - Single topic quality
GET  /api/topics/similar          - Similar topics
POST /api/topics/assign/:ideaId   - Smart assignment
POST /api/topics/context          - Chat context
GET  /api/topics/orphans          - Unassigned ideas
```

### Chat API (Enhanced)

```
POST /api/chat/sessions/:id/messages         - Send message
POST /api/chat/sessions/:id/messages/stream  - SSE streaming
POST /api/chat/sessions/:id/messages/vision  - Message with images
POST /api/chat/quick                         - Quick chat
```

### Project Context API

```
POST /api/project/analyze                    - Full project analysis
POST /api/project/summary                    - Quick project summary
POST /api/project/structure                  - File structure scan
GET  /api/project/health                     - Service availability
```

### Sync API (Offline Sync)

```
POST /api/:context/sync/swipe-actions        - Sync offline swipe actions
POST /api/:context/sync/batch                - Batch sync (voice memos, swipes, feedback)
GET  /api/:context/sync/status               - Get sync status and counts
GET  /api/:context/sync/pending              - Get pending changes (last hour)
POST /api/:context/sync/trigger              - Trigger manual sync
DELETE /api/sync/devices/:deviceId           - Remove sync device
```

### Browser API

```
GET    /api/:context/browser/history                  - List browsing history with filters
GET    /api/:context/browser/history/domains          - Get domain visit statistics
GET    /api/:context/browser/history/:id              - Get single history entry
POST   /api/:context/browser/history                  - Record a page visit
DELETE /api/:context/browser/history/:id              - Delete a single history entry
DELETE /api/:context/browser/history                  - Clear browsing history
GET    /api/:context/browser/bookmarks                - List bookmarks with filters
GET    /api/:context/browser/bookmarks/folders        - Get bookmark folder structure
GET    /api/:context/browser/bookmarks/:id            - Get single bookmark
POST   /api/:context/browser/bookmarks                - Create a bookmark
PUT    /api/:context/browser/bookmarks/:id            - Update a bookmark
DELETE /api/:context/browser/bookmarks/:id            - Delete a bookmark
POST   /api/:context/browser/analyze                  - Analyze page content with AI
```

### Contacts & CRM API

```
GET    /api/:context/contacts                         - List contacts with filters
GET    /api/:context/contacts/stats                   - Get contact statistics
GET    /api/:context/contacts/follow-ups              - Get follow-up suggestions
GET    /api/:context/contacts/:id                     - Get single contact
POST   /api/:context/contacts                         - Create contact
PUT    /api/:context/contacts/:id                     - Update contact
DELETE /api/:context/contacts/:id                     - Delete contact
GET    /api/:context/contacts/:id/timeline            - Get contact interactions timeline
POST   /api/:context/contacts/:id/interactions        - Add interaction record
GET    /api/:context/organizations                    - List organizations with filters
GET    /api/:context/organizations/:id                - Get single organization
POST   /api/:context/organizations                    - Create organization
PUT    /api/:context/organizations/:id                - Update organization
DELETE /api/:context/organizations/:id                - Delete organization
```

### Finance API

```
GET    /api/:context/finance/overview                 - Get financial overview
GET    /api/:context/finance/categories               - Get category spending breakdown
GET    /api/:context/finance/accounts                 - List financial accounts
GET    /api/:context/finance/accounts/:id             - Get single account
POST   /api/:context/finance/accounts                 - Create account
PUT    /api/:context/finance/accounts/:id             - Update account
DELETE /api/:context/finance/accounts/:id             - Delete account
GET    /api/:context/finance/transactions             - List transactions with filters
GET    /api/:context/finance/transactions/:id         - Get single transaction
POST   /api/:context/finance/transactions             - Create transaction
PUT    /api/:context/finance/transactions/:id         - Update transaction
DELETE /api/:context/finance/transactions/:id         - Delete transaction
GET    /api/:context/finance/budgets                  - List budgets
GET    /api/:context/finance/budgets/:id              - Get single budget
POST   /api/:context/finance/budgets                  - Create budget
PUT    /api/:context/finance/budgets/:id              - Update budget
DELETE /api/:context/finance/budgets/:id              - Delete budget
GET    /api/:context/finance/goals                    - List financial goals
GET    /api/:context/finance/goals/:id                - Get single goal
POST   /api/:context/finance/goals                    - Create goal
PUT    /api/:context/finance/goals/:id                - Update goal
DELETE /api/:context/finance/goals/:id                - Delete goal
```

### Screen Memory API

```
GET    /api/:context/screen-memory                    - List screen captures with filters
GET    /api/:context/screen-memory/stats              - Get screen memory statistics
GET    /api/:context/screen-memory/:id                - Get single capture
POST   /api/:context/screen-memory                    - Store new screen capture
DELETE /api/:context/screen-memory/:id                - Delete capture
POST   /api/:context/screen-memory/cleanup            - Cleanup old captures
```

### Unified Inbox API

```
GET    /api/:context/inbox                            - Get unified inbox items
GET    /api/:context/inbox/counts                     - Get item counts per type
```

### Maps API

```
GET    /api/:context/maps/status                      - Check Google Maps availability
POST   /api/:context/maps/geocode                     - Convert address to coordinates
POST   /api/:context/maps/reverse-geocode             - Convert coordinates to address
GET    /api/:context/maps/autocomplete                - Get place suggestions
GET    /api/:context/maps/places/:placeId             - Get place details
POST   /api/:context/maps/directions                  - Get directions between locations
POST   /api/:context/maps/distance-matrix             - Calculate travel times
POST   /api/:context/maps/nearby                      - Find places near location
GET    /api/:context/maps/saved-locations             - List saved locations
POST   /api/:context/maps/saved-locations             - Save new location
DELETE /api/:context/maps/saved-locations/:id         - Delete saved location
```

### Canvas API

```
POST   /api/canvas                                    - Create canvas document
GET    /api/canvas?context=personal                   - List canvas documents
GET    /api/canvas/:id                                - Get canvas document
PATCH  /api/canvas/:id                                - Update canvas document
DELETE /api/canvas/:id                                - Delete canvas document
POST   /api/canvas/:id/link-chat                      - Link chat session to document
GET    /api/canvas/:id/versions                       - Get document version history
POST   /api/canvas/:id/restore/:versionId             - Restore document version
```

### Extended Thinking API

```
POST   /api/:context/thinking/feedback                 - Record thinking quality feedback
GET    /api/:context/thinking/stats                    - Get thinking chain statistics
GET    /api/:context/thinking/strategies               - Get budget strategy performance
POST   /api/:context/thinking/strategies/persist       - Persist strategies to database
GET    /api/:context/thinking/chains/:id               - Get specific thinking chain
DELETE /api/:context/thinking/chains/:id               - Delete thinking chain
```

### RAG Analytics API

```
POST   /api/:context/rag/feedback                      - Record RAG retrieval feedback
GET    /api/:context/rag/analytics                     - Get RAG performance analytics
GET    /api/:context/rag/strategies                    - Get strategy performance breakdown
GET    /api/:context/rag/history                       - Get recent RAG query history
```

### Knowledge Graph Reasoning API

```
POST   /api/:context/knowledge-graph/infer             - Run transitive inference
GET    /api/:context/knowledge-graph/contradictions    - Detect contradiction chains
POST   /api/:context/knowledge-graph/communities       - Detect graph communities
GET    /api/:context/knowledge-graph/communities       - Get cached communities
GET    /api/:context/knowledge-graph/centrality        - Get centrality metrics
GET    /api/:context/knowledge-graph/learning-path/:id - Generate learning path
POST   /api/:context/knowledge-graph/relations         - Create manual relation
PUT    /api/:context/knowledge-graph/relations         - Update relation strength
DELETE /api/:context/knowledge-graph/relations         - Delete relation
```

### Temporal Knowledge Graph API

```
GET    /api/:context/knowledge-graph/temporal/:ideaId       - Temporal relations for idea
GET    /api/:context/knowledge-graph/temporal-contradictions - Temporal contradictions
POST   /api/:context/knowledge-graph/temporal-query         - Query relations in time range
GET    /api/:context/knowledge-graph/relation-history/:src/:tgt - Relation change history
```

### Governance & Audit Trail API

```
GET    /api/:context/governance/pending                     - Pending approval actions
GET    /api/:context/governance/history                     - Action history
POST   /api/:context/governance/:id/approve                 - Approve action
POST   /api/:context/governance/:id/reject                  - Reject action
GET    /api/:context/governance/audit                       - Audit log
GET    /api/:context/governance/policies                    - List policies
POST   /api/:context/governance/policies                    - Create policy
PUT    /api/:context/governance/policies/:id                - Update policy
DELETE /api/:context/governance/policies/:id                - Delete policy
GET    /api/:context/governance/stream                      - SSE real-time approvals
```

### Context Rules API

```
GET    /api/:context/context-rules                          - List context rules
POST   /api/:context/context-rules                          - Create context rule
PUT    /api/:context/context-rules/:id                      - Update context rule
DELETE /api/:context/context-rules/:id                      - Delete context rule
GET    /api/:context/context-rules/performance              - Rule performance stats
POST   /api/:context/context-rules/test                     - Test rule against sample query
```

### Proactive Event Engine API

```
GET    /api/:context/proactive-engine/events                - Event log
GET    /api/:context/proactive-engine/stats                 - Event statistics
GET    /api/:context/proactive-engine/rules                 - List proactive rules
POST   /api/:context/proactive-engine/rules                 - Create proactive rule
PUT    /api/:context/proactive-engine/rules/:id             - Update proactive rule
DELETE /api/:context/proactive-engine/rules/:id             - Delete proactive rule
POST   /api/:context/proactive-engine/process               - Manual event processing
GET    /api/:context/proactive-engine/stream                - SSE real-time notifications
```

### Durable Agent Execution API

```
POST   /api/agents/executions/:id/resume                    - Resume paused execution
POST   /api/agents/executions/:id/pause                     - Pause execution
POST   /api/agents/executions/:id/cancel                    - Cancel execution
GET    /api/agents/executions/:id/checkpoint                - Get checkpoint state
GET    /api/agents/executions/:id/checkpoints               - List all checkpoints
```

### Agent Teams API

```
POST   /api/agents/execute                              - Execute task with agent team
POST   /api/agents/execute/stream                       - Execute with SSE streaming progress
POST   /api/agents/classify                             - Preview strategy classification
GET    /api/agents/templates                            - List agent templates
GET    /api/agents/analytics                            - Agent execution analytics
GET    /api/agents/history                              - List past executions
GET    /api/agents/history/:id                          - Get single execution
POST   /api/agents/history/:id/save-as-idea             - Persist result as idea
```

### MCP Server Connections API

```
GET    /api/:context/mcp/servers                            - List server connections
GET    /api/:context/mcp/servers/:id                        - Get server connection
POST   /api/:context/mcp/servers                            - Create server connection
PUT    /api/:context/mcp/servers/:id                        - Update server connection
DELETE /api/:context/mcp/servers/:id                        - Delete server connection
POST   /api/:context/mcp/servers/:id/connect                - Connect and sync server
POST   /api/:context/mcp/servers/:id/disconnect             - Disconnect server
POST   /api/:context/mcp/servers/:id/health                 - Health check server
GET    /api/:context/mcp/servers/:id/tools                  - List server tools
GET    /api/:context/mcp/tools                              - Unified tools across all servers
POST   /api/:context/mcp/tools/execute                      - Execute bridged tool
GET    /api/mcp/status                                      - Internal MCP server status
GET    /api/mcp/tools                                       - List internal MCP tools
POST   /api/mcp/tools/call                                  - Call internal MCP tool
GET    /api/mcp/resources                                   - List internal MCP resources
POST   /api/mcp/resources/read                              - Read internal MCP resource
```

### Authentication API

```
POST   /api/auth/register                                   - Register new user
POST   /api/auth/login                                      - Login with email/password
POST   /api/auth/refresh                                    - Refresh access token
POST   /api/auth/logout                                     - Logout (revoke refresh token)
POST   /api/auth/logout-all                                 - Revoke all sessions
GET    /api/auth/profile                                    - Get current user profile
PUT    /api/auth/profile                                    - Update user profile
POST   /api/auth/change-password                            - Change password
POST   /api/auth/mfa/enable                                 - Enable MFA (TOTP)
POST   /api/auth/mfa/verify                                 - Verify MFA token
POST   /api/auth/mfa/disable                                - Disable MFA
GET    /api/auth/sessions                                   - List active sessions
DELETE /api/auth/sessions/:id                                - Revoke specific session
GET    /api/auth/oauth/:provider                            - OAuth redirect (Google/Microsoft/GitHub)
GET    /api/auth/oauth/:provider/callback                   - OAuth callback
```

### Voice Realtime API

```
POST   /api/:context/voice/session/start                    - Start voice session
POST   /api/:context/voice/session/:id/end                  - End voice session
GET    /api/:context/voice/session/:id/status                - Session status
POST   /api/:context/voice/tts                               - One-shot TTS
GET    /api/:context/voice/voices                            - Available TTS voices
GET    /api/:context/voice/settings                          - Get voice settings
PUT    /api/:context/voice/settings                          - Update voice settings
GET    /api/:context/voice/providers                         - Available STT/TTS providers
WS     /ws/voice                                             - WebSocket for voice streaming
```

### GraphRAG API

```
POST   /api/:context/graphrag/extract                        - Extract entities from text
GET    /api/:context/graphrag/entities                        - List entities (type, search, limit)
GET    /api/:context/graphrag/entities/:id                    - Get entity with relations
DELETE /api/:context/graphrag/entities/:id                    - Delete entity
POST   /api/:context/graphrag/retrieve                       - Hybrid retrieval (4 strategies)
GET    /api/:context/graphrag/communities                     - Get community summaries
POST   /api/:context/graphrag/communities/refresh             - Refresh community summaries
POST   /api/:context/graphrag/index                          - Trigger batch indexing
GET    /api/:context/graphrag/index/status                    - Get indexing status
```

### Memory Procedures API

```
GET    /api/:context/memory/procedures                       - List procedures (limit, outcome filter)
GET    /api/:context/memory/procedures/:id                   - Get single procedure
POST   /api/:context/memory/procedures                       - Record new procedure
POST   /api/:context/memory/procedures/recall                - Recall similar procedures
PUT    /api/:context/memory/procedures/:id/feedback           - Submit feedback/optimization
DELETE /api/:context/memory/procedures/:id                   - Delete procedure
GET    /api/:context/memory/bm25                             - BM25 full-text search
GET    /api/:context/memory/hybrid-search                    - Hybrid BM25+semantic search (RRF)
GET    /api/:context/memory/entity-links/:factId             - Get entity links for fact
```

### A2A Protocol API

```
GET    /.well-known/agent.json                               - Agent Card discovery (no auth)
POST   /api/a2a/tasks                                        - Create A2A task
GET    /api/a2a/tasks/:id                                    - Get task status
POST   /api/a2a/tasks/:id/messages                           - Send message to task
DELETE /api/a2a/tasks/:id                                    - Cancel task
GET    /api/a2a/tasks/:id/stream                             - SSE task progress
GET    /api/:context/a2a/tasks                               - List tasks for context
GET    /api/:context/a2a/external-agents                     - List external agents
POST   /api/:context/a2a/external-agents                     - Register external agent
DELETE /api/:context/a2a/external-agents/:id                 - Remove external agent
POST   /api/:context/a2a/external-agents/:id/health          - Health check agent
POST   /api/:context/a2a/external-agents/:id/send            - Send task to external agent
```

### Observability API

```
GET    /api/observability/metrics                               - Current metric snapshots
GET    /api/observability/queue-stats                           - All queue statistics
GET    /api/observability/queue-stats/:name                     - Single queue stats
GET    /api/observability/health                                - Extended health (queues + tracing)
POST   /api/observability/queue/:name/clean                     - Clean completed/failed jobs
```

### Security Admin API

```
GET    /api/security/audit-log                                  - Query audit log (filters: event_type, user_id, severity, date range)
GET    /api/security/audit-log/:id                              - Single audit entry
GET    /api/security/alerts                                     - Recent critical security events
GET    /api/security/rate-limits                                - Rate limit configuration
PUT    /api/security/rate-limits/:tier                           - Update rate limit tier
GET    /api/security/rate-limits/stats                           - Rate limit hit statistics
```

### Curiosity API

```
GET    /api/:context/curiosity/gaps                     - Detect knowledge gaps (top-5)
GET    /api/:context/curiosity/hypotheses                - List hypotheses (status filter)
POST   /api/:context/curiosity/hypotheses/:id/status     - Update hypothesis (confirmed/refuted)
GET    /api/:context/curiosity/information-gain          - Recent information gain events
GET    /api/:context/curiosity/summary                   - Aggregated curiosity stats
```

### Prediction API

```
GET    /api/:context/predictions/history                 - Prediction history (last 50)
GET    /api/:context/predictions/patterns                - Temporal + sequential patterns
GET    /api/:context/predictions/accuracy                - Accuracy over 7d/30d windows
GET    /api/:context/predictions/next                    - Current intent prediction
```

### Feedback & Adaptive API

```
GET    /api/:context/feedback/summary                    - Feedback statistics by type
POST   /api/:context/feedback/emit                       - Record feedback event
GET    /api/:context/adaptive/preferences                - Learned behavior preferences
PUT    /api/:context/adaptive/preferences                - Override preferences
GET    /api/:context/adaptive/style                      - Language style profile
```

### FSRS Review API

```
GET    /api/:context/memory/review-queue                 - Facts due for review (FSRS)
POST   /api/:context/memory/review/:factId               - Grade fact recall (1-5)
GET    /api/:context/memory/fsrs/stats                   - FSRS statistics
```

### Self-Improvement API

```
GET    /api/:context/self-improvement/opportunities      - Identify improvement actions
GET    /api/:context/self-improvement/budget              - Daily budget (max 3/day)
GET    /api/:context/self-improvement/history             - Past improvement actions
POST   /api/:context/self-improvement/:id/execute         - Execute improvement action
```

### Sleep Compute API

```
GET    /api/:context/sleep-compute/logs                          - Sleep compute logs
GET    /api/:context/sleep-compute/stats                         - Sleep compute statistics (7 days)
POST   /api/:context/sleep-compute/trigger                       - Manually trigger sleep cycle
GET    /api/:context/sleep-compute/idle-status                   - Check system idle status
POST   /api/:context/context-v2/classify                         - Classify query domain + complexity
POST   /api/:context/context-v2/assemble                         - Assemble minimum viable context
POST   /api/:context/context-v2/cache/clean                      - Clean expired context cache
```

### Agent Identity + Workflow API

```
GET    /api/agent-identities                                     - List agent identities (filter: role, enabled)
GET    /api/agent-identities/:id                                 - Get single agent identity
POST   /api/agent-identities                                     - Create agent identity
PUT    /api/agent-identities/:id                                 - Update agent identity
DELETE /api/agent-identities/:id                                 - Delete agent identity
POST   /api/agent-identities/:id/validate                        - Validate action against permissions
GET    /api/agent-workflows                                      - List saved workflows
GET    /api/agent-workflows/templates                             - Get pre-built workflow templates
GET    /api/agent-workflows/:id                                  - Get single workflow
POST   /api/agent-workflows                                      - Save workflow definition
DELETE /api/agent-workflows/:id                                  - Delete workflow
POST   /api/agent-workflows/:id/execute                          - Execute workflow graph
GET    /api/agent-workflow-runs                                   - List workflow execution runs
```

## Environment Variables

Copy `.env.example` to `.env` and configure. See the [Getting Started guide](docs/getting-started.md) for detailed setup instructions.

**Required:**
- `DATABASE_URL` - PostgreSQL connection string (with pgvector)
- `ANTHROPIC_API_KEY` - Claude API key

**Optional integrations (features degrade gracefully without these):**
- `REDIS_URL` - Redis for caching and BullMQ job queues
- `BRAVE_SEARCH_API_KEY` - Web search (falls back to DuckDuckGo)
- `JUDGE0_API_KEY` - Code execution in production (falls back to Docker locally)
- `GITHUB_PERSONAL_ACCESS_TOKEN` - GitHub tools
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` - Payment integration
- `GA4_PROPERTY_ID` / `GOOGLE_SERVICE_ACCOUNT_KEY` - Analytics
- `RESEND_API_KEY` - Email sending
- `ELEVENLABS_API_KEY` / `DEEPGRAM_API_KEY` - Voice (falls back to Whisper/Edge-TTS)
- `MISTRAL_API_KEY` - Mistral AI cloud fallback
- `OPENAI_API_KEY` - OpenAI fallback
- `OLLAMA_URL` - Local LLM inference
- `SENTRY_DSN` - Error tracking
- `ENCRYPTION_KEY` - AES-256 field-level encryption
- `JWT_SECRET` - JWT signing (auto-generated in dev)
- OAuth credentials for Google, Microsoft, GitHub login

See `.env.example` for the complete list with descriptions.

## API Key Scopes

The configured API key requires the following scopes:

| Scope | Required for |
|-------|-------------|
| `read` | All read operations (Ideas, Profile Stats, Notifications, etc.) |
| `write` | Write operations (create ideas, update profile, change preferences) |
| `admin` | API key/webhook management, Memory Admin |

**Generate an API key:**
```bash
cd backend && npm run create-web-key
```

The generated key includes all three scopes (`read`, `write`, `admin`) by default.

## Database Schema

The database uses 4 isolated schemas for context separation:

- `personal` - Personal knowledge and tasks
- `work` - Professional context
- `learning` - Educational content
- `creative` - Creative projects

Each schema contains ~95 identical tables. The backend routes queries to the correct schema via `queryContext(context, sql, params)`.

**Health check:** `GET /api/health/detailed` shows status of all connected services.

## Testing

### Test Commands

```bash
# Backend - Run all tests
cd backend && npm test

# Backend - Run a single test
cd backend && npm test -- --testPathPattern="intelligent-learning"

# Backend - Tests with coverage
cd backend && npm test -- --coverage

# Frontend (vitest)
cd frontend && npx vitest run
```

### Test Status (2026-04-06)

| Category | Passed | Skipped | Failed |
|----------|--------|---------|--------|
| **Backend** | 10141 | 24 | 0 |
| **Frontend** | 1340 | 0 | 0 |
| **CLI** | 108 | 0 | 0 |
| **Total** | 11589 | 24 | 0 |

**Intentionally skipped tests (24):**
- 21x Code-Execution Sandbox (Docker not available)
- 1x URL-Fetch Real-Request (Network)
- 2x SSL Certificate NODE_EXTRA_CA_CERTS (Environment)

### Test Structure

```
backend/src/__tests__/
├── integration/           # API integration tests
│   ├── analytics.test.ts
│   ├── automations.test.ts
│   ├── health.test.ts
│   ├── ideas.test.ts
│   ├── intelligent-learning.test.ts
│   ├── media.test.ts
│   ├── meetings.test.ts
│   ├── vision.test.ts
│   └── voice-memo.test.ts
├── unit/                  # Unit tests for services
│   ├── middleware/
│   ├── services/
│   └── mcp/
├── github.test.ts
├── project-context.test.ts
├── url-fetch.test.ts
└── web-search.test.ts
```

### Test Patterns

**1. Integration tests with errorHandler:**
```typescript
import { errorHandler } from '../../middleware/errorHandler';

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use('/api', router);
  app.use(errorHandler);  // Important for correct error responses
});
```

**2. Mock reset for isolated tests:**
```typescript
beforeEach(() => {
  jest.clearAllMocks();
  mockQueryContext.mockReset();  // Prevents mock interference
});
```

**3. TypeScript Literal Types with `as const`:**
```typescript
const mockData = {
  context: 'personal' as const,
  status: 'pending' as const,
  trigger: { type: 'schedule' as const, config: {} },
};
```

**4. Permissive tests for route variations:**
```typescript
// Accept multiple status codes when route implementation varies
expect([200, 404]).toContain(res.status);
if (res.status === 200 && res.body.data) {
  expect(res.body.data).toHaveProperty('expected');
}
```

**5. Mock sequencing:**
```typescript
// For multiple DB calls in one request
mockQueryContext
  .mockResolvedValueOnce({ rows: [item1] } as any)
  .mockResolvedValueOnce({ rows: [] } as any);
```

### Known Test Configurations

**TriggerType Enum (automations):**
- `webhook`, `schedule`, `event`, `manual`, `pattern`

**ActionType Enum (automations):**
- `webhook_call`, `notification`, `tag_idea`, `set_priority`, `move_to_topic`, `archive`, `create_task`, `send_email`

**AIContext Enum:**
- `personal`, `work`, `learning`, `creative`

## Documentation

- AI Features: `docs/AI-FEATURES.md`
- API Docs: `/api-docs` (Swagger, available when the server is running)

## Changelog

### 2026-03-22: Phase 141 -- Cognitive Architecture Frontend Visibility + Mistral Integration + Auth Fix

**All 20+ cognitive backend services (Phase 125-140) connected to frontend UI.**

| Feature | Details |
|---------|---------|
| **CognitiveDashboard Redesign** | 5 Sub-Tabs: Overview, Curiosity, Predictions, Memory, Improvement |
| **23 new API endpoints** | Curiosity (5), Predictions (4), Feedback/Adaptive (5), FSRS Review (3), Self-Improvement (4), Cognitive Health (1) |
| **14 React Query Hooks** | 11 Queries + 3 Mutations for all cognitive services |
| **Gamified FSRS Review Queue** | 5-grade rating scale (Forgot/Hard/OK/Easy/Perfect) |
| **Chat Feedback Buttons** | Thumbs up/down on AI responses (feeds Feedback Bus) |
| **SmartSurface Extension** | knowledge_gap + hypothesis suggestion types |
| **Metacognition Overview Fix** | Response format mismatch fixed (Backend to Frontend alignment) |
| **JWT Auth Fix (CRITICAL)** | apiKeyAuth delegates JWT tokens to jwtAuth instead of rejecting them as invalid API keys |
| **Mistral AI Integration** | Cloud provider between Claude and Ollama: mistral-small + mistral-large |
| **ESLint 596 to 0** | 5 Errors + 591 Warnings fully resolved (130 files) |

**Tests:** Backend 7720 + Frontend 1400 + CLI 108 = **9228 passed**, 24 skipped, 0 failures

---

### 2026-03-22: Phase 132 -- CLI Agent (108 new tests)

**ZenAI in the terminal: Agent Loop, File Tools, Backend Bridge, Session Persistence.**

| Feature | Details |
|---------|---------|
| **Agent Loop** | Claude Code pattern: single-threaded loop with tool execution, max-iterations guard, error recovery |
| **Filesystem Tools** | 6 tools: read_file, write_file, edit_file, list_files, search_content, run_command |
| **Backend Bridge** | API client for ZenAI backend: Memory (remember/recall), Web Search, Idea Search, Core Memory Blocks |
| **Terminal UI** | Chalk-based output: Markdown rendering, spinner, tool activity display |
| **Context Management** | .zenai/ directory, session persistence (JSON), project detection (11 types) |
| **Hybrid Architecture** | Local file tools + backend API for Memory/KG/RAG -- one memory store for Web UI and CLI |

---

### 2026-03-22: Phases 125-140 -- Cognitive Architecture (1100+ new tests)

**ZenAI's cognitive architecture: 16 phases, 30+ new services, 1100+ new tests.**

| Phase | Pillar | Highlights |
|-------|--------|------------|
| **125** | Memory | Hebbian KG (Co-Activation, Decay, Normalization), FSRS Spaced Repetition, Bayesian Confidence Propagation |
| **126** | Memory | Pinned Core Memory Blocks (Letta-Pattern), Cross-Context Entity Merging, 3 new Claude Tools |
| **127** | Reasoning | Global Workspace Theory (competitive context assembly), Query Analyzer, 8 Specialist Modules, Fact Checker |
| **128** | Reasoning | Chain-of-Thought Persistence (pgvector similarity), Multi-Hop Inference Engine |
| **129** | Agents | Persistent Agent Loops (Checkpoints, Pause/Resume), Context Isolation, Debate Protocol |
| **130** | Agents | Tool Composition Engine, Dynamic Team Builder (5 specialists) |
| **131** | Output | Document Generation Suite (PPTX, XLSX, PDF, DOCX), 5 Templates |
| **133** | Curiosity | Knowledge Gap Detection, Information Gain Scoring, Hypothesis Engine |
| **134** | Prediction | Pattern Tracker, Prediction Engine, Prediction Error Learning |
| **135-136** | Meta-Cognition | Confidence Calibration, Confusion Detection, Capability Profiling |
| **137-138** | Feedback | Unified Feedback Bus, Adaptive Behavior Engine, Style Learner |
| **139-140** | Integration | Cross-Pillar Pipeline, Self-Improvement Engine |

---

### 2026-03-21: Phases 119-124 -- Quality & Test Coverage Sprint

**Massive quality improvements: file decomposition, test expansion, security fixes.**

| Phase | Highlights |
|-------|------------|
| **119** | Deep Quality Audit (6 parallel workers), tool-use.ts decomposed (1689 to 215 LOC) |
| **120** | File Decomposition + 211 new tests, SystemAdminPage split into 6 files |
| **121** | Deep Decomposition + 215 new tests, GeneralChat/ProceduralMemory/AgentTeams split |
| **122** | Handler Splits + 163 new tests, ideas-handlers + general-chat-handlers extracted |
| **123** | 358 new tests across 30 files (largest pure test push) |
| **124** | 351 new tests + all 12 Dependabot vulnerabilities fixed, route coverage 38% to 98% |

---

### 2026-03-20: Phases 115-118 -- Polish & Differentiation

| Phase | Highlights |
|-------|------------|
| **115** | Proactive Intelligence 2.0: Relevance scoring, personalized timing, dedup & merge |
| **116** | Voice Experience: VoiceInputButton, emotion detection, morning briefing |
| **117** | Database Cleanup: RLS activation, IVFFlat to HNSW indexes, schema cleanup |
| **118** | Performance: Code splitting (7 chunks), spring animations, accessibility |

---

### 2026-03-18: Phase 100 -- Deep Excellence (20 fixes, research-based)

**Based on Letta/MemGPT, CRAG, Anthropic Contextual Retrieval, LangGraph, ICLR 2026 MemAgents.**

| Area | Highlights |
|------|------------|
| **AI Core** | Self-Editing Memory, Contextual Retrieval, CRAG Quality Gate, LLM-based Consolidation, Token Budget |
| **Agent System** | Parallel Execution, Persistent Shared Memory, Dynamic Teams, Semantic Tool Search |
| **Chat UX** | Edit & Regenerate (tree branching), Persistent Tool Disclosure, Expandable Thinking, Auto Titles |
| **Design System** | Glass Variants, Inline Error Recovery, Navigation Cleanup, React Query Completion, Confidence Indicators |

---

### 2026-03-18: Phase 99 -- Deep Quality Evolution (50 fixes, 4 dimensions)

| Dimension | Highlights |
|-----------|------------|
| **Backend Hardening** | Request timeout, tool limits, error sanitization, atomic consolidation, safe JSON |
| **AI Core** | Contextual Retrieval, Tool Search Tool, Dynamic RAG weights, Self-RAG Critique, Embedding Drift |
| **Frontend Architecture** | Chat State Machine, centralized error handler, shared config, intelligent retry |
| **Accessibility** | ARIA loading, tool labels, source citations, keyboard navigation, page skeletons |

---

### 2026-03-18: Phase 97 -- Quality Excellence Sprint (59 fixes)

| Area | Key Fixes |
|------|-----------|
| **Security** | SQL injection fix, encryption enforcement, auth rate limits |
| **Database** | 60 composite indexes, FK constraints, pool monitoring |
| **AI/LLM** | Temperature defaults, token estimation, request IDs, SSE limits |
| **RAG** | Cache invalidation, heuristic reranker, A-RAG thresholds |
| **Frontend** | React Query migration (4 to 8 modules), aria-live, structured logging |

---

### Earlier Phases (54-96)

See the internal changelog for detailed phase-by-phase history covering:
- Phase 54: AI OS Architecture (Governance, Temporal KG, Durable Agents, Context Engineering, Proactive Engine)
- Phase 55-56: MCP SDK + OAuth/JWT Multi-User
- Phase 57-58: Real-Time Voice + GraphRAG
- Phase 59-60: Memory Excellence (Letta-Paradigm) + A2A Protocol
- Phase 61-62: Observability + Queue + Enterprise Security + PWA
- Phase 63-64: Sleep-Time Compute + Agent Identity + LangGraph
- Phase 65-66: Multi-User Data Isolation + Security Hardening
- Phase 67-68: Performance/Caching + Design System
- Phase 69-75: Proactive Intelligence UX, A-RAG, MCP Ecosystem, Neuroscience Memory, AI Observability, Edge Inference, Extension System
- Phase 76-77: Tool Visualization + Foundation Excellence
