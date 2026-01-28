# ZenAI Feature Roadmap 2026
## Realistische Erweiterungen basierend auf bestehender Architektur

---

## Überraschende Entdeckung: Was wir bereits haben!

Bei der Analyse wurde festgestellt, dass einige "fehlende" Features bereits **implementiert** sind:

| Feature | Status | Details |
|---------|--------|---------|
| **MCP Server** | ✅ Existiert! | 5 Tools, Resources, `/mcp/server.ts` |
| **Whisper Audio** | ✅ Existiert! | Lokal + Cloud Fallback |
| **Webhooks** | ✅ Existiert! | HMAC, Retry, Multi-Event |
| **Slack Integration** | ✅ Existiert! | OAuth2, Slash Commands |
| **Microsoft 365** | ✅ Existiert! | Calendar Sync, Events |
| **Document Processing** | ✅ Existiert! | OCR, Multi-Format |

---

## TIER 1: Quick Wins (3-5 Tage pro Feature)

Diese Features bauen direkt auf bestehender Infrastruktur auf.

### 1. Web Search Tool ⭐⭐⭐⭐⭐
**Aufwand:** 3-4 Tage | **Impact:** Hoch

**Was wir haben:**
- Axios HTTP-Client (`webhooks.ts`)
- Tool-Use System (`tool-handlers.ts`)
- MCP Server Framework

**Implementierung:**
```
1. Neuer Service: /services/web-search.ts
   - SearXNG (Self-hosted) oder Brave Search API
   - Keine Google-Abhängigkeit, privacy-first

2. Neues Tool: web_search
   - Query → Search → Top 5 Results mit Snippets
   - Optional: Page-Fetch für Details

3. MCP Tool hinzufügen
```

**Warum sinnvoll:** Behebt kritischen Gap "kein Live Internet"

---

### 2. Voice Recording im Frontend ⭐⭐⭐⭐⭐
**Aufwand:** 3-4 Tage | **Impact:** Hoch

**Was wir haben:**
- Whisper-Service Backend (transkription funktioniert)
- MediaRecorder API (Browser-native)
- File-Upload Route existiert

**Implementierung:**
```
1. Frontend Component: VoiceRecorder.tsx
   - MediaRecorder API
   - Push-to-Talk oder Toggle
   - Visualizer (optional)

2. Workflow:
   - Record → Blob → Upload → Whisper → Text → Chat

3. Integration in GeneralChat.tsx
   - Microphone-Button neben Send
```

**Warum sinnvoll:** Whisper existiert, nur Frontend fehlt!

---

### 3. Artifacts/Preview System ⭐⭐⭐⭐
**Aufwand:** 5-7 Tage | **Impact:** Mittel-Hoch

**Was wir haben:**
- CodeExecutionResult.tsx (Code Display)
- Syntax Highlighting
- Copy/Collapse Funktionen

**Implementierung:**
```
1. Artifact Types:
   - code: Syntax-highlighted mit Run-Button
   - markdown: Rendered Preview
   - html: Sandboxed iframe
   - csv/json: Table View
   - mermaid: Diagramm Render

2. Component: ArtifactPanel.tsx
   - Slide-out Panel (wie Claude)
   - Tab-System für mehrere Artifacts

3. Backend: Artifact Detection in Response
```

**Warum sinnvoll:** Differenziert uns von reinen Chatbots

---

### 4. GitHub Integration ⭐⭐⭐⭐
**Aufwand:** 4-5 Tage | **Impact:** Mittel

**Was wir haben:**
- OAuth2-Pattern von Slack/Microsoft
- Webhook-Handler
- MCP Server

**Implementierung:**
```
1. Service: /services/github.ts
   - OAuth2 Flow (identisch zu Slack)
   - Issue/PR Webhooks

2. Tools:
   - search_repos: Code-Suche
   - create_issue: Issue erstellen
   - get_pr_summary: PR-Zusammenfassung

3. Use Case: Ideen → GitHub Issues
```

---

### 5. URL/Link Fetch Tool ⭐⭐⭐⭐⭐
**Aufwand:** 2-3 Tage | **Impact:** Hoch

**Was wir haben:**
- Axios HTTP-Client
- Document Processing (HTML → Text)

**Implementierung:**
```
1. Tool: fetch_url
   - URL → HTML → Clean Text
   - Readability-like Extraction
   - Metadata (Title, Description, Images)

2. Library: @mozilla/readability oder cheerio

3. Use Case: "Fasse diesen Artikel zusammen: [URL]"
```

**Warum sinnvoll:** Extrem nützlich, minimaler Aufwand

---

## TIER 2: Medium Effort (1-2 Wochen pro Feature)

### 6. Multi-File/Project Context ⭐⭐⭐⭐
**Aufwand:** 1-2 Wochen | **Impact:** Hoch

**Was wir haben:**
- File-Upload System
- RAG Pipeline
- Session Context

**Implementierung:**
```
1. Project Entity in DB
   - Name, Description, Files[]
   - Persistent Context

2. Project-aware RAG
   - Automatische File-Embedding
   - Project-scoped Search

3. UI: Project Sidebar
   - Drag & Drop Files
   - Project Switching
```

