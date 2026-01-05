# 🚀 AI Toolkit Integration - Komplett-Guide

**Erstellt:** 5. Januar 2026
**Status:** ✅ Ready for Testing
**Phase:** Prompt-Optimierung

---

## 📋 Was wurde erstellt?

### 1. VS Code Workspace Configuration

✅ [.vscode/settings.json](.vscode/settings.json)
- Ollama-Models registriert (`mistral`, `nomic-embed-text`)
- TypeScript konfiguriert
- AI Toolkit Agents Path definiert

### 2. Persona Agent Definitionen

✅ [.vscode/agents/personal-persona.json](.vscode/agents/personal-persona.json)
- **Personal Companion** Agent
- Temperature: 0.7 (kreativ, explorativ)
- Fokus: Inkubation, assoziative Verbindungen
- 3 Beispiel-Interaktionen

✅ [.vscode/agents/work-persona.json](.vscode/agents/work-persona.json)
- **Business Coordinator** Agent
- Temperature: 0.3 (fokussiert, strukturiert)
- Fokus: Sofortige JSON-Strukturierung
- 3 Business-Beispiele (EwS, 1komma5, Team)

### 3. Umfangreiche Test Suites

✅ [.vscode/agents/test-cases-personal.json](.vscode/agents/test-cases-personal.json)
- **10 realistische Test Cases** für Personal Persona
- Tests für: Familie, Meditation, Reisen, Stress, Hobbys, Life-Reflection
- Evaluation Metrics für Ton, Exploration, Vermeidung von Struktur

✅ [.vscode/agents/test-cases-work.json](.vscode/agents/test-cases-work.json)
- **10 Business Test Cases** für Work Persona
- Tests für: Kunden-Probleme, 1komma5, Marketing, Strategie, Team
- Evaluation Metrics für JSON-Struktur, Kategorisierung, Priority

### 4. Automatisches Evaluierungs-System

✅ [.vscode/agents/evaluate-personas.ts](.vscode/agents/evaluate-personas.ts)
- **TypeScript-basiertes Evaluation Framework**
- Läuft alle Test Cases automatisch
- Scoring-System (0-100 Punkte pro Test)
- Generiert detaillierte Markdown-Reports
- Konkrete Optimierungs-Empfehlungen

✅ [.vscode/agents/package.json](.vscode/agents/package.json)
- NPM Scripts für einfache Ausführung
- Dependencies für TypeScript & Axios

### 5. Dokumentation

✅ [.vscode/agents/README.md](.vscode/agents/README.md)
- **Kompletter User Guide** (150+ Zeilen)
- Quick Start, Testing, Optimization Workflow
- Troubleshooting, Integration Guide
- Advanced: Fine-Tuning Anleitung

---

## 🎯 Sofort loslegen: Quick Start

### Schritt 1: Dependencies installieren

```bash
cd /Users/alexanderbering/Projects/KI-AB/.vscode/agents
npm install
```

### Schritt 2: Ollama prüfen

```bash
ollama list
# Sollte zeigen:
# - mistral:latest
# - nomic-embed-text:latest

# Falls nicht laufend:
ollama serve
```

### Schritt 3: Erste Evaluation laufen lassen

```bash
cd /Users/alexanderbering/Projects/KI-AB/.vscode/agents
npm run evaluate
```

**Output:**
```
📊 EVALUATING PERSONAL PERSONA
--- Testing: personal-001 ---
Input: Mir kam der Gedanke, dass ich mehr Zeit mit Familie brauche
Response: Was löst das in dir aus? ...
Score: 85/100 ✅

📊 EVALUATING WORK PERSONA
--- Testing: work-001 ---
Input: Kunde Meyer hat Problem mit PV-Anlage, dringend
Response: {"title": "Kunde Meyer: PV-Anlage Problem", ...}
Score: 92/100 ✅

✅ Reports saved:
- evaluation-report-personal-2026-01-05.md
- evaluation-report-work-2026-01-05.md
```

### Schritt 4: Reports analysieren

```bash
# Reports öffnen
code .vscode/agents/evaluation-report-personal-*.md
code .vscode/agents/evaluation-report-work-*.md
```

