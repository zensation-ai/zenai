# ZenAI

<div align="center">
  <img src="frontend/public/zenai-brain.svg" alt="ZenAI Logo" width="120" />

  **Enterprise AI Platform by ZenSation Enterprise Solutions**

  [![Website](https://img.shields.io/badge/Website-zensation.ai-667eea)](https://zensation.ai)
  [![App](https://img.shields.io/badge/App-zensation.app-764ba2)](https://zensation.app)
  [![Platform](https://img.shields.io/badge/Platform-zensation.sh-f093fb)](https://zensation.sh)

  *© 2026 Alexander Bering. All rights reserved.*
</div>

---

A powerful enterprise AI platform that captures, structures, and connects your ideas across personal and work contexts with state-of-the-art AI capabilities.

## Features

### Phase 21: Personalization Chat
- AI learns about you through conversational questions
- Stores personal facts across 10 categories (personality, goals, preferences, etc.)
- Tracks learning progress
- Available in Profile → "Lerne mich kennen"

### Context-Aware Recording
- **Personal Context**: Exploratory, creative thinking
- **Work Context**: Structured, business-focused
- Voice memos, photos, and text input
- AI-powered structuring with automatic categorization

### Offline Support
- Queue recordings when offline
- Automatic sync when connection restored
- Full offline capability for capturing ideas

### Knowledge Graph
- Automatic relationship detection between ideas
- Visual graph exploration
- Topic clustering

### Export & Backup
- PDF, Markdown, CSV, JSON exports
- Full backup functionality

## Tech Stack

### Backend
- **Node.js** + **TypeScript** + **Express**
- **PostgreSQL** with dual-context databases (personal/work)
- **OpenAI** for AI structuring (with Ollama fallback)
- **Redis** for caching (optional)
- **Whisper** for voice transcription
- Deployed on **Railway**

### iOS App
- **SwiftUI** (iOS 17+)
- Modern async/await architecture
- Context switcher for Personal/Work
- Offline-first design

### Infrastructure
- **GitHub Actions** CI/CD
- **Railway** for backend hosting
- Production URL: `https://zenai-production.up.railway.app`

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ (or Railway database)
- OpenAI API key (recommended) or Ollama (local)
- Xcode 15+ (for iOS development)

### Backend Setup

1. **Clone and install**
   ```bash
   cd backend
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your values:
   # - DATABASE_URL (Railway provides this)
   # - OPENAI_API_KEY (get from https://platform.openai.com/api-keys)
   ```

3. **Initialize database**
   ```bash
   # Railway PostgreSQL already configured
   # Schema applied automatically on deployment
   ```

4. **Run locally**
   ```bash
   npm run dev
   ```

5. **Build**
   ```bash
   npm run build
   ```

### iOS Setup

1. **Open project**
   ```bash
   cd ios
   open PersonalAIBrain.xcodeproj
   ```

2. **Configure API URL**
   - For simulator: Uses Railway production URL
   - For real devices: Uses Railway production URL
   - See `ios/PersonalAIBrain/Services/APIService.swift`

3. **Run**
   - Select simulator or device
   - Press ⌘R to build and run

## Environment Variables

### Backend (.env)

```bash
# Database (provided by Railway)
DATABASE_URL=postgresql://user:password@host:5432/railway

# AI Services
OPENAI_API_KEY=sk-...              # Recommended for production
OPENAI_MODEL=gpt-4o-mini           # or gpt-4o
OLLAMA_URL=http://localhost:11434  # Fallback for local development

# Optional: Redis Caching
REDIS_URL=redis://localhost:6379

# Server
PORT=3000
NODE_ENV=production
```

### Railway Environment Variables

Set these in Railway Dashboard → Variables:
- `OPENAI_API_KEY` - Your OpenAI API key

## API Endpoints

### Core APIs
- `POST /api/voice-memo` - Submit voice memo (audio or text)
- `GET /api/:context/ideas` - Get ideas for context (personal/work)
- `GET /api/health` - Health check with service status

### Phase 21: Personalization
- `GET /api/personalization/start` - Start learning conversation
- `POST /api/personalization/chat` - Send message
- `GET /api/personalization/facts` - Get learned facts
- `GET /api/personalization/progress` - Learning progress
- `GET /api/personalization/summary` - AI-generated summary

### Export
- `POST /api/export/ideas/pdf` - Export ideas as PDF
- `POST /api/export/ideas/markdown` - Export as Markdown
- `POST /api/export/backup` - Full backup

[Full API documentation available at `/api-docs` when running]

## Development

### Backend Development

```bash
cd backend
npm run dev          # Start dev server with auto-reload
npm run build        # Build TypeScript
npm test            # Run tests (if available)
```

### iOS Development

- Use Xcode for development
- SwiftUI previews available for most views
- Supports iOS 17.0+

### CI/CD

GitHub Actions automatically:
- Builds and tests backend on every push
- Validates iOS build on PRs
- Railway auto-deploys on push to main

## Architecture

### Dual-Context System
- **Personal Database**: Private thoughts, personal projects
- **Work Database**: Business ideas, work tasks
- Separate storage, shared schema
- Context switching in UI

### AI Service Layer
Priority fallback chain:
1. **OpenAI** (if API key configured) - Best quality
2. **Ollama** (if running locally) - Free, private
3. **Basic fallback** (no AI) - Always works

### Offline Architecture
- Queue pending operations
- Automatic background sync
- Optimistic UI updates

## Project Structure

```
.
├── backend/
│   ├── src/
│   │   ├── routes/          # API endpoints
│   │   ├── services/        # Business logic (AI, OpenAI, Whisper)
│   │   ├── utils/           # Helpers (database, cache, logger)
│   │   └── middleware/      # Express middleware
│   ├── sql/                 # Database schemas
│   └── package.json
├── ios/
│   └── PersonalAIBrain/
│       ├── Views/           # SwiftUI views
│       ├── Services/        # API client, audio recorder
│       └── Models/          # Data models
├── .github/
│   └── workflows/           # CI/CD pipelines
└── EXECUTION_PLAN.md        # Development roadmap
```

## Deployment

### Backend (Railway)

Railway automatically deploys from GitHub on push to `main`:
1. Push to GitHub
2. Railway detects changes
3. Builds and deploys automatically
4. Health check: `https://ki-ab-production.up.railway.app/api/health`

### iOS (TestFlight)

See [EXECUTION_PLAN.md](EXECUTION_PLAN.md) Block 6 for TestFlight setup instructions.

## Contributing

This is a personal project, but suggestions are welcome via issues.

## License

**Proprietary Software** - © 2026 Alexander Bering / ZenSation Enterprise Solutions. All rights reserved.

This software and associated documentation files are proprietary and confidential. Unauthorized copying, modification, distribution, or use of this software, via any medium, is strictly prohibited without express written permission from ZenSation Enterprise Solutions.

## Support

For enterprise support and inquiries:
- Visit [zensation.ai](https://zensation.ai)
- Check API documentation at `/api-docs`
- Contact: alex@zensation.ai

## ZenSation Enterprise Solutions

ZenAI is the flagship AI platform by ZenSation Enterprise Solutions, providing cutting-edge artificial intelligence solutions for businesses and individuals.

**Our Platforms:**
- **[zensation.ai](https://zensation.ai)** - Enterprise AI Solutions
- **[zensation.app](https://zensation.app)** - Application Platform
- **[zensation.sh](https://zensation.sh)** - Developer Tools

---

<div align="center">

  **ZenAI - Enterprise AI Platform**

  Phase 31 • Vision Integration • Claude AI Powered

  Built with excellence by [Alexander Bering](https://zensation.ai)

  *© 2026 ZenSation Enterprise Solutions*

</div>
