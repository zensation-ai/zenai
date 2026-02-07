# Dokument-Analyse Feature - Implementierungskonzept

> **Status:** Research & Konzept
> **Erstellt:** 2026-02-07
> **Autor:** Claude / Alexander Bering

---

## 1. Vision

Eine Schnell-Analyse-Sektion in ZenAI, in die Benutzer Dokumente (PDF, Excel, CSV) per Drag & Drop einschieben können. Die Analyse wird als Artifact ausgegeben - strukturiert, interaktiv und exportierbar.

### Use Cases

- **Finanzdaten:** Excel-Tabellen hochladen → automatische Auswertung mit KPIs, Trends, Auffälligkeiten
- **Verträge/Dokumente:** PDF hochladen → Zusammenfassung, Schlüsselklauseln, Risikobewertung
- **Reports:** PDF-Berichte → strukturierte Extraktion von Daten, Tabellen, Grafiken
- **Datenanalyse:** CSV/Excel → statistische Auswertung, Pattern-Erkennung, Visualisierung

---

## 2. Bestehende Infrastruktur (Wiederverwendbar)

### Frontend (ca. 70% vorhanden)

| Komponente | Datei | Wiederverwendbar |
|------------|-------|-----------------|
| Drag & Drop Upload | `frontend/src/components/ImageUpload.tsx` | Erweitern um PDF/XLSX/CSV-Akzeptanz |
| Artifact-Ausgabe | `frontend/src/components/ArtifactPanel.tsx` | Direkt nutzbar (Markdown, CSV, JSON, Mermaid) |
| Chat-Integration | `frontend/src/components/GeneralChat.tsx` | Dokument-Analyse als Chat-Nachricht |
| Styling-Patterns | `frontend/src/components/ImageUpload.css` | Dark Mode, Responsive, Accessibility |

### Backend (ca. 60% vorhanden)

| Komponente | Datei | Wiederverwendbar |
|------------|-------|-----------------|
| Multer Upload (Memory) | `backend/src/routes/vision.ts` | Pattern für kleine Dateien (<10MB) |
| Multer Upload (Disk) | `backend/src/routes/media.ts` | Pattern für große Dateien, Magic Numbers |
| Claude Vision Service | `backend/src/services/claude-vision.ts` | `processDocument()` Methode |
| PDF-Generierung | `backend/src/routes/export.ts` | PDFKit für Report-Export |
| Tool-Handler System | `backend/src/services/tool-handlers.ts` | Integration als Claude-Tool |
| Streaming (SSE) | `backend/src/services/claude/streaming.ts` | Echtzeit-Analyse-Fortschritt |

### API & Datenbank

| Komponente | Status |
|------------|--------|
| Anthropic SDK (v0.71) | `document`-Content-Block für PDFs nativ unterstützt |
| Supabase + pgvector | Bereit für Dokument-Embeddings |
| Export-Pipeline | PDF, CSV, Markdown Export vorhanden |

---

## 3. Claude API - Native PDF-Unterstützung

### Kern-Erkenntnis

Claude's API unterstützt **PDFs nativ** über einen `document`-Content-Block. Es wird **keine zusätzliche PDF-Parsing-Library** benötigt.

```typescript
// PDF direkt an Claude senden
const message = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 4096,
  messages: [{
    role: "user",
    content: [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: pdfBase64
        }
      },
      {
        type: "text",
        text: "Analysiere dieses Dokument: Erstelle eine Zusammenfassung, extrahiere Schlüsseldaten und identifiziere Auffälligkeiten."
      }
    ]
  }]
});
```

### Limits

| Parameter | Wert |
|-----------|------|
| Max Seiten pro PDF | 100 |
| Max Dateigröße (Messages API) | 32 MB |
| Max Dateigröße (Files API) | 500 MB |
| Prompt Caching | 5 Min TTL (spart Tokens bei Folge-Fragen) |

### Token-Kosten (Schätzung)

- Jede PDF-Seite wird intern als Bild verarbeitet
- Ca. 1.000-2.000 Tokens pro Seite (je nach Komplexität)
- Ein 10-seitiges PDF: ~15.000-20.000 Input-Tokens
- Kosten pro Analyse (Sonnet): ca. $0.05-0.10

---

## 4. Architektur

