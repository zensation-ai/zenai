# ZenAI — Vollstaendiger Funktionsbericht

> **Stand: Phase 141 | 22. Maerz 2026**
> ZenAI - Enterprise AI Platform
> (c) 2026 Alexander Bering / ZenSation Enterprise Solutions
> https://zensation.ai | https://zensation.app | https://zensation.sh

---

## Plattform-Uebersicht

ZenAI ist eine Enterprise AI Platform, die als persoenliches AI-Betriebssystem fungiert. Die Plattform kombiniert modernste KI-Technologie mit neurowissenschaftlichen Prinzipien fuer eine adaptive, lernende Benutzererfahrung. Ueber 141 Entwicklungsphasen hinweg wurde ein vollstaendiges Oekosystem aus Konversation, Wissensmanagement, Aufgabenplanung, E-Mail, Business-Analytik, Multi-Agenten-Orchestrierung und kognitiver Architektur aufgebaut.

### Architektur

| Schicht | Technologie | Deployment |
|---------|-------------|------------|
| **Frontend** | React 18 + TypeScript + Vite | Vercel (Auto-Deploy) |
| **Backend** | Express.js + TypeScript | Railway (Auto-Deploy) |
| **Datenbank** | PostgreSQL 15 + pgvector | Supabase (4 Schemas) |
| **Cache** | Redis 8.2.1 (BullMQ) | Railway |
| **KI Primary** | Claude API (Anthropic) | Cloud |
| **KI Fallback** | Mistral API | Cloud |
| **KI Lokal** | Ollama + Mistral 7B | Lokal |
| **CLI** | Node.js + @anthropic-ai/sdk | Lokal |
| **Observability** | OpenTelemetry + Sentry | Cloud |

### Code-Metriken

| Bereich | Dateien | LOC (ca.) | Tests |
|---------|---------|-----------|-------|
| Backend (Services + Utils) | ~344 | ~130.000 | 7.692 |
| Backend (Routes) | ~103 | ~38.000 | (in Backend enthalten) |
| Frontend (Components + Hooks) | ~294 | ~93.000 | 1.400 |
| CLI | 12 | ~1.500 | 108 |
| SQL Migrationen | ~110 | ~18.000 | — |
| **Gesamt** | **~860** | **~280.000** | **9.200** |

### Datenbank-Architektur

- **4 Schema-Kontexte:** `personal`, `work`, `learning`, `creative`
- **~95 Tabellen pro Schema** (volle Paritaet)
- **Schema-Isolation:** `SET search_path TO {context}, public`
- **pgvector:** Embedding-basierte Aehnlichkeitssuche (HNSW-Indexe)
- **Row-Level Security:** Vorbereitet auf allen kritischen Tabellen

---

## 1. Chat & Konversation

ZenAI bietet ein vollstaendiges Chat-System mit vier KI-Modi, Echtzeit-Streaming, erweitertem Denken und 55 integrierten Tools.

### 1.1 Chat-Modi

| Modus | Beschreibung | Ausloeser |
|-------|-------------|-----------|
| **conversation** | Normale Unterhaltung | Standard |
| **tool_assisted** | Chat mit Tool-Nutzung | Aufgaben-Schluesselwoerter |
| **agent** | Multi-Agent-Orchestrierung | Komplexe Anfragen |
| **rag_enhanced** | Wissensbasierte Antworten | Wissensfragen |

### 1.2 Streaming & Thinking

- **SSE (Server-Sent Events):** Echtzeit-Streaming von KI-Antworten
- **Extended Thinking:** Sichtbarer Denkprozess mit konfigurierbarem Token-Budget (Standard: 16.000 Tokens)
- **ThinkingBlock:** Aufklappbare Denkprozess-Anzeige (2-Zeilen-Vorschau, voller Inhalt bei Klick)
- **Thinking Budget Strategien:** Lernende Budget-Allokation pro Task-Typ (conversation→low, tool→medium, agent→high)
- **Thinking Chain Persistenz:** Denkprozesse werden mit Embeddings gespeichert fuer Aehnlichkeitssuche

### 1.3 Tool-Nutzung

- **55 registrierte Tools** in 14 Kategorien (siehe Abschnitt 7)
- **Tool-Use Visualization:** Inline-Aktivitaets-Pills waehrend Streaming (aktives Tool mit Spinner, abgeschlossene mit Haekchen)
- **Tool Search Meta-Tool:** On-Demand-Tool-Discovery spart 40-50% Kontextfenster
- **Persistent Tool Disclosure:** `tool_calls` JSONB auf Chat-Nachrichten, aufklappbare Anzeige im Verlauf
- **Tool Hard Limits:** 60s Gesamt-Budget, 10 Iterations-Maximum

### 1.4 Message-Features

| Feature | Beschreibung |
|---------|-------------|
| **Edit & Regenerate** | Baumbasiertes Message-Branching mit Versionshistorie |
| **Auto Session Titles** | Heuristische Titel-Generierung (DE/EN Filler-Removal, 3-6 Woerter) |
| **Confidence Badges** | Gruen (>0.75), Amber (0.45-0.75), Rot (<0.45) auf KI-Antworten |
| **Source Citations** | Aufklappbare Quellen-Anzeige mit `aria-expanded` |
| **Feedback Buttons** | Thumbs up/down fuer Antwort-Qualitaet |

### 1.5 Vision & Multimedia

- **8 Vision API Endpoints:** Bildanalyse, OCR, Ideen-Extraktion, Beschreibung, Q&A, Vergleich, Dokumentverarbeitung
- **Drag-and-Drop ImageUpload:** Bilder direkt im Chat analysieren
- **Voice Input:** Browser-native MediaRecorder + Whisper-Transkription

### 1.6 Artifacts System

- **ArtifactPanel:** Slide-out-Panel fuer Code, Markdown, Mermaid, CSV
- **Automatische Extraktion:** Grosse Code-Bloecke (>15 Zeilen) werden als Artifacts dargestellt
- **Syntax-Highlighting:** Prism.js fuer alle gaengigen Sprachen
- **Copy/Download:** Ein-Klick-Export aller Artifacts

---

## 2. Ideen-Management

Das Ideen-System bildet den Kern der Wissensarbeit mit 4 Status-Stufen, intelligentem Content und KI-gestuetzter Organisation.

### 2.1 CRUD & Status-Lifecycle

| Status | Beschreibung |
|--------|-------------|
| **active** | Aktive Ideen in Bearbeitung |
| **incubator** | Ideen in der Reifephase |
| **archived** | Archivierte Ideen |
| **triage** | Neue Ideen zur Bewertung |

### 2.2 Smart Content (6 Typen)

| Typ | Erkennung | KI-Ausgabe |
|-----|-----------|-----------|
| **Schreibinhalt** | "E-Mail schreiben", "Artikel" | Vollstaendiger Entwurf |
| **Leseinhalt** | "Gedicht lesen", "Buch" | Zusammenfassung + Kontext |
| **Recherche** | "recherchieren", "herausfinden" | Kompakte Fakten + Aspekte |
| **Lernmaterial** | "lernen wie", "Tutorial" | ELI5 + Kernkonzepte + Fragen |
| **Plan** | "planen", "Roadmap" | Schritte + Checkliste |
| **Analyse** | "analysieren", "Pro Contra" | Pro/Contra + Empfehlung |

### 2.3 Weitere Features

- **Topic-Zuweisung:** TF-IDF-basierte Keyword-Extraktion, Quality-Metriken (Coherence, Separation, Density, Stability)
- **Idee → Aufgabe:** Direkte Konvertierung via API
- **Drag-and-Drop:** Sortierung und Priorisierung
- **Export:** Markdown, JSON, CSV
- **Incubator:** Ideen reifen lassen mit automatischen Erinnerungen
- **Archive:** Langzeit-Speicher mit Volltextsuche
- **Triage:** KI-gestuetzte Bewertung und Kategorisierung neuer Ideen

---

## 3. Planer & Aufgaben