**Prüfe:**
- Durchschnittlicher Score (Ziel: >85%)
- Warnings & Feedback
- Empfehlungen am Ende

---

## 🔧 Optimization Loop

### Iterativer Prozess:

```
1. Baseline Run
   ↓
2. Reports analysieren
   ↓
3. Prompts anpassen (in .json Files)
   ↓
4. Re-Evaluation
   ↓
5. Vergleichen: Besser geworden?
   ↓
   Ja → Production Update
   Nein → Zurück zu Schritt 3
```

### Konkrete Optimierungen:

#### Personal Persona verbessern:

**Problem gefunden:** Score <70%, Persona strukturiert trotzdem

**Lösung:** [personal-persona.json](.vscode/agents/personal-persona.json) editieren:

```json
{
  "instructions": "...

  ⚠️ KRITISCH - NIE STRUKTURIEREN:
  - Du erstellst NIEMALS JSON
  - Du kategorisierst NIEMALS
  - Du planst NIEMALS Next Steps
  - Du inkubierst und stellst Fragen

  ..."
}
```

Dann:
```bash
npm run evaluate
```

#### Work Persona verbessern:

**Problem gefunden:** JSON-Fehler, falsche Kategorien

**Lösung:** [work-persona.json](.vscode/agents/work-persona.json) editieren:

```json
{
  "instructions": "...

  KATEGORISIERUNG (EXAKT):
  - EwS: Elektro wie Schmidt Hauptgeschäft
    → Beispiele: Kunden-Service, Installations-Jobs, PV-Anlagen
  - 1komma5: Partner-Projekt
    → Beispiele: 1komma5 Marketing, Integration, Strategie
  - Kunden: Allgemeine Anfragen (nicht EwS-spezifisch)
  ...

  ANTWORTE NUR MIT DIESEM JSON (KEINE ERKLÄRUNG):
  {
    \"title\": \"...\",
    \"type\": \"idea|task|problem|question|insight\",
    ...
  }
  "
}
```

---

## 📊 Was die Evaluation misst

### Personal Persona (Inkubations-Check)

| Kriterium | Gewichtung | Beschreibung |
|-----------|------------|--------------|
| **Forbidden Words** | -20 Punkte | Business-Begriffe wie "Next Steps", "Deadline" |
| **Strukturierung** | -30 Punkte | JSON, Kategorien → sofortiges Fail |
| **Fragen stellen** | -10 Punkte | Muss explorative Fragen enthalten |
| **Warme Formulierungen** | -15 Punkte | "Was", "Wie", "Hast du", etc. |
| **Response-Länge** | -10 Punkte | Nicht zu kurz (min. 50 Zeichen) |

**Pass-Grenze:** 60/100
**Excellent:** 85+/100

### Work Persona (Strukturierungs-Check)

| Kriterium | Gewichtung | Beschreibung |
|-----------|------------|--------------|
| **JSON-Struktur** | -50 Punkte | Kein JSON → Kritischer Fail |
| **Required Fields** | -10/Field | title, type, category, priority, summary, next_steps |
| **Kategorie-Validität** | -15 Punkte | Ungültige Kategorie |
| **Kategorie-Accuracy** | -10 Punkte | Falsch kategorisiert |
| **Priority-Validität** | -10 Punkte | Muss low\|medium\|high sein |
| **Next Steps Qualität** | -10 Punkte | Leer oder zu vage |

**Pass-Grenze:** 70/100
**Excellent:** 85+/100

---

## 🔄 Integration in Production

### Nach erfolgreicher Optimierung (Score >85%):

#### 1. Optimierte Prompts übernehmen

```bash
# Öffne Backend Personas Config
code /Users/alexanderbering/Projects/KI-AB/backend/src/config/personas.ts
```

Ersetze die `systemPrompt` Strings mit den optimierten Versionen aus:
- `.vscode/agents/personal-persona.json` → `instructions` Field
- `.vscode/agents/work-persona.json` → `instructions` Field

#### 2. Backend neu kompilieren

```bash
cd /Users/alexanderbering/Projects/KI-AB/backend
npx tsc
node dist/main.js
```

Prüfe Startup-Log:
```
🧠 Personal AI System - Backend (Phase 6: Dual-Context)
========================================================
✅ All databases connected successfully
```

