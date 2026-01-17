# 🚀 CLAUDE IMPLEMENTATION PROMPT
## KI-AB Proactive Draft System - Ready to Build

---

## CONTEXT: Was wir bauen

Du wirst das **Proactive Draft Preparation System** für die KI-AB Anwendung implementieren.

Das System erkennt automatisch, wenn der Benutzer einen Output braucht (Email, Artikel, Report) und bereitet einen 70%-fertigen Draft vor - **ohne dass der Benutzer fragen muss**.

---

## ARCHITEKTUR OVERVIEW (Dein Referenz)

```
INPUT (Sprachmemo: "Schreib Email an John")
  ↓
[LAYER 1] Task Detection → Erkennt WriteEmail Task
  ↓
[LAYER 2] Context Aggregation (GraphRAG) → Related Ideas + Profile + History
  ↓
[LAYER 3] Draft Generation (Claude API) → 70%-fertiger Draft
  ↓
[LAYER 4] Storage & Notification → Draft ready!
  ↓
[LAYER 5] Feedback Loop → System lernt
```

---

## PHASE 1: TASK DETECTION SYSTEM

### Aufgabe 1.1: Task Registry definieren

**Was du tun sollst:**
1. Erstelle eine `TaskRegistry` Klasse/Objekt
2. Definiere die Basis-Task-Types:
   - `WriteEmail` (schnell, high ROI)
   - `WriteArticle` (komplex, wertvoll)
   - `WriteReport` (strukturiert)
   - `PresentationDraft` (optional, später)

**Anforderungen an jede Task:**
- Task ID + Name
- Trigger Patterns (Keywords wie "schreib email", "article über")
- Output Type (email, article, report, slide)
- Context Requirements (braucht Research? RelatedIdeas? UserProfile?)
- Template/Struktur-Info

**Code Pattern zu verwenden:**
```typescript
interface TaskType {
  id: string;
  name: string;
  triggerPatterns: {
    keywords: string[];
    entities: string[];
    contexts?: string[];
  };
  outputType: "email" | "article" | "report" | "slide";
  contextRequirements: {
    needsResearch: boolean;
    needsRelatedIdeas: boolean;
    needsUserProfile: boolean;
    needsHistoricalExamples: boolean;
  };
  template?: string;
}
```

**Acceptance Criteria:**
- [ ] 4 Task Types definiert
- [ ] Jeder mit Keywords, Entities, Requirements
- [ ] Testbar mit echo ("schreib email" → WriteEmail erkannt)

---

### Aufgabe 1.2: Detection Engine implementieren

**Was du tun sollst:**
1. Erstelle eine `TaskDetector` Klasse
2. Implementiere 2 Detection Layers:
   - **Layer 1:** Keyword-basiert (schnell, sicher)
   - **Layer 2:** Semantic (Claude-powered Intent)

**Layer 1: Keyword Detection (Lokal)**
- Input: String (z.B. "schreib email an john")
- Prozess: Durchsuche Task Registry, matche Keywords
- Output: `{ detected: true, taskType: WriteEmail, confidence: 0.9 }`

**Layer 2: Semantic Detection (Claude)**
- Input: String + UserContext
- Prozess: Frage Claude "What task is this?"
- Output: `{ detected: true, taskType: WriteArticle, confidence: 0.75 }`

**Acceptance Criteria:**
- [ ] Keyword Detection funktioniert (min 90% accuracy)
- [ ] Semantic Detection funktioniert (Claude API call)
- [ ] Fallback auf Semantic wenn Keyword nicht matcht
- [ ] Confidence Score (0-1) wird korrekt gesetzt

**Testfälle:**
```
"schreib email an john" → WriteEmail (0.95)
"article über pv distribution" → WriteArticle (0.9)
"ich muss einen bericht schreiben" → WriteReport (0.8)
"können Sie mir helfen?" → No detection (0.0)
```

---

## PHASE 2: CONTEXT AGGREGATION (GraphRAG Pattern)

### Aufgabe 2.1: Context Aggregation Pipeline

**Was du tun sollst:**
Erstelle eine `ContextAggregator` Klasse, die 5 Kontexte zusammenführt:

1. **User Profile Context** → Was ist sein Communication Style?
2. **Related Ideas** (GraphRAG) → Welche Ideen sind relevant?
3. **Historical Examples** → Ähnliche bisherige Outputs
4. **Style Guide** → Wie schreibt der Benutzer normalerweise?
5. **Research Data** → Externe Informationen (optional)

**GraphRAG Query (Multi-Hop):**
- Nicht nur "ähnliche Ideen" (Vector Search)
- Sondern: Start mit Topic → traversiere Relations (2 Hops) → aggregiere
- Beispiel: "PV Distribution" → verwandte Ideas → noch verwandte Ideas

**Input:**
```typescript
{
  taskType: TaskType,
  detectionContext: { mainTopic: "PV Distribution", recipient?: "John" },
  userId: string
}
```

**Output:**
```typescript
interface AggregatedContext {
  userProfile: { tone, style, communicationPatterns, targetAudience };
  relatedIdeas: Idea[];
  historicalExamples: Output[];
  styleGuide: { writingStyle, structure, format };
  researchData?: ResearchData[];
}
```

**Acceptance Criteria:**
- [ ] 5 Context-Typen werden gesammelt
- [ ] GraphRAG Multi-Hop traversal funktioniert
- [ ] Related Ideas sind relevant + nicht redundant
- [ ] Historical Examples matchen Task Type + Topic

---

### Aufgabe 2.2: Output-Type-Spezifische Context Assembly

**Was du tun sollst:**
Erstelle spezifische Context-Assembler für jeden Output Type:

**1. Email Context Assembler:**
```
- Recipient Profile (Wer ist John?)
- Conversation History (Was habt ihr besprochen?)
- Email Style (Wie schreibst du Emails an ihn?)
- Key Points to mention
- Previous similar emails
```

**2. Article Context Assembler:**
```
- Writing Style (Formal? Casual?)
- Related Ideas + Research
- Article Structure (wie strukturierst du?)
- Key Points to cover
- Target Audience
```

**3. Report Context Assembler:**
```
- Report Structure Pattern
- Key Findings to include
- Data/Metrics
- Executive Summary Style
- Recommendation Patterns
```

**Acceptance Criteria:**
- [ ] 3 Context Assembler Methoden
- [ ] Jede produziert Task-spezifischen Context String
- [ ] Context ist konkret + actionable (nicht generic)

---

## PHASE 3: DRAFT GENERATION

### Aufgabe 3.1: System Prompt Engineering

**Was du tun sollst:**
Erstelle Task-spezifische System Prompts für Claude:

**Template Structure:**
```
You are drafting a [OUTPUT_TYPE] for a user...

COMMUNICATION STYLE:
[User's tone, voice, patterns]

OUTPUT REQUIREMENTS:
[Email: Subject + Body structure]
[Article: H1 + Sections + CTA]
[Report: Executive Summary + Findings]

CONSTRAINTS:
- Max length: [if applicable]
- Tone: [formal/casual]
- Include: [specific points]
- Avoid: [specific topics]

TASK-SPECIFIC:
[Email: Subject line tips]
[Article: Hook + Structure]
[Report: Data-focus requirements]

Generate a 70% complete draft.
Include [PLACEHOLDER] for sections needing more data.
```

**Acceptance Criteria:**
- [ ] 3 System Prompts (Email, Article, Report)
- [ ] Jeder ist Task-spezifisch (nicht generic)
- [ ] Output Format ist klar definiert

---

### Aufgabe 3.2: Draft Generation Function

**Was du tun sollst:**
Implementiere die `generateDraft()` Funktion:

**Input:**
```typescript
{
  taskType: TaskType,
  outputType: string,
  userProfile: UserProfileContext,
  aggregatedContext: AggregatedContext,
  constraints?: { maxLength?, tone?, includes?, excludes? }
}
```

**Process:**
1. Baue System Prompt (task-spezifisch)
2. Baue Context Block (aus AggregatedContext)
3. Rufe Claude API auf
4. Parse + Validiere Response
5. Gebe Draft zurück

**Claude API Call Pattern:**
```typescript
const response = await anthropic.messages.create({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 2000,
  system: systemPrompt,
  messages: [{
    role: "user",
    content: contextBlock
  }]
});
```

**Output:**
- String (der Draft)
- Sollte ~70% vollständig sein
- Mit [PLACEHOLDER] für unvollständige Abschnitte