Zentrales Planungs-Hub mit 4 Tabs: Kalender, Aufgaben (Kanban + Gantt), Projekte und Meeting-Protokolle.

### 3.1 Kalender

- Monats-, Wochen- und Tagesansicht
- Event-Erstellung mit Wiederholungen
- Meeting-Verknuepfung fuer Live-Protokollierung
- Reise-Zeitschaetzung via Google Maps

### 3.2 Aufgaben-Management

| Ansicht | Features |
|---------|---------|
| **Kanban-Board** | 4 Spalten (Backlog/Todo/In Arbeit/Erledigt), HTML5 Drag-and-Drop, Projekt-Filter |
| **Gantt-Chart** | Custom SVG, 3 Zoom-Stufen (Tag/Woche/Monat), Today-Line, Projekt-Gruppierung |
| **Listen-Ansicht** | Sortierung, Filter, Bulk-Aktionen |

- **Abhaengigkeiten:** Task-Dependencies mit visueller Darstellung
- **Reorder:** Kanban-Spalten-Sortierung per API
- **Prioritaeten:** critical, high, medium, low
- **Projekt-Zuweisung:** Tasks werden Projekten zugeordnet

### 3.3 Projekte

- CRUD mit Task-Counts und Status-Zusammenfassung
- Archivierung statt Loeschung
- Projekt-Filter in Kanban und Gantt

### 3.4 Meeting-Protokoll

- **VoiceInput:** Sprachaufnahme waehrend Meetings
- **KI-Strukturierung:** Automatische Zusammenfassung, Entscheidungen, Action Items
- **Kalender-Verknuepfung:** Events mit Meeting-Notizen verbinden

---

## 4. E-Mail & Unified Inbox

Vollstaendige E-Mail-Integration ueber Resend mit KI-Analyse und automatischer Verarbeitung.

### 4.1 E-Mail-Features

| Feature | Beschreibung |
|---------|-------------|
| **Inbound-Webhook** | Svix-signierte Webhooks von Resend |
| **KI-Analyse** | Zusammenfassung, Kategorie, Prioritaet, Sentiment, Action Items |
| **3 Antwort-Vorschlaege** | Formal, freundlich, kurz — KI-generiert |
| **Threading** | Automatische Thread-Erkennung via Message-ID |
| **Domain-Routing** | `zensation.ai` → work, `zensation.app` → personal |
| **Bulk-Aktionen** | Markieren, Archivieren, Loeschen in Batches |

### 4.2 E-Mail-API (20+ Endpoints)

- Entwuerfe erstellen, bearbeiten, senden
- Antworten und Weiterleiten
- Status-Aenderungen und Stern-Toggle
- Account-Management (mehrere E-Mail-Konten)
- Thread-Ansicht mit KI-Zusammenfassung

### 4.3 Unified Inbox

- **Aggregierte Ansicht:** E-Mails, Aufgaben, Benachrichtigungen in einer Liste
- **Counts pro Typ:** Schnelluebersicht ueber ungelesene Items
- **Inbox-Intelligence Tools:** `ask_inbox` und `inbox_summary` fuer KI-Abfragen

---

## 5. Wissen & Dokumente

Umfassendes Wissensmanagement mit Dokumenten-Vault, Canvas-Editor, Knowledge Graph und Dokumenten-Generierung.

### 5.1 Document Vault

- **Upload:** PDF, DOCX, TXT, Markdown mit KI-Analyse
- **Ordner-Struktur:** Hierarchische Organisation
- **Volltextsuche:** BM25 + Semantische Suche
- **KI-Analyse:** Zusammenfassung, Schluesselwoerter, Entitaeten
- **Synthesize Knowledge:** Wissens-Synthese ueber mehrere Dokumente

### 5.2 Canvas Editor

| Feature | Beschreibung |
|---------|-------------|
| **Markdown-Editor** | 6-Button Toolbar (Bold, Italic, Heading, List, Code, Link) |
| **Mermaid-Diagramme** | Live-Preview via CDN Dynamic Import |
| **Bild-Upload** | Drag-and-Drop (max 5 MB) |
| **Versionierung** | Volle Versionshistorie mit Wiederherstellung |
| **Export** | Markdown, PDF, HTML |
| **Chat-Verknuepfung** | Chat-Sessions mit Dokumenten verbinden |

### 5.3 Knowledge Graph

- **Entity-Typen:** Person, Organisation, Konzept, Technologie, Ort, Event, Produkt
- **Entity Resolution:** Embedding-basierte Deduplizierung (Cosine > 0.92)
- **Beziehungen:** supports, contradicts, relates_to, causes, part_of
- **Temporal Relations:** valid_from/valid_until fuer zeitliche Gueltigkeit
- **Community Detection:** Label Propagation fuer Cluster-Erkennung
- **Centrality Analysis:** Degree + Betweenness, Hub/Bridge-Identifikation
- **Lernpfade:** Automatische Pfad-Generierung durch den Graphen
- **Contradiction Detection:** Logische Konflikte erkennen und aufloesen
- **Transitive Inference:** Versteckte A→C Verbindungen ueber 2-Hop-Pfade

### 5.4 GraphRAG Hybrid Retrieval (4 Strategien)

| Strategie | Beschreibung |
|-----------|-------------|
| **Vector Search** | Embedding-basierte Aehnlichkeitssuche |
| **Graph Traversal** | Entitaeten und Relationen durchlaufen |
| **Community Search** | Cluster-Zusammenfassungen abfragen |
| **BM25 Full-Text** | PostgreSQL ts_rank fuer Keyword-Suche |

Ergebnisse werden per Cross-Encoder Re-Ranking zusammengefuehrt.

### 5.5 Dokumenten-Generierung (Phase 131)

| Format | Technologie | Templates |
|--------|-------------|-----------|
| **PowerPoint (.pptx)** | PptxGenJS | Praesentation, Report |
| **Excel (.xlsx)** | ExcelJS | Datenanalyse, Planung |
| **PDF (.pdf)** | pdfmake | Bericht, Brief |
| **Word (.docx)** | docx | Dokument, Vertrag |

5 vordefinierte Templates + Claude-Tool fuer KI-gesteuerte Generierung.

---

## 6. Business, Finanzen & CRM

Integriertes Business-Dashboard mit 8 Tabs fuer Umsatz, Traffic, SEO, Finanzen, Kontakte und mehr.

### 6.1 Business Connectors

| Connector | Datenquelle | Metriken |
|-----------|-------------|----------|
| **Stripe** | Payment API | Umsatz, Abonnements, Conversion |
| **Google Analytics 4** | GA4 Data API | Traffic, Sessions, Bounce Rate |
| **Google Search Console** | GSC API | Rankings, Klicks, Impressionen |
| **Lighthouse** | PageSpeed API | Performance, Accessibility, SEO Score |
| **UptimeRobot** | Monitoring API | Uptime, Response Time |

### 6.2 Business Intelligence Tools

- `get_revenue_metrics`: Umsatz-KPIs abrufen
- `get_traffic_analytics`: Website-Traffic analysieren
- `get_seo_performance`: SEO-Performance pruefen
- `get_system_health`: System-Gesundheit monitoren
- `generate_business_report`: KI-Business-Report erstellen
- `identify_anomalies`: Anomalien erkennen
- `compare_periods`: Zeitraeume vergleichen

### 6.3 Finanz-Management

- **Konten:** Bankkonten, Kreditkarten, Investments
- **Transaktionen:** Import, Kategorisierung, Suche
- **Budgets:** Monats-/Jahresbudgets mit Tracking
- **Finanzziele:** Sparziele mit Fortschrittsanzeige
- **Kategorie-Analyse:** Ausgaben-Aufschluesselung

### 6.4 Kontakte & CRM

- **Kontakte:** CRUD mit Tags, Notizen, Timeline
- **Organisationen:** Firmenverwaltung mit Kontakt-Zuordnung
- **Interaktions-Timeline:** Chronologische Kontakthistorie
- **Follow-Up-Vorschlaege:** KI-basierte Erinnerungen
- **Statistiken:** Kontakt-Metriken und -Trends

