# Cockpit Completion — 100% Spec Implementation

> **Erstellt:** 2026-03-23
> **Basis-Spec:** `2026-03-22-phase2a-cockpit-redesign-design.md`
> **Ziel:** Alle Gaps zwischen aktuellem Stand (~65%) und Spec (100%) schliessen

---

## Ausgangslage

Die Cockpit-Architektur steht: Rail, PanelArea, PanelContext, URL-Sync, 9/10 Panels (delegieren an bestehende Pages), Keyboard-Shortcut-Hook. Folgende Gaps verhindern produktiven Einsatz:

| Gap | Severity | Bereich |
|-----|----------|---------|
| Dashboard-Widgets sind Platzhalter | Critical | DashboardPage |
| Chat-Session-Management nicht implementiert | Critical | CockpitShell |
| useCockpitShortcuts nicht eingehaengt | Critical | CockpitShell |
| Mobile Layout fehlt | Critical | CockpitLayout |
| SearchPanel ist Stub | Medium | Panels |
| QuickActionsBar nicht gerendert | Medium | Chat Input |
| Rail: kein Activity-Indicator, keine Session-Liste | Medium | Rail |
| Touch-Support fuer Panel-Resize | Low | PanelShell |

---

## 1. Dashboard-Widgets mit echten Daten

**Datei:** `frontend/src/components/cockpit/DashboardPage.tsx`

Vier Widgets ersetzen Platzhalter-Text durch React-Query-Hooks. DashboardPage nutzt `usePanelContext()` zum Oeffnen von Panels (kein `navigate()`), da es innerhalb des `PanelProvider`-Subtrees gerendert wird.

### Widget "Heute"
- **Daten:** `useTasksQuery(context, { status: 'pending' })` gefiltert auf `due_date <= today`, `useCalendarQuery(context)` fuer naechstes Event, `useEmailStatsQuery(context)` fuer unread count
- **Anzeige:** "{n} offene Tasks", naechstes Meeting mit Uhrzeit, "{n} ungelesene Mails"
- **Klick:** `panelDispatch({ type: 'OPEN_PANEL', panel: 'tasks' })` etc.
- **Leer-State:** "Alles erledigt" mit Haekchen-Icon
- **Neue Wrapper-Hooks:** `useTodayWidgetData(context)` aggregiert die 3 Queries

### Widget "AI Insights"
- **Daten:** `useSmartSuggestions()` (existierender SSE-Hook, `.suggestions.slice(0, 3)`), `useCuriosityGaps(context)` fuer Top Gap
- **Anzeige:** Max 3 Suggestion-Einzeiler (Typ-Icon + Titel), Top Knowledge Gap als Frage
- **Klick:** Suggestion-Aktion ausfuehren, Gap oeffnet Chat mit Frage
- **Leer-State:** "Keine Vorschlaege gerade"
- **Hinweis:** `useSmartSuggestions` ist ein SSE-basierter Hook, kein Standard React-Query-Hook. Ergebnis wird mit `.slice(0, 3)` begrenzt.

### Widget "Letzte Aktivitaet"
- **Daten:** `useChatSessionsQuery(context)` (existiert in `hooks/queries/useChat.ts`), `.slice(0, 5)` fuer die neuesten
- **Anzeige:** Timeline mit relativer Zeit ("vor 2h"), Session-Titel, Kontext-Badge
- **Klick:** Wechselt zur Chat-Session via `sessionManager.switchSession(id)`
- **Leer-State:** "Noch keine Gespraeche"
- **Abhaengigkeit:** Benoetigt Session-Management (Sektion 2) fuer Klick-Interaktion. Implementierungsreihenfolge: Sektion 2 vor Sektion 1.

### Widget "Memory Health"
- **Daten:** `useCognitiveOverview(context)` (existiert in `hooks/queries/useCognitive.ts`), `useReviewQueue(context)`
- **Composite Score:** `Math.round((data.confidence_score + data.coherence_score + data.coverage_score) / 3 * 100)` — Durchschnitt der drei Subscores als 0-100 Wert
- **Anzeige:** Composite Score als Ring-Chart (SVG), Facts-Count aus `useCognitiveOverview`, naechste FSRS-Review aus `useReviewQueue`
- **Ring-Farben:** Gruen >75, Gelb 50-75, Rot <50
- **Klick:** `panelDispatch({ type: 'OPEN_PANEL', panel: 'memory' })`
- **Leer-State:** Score 0 mit "Noch keine Daten"