```
┌──────────────────────────────────────────────────────────┐
│  Frontend                                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │  DocumentAnalysis.tsx (Neue Sektion)               │  │
│  │  ├── DocumentUpload (erweitert ImageUpload)        │  │
│  │  │   ├── Drag & Drop Zone (PDF, XLSX, CSV)        │  │
│  │  │   ├── Datei-Vorschau (Name, Größe, Typ-Icon)   │  │
│  │  │   └── Analyse-Template-Auswahl (optional)       │  │
│  │  ├── AnalysisProgress (SSE Streaming)              │  │
│  │  └── AnalysisResult (→ ArtifactPanel)              │  │
│  │      ├── Zusammenfassung (Markdown)                │  │
│  │      ├── Extrahierte Tabellen (CSV)                │  │
│  │      ├── Strukturierte Daten (JSON)                │  │
│  │      └── Visualisierungen (Mermaid)                │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────┬───────────────────────────────────┘
                       │ POST /api/documents/analyze
                       │ multipart/form-data + SSE
                       ▼
┌──────────────────────────────────────────────────────────┐
│  Backend                                                 │
│  ┌────────────────────────────────────────────────────┐  │
│  │  routes/document-analysis.ts                       │  │
│  │  ├── POST /api/documents/analyze                   │  │
│  │  ├── POST /api/documents/analyze/stream (SSE)      │  │
│  │  ├── GET  /api/documents/templates                 │  │
│  │  └── GET  /api/documents/history                   │  │
│  └──────────────────┬─────────────────────────────────┘  │
│                     ▼                                    │
│  ┌────────────────────────────────────────────────────┐  │
│  │  services/document-analysis.ts                     │  │
│  │  ├── analyzeDocument(file, template?, options?)    │  │
│  │  ├── parseExcel(buffer) → strukturierter Text      │  │
│  │  ├── parseCSV(buffer) → strukturierter Text        │  │
│  │  └── buildAnalysisPrompt(type, template)           │  │
│  └──────────────────┬─────────────────────────────────┘  │
│                     ▼                                    │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Claude API                                        │  │
│  │  ├── PDF → document-Block (nativ)                  │  │
│  │  ├── Excel → text-Block (nach xlsx-Parsing)        │  │
│  │  └── CSV → text-Block (direkt)                     │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## 5. Implementierungsplan

### Phase 1 - MVP (Kern-Funktionalität)

**Ziel:** PDF und Excel hochladen → Analyse als Artifact anzeigen

#### Backend (4 neue Dateien)

| Datei | Beschreibung |
|-------|-------------|
| `services/document-analysis.ts` | Kern-Service: Dokument-Typ-Erkennung, Excel-Parsing, Claude-API-Integration |
| `routes/document-analysis.ts` | REST-Endpoints mit Multer, Streaming-Support |
| `__tests__/document-analysis.test.ts` | Unit Tests für Service |
| `__tests__/integration/document-analysis.test.ts` | Integration Tests für Routes |

**Neue Dependency:** `xlsx` (SheetJS) für Excel-Parsing

**Endpoints:**

```
POST /api/documents/analyze          - Dokument hochladen und analysieren
POST /api/documents/analyze/stream   - SSE Streaming-Analyse
GET  /api/documents/health           - Service-Status
```

#### Frontend (3 neue Dateien)

| Datei | Beschreibung |
|-------|-------------|
| `components/DocumentAnalysis.tsx` | Hauptkomponente (Upload + Ergebnis) |
| `components/DocumentUpload.tsx` | Erweiterte Upload-Komponente (PDF/XLSX/CSV) |
| `components/DocumentAnalysis.css` | Styling |

**Änderungen an bestehenden Dateien:**

| Datei | Änderung |
|-------|----------|
| `App.tsx` | Neue Route/Sektion für Dokument-Analyse |
| `GeneralChat.tsx` | Optional: Dokument-Upload im Chat |

#### Geschätzter Umfang Phase 1

- **Backend:** ~400-500 Zeilen neuer Code
- **Frontend:** ~300-400 Zeilen neuer Code
- **Tests:** ~200-300 Zeilen
- **Neue Dependencies:** 1 (`xlsx`)
- **Bestehende Dateien zu ändern:** 2-3

---

### Phase 2 - Erweiterte Analyse

**Ziel:** Templates, Multi-Dokument, Datenbank-Integration

| Feature | Beschreibung |
|---------|-------------|
| Analyse-Templates | Vordefinierte Prompts: "Finanzbericht", "Vertragsprüfung", "Datenauswertung", "Allgemein" |
| Multi-Dokument-Vergleich | 2-5 Dokumente gleichzeitig vergleichen (nutzt bestehendes Compare-Pattern) |
| Analyse-Historie | Vergangene Analysen in Supabase speichern und wieder abrufen |
| Prompt Caching | Für Folge-Fragen zum selben Dokument (spart ~80% Tokens) |

#### Neue DB-Tabelle

```sql
CREATE TABLE document_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  file_size INTEGER NOT NULL,
  analysis_type VARCHAR(50) DEFAULT 'general',
  analysis_result JSONB,
  token_usage JSONB,
  context VARCHAR(20) DEFAULT 'work',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Phase 3 - Power Features