### 6.5 Google Maps Integration

- **Geocoding:** Adresse zu Koordinaten und umgekehrt
- **Directions:** Routenplanung zwischen Standorten
- **Nearby Places:** POIs in der Umgebung finden
- **Oeffnungszeiten:** Aktuelle Geschaeftszeiten abrufen
- **Gespeicherte Orte:** Favoriten-Standorte verwalten
- **Tagesrouten-Optimierung:** Mehrere Stopps optimal planen

---

## 7. KI-Kern (55 registrierte Tools)

Alle 55 Tools, die Claude waehrend eines Chats aufrufen kann:

### 7.1 Ideen-Tools (6)

| Tool | Beschreibung |
|------|-------------|
| `search_ideas` | Ideen durchsuchen (Volltext + Semantisch) |
| `create_idea` | Neue Idee erstellen |
| `update_idea` | Idee aktualisieren |
| `archive_idea` | Idee archivieren |
| `delete_idea` | Idee loeschen |
| `get_related_ideas` | Verwandte Ideen finden |

### 7.2 Memory-Tools (9)

| Tool | Beschreibung |
|------|-------------|
| `remember` | Fakt im Langzeitgedaechtnis speichern |
| `recall` | Fakten aus dem Gedaechtnis abrufen |
| `memory_introspect` | Memory-System inspizieren |
| `memory_update` | Gespeicherten Fakt aktualisieren |
| `memory_delete` | Fakt loeschen |
| `memory_update_profile` | Nutzerprofil aktualisieren |
| `memory_promote` | Fakt in hoehere Memory-Schicht befoerdern |
| `memory_demote` | Fakt in niedrigere Schicht zurueckstufen |
| `memory_forget` | Fakt gezielt vergessen |

### 7.3 Meta-Tool (1)

| Tool | Beschreibung |
|------|-------------|
| `search_tools` | On-Demand Tool-Discovery (spart 40-50% Kontext) |

### 7.4 Web-Tools (2)

| Tool | Beschreibung |
|------|-------------|
| `web_search` | Web-Suche via Brave Search (DuckDuckGo Fallback) |
| `fetch_url` | URL-Inhalte abrufen und extrahieren |

### 7.5 GitHub-Tools (5)

| Tool | Beschreibung |
|------|-------------|
| `github_search` | Repository-Suche |
| `github_create_issue` | Issue aus Gespraech erstellen |
| `github_repo_info` | Repository-Details abrufen |
| `github_list_issues` | Issues eines Repos auflisten |
| `github_pr_summary` | Pull Request Zusammenfassung |

### 7.6 Projekt-Kontext-Tools (3)

| Tool | Beschreibung |
|------|-------------|
| `analyze_project` | Umfassende Projektanalyse (11 Typen) |
| `get_project_summary` | Schnelle Projektuebersicht |
| `list_project_files` | Projektstruktur anzeigen |

### 7.7 Code-Execution (1)

| Tool | Beschreibung |
|------|-------------|
| `execute_code` | Python/Node.js/Bash im Sandbox ausfuehren (Docker lokal, Judge0 Production) |

### 7.8 Dokumenten-Tools (3)

| Tool | Beschreibung |
|------|-------------|
| `analyze_document` | Dokument-KI-Analyse |
| `search_documents` | Dokumente durchsuchen |
| `synthesize_knowledge` | Wissen ueber Dokumente synthetisieren |

### 7.9 Assistenz-Tools (4)

| Tool | Beschreibung |
|------|-------------|
| `create_meeting` | Meeting erstellen |
| `navigate_to` | In-App Navigation |
| `app_help` | Plattform-Hilfe |
| `calculate` | Mathematische Berechnungen |

### 7.10 Business-Tools (7)

| Tool | Beschreibung |
|------|-------------|
| `get_revenue_metrics` | Umsatz-KPIs |
| `get_traffic_analytics` | Traffic-Analyse |
| `get_seo_performance` | SEO-Metriken |
| `get_system_health` | System-Status |
| `generate_business_report` | Business-Report |
| `identify_anomalies` | Anomalie-Erkennung |
| `compare_periods` | Perioden-Vergleich |

### 7.11 Kalender- & E-Mail-Tools (4)

| Tool | Beschreibung |
|------|-------------|
| `create_calendar_event` | Kalender-Eintrag erstellen |
| `list_calendar_events` | Events auflisten |
| `draft_email` | E-Mail-Entwurf erstellen |
| `estimate_travel` | Reisezeit schaetzen |

### 7.12 Karten-Tools (4)

| Tool | Beschreibung |
|------|-------------|
| `get_directions` | Wegbeschreibung |
| `get_opening_hours` | Oeffnungszeiten |
| `find_nearby_places` | Orte in der Naehe |
| `optimize_day_route` | Tagesroute optimieren |

### 7.13 E-Mail-Intelligence-Tools (2)

| Tool | Beschreibung |
|------|-------------|
| `ask_inbox` | KI-Fragen an die Inbox |
| `inbox_summary` | Inbox-Zusammenfassung |

### 7.14 MCP-Tools (2)

| Tool | Beschreibung |
|------|-------------|
| `mcp_call_tool` | Externes MCP-Tool aufrufen |
| `mcp_list_tools` | Verfuegbare MCP-Tools auflisten |

### 7.15 Dokumenten-Generierung (1)

| Tool | Beschreibung |
|------|-------------|
| `generate_document` | PPTX/XLSX/PDF/DOCX erstellen |

### 7.16 Self-Editing Memory (3 — Phase 100)

| Tool | Beschreibung |
|------|-------------|
| `memory_replace` | Fakt korrigieren/aktualisieren |
| `memory_abstract` | Fakten abstrahieren und zusammenfassen |
| `memory_search_and_link` | Fakten suchen und verknuepfen |

---

## 8. Memory-System (HiMeS — Hierarchical Memory System)

Neurowissenschaftlich inspiriertes 4-Schichten-Gedaechtnissystem mit Spaced Repetition, emotionalem Tagging und kontextabhaengigem Abruf.

### 8.1 4-Schichten-Architektur

| Schicht | Beschreibung | Persistenz | Kapazitaet |
|---------|-------------|------------|-----------|
| **Working Memory** | Aktiver Task-Fokus | Session | Begrenzt (~7 Items) |
| **Short-Term Memory** | Session-Kontext | Session + Cache | Mittel |
| **Episodic Memory** | Konkrete Erfahrungen | Datenbank | Unbegrenzt |
| **Long-Term Memory** | Abstrahiertes Wissen | Datenbank + Embeddings | Unbegrenzt |

### 8.2 FSRS Spaced Repetition (Phase 125)

- **Ersetzt SM-2:** Free Spaced Repetition Scheduler fuer optimales Wiederholungs-Timing
- **Stability + Difficulty:** Pro-Fakt-Parameter fuer adaptives Lernen
- **Review-Queue:** Automatische Identifikation faelliger Fakten
- **Recall Tracker:** Post-Response FSRS Feedback

### 8.3 Emotionales Tagging (Phase 72)

- **Sentiment:** Positiv/Negativ/Neutral basierend auf Keyword-Lexikon (DE + EN)
- **Arousal:** Erregungsniveau des Inhalts
- **Valence:** Emotionale Wertigkeit
- **Significance:** Bedeutsamkeit fuer den Nutzer
- **Consolidation Weight:** `arousal * 0.4 + significance * 0.6` — emotionale Fakten haben 3x laengere Decay-Halbwertszeit

### 8.4 Ebbinghaus Decay (Phase 72)

- **Formel:** `R = e^(-t/S)` statt linearem Decay
- **SM-2 Stability Updates:** Uebergang zu FSRS in Phase 125
- **Spaced Repetition Kandidaten:** Pre-Loading in Sleep Compute

### 8.5 Core Memory Blocks (Phase 126 — Letta-Pattern)