### Technische Details
- Fehlende Wrapper-Hooks werden als duenne Aggregatoren um vorhandene Hooks erstellt
- Loading: Skeleton-Pulse pro Widget (nicht global)
- Error: "Nicht verfuegbar" mit Retry-Button pro Widget
- Auto-Refresh: `refetchInterval: 60_000` (1 Minute)
- Grid: 2x2 auf Desktop, 1-Spalte auf Mobile

---

## 2. Chat-Session-Management

**Dateien:** `App.tsx` (CockpitShell), neuer Hook `hooks/useCockpitSessions.ts`

### Session-Lifecycle
- **Erstellen:** Button "+" in ChatSessionTabs oder Cmd+T
  - POST `/api/:ctx/chat/sessions` → neue Session-ID
  - Tab wird sofort hinzugefuegt, Chat zeigt Willkommens-Nachricht
- **Wechseln:** Klick auf Tab oder Cmd+[/]
  - Aktive Session-ID aendert sich, GeneralChat laedt Messages der Session
  - URL bleibt auf aktuellem Pfad (Session-State ist lokal, nicht URL-basiert)
- **Schliessen:** X-Button auf Tab oder Alt+W
  - Tab wird entfernt, naechster Tab wird aktiv
  - Letzter Tab kann nicht geschlossen werden (mindestens 1 Session)
  - Keine Bestaetigung noetig (Session bleibt im Backend erhalten)
- **Erster Start:** Hook erkennt leere Session-Liste und ruft automatisch `createSession()` in einem `useEffect` auf. Keine manuelle Initialisierung in CockpitShell noetig.
- **Persistenz:** Session-IDs + activeSessionId in localStorage (`zenai-cockpit-sessions`)
  - Beim App-Start: gespeicherte Sessions laden, aktive Session wiederherstellen
  - Max 8 sichtbare Tabs (aelteste werden ausgeblendet, nicht geloescht)

### Hook-Interface
```typescript
interface UseCockpitSessions {
  sessions: ChatSession[];        // Alle offenen Sessions
  activeSessionId: string | null; // Aktuell sichtbare Session
  createSession: () => Promise<string>;  // Neue Session, gibt ID zurueck
  switchSession: (id: string) => void;   // Wechselt zu bestimmter Session
  switchToPrev: () => void;              // Wechselt zum vorherigen Tab
  switchToNext: () => void;              // Wechselt zum naechsten Tab
  closeSession: (id: string) => void;    // Schliesst Tab (nicht den letzten)
}
```

`switchToPrev`/`switchToNext` berechnen den Index aus `sessions.findIndex(s => s.id === activeSessionId)` und wrappen am Anfang/Ende.

### Integration mit GeneralChat
- `GeneralChat` erhaelt `sessionId` als Prop
- Key-Prop auf GeneralChat mit sessionId: `<GeneralChat key={activeSessionId} sessionId={activeSessionId} ... />`
- Beim Session-Wechsel: React unmountet und remountet GeneralChat automatisch (wegen neuem key)
- Kein State-Leak zwischen Sessions

---

## 3. Keyboard-Shortcuts einhaengen

**Datei:** `App.tsx` (CockpitShell)

`useCockpitShortcuts` existiert bereits mit vollstaendiger Implementation. Es muss nur eingehaengt werden:

```typescript
useCockpitShortcuts({
  onOpenPanel: (panel) => panelDispatch({ type: 'OPEN_PANEL', panel }),
  onClosePanel: () => panelDispatch({ type: 'CLOSE_PANEL' }),
  onNavigate: navigateToPage,
  onNewTab: () => sessionManager.createSession(),
  onCloseTab: () => sessionManager.closeSession(sessionManager.activeSessionId),
  onPrevTab: () => sessionManager.switchToPrev(),
  onNextTab: () => sessionManager.switchToNext(),
});
```