#### 3. Live-Testing via API

```bash
# Personal Context
curl -X POST http://localhost:3000/api/personal/voice-memo \
  -H "Content-Type: application/json" \
  -d '{"text": "Mir kam der Gedanke an einen Familienurlaub nach Japan"}'

# Erwartung: mode: "incubated", warme Antwort

# Work Context
curl -X POST http://localhost:3000/api/work/voice-memo \
  -H "Content-Type: application/json" \
  -d '{"text": "Kunde Meyer hat Problem mit PV-Anlage dringend"}'

# Erwartung: mode: "structured", vollständiges JSON
```

#### 4. iOS App Testing

```bash
# Xcode öffnen
open /Users/alexanderbering/Projects/KI-AB/ios/PersonalAIBrain.xcodeproj

# Build & Run
# Teste:
# - Personal Context Voice Memo
# - Work Context Voice Memo
# - Context Switching
```

---

## 📈 Erwartete Verbesserungen

### Vorher (ohne Optimierung):

| Persona | Typische Probleme |
|---------|-------------------|
| Personal | - Strukturiert manchmal doch<br>- Gibt Ratschläge statt Fragen<br>- Business-Sprache |
| Work | - JSON unvollständig<br>- Falsche Kategorien (EwS vs. Kunden)<br>- Vage Next Steps |

### Nachher (mit AI Toolkit Optimierung):

| Persona | Erwartete Verbesserungen |
|---------|--------------------------|
| Personal | - Konsequente Inkubation<br>- Warme, explorative Fragen<br>- Null Business-Sprache<br>- Score: 85-95% |
| Work | - Perfektes JSON (100%)<br>- Präzise Kategorisierung<br>- Konkrete Next Steps<br>- Score: 88-98% |

---

## 🚀 Advanced Features (später)

### 1. Fine-Tuning mit eigenen Daten

Wenn du genug User-Korrekturen gesammelt hast:

```sql
-- Export Training Data
SELECT raw_input, corrected_output, context
FROM user_training
WHERE weight > 5
ORDER BY created_at DESC;
```

**QLoRA Fine-Tuning im AI Toolkit:**
1. Dataset vorbereiten (CSV/JSON)
2. AI Toolkit → "Fine-Tune" Tab
3. Base Model: `mistral:latest`
4. Upload Dataset
5. Start Fine-Tuning
6. Deploy als `mistral-personal-v1` / `mistral-work-v1`

**Erwartete Verbesserung:** +5-10% Score

### 2. RAG für Thought-Clustering

**Ziel:** Ähnliche Gedanken automatisch finden

```typescript
// Neue Funktion in backend
async function findSimilarThoughts(
  newThought: string,
  context: AIContext,
  limit: number = 5
): Promise<Thought[]> {
  const embedding = await generateEmbedding(newThought);

  return queryContext(
    context,
    `SELECT *, embedding <-> $1 AS distance
     FROM loose_thoughts
     WHERE is_processed = false
     ORDER BY distance
     LIMIT $2`,
    [formatForPgVector(embedding), limit]
  );
}
```

**Integration in Personal Persona:**
- Bei >= 3 ähnlichen Gedanken → Cluster-Vorschlag
- RAG-Context in Prompt injizieren

### 3. Multi-Persona Orchestration

**Szenario:** Gemischter Input (Privat + Business)

```typescript
// Input: "Kunde Meyer Familienurlaub Japan PV-Anlage"
// Orchestrator erkennt:
// - "Kunde Meyer PV-Anlage" → Work Subagent
// - "Familienurlaub Japan" → Personal Subagent
// Beide arbeiten parallel
```

Implementierung via **MCP Custom Tools** (siehe README)

---

## 🐛 Troubleshooting

### Problem: "Ollama not reachable"

```bash
# Prüfe Ollama Status
ps aux | grep ollama

# Starte Ollama
ollama serve

# Test Connection
curl http://localhost:11434/api/tags
```

### Problem: "ts-node not found"

```bash
cd .vscode/agents
npm install
```

### Problem: "Low scores despite changes"

