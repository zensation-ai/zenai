<p align="center">
  <h1 align="center">ZenAI</h1>
  <p align="center"><strong>The AI OS that remembers. Self-hosted. Open source.</strong></p>
  <p align="center">55 AI tools. 9,228 tests. 7-layer neuroscience-inspired memory. Built on <a href="https://github.com/zensation-ai/zenbrain">ZenBrain</a>.</p>
</p>

<p align="center">
  <a href="https://github.com/zensation-ai/zenai/stargazers"><img src="https://img.shields.io/github/stars/zensation-ai/zenai?style=social" alt="GitHub stars"></a>
  <a href="https://github.com/zensation-ai/zenbrain"><img src="https://img.shields.io/badge/memory-ZenBrain-blue" alt="Built on ZenBrain"></a>
  <a href="https://github.com/zensation-ai/zenai/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7+-blue.svg" alt="TypeScript"></a>
</p>

---

## What is ZenAI?

ZenAI is a self-hosted AI platform with neuroscience-inspired memory. Unlike ChatGPT or Claude, ZenAI remembers your conversations, learns from your preferences, and improves over time — using the same mechanisms your brain uses.

### Key Features

- **55 AI Tools** across 14 categories (memory, web search, code execution, GitHub, maps, email, documents, and more)
- **7-Layer Memory** (Working, Short-Term, Episodic, Semantic, Procedural, Core, Cross-Context) powered by [ZenBrain](https://github.com/zensation-ai/zenbrain)
- **FSRS Spaced Repetition** — your AI never forgets what matters
- **4 Context Isolation** — separate memory for personal, work, learning, and creative
- **Multi-Agent System** — researcher, writer, reviewer, coder agents with debate protocol
- **RAG Pipeline** — HyDE + Cross-Encoder reranking + GraphRAG hybrid retrieval
- **Real-Time Voice** — WebSocket STT/TTS pipeline with turn-taking
- **Extended Thinking** — visible AI reasoning with budget management
- **Sleep-Time Compute** — background memory consolidation and contradiction detection
- **MCP Ecosystem** — connect external tools via Model Context Protocol

### Architecture

```
Frontend: React + TypeScript (Vite)
Backend:  Express.js + TypeScript
AI:       Claude API (primary), Mistral (fallback), Ollama (local)
Database: PostgreSQL + pgvector (4 isolated schemas)
Memory:   ZenBrain 7-layer architecture
Cache:    Redis (optional)
```

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+ with pgvector extension
- Anthropic API key

### Setup

```bash
# Clone
git clone https://github.com/zensation-ai/zenai.git
cd zenai

# Backend
cd backend
cp .env.example .env
# Edit .env with your DATABASE_URL and ANTHROPIC_API_KEY
npm install
npm run build
npm run dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### Docker Compose (Coming Soon)

```bash
docker compose up -d
```

## API

ZenAI exposes 250+ API endpoints. Key areas:

| Area | Endpoints | Description |
|------|-----------|-------------|
| Chat | `/api/chat/*` | Streaming chat with tool use, vision, artifacts |
| Memory | `/api/:context/memory/*` | FSRS review, procedures, hybrid search |
| Ideas | `/api/:context/ideas/*` | CRUD with semantic search, topics, drafts |
| Tasks | `/api/:context/tasks/*` | Kanban, Gantt, dependencies, projects |
| Email | `/api/:context/emails/*` | Send/receive with AI categorization |
| Agents | `/api/agents/*` | Multi-agent execution, templates, streaming |
| Knowledge Graph | `/api/:context/graphrag/*` | Entity extraction, hybrid retrieval |
| Voice | `/api/:context/voice/*` | Real-time STT/TTS pipeline |

Full API documentation: `/api-docs` (Swagger UI when running)

## Testing

```bash
# Backend (9,228 tests)
cd backend && npm test

# Frontend (1,400 tests)
cd frontend && npx vitest run

# CLI (108 tests)
cd cli && npm test
```

## Memory System

ZenAI's memory is powered by [ZenBrain](https://github.com/zensation-ai/zenbrain) — the neuroscience-inspired memory system:

| Layer | Inspired By | Function |
|-------|------------|----------|
| Working Memory | Baddeley (1974) | Active task focus (7±2 items) |
| Short-Term | Session context | Current conversation |
| Episodic | Tulving (1972) | Concrete experiences |
| Semantic | FSRS + Ebbinghaus | Facts with spaced repetition |
| Procedural | Cognitive psychology | "How to do X" skills |
| Core | Letta/MemGPT | Pinned, user-editable facts |
| Cross-Context | Novel | Shared knowledge across domains |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

[Apache 2.0](./LICENSE)

---

<p align="center">
  Built by <a href="https://zensation.ai">ZenSation</a> in Kiel, Germany.
</p>