Keine neuen Dateien, nur Integration. Abhaengigkeit: Sektion 2 (Session-Management) muss zuerst implementiert werden.

---

## 4. Mobile Layout

**Dateien:** `CockpitLayout.tsx`, `CockpitLayout.css`, neuer `CockpitBottomBar.tsx`, `PanelArea.tsx`

### Bottom-Bar (< 768px)
- Ersetzt Rail auf Mobile
- 3 Icons: Chat (MessageSquare), Dashboard (LayoutDashboard), Settings (Settings)
- Feste Hoehe: 56px, unten fixiert
- Active-State: Farbiger Dot unter aktivem Icon
- Safe-Area-Padding fuer iOS (env(safe-area-inset-bottom))

### Panel als Full-Screen-Sheet
- Panels oeffnen sich als Bottom-Sheet (von unten hochfahrend) statt als Sidebar
- **Rendering-Strategie:** `PanelArea` erhaelt ein `isMobile` Prop (via `useMediaQuery(767)`). Bei `isMobile=true` rendert es ein anderes Framer-Motion-Layout:
  - Position: `fixed`, `inset: 0`, `top: 48px` (Drag-Handle-Bereich)
  - Animation: `variants={{ hidden: { y: '100%' }, visible: { y: 0 } }}` statt width-basiert
  - Backdrop: `<motion.div>` mit `opacity: 0 → 0.5`, klick schliesst Panel
- Swipe-Down auf Handle schliesst Panel (`onPanGesture` mit threshold 100px)
- Keine Resize-Funktion auf Mobile (immer volle Breite)

### Chat auf Mobile
- Chat nimmt volle Breite ein (kein Rail)
- ChatInput fixiert am unteren Rand (ueber BottomBar)
- QuickActionsBar horizontal scrollbar ueber dem Input

### CSS-Strategie
- Media Query `@media (max-width: 767px)` in CockpitLayout.css
- Rail: `display: none`
- BottomBar: Position fixed, bottom 0, width 100%, height 56px + safe-area
- Main Chat Area: `padding-bottom: calc(56px + env(safe-area-inset-bottom))`

---

## 5. SearchPanel implementieren

**Datei:** `frontend/src/components/cockpit/panels/SearchPanel.tsx`

### Funktionalitaet
- Suchfeld mit Auto-Focus beim Oeffnen
- Suche ueber alle Domains: Ideas, Tasks, Emails, Contacts, Documents, Memory Facts
- **Backend:** `POST /api/search/global` mit Body `{ query, contexts: [context], types: ['idea', 'document', 'fact', 'chat', 'contact', 'email', 'calendar_event'], limit: 30 }` — **Endpoint existiert bereits**, keine Backend-Arbeit noetig
- Ergebnisse gruppiert nach Typ mit Icon und Typ-Label
- Klick auf Ergebnis: oeffnet passendes Panel mit Filter (z.B. `panelDispatch({ type: 'OPEN_PANEL', panel: 'ideas', filter: result.id })`)
- Debounce: 300ms nach letztem Tastendruck
- Max 5 Ergebnisse pro Typ, "Mehr anzeigen" Link
- Tastatur: Pfeiltasten navigieren Ergebnisse, Enter oeffnet

### Leerer State
- Letzte 5 Suchbegriffe als Chips (localStorage)
- Vorschlaege: "Versuche: offene Tasks, ungelesene Mails, letzte Ideen"

---

## 6. QuickActionsBar integrieren

**Datei:** `App.tsx` (CockpitShell), `CockpitLayout.css`

### Platzierung
- Zwischen ChatSessionTabs und ChatInput (nur sichtbar wenn Chat-View aktiv, nicht auf Dashboard)
- Horizontal: 4 Icon-Buttons (Attach, Image, Voice, Quick-Create)
- Auf Mobile: Horizontal scrollbar