- **Pinned Blocks:** Nicht-verfallende Kern-Informationen (Name, Praeferenzen, wichtige Fakten)
- **3 neue Claude-Tools:** memory_replace, memory_abstract, memory_search_and_link
- **Self-Editing:** KI entscheidet selbst, was gespeichert, korrigiert oder vergessen wird
- **Fact-Lineage:** `superseded_by` + `supersede_reason` fuer Versionierung

### 8.6 Cross-Context Entity Merging (Phase 126)

- Entitaeten ueber Schema-Grenzen (personal/work/learning/creative) hinweg zusammenfuehren
- Embedding-basierte Erkennung identischer Entitaeten in verschiedenen Kontexten

### 8.7 Procedural Memory (Phase 59 — Letta-Paradigm)

- **"Wie mache ich X?"** Speicher aus vergangenen Tool-Aktionen
- **Trigger → Steps → Tools → Outcome:** Vollstaendige Vorgehensweise
- **Semantic Recall:** Embedding-basierte Aehnlichkeitssuche
- **Feedback-Optimierung:** Success-Rate Tracking + Feedback-Score

### 8.8 BM25 Hybrid Search (Phase 59)

- **BM25 Full-Text:** PostgreSQL `ts_rank` + `to_tsvector`
- **Hybrid Search (RRF):** Reciprocal Rank Fusion kombiniert BM25 + Semantic
- **Entity Resolver:** NER via GraphBuilder + automatisches Fact-Entity Linking

### 8.9 Kontextabhaengiger Abruf (Phase 72)

- **Encoding Specificity:** timeOfDay + dayOfWeek + taskType
- **Retrieval-Boost:** Bis zu 30% bei passender Kontext-Uebereinstimmung

---

## 9. RAG Pipeline

Mehrstufige Retrieval-Augmented Generation mit autonomer Strategie-Wahl, Qualitaetskontrolle und Caching.

### 9.1 Retrieval-Stufen

| Stufe | Beschreibung |
|-------|-------------|
| **HyDE** | Hypothetical Document Embeddings mit 5s Timeout |
| **Cross-Encoder Re-Ranking** | Structured Fallback bei Fehler |
| **Confidence Scoring** | 4-Komponenten: 40% topScore, 30% avgScore, 15% Varianz, 15% Diversitaet |
| **Contextual Retrieval** | Anthropic-Methode: Claude-Haiku-generierte Kontext-Saetze (+67% Accuracy) |
| **Self-RAG Critique** | Auto-Reformulierung bei Confidence < 0.5, einmaliger Retry |

### 9.2 CRAG Quality Gate (Phase 100)

| Confidence | Aktion |
|-----------|--------|
| **CONFIDENT (>0.75)** | Dokumente direkt nutzen |
| **AMBIGUOUS (0.45-0.75)** | Query reformulieren + Retry |
| **FAILED (<0.45)** | Niedrige Confidence zurueckgeben |

### 9.3 A-RAG (Autonome Retrieval-Strategie — Phase 70)

- **Strategy Agent:** Claude-basierter Meta-Agent klassifiziert Queries in 5 Typen
- **5 Retrieval Interfaces:** keyword, semantic, chunk_read, graph, community
- **Heuristic Evaluator:** 7 Scoring-Faktoren
- **Iterative Retrieval:** Parallel/Sequential Steps, Early Exit bei >0.9, Max 3 Iterationen
- **Fallback:** Automatisch auf feste Pipeline bei A-RAG-Fehler

### 9.4 Weitere RAG-Features

- **Dynamic RAG Weights:** Score-basiert statt fixer 0.4/0.6
- **Content-Hash Dedup:** SHA-256 fuer Duplikats-Erkennung
- **Embedding Drift Detection:** BullMQ Worker, 50-Query Sampling, >10% Schwelle
- **RAG Cache:** Zwei-Schichten-Cache (Redis 1h TTL + semantisch in-memory 0.92 Threshold)
- **Query Decomposition:** Komplexe Queries in Sub-Queries (Vergleich, Kausal, Temporal, Multi-Part)
- **Query Size Limit:** Max 10.000 Zeichen

---

## 10. Kognitive Architektur (Phase 125-141)

16 Phasen, die ZenAI von einer Chat-Anwendung zu einem kognitiven System transformieren — basierend auf aktueller Forschung (Letta/MemGPT, CRAG, ICLR 2026 MemAgents, Global Workspace Theory).

### 10.1 Deep Memory (Phase 125-126) — 199 Tests

**Hebbian Knowledge Graph:**
- Co-Activation Tracking zwischen Entitaeten
- Hebbian Strengthening: Gleichzeitig abgerufene Fakten staerken ihre Verbindung
- Zeitbasierter Decay: Ungenutzte Verbindungen werden schwaecher
- Normalisierung: Gewichte bleiben im [0,1]-Bereich

**FSRS Spaced Repetition:**
- Ersetzt SM-2 vollstaendig
- 4 Parameter pro Fakt: Stability, Difficulty, Retrievability, Interval
- Optimales Review-Timing fuer Langzeit-Retention

**Bayesian Confidence Propagation:**
- Belief Propagation ueber den Knowledge Graph
- Fakten-Confidence beeinflusst verbundene Fakten
- Automatische Confidence-Updates bei neuen Informationen

### 10.2 Reasoning (Phase 127-128) — 263 Tests

**Global Workspace Theory (GWT):**
- Kompetitives Context Assembly aus 8 Specialist Modules
- Query Analyzer: Heuristischer Parser fuer Intent, Domaine, Komplexitaet
- Winner-Takes-All: Relevanteste Informationen gewinnen Zugang zum "globalen Workspace"

**8 Specialist Modules:**

| Modul | Aufgabe |
|-------|---------|
| Memory Module | Fakten aus allen Memory-Schichten |
| RAG Module | Dokument-Retrieval |
| Knowledge Graph Module | Entitaeten und Relationen |
| Temporal Module | Zeitliche Kontexte |
| Procedural Module | Bewaehrte Vorgehensweisen |
| Emotional Module | Emotionaler Kontext |
| Metacognitive Module | Selbst-Bewertung |
| External Module | Web-Suche, APIs |

**Fact Checker:** Post-Response Faktencheck gegen Knowledge Graph

**Chain-of-Thought Persistence:**
- Denkprozesse werden mit pgvector-Embeddings gespeichert
- Aehnliche fruehere Ueberlegungen koennen abgerufen werden

**Multi-Hop Inference Engine:**
- Transitive Inferenz (A→B→C)
- Analogie-Schluss
- Negations-Erkennung

### 10.3 Agenten (Phase 129-130) — 222 Tests

**Persistent Agent Loops:**
- Ziel-orientierte Loops mit Checkpoints
- Pause/Resume/Cancel Steuerung
- Reducer-Driven Shared State
- Error Recovery mit Retry

**Context Isolation:**
- Rollen-basierte Informations-Filterung
- Jeder Agent sieht nur relevanten Kontext

**Debate Protocol:**
- Multi-Turn Debatten zwischen Agenten
- Pro/Contra Argumentation
- Konsens-Findung

**Tool Composition Engine:**
- Chain-Validierung fuer Tool-Sequenzen
- Planung optimaler Tool-Abfolgen

**Dynamic Team Builder:**
- 5 Spezialisten-Rollen automatisch zusammenstellen
- Aufgaben-basierte Team-Komposition

### 10.4 Output (Phase 131-132) — 188 Tests

**Document Generation Suite:**
- 4 Formate: PPTX, XLSX, PDF, DOCX
- 5 Templates pro Format
- Claude-Tool fuer KI-gesteuerte Generierung

**CLI Agent (Phase 132):**
- Claude Code Pattern: Single-threaded Agent Loop
- 6 Filesystem-Tools: read_file, write_file, edit_file, list_files, search_content, run_command
- Backend Bridge: Memory, Web Search, Idea Search, Core Memory Blocks
- Terminal UI: Chalk-basiert mit Markdown Rendering
- Session Persistence in `.zenai/` Directory

### 10.5 Kuenstliche Neugier (Phase 133-134) — 175 Tests