**Warum sinnvoll:** Wie Claude Projects, aber mit unserem Memory-System

---

### 7. Email Integration (Gmail/Outlook) ⭐⭐⭐
**Aufwand:** 1-2 Wochen | **Impact:** Mittel

**Was wir haben:**
- Microsoft OAuth (Outlook halbfertig)
- Webhook System

**Implementierung:**
```
1. Gmail API Integration
   - OAuth2 (wie Microsoft)
   - Read/Send/Label

2. Tools:
   - search_emails
   - send_email
   - summarize_thread

3. Automation: Email → Idea Extraction
```

---

### 8. Scheduled Tasks/Reminders ⭐⭐⭐⭐
**Aufwand:** 1 Woche | **Impact:** Mittel-Hoch

**Was wir haben:**
- Memory Scheduler (Cron-Jobs existieren)
- Proactive Suggestions Service

**Implementierung:**
```
1. Reminder Entity
   - Time, Message, Recurrence
   - Linked to Ideas/Tasks

2. Notification System
   - Browser Push Notifications
   - Email Fallback

3. Natural Language: "Erinnere mich morgen um 9..."
```

---

### 9. Canvas/Whiteboard Mode ⭐⭐⭐
**Aufwand:** 2 Wochen | **Impact:** Mittel

**Was wir haben:**
- Knowledge Graph (Backend)
- React Frontend

**Implementierung:**
```
1. Library: React Flow oder TLDraw

2. Features:
   - Ideas als Nodes
   - Connections visualisieren
   - Drag & Drop Arrangement
   - AI-suggested Connections

3. Integration mit Knowledge Graph Service
```

---

## TIER 3: Strategic Features (3-4 Wochen)

### 10. Browser Extension ⭐⭐⭐⭐
**Aufwand:** 3-4 Wochen | **Impact:** Hoch

**Was wir haben:**
- MCP Server (kann als Backend dienen)
- API Endpoints

**Implementierung:**
```
1. Chrome/Firefox Extension
   - Floating Chat Widget
   - Page Context Extraction
   - Quick Capture → Idea

2. Features:
   - "Explain this page"
   - "Save as Idea"
   - "Related Ideas"
```

---

### 11. Real-time Voice Conversation ⭐⭐⭐
**Aufwand:** 3-4 Wochen | **Impact:** Hoch (aber komplex)

**Was wir haben:**
- Whisper (Speech-to-Text)
- Claude Streaming

**Was fehlt:**
- Text-to-Speech (ElevenLabs/OpenAI TTS)
- WebRTC für Low-Latency
- Voice Activity Detection

**Bewertung:** Machbar, aber erfordert externe Services (ElevenLabs ~$5/mo)

---

## Nicht empfohlen (zu komplex/geringer Nutzen)

| Feature | Grund |
|---------|-------|
| **Computer Use** | Erfordert Browser-Automation-Infrastruktur, Security-Risiken |
| **Image Generation** | Erfordert DALL-E/Midjourney API, hohe Kosten, off-brand |
| **Video Processing** | Hoher Compute-Aufwand, GPU erforderlich |
| **Custom Fine-Tuning** | Anthropic bietet das nicht an, würde OpenAI erfordern |

---

## Empfohlene Reihenfolge

### Phase 1 (Nächste 2 Wochen)
1. **URL Fetch Tool** (2-3 Tage) - Sofortiger Mehrwert
2. **Voice Recording Frontend** (3-4 Tage) - Whisper endlich nutzbar
3. **Web Search Tool** (3-4 Tage) - Kritischer Gap geschlossen

### Phase 2 (Wochen 3-4)
4. **Artifacts System** (5-7 Tage) - UX Upgrade
5. **GitHub Integration** (4-5 Tage) - Developer-Fokus

### Phase 3 (Wochen 5-8)
6. **Project/Workspace Context** (1-2 Wochen)
7. **Scheduled Reminders** (1 Woche)

---

## Zusammenfassung

| Priorität | Feature | Aufwand | Nutzen |
|-----------|---------|---------|--------|
| 🔴 Hoch | URL Fetch | 2-3 Tage | ⭐⭐⭐⭐⭐ |
| 🔴 Hoch | Voice Recording | 3-4 Tage | ⭐⭐⭐⭐⭐ |
| 🔴 Hoch | Web Search | 3-4 Tage | ⭐⭐⭐⭐⭐ |
| 🟡 Mittel | Artifacts | 5-7 Tage | ⭐⭐⭐⭐ |
| 🟡 Mittel | GitHub | 4-5 Tage | ⭐⭐⭐⭐ |
| 🟢 Nice | Projects | 1-2 Wo. | ⭐⭐⭐⭐ |
| 🟢 Nice | Reminders | 1 Woche | ⭐⭐⭐ |

**Gesamtaufwand Phase 1-2:** ~3-4 Wochen für 5 signifikante Features

---

*Erstellt: Januar 2026*
*Basierend auf: Codebase-Analyse und Competitive Analysis*