**Acceptance Criteria:**
- [ ] Draft Generation funktioniert
- [ ] Output ist Task-type-spezifisch
- [ ] Claude API Integration testet
- [ ] Error handling (wenn API fehlt)

---

## PHASE 4: STORAGE & NOTIFICATION

### Aufgabe 4.1: Draft Storage

**Was du tun sollst:**
Implementiere `DraftRepository` Klasse:

**Funktionen:**
- `saveDraft(draft)` → Speichere Draft mit Metadaten
- `getDraft(draftId)` → Hole Draft zurück
- `updateDraftStatus(draftId, status)` → Status ändern (pending_review, accepted, edited, rejected)
- `recordEdit(draftId, edit)` → Speichere User Edits

**Draft Schema:**
```typescript
interface StoredDraft {
  id: string;
  taskId: string;
  taskType: string;
  generatedAt: Date;
  content: string;
  status: "pending_review" | "accepted" | "edited" | "rejected";
  contextUsed: {
    relatedIdeas: string[];
    historicalExamples: string[];
    researchSources?: string[];
  };
  editHistory: DraftEdit[];
  feedback?: string;
}
```

**Acceptance Criteria:**
- [ ] Draft kann gespeichert werden
- [ ] Draft kann abgerufen werden
- [ ] Status kann aktualisiert werden
- [ ] Edits werden trackt

---

### Aufgabe 4.2: Notifications (Stub für später)

**Was du tun sollst:**
Erstelle `notifyDraftReady()` Funktion (minimal implementiert):

```typescript
async function notifyDraftReady(userId: string, draft: StoredDraft): Promise<void> {
  // Stub: Console log für jetzt
  console.log(`✨ Draft ready for ${draft.taskType}: ${draft.id}`);
  
  // TODO: Integration mit:
  // - In-App Notification
  // - Email Notification
  // - Slack/Teams Message
}
```

**Acceptance Criteria:**
- [ ] Function existiert
- [ ] Loggt Draft Ready Event
- [ ] Hat TODO für Integration

---

## PHASE 5: FEEDBACK LOOP

### Aufgabe 5.1: Feedback Collection (Minimal)

**Was du tun sollst:**
Erstelle `FeedbackRecorder` Klasse:

**Input:**
```typescript
interface DraftFeedback {
  draftId: string;
  userId: string;
  action: "accepted" | "edited" | "rejected";
  thumbsRating?: 1 | 2 | 3 | 4 | 5;
  changes?: string;
  userNotes?: string;
}
```

**Funktion:**
```typescript
async recordFeedback(feedback: DraftFeedback): Promise<void> {
  // Speichere Feedback
  // Log für später Learning
  console.log(`Feedback recorded: ${feedback.action} (${feedback.thumbsRating})`);
}
```

**Acceptance Criteria:**
- [ ] Feedback kann gespeichert werden
- [ ] Basic Logging funktioniert
- [ ] TODO für ML Learning später

---

## TESTING STRATEGY

### Unit Tests (minimal)

```typescript
describe("TaskDetector", () => {
  test("detects WriteEmail from keywords", () => {
    const result = detector.detect("schreib email an john");
    expect(result.detected).toBe(true);
    expect(result.taskType.id).toBe("write_email");
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  test("detects WriteArticle from keywords", () => {
    const result = detector.detect("article über pv distribution");
    expect(result.detected).toBe(true);
    expect(result.taskType.id).toBe("write_article");
  });
});

describe("DraftGeneration", () => {
  test("generates email draft with correct structure", async () => {
    const draft = await generateDraft({
      taskType: TASK_REGISTRY.WriteEmail,
      outputType: "email",
      userProfile: mockUserProfile,
      aggregatedContext: mockContext
    });
    
    expect(draft).toContain("Subject:");
    expect(draft.length).toBeGreaterThan(100);
  });
});
```

### Manual Testing Flows

**Flow 1: Email Detection → Draft**
```
1. User: "schreib email an john smith"
2. Check: Task detected? (WriteEmail)
3. Check: Context aggregiert? (John's profile, similar emails)
4. Check: Draft erzeugt? (Email with subject + body)
5. Check: Draft gespeichert? (Can retrieve by ID)
```