**Knowledge Gap Detection:**
- Gap-Score Formel: `(queryCount/maxQueries)*0.4 + (1-factCount/maxFacts)*0.3 + (1-avgConfidence)*0.2 + (1-avgRAGScore)*0.1`
- Topic-Gruppierung via TF-IDF Keywords
- Top-5 Gaps mit Aktionsvorschlaegen (web_research, consolidate_existing, ask_user, monitor)

**Information Gain Scoring:**
- ICM-adaptiert: Cosine Surprise + Novelty Score
- FamiliarityBuffer (FIFO) fuer bekannte Muster
- Fire-and-forget DB Tracking

**Hypothesis Engine:**
- 3 Generatoren: Incomplete Patterns (Graph-Luecken), Temporal Gaps (30d Stale), Contradictions (Negation Detection)

**Pattern Tracker:**
- Temporal Patterns (Stunde + Wochentag + Domain)
- Sequential Patterns (Bigram Intent-Modell)
- Dominant Pattern Matching

**Prediction Engine:**
- 3-Signal Kombination: Temporal (0.4) + Sequential (0.4) + Recency (0.2)
- Prediction Error Learning (correct/wrong_intent/wrong_domain/surprise)

### 10.6 Meta-Kognition (Phase 135-138) — 242 Tests

**Metacognitive State Vector:**
- 5 Pro-Response Metriken: Confidence, Coherence, ConflictLevel, KnowledgeCoverage, ConfusionLevel
- 3-stufige Confusion Detection (high/medium/low)

**Calibration Tracking:**
- Expected Calibration Error (ECE)
- 5 Confidence-Bins
- Overconfidence Detection

**Capability Model:**
- Pro-Domain Performance (factCount, successRate)
- Strengths/Weaknesses Analyse
- Improvement Trend Tracking

**Feedback Bus (Phase 137):**
- Pub/Sub fuer 6 Feedback-Typen: response_rating, fact_correction, suggestion_action, tool_success, document_quality, agent_performance
- Statistiken pro Typ: avgValue, positiveRate, recentTrend, overallScore

**Adaptive Behavior Engine (Phase 138):**
- Lernende Praeferenzen: responseLength, detailLevel, proactivityLevel, preferredTools, languageStyle
- Style Learner: Formality (DE+EN), Technicality, Verbosity, Language Detection

### 10.7 Integration & Self-Improvement (Phase 139-141) — 66+ Tests

**Cross-Pillar Pipeline (Phase 139):**
6-Schritt Post-Response Pipeline (Error-isoliert, Priority-basiert):
1. Hebbian Learning (KG-Staerkung)
2. FSRS Scheduling (Spaced Repetition)
3. Information Gain (Neuheits-Bewertung)
4. Prediction Error (Vorhersage-Korrektur)
5. Calibration Update (Confidence-Kalibrierung)
6. Feedback Processing (Nutzer-Feedback)

**Self-Improvement (Phase 140):**
- 4 Verbesserungstypen: Knowledge Gap Research, Procedural Optimization, Team Learning, Calibration Fix
- Budget: Max 3 Aktionen/Tag (Anti-Feedback-Loop)
- Risk Governance: knowledge_gap_research → medium risk (requiresApproval)

**Kognitive Dashboard UI (Phase 141):**
- Visualisierung des kognitiven Zustands
- FSRS Review Queue fuer faellige Fakten
- Mistral-Integration als Fallback-Modell

---

## 11. Multi-Agent System

Vollstaendiges Multi-Agent-Orchestrierungssystem mit 5 Agenten-Typen, paralleler Ausfuehrung und LangGraph-Workflows.

### 11.1 Agent Orchestrator

| Feature | Beschreibung |
|---------|-------------|
| **Strategy Classification** | Automatische Aufgaben-Analyse → optimale Strategie |
| **SSE Streaming** | Echtzeit-Fortschritt per Server-Sent Events |
| **Error Recovery** | 1 automatischer Retry pro Agent |
| **Parallel Execution** | `Promise.allSettled` / `Promise.race` mit Timeout |
| **Analytics** | Erfolgsraten, Token-Kosten, Strategie-Breakdown |

### 11.2 Agenten-Typen

| Agent | Modell | Spezialisierung |
|-------|--------|----------------|
| **Researcher** | Claude Sonnet | Recherche, Analyse, Zusammenfassung |
| **Writer** | Claude Sonnet | Texterstellung, Stil-Anpassung |
| **Reviewer** | Claude Sonnet | Qualitaetspruefung, Feedback |
| **Coder** | Claude Sonnet | Code-Generierung, Testing, Debugging |
| **Custom** | Konfigurierbar | Nutzerdefinierte Agenten via Agent Identity |

### 11.3 Strategien (8)

| Strategie | Agenten-Kombination |
|-----------|---------------------|
| `research_only` | Researcher |
| `research_write` | Researcher → Writer |
| `research_write_review` | Researcher → Writer → Reviewer |
| `code_solve` | Coder → Reviewer |
| `research_code_review` | Researcher → Coder → Reviewer |
| `parallel_research` | 2x Researcher parallel |
| `parallel_code_review` | Coder + Researcher parallel → Reviewer |
| `full_parallel` | Alle parallel → Merger |

### 11.4 8 Templates

Tiefenrecherche, Blog-Artikel, Code-Loesung, Wettbewerbsanalyse, Technischer Report, E-Mail-Kampagne, Datenanalyse, Lernmaterial.

### 11.5 LangGraph-Style Workflows (Phase 64)

- **4 Node-Typen:** agent, tool, condition, human_review
- **Conditional Routing:** State-basierte Entscheidungen
- **Loop Detection:** Max Iterations Guard
- **Workflow Pause/Resume:** human_review Nodes fuer manuelle Freigabe
- **3 Pre-built Templates:** research-write-review, code-review, research-code-review

### 11.6 Agent Identity (Phase 64)

- CRUD fuer Agent-Persoenlichkeiten (Ton, Expertise, Stil, Sprache)
- Permission System mit Wildcard Pattern Matching
- Trust Levels (low/medium/high)
- Automatische System-Prompt-Generierung

### 11.7 A2A Protocol (Phase 60)

- **Agent Card:** Discovery unter `/.well-known/agent.json`
- **JSON-RPC 2.0:** tasks/send, tasks/get, tasks/cancel
- **SSE Streaming:** Echtzeit-Task-Progress
- **External Agent Registry:** DB-persistierte externe Agents mit Health-Check

### 11.8 Shared Memory

- 3-Layer: In-Memory + Redis + Datenbank
- Fire-and-forget DB-Writes
- Ueberlebt Process-Restarts

### 11.9 Debate Protocol (Phase 129)

- Multi-Turn Debatten zwischen Agenten
- Strukturierte Pro/Contra Argumente
- Konsens-Findung mit Zusammenfassung

---

## 12. Sprache & Voice

Echtzeit-Sprach-Pipeline mit WebSocket-Streaming, Multi-Provider STT/TTS und Emotion Detection.

### 12.1 Cascading Pipeline

```
Spracheingabe → STT (Whisper/Deepgram) → Claude LLM → TTS (ElevenLabs/Edge-TTS) → Sprachausgabe
```

### 12.2 STT-Provider

| Provider | Typ | Qualitaet |
|----------|-----|-----------|
| **Whisper** (OpenAI) | Cloud | Hoch (Standard) |
| **Deepgram** | Cloud | Hoch (Alternative) |

### 12.3 TTS-Provider

| Provider | Typ | Qualitaet |
|----------|-----|-----------|
| **ElevenLabs** | Cloud Premium | Sehr hoch |
| **Edge-TTS** | Cloud Kostenlos | Gut (Fallback) |

### 12.4 Features