**Ziel:** Axel-spezifische Workflows, Auto-Visualisierung

| Feature | Beschreibung |
|---------|-------------|
| Custom Analyse-Prompts | Benutzer-eigene Templates definieren und speichern |
| Auto-Visualisierung | Mermaid-Diagramme aus Excel-Daten generieren (Pie Charts, Bar Charts, Flow Charts) |
| PDF-Report-Export | Analyse-Ergebnis als professionellen PDF-Report exportieren (nutzt bestehendes PDFKit) |
| RAG-Integration | Analysierte Dokumente in den Wissens-Kontext einbinden (HiMeS Memory) |
| Chat mit Dokument | Nach Analyse: Folge-Fragen zum Dokument im Chat stellen |
| `analyze_document` Tool | Als Claude-Tool im Chat verfügbar (wie `execute_code`) |

---

## 6. Unterstützte Dateiformate

### Phase 1

| Format | MIME Type | Parsing | Max Größe |
|--------|-----------|---------|-----------|
| PDF | `application/pdf` | Claude API nativ | 32 MB / 100 Seiten |
| XLSX | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | `xlsx`-Library → Text | 20 MB |
| XLS | `application/vnd.ms-excel` | `xlsx`-Library → Text | 20 MB |
| CSV | `text/csv` | Native Node.js | 10 MB |

### Phase 2+ (optional)

| Format | MIME Type | Parsing |
|--------|-----------|---------|
| DOCX | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `mammoth`-Library |
| PPTX | PowerPoint | `pptx-parser` |
| TXT/MD | Text/Markdown | Native |

---

## 7. Risiken & Mitigation

| Risiko | Impact | Mitigation |
|--------|--------|-----------|
| **Token-Kosten bei großen PDFs** | Hoch | Seiten-Limit konfigurierbar (z.B. max 20 Seiten für Schnell-Analyse), Cost-Tracking pro Analyse |
| **100-Seiten-Limit** | Mittel | Chunking: PDF in Teile aufteilen, jeweils analysieren, Ergebnisse zusammenführen |
| **Komplexe Excel-Sheets** | Mittel | Pre-Processing: Multi-Sheet erkennen, relevante Sheets auswählen lassen |
| **Langsame Analyse (große Dokumente)** | Mittel | SSE-Streaming für Fortschritt, Timeout konfigurierbar |
| **Sensible Dokumente** | Hoch | Hinweis an Benutzer: Daten werden an Claude API gesendet, optional: lokales Ollama-Fallback |

---

## 8. Technische Entscheidungen

### PDF-Parsing: Claude API nativ vs. pdf-parse Library

| | Claude API nativ | pdf-parse Library |
|--|-----------------|-------------------|
| **Setup** | Kein Setup nötig | npm install + Integration |
| **Tabellen** | Versteht Layout visuell | Nur roher Text |
| **Grafiken/Charts** | Erkennt und beschreibt | Ignoriert |
| **Qualität** | Sehr hoch (Vision-basiert) | Mittel (nur Text) |
| **Kosten** | ~1.500 Tokens/Seite | Keine API-Kosten |
| **Geschwindigkeit** | 2-5 Sek/Seite | Instant |

**Empfehlung:** Claude API nativ für Phase 1. Hybrid-Ansatz in Phase 2 (pdf-parse für Vorschau/Extraktion, Claude für tiefe Analyse).

### Excel-Parsing: xlsx vs. exceljs

| | xlsx (SheetJS) | exceljs |
|--|---------------|---------|
| **Größe** | ~2 MB | ~5 MB |
| **Parsing-Speed** | Schnell | Mittel |
| **Styling-Info** | Nein | Ja |
| **Formeln** | Berechnet | Berechnet |
| **TypeScript** | Typen vorhanden | Native TS |

**Empfehlung:** `xlsx` für Phase 1 (leichter, schneller). Wechsel zu `exceljs` nur wenn Styling-Informationen relevant werden.

---

## 9. Zusammenfassung

| Aspekt | Bewertung |
|--------|-----------|
| **Machbarkeit** | Hoch - 60-70% der Infrastruktur existiert bereits |
| **Aufwand Phase 1** | Mittel - ~8-10 neue Dateien, 1 neue Dependency |
| **Aufwand Phase 2** | Mittel - Templates, DB-Integration, Multi-Doc |
| **Aufwand Phase 3** | Hoch - Custom Tools, RAG, Auto-Visualisierung |
| **Risiko** | Niedrig - keine fundamentalen technischen Hürden |
| **ROI** | Hoch - differenzierendes Feature für ZenAI |