**Flow 2: Article Detection → Draft**
```
1. User: "artikel über neue trends in pv distribution"
2. Check: Task detected? (WriteArticle)
3. Check: GraphRAG queries? (Related ideas retrieved)
4. Check: Draft mit Struktur? (H1, Sections, CTA)
5. Check: Notifications? (User informed)
```

---

## DELIVERABLES (Was fertig sein sollte)

### By End of Phase 1 (Week 1-2):
- ✅ Task Registry (4 Tasks definiert)
- ✅ TaskDetector Klasse (Keyword + Semantic)
- ✅ Unit Tests für Detection

### By End of Phase 2 (Week 3-4):
- ✅ ContextAggregator Klasse
- ✅ 3x Context Assembler (Email, Article, Report)
- ✅ GraphRAG Query implementiert

### By End of Phase 3 (Week 5-6):
- ✅ System Prompts (3x)
- ✅ Draft Generation Function
- ✅ Claude API Integration tested

### By End of Phase 4 (Week 7-8):
- ✅ DraftRepository (Save/Get/Update)
- ✅ Notifications (Stub + TODO)
- ✅ FeedbackRecorder
- ✅ Manual Testing Flows durchgeführt

---

## INTEGRATION NOTES

### Mit bestehender KI-AB:
- **Automation Registry**: Neue DraftPreparation Automation registrieren
- **Knowledge Graph**: Nutzen für RelatedIdeas Query
- **User Profile**: Existierendes Learning System verwenden
- **Storage**: Neue `drafts` Collection hinzufügen

### Tech Stack (dein existing):
- Language: TypeScript
- API: Claude API (anthropic/sdk)
- DB: MongoDB (oder existierendes)
- Framework: Node.js

---

## STARTING POINT (Copy this für Claude)

```
## START HERE

Ich will das Proactive Draft Preparation System für KI-AB bauen.

**Phase 1:** Task Detection System
1. Task Registry mit 4 Task Types (WriteEmail, WriteArticle, WriteReport, PresentationDraft)
2. TaskDetector Klasse mit 2 Layers (Keyword + Semantic)
3. Acceptance Criteria + Unit Tests

**Phase 2:** Context Aggregation
1. ContextAggregator Klasse (User Profile + Related Ideas + History + Style + Research)
2. GraphRAG Multi-Hop Query
3. 3x Context Assembler (Email, Article, Report)

**Phase 3:** Draft Generation
1. System Prompts für jede Task (Email, Article, Report)
2. Draft Generation Function
3. Claude API Integration

**Phase 4:** Storage & Notification
1. DraftRepository (Save/Get/Update/RecordEdit)
2. Notification Function (Stub)
3. FeedbackRecorder

**Phase 5:** Feedback Loop
1. Basic Feedback Collection
2. Logging für später Learning

Lass mich mit Phase 1 starten: Task Registry + Detection Engine.
```

---

## SUCCESS CRITERIA (Gesamtprojekt)

- [ ] Benutzer sagt "schreib email" → System erkennt Task
- [ ] System aggregiert Context (Related Ideas, Style, History)
- [ ] Claude generiert 70%-fertigen Draft
- [ ] Draft wird gespeichert + Benutzer benachrichtigt
- [ ] Benutzer öffnet Draft → er ist bereits 70% vollständig
- [ ] Benutzer editiert → Feedback wird trackt
- [ ] Nächster Draft ist besser (System lernt)

**ROI Messbar:**
- Email: 30 min → 5-10 min Edit (⏱️ 20-25 min gespart)
- Article: 5-6h → 2-3h Refinement (⏱️ 2-3h gespart)
- Report: 4h → 1-2h Polish (⏱️ 2-3h gespart)

---

## QUESTIONS ZU BEANTWORTEN (Vor Start)

1. **DB Choice:** Welche DB nutzt KI-AB? (MongoDB, PostgreSQL, etc.)
2. **Claude API Key:** Hast du einen? (env var ANTHROPIC_API_KEY)
3. **Existing Code:** Wo ist das KI-AB Repo? (GitHub Link?)
4. **Context Source:** Wie greifst du auf Knowledge Graph zu? (API? Direct?)
5. **Priority:** Welche Task Type starten wir zuerst? (WriteEmail wäre schnell)

---

**Ready?** 🚀

Kopiere diesen Prompt in Claude, beantworte die 5 Questions, und los geht's mit Phase 1!