| Feature | Beschreibung |
|---------|-------------|
| **WebSocket Streaming** | `/ws/voice` fuer Echtzeit-Audio (Base64 JSON) |
| **Turn-Taking** | Energy-basierte VAD mit konfigurierbarem Silence-Threshold |
| **Sentence-Level TTS** | Pro-Satz-Streaming (nicht auf volle Antwort warten) |
| **Audio Visualizer** | Canvas-basierter Circular-Visualizer mit Farbstatus |
| **Emotion Detection** | Heuristisch: RMS Energy + Speaking Rate → Mood-Matrix (calm/excited/tense/energetic) |
| **Morning Briefing** | Pending Tasks + Unread Emails + Today Events (6-11 Uhr), optional als TTS Audio |
| **TTS Cache** | LFU-Cache (200 Eintraege, 30min TTL), Greeting Pre-Cache (10 Phrasen) |
| **VoiceInputButton** | Wiederverwendbare Kompakt-Mic-Komponente in IdeasToolbar und InboxToolbar |

---

## 13. Sicherheit & Authentifizierung

Defense-in-Depth Sicherheitsarchitektur mit Multi-Layer Auth, Verschluesselung und Audit.

### 13.1 Authentifizierung

| Methode | Beschreibung |
|---------|-------------|
| **JWT (Access + Refresh)** | RS256, 15min Access / 7d Refresh, Token-Rotation |
| **API Key** | Backward-kompatibel, 3 Scopes (read, write, admin) |
| **OAuth 2.1 PKCE** | Google, Microsoft, GitHub Provider |
| **MFA (TOTP)** | Time-based One-Time Password, AES-256 verschluesselt |
| **Dual Auth** | JWT Bearer + API Key parallel unterstuetzt |

### 13.2 Autorisierung

| Feature | Beschreibung |
|---------|-------------|
| **RBAC** | 3 Rollen (admin, editor, viewer), 7 Actions, `requireRole()` Middleware |
| **Row-Level Security** | Vorbereitet auf 6 Tabellen x4 Schemas (RLS Policies erstellt) |
| **Multi-User Isolation** | Application-Level Filtering via `getUserId(req)` + `AND user_id = $N` |
| **SYSTEM_USER_ID** | Fallback fuer API-Key-Auth, bestehende Daten bleiben erreichbar |

### 13.3 Verschluesselung & Sicherheit

| Feature | Beschreibung |
|---------|-------------|
| **AES-256-GCM** | Field-Level Encryption mit Versioned Prefix (`enc:v1:`) |
| **Security Audit Logger** | 10 Event-Typen, Schema-isoliert, Event System Integration |
| **Rate Limiting** | Redis Sliding Window, 4 Tiers (default/auth/ai/upload), In-Memory Fallback |
| **Input Screening** | 14 Regex-Patterns fuer Prompt Injection, Score-basiert, nie blockierend |
| **Error Sanitization** | Production: generische Meldung; Dev: volle Details |
| **Request Timeout** | 30s default, 120s streaming, 180s vision |

---

## 14. Observability & Monitoring

Production-Grade Observability mit OpenTelemetry, Sentry und BullMQ.

### 14.1 Tracing

| Feature | Beschreibung |
|---------|-------------|
| **OpenTelemetry SDK** | Auto-Instrumentation (HTTP, Express, PostgreSQL) |
| **Custom Spans** | Pro-Request Span mit X-Trace-ID Header |
| **AI Traces** | Langfuse-Style Traces mit Spans + Generations |
| **Cost Estimation** | Claude Modell-basierte Kostenberechnung |

### 14.2 Metriken (8 Custom Business Metrics)

| Metrik | Beschreibung |
|--------|-------------|
| `ai.tokens.total` | Gesamt-Token-Verbrauch |
| `ai.rag.latency` | RAG-Pipeline Latenz |
| `ai.agent.duration` | Agent-Ausfuehrungsdauer |
| `ai.tool.calls` | Tool-Aufrufe pro Session |
| `queue.jobs.completed` | Abgeschlossene Queue-Jobs |
| `queue.jobs.failed` | Fehlgeschlagene Queue-Jobs |
| `memory.operations` | Memory-Operationen |
| `db.pool.active` | Aktive DB-Verbindungen |

### 14.3 Job Queues (BullMQ)

| Queue | Beschreibung |
|-------|-------------|
| `memory-consolidation` | Episodic → Long-Term Memory |
| `rag-indexing` | RAG-Index-Updates |
| `email-processing` | E-Mail KI-Verarbeitung |
| `graph-indexing` | Knowledge Graph Updates |
| `sleep-compute` | Background Memory Processing |

- **Dead Letter Queue:** Gescheiterte Jobs werden isoliert
- **Stalled Detection:** 30s Timeout, max 2 Retries
- **Health Metrics:** 6 Counter pro Queue

### 14.4 Error Tracking (Sentry)

- **Backend:** Express Integration, Performance Monitoring, gefilterte operationale Fehler
- **Frontend:** Browser Error Tracking, Session Replay, React ErrorBoundary Integration

### 14.5 Pool Monitoring

- Event Listeners (connect/acquire/remove/error)
- Active/Idle/Waiting Counters
- Warning bei 50%, Error bei 75% Auslastung

---

## 15. Proaktive Intelligenz

KI-System, das von reaktiv zu proaktiv wechselt — Vorschlaege macht, Kontext vorbereitet und autonom handelt.

### 15.1 Smart Suggestions (10 Typen)

| Typ | Beispiel |
|-----|---------|
| Aufgaben-Erinnerung | "Du hast 3 ueberfaellige Aufgaben" |
| Follow-Up | "Kontakt mit Max seit 2 Wochen ohne Antwort" |
| Knowledge Gap | "Zum Thema X gibt es wenig Fakten" |
| Tagesplan | "Heute: 2 Meetings, 5 Aufgaben" |
| E-Mail | "3 ungelesene E-Mails mit hoher Prioritaet" |
| Learning | "Fakt X ist faellig fuer Wiederholung" |
| Insight | "Dein Schreibrhythmus ist morgens am besten" |
| Briefing | "Guten Morgen — hier dein Tages-Ueberblick" |
| Anomalie | "Ungewoehnlicher Traffic-Anstieg erkannt" |
| Verbesserung | "Vorschlag: Prozedur Y optimieren" |

- **Relevance Scoring:** Type Weight + Recency Decay + Interaction Boost
- **Personalized Timing:** Aktivitaets-Tracking pro Stunde
- **Dedup & Merge:** Jaccard-Similarity >70% = Merge

### 15.2 Morning Briefing

- Automatisch zwischen 6-11 Uhr
- Pending Tasks + Unread Emails + Today Events
- Deutscher Text, optional als TTS Audio
- API: `GET /api/:context/voice/briefing?audio=true`

### 15.3 Sleep Compute (5 Stufen — Phase 63)

| Stufe | Beschreibung |
|-------|-------------|
| **Episodic Consolidation** | Aehnliche Episoden gruppieren → abstrahierte Langzeit-Fakten |
| **Contradiction Detection** | Widersprueche im Wissen finden und aufloesen |
| **Working Memory Pre-Loading** | Haeufig abgefragte Fakten vorladen |
| **Procedural Optimization** | Bewaehrte Vorgehensweisen verbessern |
| **Entity Graph Maintenance** | Verwaiste Entitaeten bereinigen |

- **BullMQ Worker:** Scheduled Sleep Cycles
- **Distributed Lock:** Verhindert parallele Ausfuehrung
- **Cache Cleanup:** Abgelaufene Kontexte bereinigen

### 15.4 Context Engine V2 (Phase 63)

- **Domain Classification:** finance, email, code, learning, general
- **Complexity Estimation:** Leicht, mittel, schwer
- **Multi-Model Routing:** Einfache Anfragen → kleines Modell, komplexe → grosses Modell
- **Minimum Viable Context:** Token-Budget-basiertes Context Assembly mit 1h Cache

### 15.5 Proactive Event Engine (Phase 54)

| Feature | Beschreibung |
|---------|-------------|
| **Persistent Event Bus** | System-Events mit DB-Persistenz |
| **Proactive Rules** | Event-Typ-Matching + Condition-Evaluation + Cooldown |
| **Decision Types** | notify, prepare_context, take_action, trigger_agent |
| **Governance Integration** | Kritische Aktionen → Approval-Queue |

### 15.6 Governance & Audit Trail (Phase 54)