**Mögliche Ursachen:**
1. **Temperature falsch:** Personal=0.7, Work=0.3
2. **Prompt zu vage:** Mehr konkrete Beispiele hinzufügen
3. **Test Cases zu hart:** Anpassen an realistische Szenarien
4. **Model cached:** Ollama neu starten

```bash
# Ollama Cache leeren
killall ollama
ollama serve
```

### Problem: "Work Persona gibt kein JSON zurück"

**Lösung:** Prompt extrem explizit machen:

```json
{
  "instructions": "...

  Du antwortest AUSSCHLIESSLICH mit JSON.
  KEINE Erklärungen VOR oder NACH dem JSON.
  NUR das JSON-Objekt.

  Format:
  {\"title\":\"...\",\"type\":\"...\", ...}
  "
}
```

---

## 📚 Ressourcen

### VS Code AI Toolkit
- [Official Docs](https://code.visualstudio.com/docs/intelligentapps/overview)
- [Agent Builder Guide](https://code.visualstudio.com/docs/intelligentapps/agentbuilder)
- [Model Management](https://code.visualstudio.com/docs/intelligentapps/models)

### Ollama
- [Ollama Documentation](https://ollama.com/docs)
- [Mistral Model Card](https://ollama.com/library/mistral)
- [Model Customization](https://github.com/ollama/ollama/blob/main/docs/modelfile.md)

### Prompt Engineering
- [Prompt Engineering Guide](https://www.promptingguide.ai/)
- [OpenAI Best Practices](https://platform.openai.com/docs/guides/prompt-engineering)
- [Anthropic Prompt Library](https://docs.anthropic.com/claude/prompt-library)

---

## ✅ Checkliste: Nächste Schritte

### Heute (5. Januar 2026)
- [x] VS Code Workspace Setup erstellt
- [x] Beide Persona Agents definiert
- [x] Test Suites erstellt (10+10 Cases)
- [x] Evaluation Framework implementiert
- [x] Dokumentation geschrieben

### Diese Woche
- [ ] Dependencies installieren (`npm install`)
- [ ] Erste Evaluation laufen lassen (`npm run evaluate`)
- [ ] Reports analysieren
- [ ] Prompts iterativ optimieren (3-5 Iterationen)
- [ ] Ziel-Score erreichen (>85%)

### Nächste Woche
- [ ] Optimierte Prompts in `personas.ts` übernehmen
- [ ] Backend neu deployen
- [ ] API-Tests durchführen
- [ ] iOS App mit neuen Personas testen
- [ ] User-Feedback sammeln

### Später (Optional)
- [ ] User-Korrekturen in `user_training` sammeln (Phase 3)
- [ ] Training-Dataset für Fine-Tuning vorbereiten
- [ ] QLoRA Fine-Tuning durchführen
- [ ] Custom Models deployen (`mistral-personal-v1`)
- [ ] RAG für Thought-Clustering implementieren

---

## 🎯 Ziel-Metriken

| Metrik | Aktuell | Ziel | Status |
|--------|---------|------|--------|
| Personal Persona Score | ? | 85%+ | 🔄 Testing |
| Work Persona Score | ? | 85%+ | 🔄 Testing |
| JSON-Success-Rate (Work) | ? | 95%+ | 🔄 Testing |
| Category-Accuracy (Work) | ? | 90%+ | 🔄 Testing |
| Inkubations-Rate (Personal) | ? | 100% | 🔄 Testing |

---

## 💬 Feedback & Iteration

Nach jeder Evaluation-Runde:

1. **Was funktioniert gut?**
   - Notiere erfolgreiche Prompt-Patterns
   - Dokumentiere Best Practices

2. **Was muss verbessert werden?**
   - Konkrete Schwachstellen identifizieren
   - Prioritäten setzen

3. **Nächste Änderung?**
   - Eine Sache zur Zeit optimieren
   - Erneut evaluieren

**Wichtig:** Nicht zu viele Änderungen auf einmal! Sonst weißt du nicht, was wirkt.

---

## 🚀 Los geht's!

```bash
cd /Users/alexanderbering/Projects/KI-AB/.vscode/agents
npm install
npm run evaluate
```

**Viel Erfolg beim Optimieren! 🎉**

---

*Erstellt: 5. Januar 2026*
*Autor: Claude Sonnet 4.5*
*Version: 1.0.0*