### Aktionen
- **Attach:** Oeffnet nativen File-Picker, Datei wird an naechste Nachricht angehaengt
- **Image:** Oeffnet File-Picker mit accept="image/*", Bild wird als Vision-Attachment angehaengt
- **Voice:** Startet VoiceInput-Aufnahme (existierende Komponente)
- **Quick-Create:** Dropdown mit "Neue Idee", "Neuer Task", "Neue Notiz" → oeffnet jeweiliges Panel mit Create-Mode

### Integration
- QuickActionsBar.tsx existiert bereits, muss nur in CockpitShell gerendert werden
- Callbacks verbinden mit bestehenden Upload/Voice/Panel-Funktionen

---

## 7. Rail-Erweiterungen

**Datei:** `frontend/src/components/cockpit/Rail.tsx`

### Chat-Activity-Indicator
- Kleiner farbiger Dot (8px) am Chat-Icon wenn ungelesene Nachrichten vorhanden
- Daten: Polling alle 30s oder SSE-Event basiert
- Verschwindet wenn Chat-Tab aktiv ist

### Session-Liste (Hover-Expand)
- Bei Hover ueber Chat-Icon: Tooltip-aehnliches Popup mit letzten 5 Sessions
- Session-Titel + relative Zeit ("vor 2h")
- Klick wechselt zur Session
- Nicht auf Mobile (kein Hover)

---

## 8. Touch-Support fuer Panel-Resize

**Datei:** `frontend/src/components/cockpit/PanelShell.tsx`

- `onTouchStart`/`onTouchMove`/`onTouchEnd` parallel zu Mouse-Events
- Gleiche Logik wie Mouse-Resize, nur mit `touches[0].clientX`
- Auf Mobile deaktiviert (kein Resize, volle Breite)

---

## Nicht-Ziele (bewusst ausgeschlossen)

- Slash-Commands im Chat (`/task`, `/email`) — separates Feature
- @-Mentions fuer Kontakte — separates Feature
- Chat-Session-Sync zwischen Geraeten — localStorage reicht vorerst
- Panel-Drag-Reordering — overkill
- Multi-Panel (2 gleichzeitig) — Spec sagt max 1

---

## Abhaengigkeiten und Reihenfolge

| Feature | Backend-Aenderung noetig? | Abhaengig von |
|---------|--------------------------|---------------|
| Session-Management | Nein — `/api/:ctx/chat/sessions` existiert | — |
| Shortcuts | Nein — nur Frontend | Session-Management |
| Dashboard-Widgets | Nein — alle Endpoints existieren | Session-Management (fuer Klick auf "Letzte Aktivitaet") |
| QuickActionsBar | Nein — nutzt bestehende Upload/Voice | — |
| Rail-Erweiterungen | Nein — nutzt bestehende Session-API | Session-Management |
| SearchPanel | Nein — `POST /api/search/global` existiert bereits | — |
| Mobile Layout | Nein — nur CSS + neue Komponenten | — |
| Touch-Resize | Nein — nur Frontend | — |

**Implementierungsreihenfolge:**
1. Session-Management (Grundlage fuer Shortcuts + Dashboard + Rail)
2. Shortcuts einhaengen (abhaengig von 1)
3. Dashboard-Widgets (abhaengig von 1)
4. QuickActionsBar (unabhaengig)
5. SearchPanel (unabhaengig)
6. Rail-Erweiterungen (abhaengig von 1)
7. Mobile Layout (unabhaengig, groesster Block)
8. Touch-Resize (Feinschliff)

---

## Testplan

- Bestehende Tests muessen weiterhin bestehen (1495 Frontend, 7904 Backend)
- Neue Tests pro Feature:
  - DashboardPage: 4 Widget-Tests (Loading, Data, Error, Click)
  - useCockpitSessions: Hook-Tests (create, switch, switchToPrev/Next, close, persist, first-launch auto-create)
  - CockpitShortcuts: Integration-Test (key events → panel opens, tab switches)
  - CockpitBottomBar: Render + Click-Tests
  - SearchPanel: Search, Results grouping, Keyboard-Navigation, Debounce
  - PanelArea mobile: Bottom-sheet rendering, backdrop click, swipe-close