- **Governance Actions:** Approval-Queue fuer High-Impact KI-Aktionen
- **Governance Policies:** Regelbasierte Auto-Approval/Manual-Approval
- **Audit Log:** Immutables Event-Log fuer alle System-Aktionen
- **SSE Stream:** Echtzeit-Benachrichtigungen fuer Approval-Requests
- **Frontend Dashboard:** 3 Sub-Tabs (Pending, History, Policies)

---

## 16. Offline & Edge

Progressive Web App mit Offline-Faehigkeit, lokaler Inferenz und Background Sync.

### 16.1 PWA (Service Worker v3)

| Feature | Beschreibung |
|---------|-------------|
| **Offline Mutation Queue** | IndexedDB-basierte Queue fuer ausstehende Aenderungen |
| **Background Sync** | Automatischer Replay bei Netzwerk-Wiederherstellung |
| **SW Update Notifications** | Benachrichtigung bei neuer Version |
| **Cache Strategy** | Stale-While-Revalidate fuer Assets |

### 16.2 Local Inference (Phase 74)

| Provider | Beschreibung |
|----------|-------------|
| **HeuristicProvider** | Pure-JS Intent Classification (12 Kategorien) + Sentiment + Keyword Extraction |
| **WebGPU Detection** | `isWebGPUAvailable()` fuer Feature-Detection |
| **Graceful Fallback** | Online: Cloud API, Offline: Local Heuristic Response |

### 16.3 Offline Chat

- **IndexedDB Message Queue:** Nachrichten werden lokal zwischengespeichert
- **Auto-Sync:** Automatischer Upload bei Reconnect
- **OfflineIndicator:** Glassmorphism-Banner mit Pending-Count
- **React Query offlineFirst:** Optimistic Updates auch offline

---

## 17. Erweiterbarkeit

Offene Plattform mit MCP-Protokoll, Extension Marketplace und Plugin-System.

### 17.1 MCP (Model Context Protocol — Phase 55)

| Feature | Beschreibung |
|---------|-------------|
| **SDK-basierter Client** | @modelcontextprotocol/sdk Integration |
| **3 Transports** | Streamable HTTP, SSE (Legacy), stdio |
| **Database Registry** | Schema-aware CRUD fuer Server-Connections |
| **Tool Bridge** | Externe Tools mit qualifizierten Namen (`mcp_serverId_toolName`) |
| **Health Monitoring** | Konfigurierbares Intervall, Background-Polling |

### 17.2 MCP Server (Intern)

- **30 Built-in Tools:** Alle ZenAI-Faehigkeiten als MCP-Tools
- **5 Resources:** zenai://memory/working, zenai://memory/procedures, zenai://memory/entities + weitere
- **5 Prompts:** Vordefinierte Prompt-Templates

### 17.3 MCP Discovery (Phase 71)

8 vordefinierte Server im Katalog:

| Server | Zweck |
|--------|-------|
| Slack | Team-Kommunikation |
| GitHub | Code-Management |
| Google Drive | Dokumenten-Zugriff |
| Linear | Issue Tracking |
| Notion | Wissensbasis |
| Calendar | Kalender-Integration |
| Figma | Design-Dateien |
| HubSpot | CRM-Daten |

- **Auto-Config Templates:** Transport-Config + Required Credentials
- **Tool Marketplace UI:** Card-Grid mit Status-Badges
- **Setup Wizard:** 3-Step (Info → Credentials → Connect)

### 17.4 Extension Marketplace (Phase 75)

| Extension | Beschreibung |
|-----------|-------------|
| **Pomodoro Timer** | Zeitmanagement mit Pausen |
| **Markdown Export** | Ideen als Markdown exportieren |
| **Daily Digest** | Taegliche Zusammenfassung |
| **Code Snippets** | Code-Schnipsel verwalten |
| **Meeting Templates** | Vorlagen fuer Meeting-Notizen |

- **Permission System:** 6 Permissions (storage, network, ai, ui, data_read, data_write)
- **Sandbox:** Rate Limiting (100/h), Timeout (30s)
- **Extension Lifecycle:** Install → Enable → Execute → Disable → Uninstall

---

## 18. Design System

Formalisiertes Design System mit TypeScript Tokens, 24+ Komponenten und Accessibility.

### 18.1 Design Tokens

| Kategorie | Umfang |
|-----------|--------|
| **Colors** | Brand, Semantic, Surface (Light/Dark), Glass, Neuro |
| **Typography** | 2 Font-Familien, 10 Groessen, 7 Gewichte |
| **Spacing** | 13 Stufen (0-96) |
| **Shadows** | Light + Dark Mode Sets, Glow Effects |
| **Animations** | 4 Easing Curves, 5 Durations, 8 Transitions, Spring Physics |

### 18.2 Core Components (10 DS-Komponenten)

| Komponente | Features |
|-----------|---------|
| **Button** | 4 Varianten (primary, secondary, ghost, glass), 3 Groessen |
| **Input** | Text, Password, Textarea, Glass-Variante |
| **Card** | Standard, Glass, Neuro, Hover-Effekte |
| **Badge** | 6 Farben, Pill/Square |
| **Modal** | Focus Trap, ESC-Close, Backdrop |
| **Tabs** | Arrow-Key Navigation, ARIA |
| **Toast** | 4 Typen (success, error, warning, info), Auto-Dismiss |
| **Skeleton** | Shimmer-Animation, verschiedene Formen |
| **EmptyState** | Illustration + CTA |
| **Avatar** | Initialen + Bild, 4 Groessen |

### 18.3 Accessibility (WCAG 2.1 AA)

- **ARIA:** role, aria-label, aria-live, aria-expanded auf allen interaktiven Elementen
- **Keyboard:** Arrow Keys in Tabs/Sidebar, Focus Trap in Modals, ESC zum Schliessen
- **Touch Targets:** Mindestens 44px fuer `@media (pointer: coarse)`
- **Reduced Motion:** `prefers-reduced-motion` Support fuer alle Animationen
- **Kontrast:** CSS Variables statt Hardcoded Hex, Chevron Opacity 0.6
- **Screen Reader:** Status-Dots mit aria-label ("Datenbank: verbunden")

### 18.4 Responsive Design

| Breakpoint | Layout |
|-----------|--------|
| **Desktop** | Sidebar (260px/64px) + Content + Optional Panel |
| **Tablet** | Collapsed Sidebar + Full Content |
| **Mobile** | Bottom Bar (5 Tabs) + Drawer Navigation |

- **Spring Animations:** `cubic-bezier(0.34, 1.56, 0.64, 1)` mit Stagger
- **Code Splitting:** 7 manuelle Vite-Chunks fuer optimales Loading
- **Page Skeletons:** ChatSkeleton, DashboardSkeleton, SmartPageSkeleton

---

## 19. Deployment & Infrastruktur

### 19.1 Deployment-Architektur

| Dienst | Plattform | Konfiguration |
|--------|-----------|---------------|
| **Frontend** | Vercel | Auto-Deploy auf `main`, CDN global |
| **Backend** | Railway | Auto-Deploy auf `main`, Health Check aktiv |
| **Datenbank** | Supabase | PostgreSQL 15 + pgvector, Port 6543 (Transaction Mode) |
| **Cache** | Railway Redis | `redis.railway.internal:6379` |
| **Error Tracking** | Sentry | Backend + Frontend |

### 19.2 CI/CD (GitHub Actions)

12 Jobs in der Pipeline:

| Job | Beschreibung |
|-----|-------------|
| `install` | Dependencies installieren |
| `lint-backend` | ESLint Backend |
| `lint-frontend` | ESLint Frontend |
| `test-backend-1..5` | Backend Tests (5 Shards) |
| `test-frontend` | Frontend Tests (Vitest) |
| `build-backend` | TypeScript Kompilierung |
| `build-frontend` | Vite Production Build |
| `deploy-ready` | Deployment-Check |

### 19.3 Environment Variables

- **Backend:** 50+ konfigurierte Variablen (DB, AI, Auth, Email, Maps, Voice, etc.)
- **Frontend:** 5 VITE_-prefixed Variablen
- **Railway:** 20+ Production-spezifische Variablen

### 19.4 Datenbank-Schema

- **4 Schemas:** personal, work, learning, creative (volle Paritaet)
- **~95 Tabellen pro Schema** mit identischer Struktur
- **HNSW Indexes:** Optimiert fuer Vektor-Suche (m=16, ef_construction=64)
- **Composite Indexes:** 60+ Performance-Indexes pro Schema
- **Connection Pool:** Shared Pool (max=8, min=2), Transaction Mode Pooler

---

## 20. API-Uebersicht

Vollstaendige REST API mit 328+ registrierten Endpoints ueber 103 Route-Dateien.

| API-Gruppe | Endpoints (ca.) | Beschreibung |
|------------|----------------|-------------|
| **Chat** | 8 | Nachrichten, Streaming, Vision, Quick Chat |
| **Ideas** | 15 | CRUD, Triage, Incubator, Archive, Smart Content |
| **Tasks** | 12 | CRUD, Kanban Reorder, Dependencies, Idea→Task |
| **Projects** | 5 | CRUD mit Task-Counts |
| **Calendar** | 8 | Events, Meetings, Meeting-Notes |
| **Email** | 22 | CRUD, Send, Reply, Forward, AI-Processing |
| **Documents** | 24 | Upload, Analyse, Folders, Search |
| **Canvas** | 8 | CRUD, Versionen, Chat-Link |
| **Contacts & CRM** | 15 | Kontakte, Organisationen, Timeline |
| **Finance** | 21 | Konten, Transaktionen, Budgets, Ziele |
| **Browser** | 13 | History, Bookmarks, AI-Analyse |
| **Maps** | 11 | Geocoding, Directions, Places, Saved Locations |
| **Vision** | 8 | Analyze, OCR, Ideas, Q&A, Compare |
| **Code Execution** | 5 | Execute, Run, Validate, Health, Languages |
| **Topics** | 7 | Enhanced Topics, Quality, Assign, Context |
| **Knowledge Graph** | 13 | Inference, Communities, Centrality, Relations |
| **GraphRAG** | 9 | Extract, Entities, Retrieve, Communities, Index |
| **Memory Procedures** | 10 | Record, Recall, Feedback, BM25, Hybrid Search |
| **Thinking** | 6 | Feedback, Stats, Strategies, Chains |
| **RAG Analytics** | 5 | Feedback, Analytics, Strategies, History |
| **Smart Suggestions** | 5 | List, Dismiss, Snooze, Accept, SSE Stream |
| **Agent Teams** | 10 | Execute, Stream, Templates, Analytics, History |
| **Agent Identity** | 13 | Identity CRUD, Workflows, Templates, Runs |
| **A2A Protocol** | 12 | Tasks, External Agents, Discovery, SSE |
| **MCP Connections** | 14 | Servers, Tools, Execute, Health |
| **Auth** | 15 | Register, Login, OAuth, MFA, Sessions |
| **Voice** | 8 | Session, TTS, Settings, Voices, WebSocket |
| **Governance** | 10 | Pending, History, Approve, Reject, Policies |
| **Context Rules** | 6 | CRUD, Performance, Test |
| **Proactive Engine** | 8 | Events, Rules, Process, SSE Stream |
| **Sleep Compute** | 7 | Logs, Stats, Trigger, Idle Status |
| **Security** | 6 | Audit Log, Alerts, Rate Limits |
| **Observability** | 5 | Metrics, Queue Stats, Health |
| **AI Traces** | 3 | List, Detail, Stats |
| **Extensions** | 8 | Marketplace, Install, Execute, Settings |
| **Health** | 3 | Basic, Detailed, Ready |
| **Curiosity** | 5 | Gaps, Hypotheses, Information Gain |
| **Predictions** | 4 | Predict, Record, Patterns |
| **Metacognition** | 7 | State, Calibration, Capabilities |
| **Feedback/Adaptive** | 5 | Feedback, Preferences, Style |
| **Self-Improvement** | 4 | Identify, Execute, Budget, History |
| **Weitere** | ~30 | Analytics, Learning, Export, Sync, i18n, etc. |
| **Gesamt** | **~328+** | |

---

## Qualitaetsmetriken

| Metrik | Wert |
|--------|------|
| **Backend Tests** | 7.692 bestanden |
| **Frontend Tests** | 1.400 bestanden |
| **CLI Tests** | 108 bestanden |
| **Gesamt Tests** | 9.200 bestanden, 24 uebersprungen, 0 Failures |
| **ESLint** | 0 Errors, 0 Warnings |
| **TypeScript** | 0 Errors (Backend + Frontend + CLI) |
| **Absichtlich uebersprungen** | 21x Docker, 1x Netzwerk, 2x SSL |
| **Route Test Coverage** | ~98% |
| **Build** | Backend + Frontend + CLI erfolgreich |
| **Production Health** | Railway Health Check aktiv |

---

## Technologie-Stack (Vollstaendig)

### Backend Dependencies (Auswahl)

| Package | Zweck |
|---------|-------|
| `@anthropic-ai/sdk` | Claude API Client |
| `@modelcontextprotocol/sdk` | MCP Protocol |
| `express` | HTTP Server |
| `pg` + `pgvector` | PostgreSQL + Vektor-Suche |
| `bullmq` | Job Queues |
| `ioredis` | Redis Client |
| `jsonwebtoken` | JWT Auth |
| `bcrypt` | Password Hashing |
| `resend` | E-Mail API |
| `pptxgenjs` | PowerPoint Generation |
| `exceljs` | Excel Generation |
| `pdfmake` | PDF Generation |
| `docx` | Word Generation |
| `@opentelemetry/*` | Tracing & Metrics |
| `@sentry/node` | Error Tracking |

### Frontend Dependencies (Auswahl)

| Package | Zweck |
|---------|-------|
| `react` + `react-dom` | UI Framework |
| `@tanstack/react-query` | Server State Management |
| `vite` | Build Tool |
| `prismjs` | Syntax Highlighting |
| `@sentry/react` | Error Tracking |
| `dompurify` | XSS Protection |

---

## Phasen-Uebersicht (0-141)

| Phase | Zeitraum | Schwerpunkt |
|-------|----------|------------|
| 0-30 | Jan 2026 | Grundlagen: Chat, Ideas, Memory, RAG |
| 31-40 | Feb 2026 | Tools, Code Execution, Web Search, Vision, Streaming |
| 41-50 | Feb-Maerz 2026 | Business, Browser, Contacts, Finance, Maps, Knowledge Graph |
| 51-60 | Maerz 2026 | MCP, Auth, Voice, GraphRAG, A2A Protocol |
| 61-70 | Maerz 2026 | Observability, Security, Sleep Compute, Agent Identity, A-RAG |
| 71-80 | Maerz 2026 | MCP Discovery, Neuroscience Memory, AI Traces, Edge AI, Extensions |
| 81-96 | Maerz 2026 | Frontend Polish, React Query, Design System, Proactive Intelligence |
| 97-100 | Maerz 2026 | Quality Excellence: 100+ Fixes, Research-basiert |
| 101-118 | Maerz 2026 | Deep Polish, Performance, Accessibility, Voice UX |
| 119-124 | Maerz 2026 | File Decomposition, Test Coverage Sprint, Security Fixes |
| 125-131 | 22. Maerz 2026 | Kognitive Architektur Foundation (764 Tests) |
| 132-134 | 22. Maerz 2026 | CLI Agent, Kuenstliche Neugier, Prediction Engine |
| 135-138 | 22. Maerz 2026 | Meta-Kognition, Feedback Bus, Adaptive Behavior |
| 139-141 | 22. Maerz 2026 | Cross-Pillar Integration, Self-Improvement, Cognitive UI |

---

> **ZenAI** — Vom Chat zur kognitiven Plattform in 141 Phasen.
> 280.000 Zeilen Code. 9.200 Tests. 55 KI-Tools. 328+ API-Endpoints. 4 Schemas. 1 Vision.
