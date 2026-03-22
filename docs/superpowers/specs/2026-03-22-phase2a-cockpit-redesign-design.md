# Phase 2A: AI Cockpit — Chat-Centric Redesign

> **Erstellt:** 2026-03-22
> **Phase:** 2A (UX Revolution, Teil 1 von 3)
> **Masterplan-Kontext:** Phase 2 = UX Revolution (2A: Cockpit Redesign, 2B: Visual Polish, 2C: Onboarding)
> **Ansatz:** "AI Cockpit" — Chat links + kontextuelle Slide-Out Panels rechts (Cursor-Pattern)

---

## Problem

ZenAI hat 20+ Seiten mit Tabs (Ideas 4 Tabs, Planner 4 Tabs, Settings 8 Tabs, etc.). Die Navigation ist komplex, das Produktgefuehl wirkt wie ein Dev-Tool statt eines Premium-AI-Assistenten. Features sind ueber viele Seiten verteilt statt zentral zugaenglich. Fuer ein "AI OS" muss Chat das primaere Interface sein — nicht eine von 20 Seiten.

## Loesung

Radikaler Umbau auf das "AI Cockpit" Pattern: Chat ist immer sichtbar, alles andere sind kontextuelle Panels die sich bei Bedarf oeffnen. 20+ Seiten werden auf 3 Seiten + 10 Panels reduziert.

## Zielgruppe

Power-User und Solopreneure die ZenAI als taeglichen AI-Assistenten nutzen.

## Erfolgskriterien

- App hat nur noch 3 Routen: `/chat`, `/dashboard`, `/settings`
- Alle bisherigen Features sind ueber Panels oder Chat-Tools erreichbar
- Kein Feature-Verlust gegenueber dem aktuellen Stand
- Mobile funktioniert mit Bottom-Bar + Full-Screen-Panels
- Panel oeffnet sich in < 250ms (Spring-Animation)

---

## 1. Layout-Architektur

3 Zonen bilden das Cockpit:

| Zone | Breite | Zweck |
|------|--------|-------|
| **Rail** | 48px fest | Icon-only Navigation + Context-Switcher |
| **Chat** | flex (mind. 400px) | Primaerer Arbeitsbereich, immer sichtbar |
| **Panel** | 0px oder 360-480px | Kontextuelles Datenpanel, oeffnet sich bei Bedarf |

### Rail (48px)

Vertikale Icon-Leiste am linken Rand:

| Position | Icon | Funktion |
|----------|------|----------|
| Oben | Chat-Icon | Aktiv-Indikator, zurueck zum Chat |
| Mitte | Dashboard-Icon | Navigiert zu `/dashboard` |
| Mitte | Session-Icons | Letzte 5 Chat-Sessions (expandierbar bei Hover) |
| Unten | Context-Switcher | Personal/Work/Learning/Creative Farbring |
| Unten | Settings-Icon | Navigiert zu `/settings` |

### Chat-Area (flex)

Immer sichtbar. Besteht aus:

1. **ChatSessionTabs** — Tabs ueber dem Chat fuer parallele Konversationen (wie Browser-Tabs)
2. **Context-Header** — Kleiner Header: aktueller Context + geladene Facts-Zahl
3. **ChatMessages** — Bestehende GeneralChat-Komponente (Streaming, Tool-Pills, Thinking-Blocks)
4. **ChatInput** — Erweitertes Input-Feld (siehe Sektion 3)

### Panel-Area (0px oder 360-480px)

Kontextuelles Panel rechts vom Chat. **Split-Layout (nicht Overlay):** Chat-Area schrumpft wenn Panel oeffnet, beide teilen sich die Viewport-Breite. Kein Backdrop, kein Overlay.

- Default: geschlossen (0px Breite, Chat nutzt volle Breite)
- Oeffnet sich bei Bedarf mit Spring-Animation (Framer Motion, stiffness: 300, damping: 30, ~250ms)
- Breite per Drag-Handle anpassbar (360px min, 600px max)
- Trennlinie mit Drag-Cursor zwischen Chat und Panel
- Close-Button (X) oben rechts im Panel-Header
- "Pin"-Button um Panel dauerhaft offen zu halten (siehe Pin-Verhalten unten)

---

## 2. Panel-System

### Panel-Ausloeser

3 Wege ein Panel zu oeffnen:

| Trigger | Beispiel |
|---------|----------|
| **Chat-Kontext** | AI antwortet auf "zeig mir meine Tasks" → Tasks-Panel oeffnet automatisch via `open_panel` Tool |
| **Command Palette** | `⌘K` → "Tasks" tippen → Tasks-Panel oeffnet |
| **Keyboard-Shortcut** | `⌘1` = Tasks, `⌘2` = Email, `⌘3` = Ideas, ... |

### Panel-Typen (10 Panels ersetzen 20+ Seiten)

| Panel ID | Ersetzt | Kernfunktion | Shortcut |
|----------|---------|-------------|----------|
| `tasks` | PlannerPage (4 Tabs) | Aufgabenliste mit Status-Filter + Quick-Add | `⌘1` |
| `email` | EmailPage | Inbox mit Thread-Ansicht | `⌘2` |
| `ideas` | IdeasPage (4 Tabs) | Ideenliste mit Suche + Quick-Create | `⌘3` |
| `calendar` | CalendarPage | Wochenansicht + Termin-Quick-Add | `⌘4` |
| `contacts` | ContactsPage | Kontaktliste + Suche | `⌘5` |
| `documents` | DocumentVaultPage (3 Tabs) | Dokumentenliste + Upload | `⌘6` |
| `memory` | MyAIPage + MemoryInsights | Memory-Timeline + FSRS-Review | `⌘7` |
| `finance` | FinancePage | Konten-Uebersicht + Transaktionen | `⌘8` |
| `agents` | AgentTeamsPage | Agent-Execution + History | `⌘9` |
| `search` | Globale Suche | Universelle Suche ueber alles | `⌘/` |

### Panel-Verhalten

- **Eins zur Zeit:** Maximal 1 Panel offen. Neues Panel ersetzt altes (auch wenn das alte gepinnt ist — Pin wird entfernt).
- **Escape schliesst:** `Esc` schliesst das aktive Panel (auch gepinnte).
- **Resize:** Panel-Breite per Drag anpassbar (360px-600px). Default-Breite beim ersten Oeffnen: 420px. Breite wird pro Panel-Typ in localStorage gespeichert (Key: `panel-width-{type}`).
- **Pin:** Panel kann "angepinnt" werden — bleibt offen bei Chat-Interaktionen. Oeffnen eines ANDEREN Panels entfernt den Pin und ersetzt das Panel. Pin schuetzt nur vor automatischem Schliessen, nicht vor Panel-Wechsel.
- **Transition:** Slide-in von rechts, Framer Motion Spring-Animation (stiffness: 300, damping: 30, ~250ms). `useReducedMotion()` Hook respektieren — bei reduzierter Bewegung instant.
- **Deep-Link:** URL Query-Parameter `?panel=tasks&filter=today` fuer direkte Links.
- **Cross-Route:** Navigation zu `/dashboard` oder `/settings` schliesst das Panel. Browser-Back von `/dashboard` zu `/chat?panel=tasks` oeffnet das Panel wieder (URL ist authoritative).

### Panel-Registry

Jeder Panel-Typ registriert sich deklarativ:

```typescript
interface PanelDefinition {
  id: PanelType;
  icon: LucideIcon;
  label: string;
  shortcut: string;
  component: React.LazyExoticComponent<React.ComponentType<PanelProps>>;
}

interface PanelProps {
  filter?: string;
  onClose: () => void;
}
```

Panel-Components werden lazy-loaded — erst bei erster Oeffnung geladen.

### PanelShell Component

Wrapper-Component die jedem Panel Header, Close, Resize und Pin gibt:

```
PanelShell
├── PanelHeader (Titel + Icon + Pin-Button + Close-Button)
├── PanelContent (der eigentliche Panel-Inhalt, scrollbar)
└── ResizeHandle (am linken Rand des Panels)
```

---

## 3. Chat-Erweiterungen

### Panel-Trigger in AI-Antworten

AI-Antworten enthalten klickbare Panel-Links:

```
Ich habe [3 Tasks →] fuer heute gefunden.
```

Der `[3 Tasks →]` Link oeffnet das Tasks-Panel mit Filter `today`.

### Inline-Widgets

Kompakte Widgets direkt in Chat-Antworten (statt nur Text):

- Task-Cards mit Checkbox + Status
- Email-Previews mit Absender + Betreff
- Kalender-Snippets mit Uhrzeit + Titel
- Kontakt-Cards mit Name + letzte Interaktion

### Action-Buttons in AI-Antworten

Wenn die AI eine Aktion vorschlaegt, erscheinen Buttons:

```
Hier ist der Email-Entwurf an Max:
[Senden] [Bearbeiten] [Verwerfen]
```

Buttons triggern die entsprechende Backend-Aktion direkt.

### Quick-Actions Bar

Ueber dem Input-Feld: kontextuelle Buttons:

| Button | Funktion |
|--------|----------|
| 📎 | Datei anhaengen |
| 📷 | Bild hochladen |
| 🎤 | Voice Input |
| ➕ | Schnell-Aktion (Neue Idee, Neuer Task, etc.) |

### Input-Erweiterungen

| Feature | Trigger | Funktion |
|---------|---------|----------|
| **Slash-Commands** | `/task`, `/email`, `/idea` | Oeffnet Panel + prefilled Action |
| **@-Mentions** | `@kontaktname` | Kontakt-Referenz in Nachricht |
| **Multi-Line** | `Shift+Enter` | Zeilenumbruch, Auto-Resize bis 6 Zeilen |
| **File Drop** | Drag & Drop auf Input | Upload + AI-Analyse |

### Chat-Session-Tabs

Mehrere Konversationen parallel als Tabs ueber dem Chat:

- Neuer Tab: `⌘T` oder `+` Button → erstellt neue `chat_session` im Backend (eigene `session_id`)
- Tab schliessen: Mittelklick oder X → Session bleibt in DB, verschwindet nur aus Tabs
- Tab wechseln: `⌘[` / `⌘]`
- Maximal 8 Tabs sichtbar, Rest im Overflow-Menu
- **Datenmodell:** Jeder Tab ist eine eigene Chat-Session mit eigener `session_id`. Tab-Liste wird in localStorage gespeichert (`open-session-tabs: string[]`). Beim App-Start werden die gespeicherten Sessions geladen.
- **Erster Start (keine Sessions):** Automatisch eine neue Session erstellen. Kein leerer Zustand.

---

## 4. Dashboard

Einzige "klassische" Seite neben Chat und Settings. Route: `/dashboard`.

### Grid-Layout (4 Widgets)

| Widget | Inhalt |
|--------|--------|
| **Heute** | Tasks faellig heute + naechster Termin + ungelesene Emails. Jedes Item klickbar → oeffnet Panel. |
| **AI Insights** | Smart Suggestions (max 3) + Curiosity Gaps + Predictions |
| **Letzte Aktivitaet** | Timeline der letzten 5 Interaktionen (Chat, Ideas, Emails) |
| **Memory Health** | Cognitive Score Ring + Facts-Zahl + naechste FSRS-Review |

### Prinzipien

- Read-only Ueberblick, keine Editier-Funktionen
- Jedes Widget klickbar → oeffnet entsprechendes Panel im Chat
- Kein Tab-System, ein einziger kompakter Screen
- Chat ist Default, Dashboard ist optionaler "Blick von oben"

---

## 5. Mobile Experience (< 768px)

### Layout-Anpassung

| Element | Desktop | Mobile |
|---------|---------|--------|
| **Rail** | 48px Sidebar | Bottom-Bar (3 Icons) |
| **Chat** | Flex-Bereich | Vollbild (Default-Screen) |
| **Panel** | Slide-Out rechts | Full-Screen Overlay (Sheet von unten) |
| **Command Palette** | Modal (⌘K) | Top-Bar Suchfeld + ⌘K |

### Bottom-Bar (3 Items)

| Icon | Aktion |
|------|--------|
| 💬 Chat | Chat (Default) |
| 📊 Dashboard | Dashboard |
| ⚙️ Settings | Settings |

### Gesten

- Swipe down auf Panel-Sheet → schliesst Panel (Sheet-Pattern, wie iOS Action Sheets)

**Hinweis:** Horizontale Swipe-Gesten (links/rechts) werden NICHT implementiert, da sie mit Browser-nativen Back/Forward-Gesten (iOS Safari, Android Chrome) kollidieren. Session-Liste und Panel-Oeffnung erfolgen ueber Bottom-Bar-Icons und Command Palette.

---

## 6. Migration bestehender Features

### Strategie: Wrap, Don't Rewrite

Bestehende Komponenten werden NICHT neu geschrieben. Sie werden in PanelShell gewrappt. Der bestehende Content erhaelt einen Panel-Header mit Close/Pin/Resize.

### Seiten → Panel Mapping

| Bisherige Seite | Wird zu | Content-Behandlung |
|----------------|---------|-------------------|
| IdeasPage (4 Tabs) | Ideas-Panel | Nur "Aktiv"-Liste. Inkubator/Archiv/Triage ueber Filter-Dropdown |
| PlannerPage (4 Tabs) | Tasks-Panel + Calendar-Panel | Tasks und Kalender werden separate Panels |
| EmailPage | Email-Panel | Inbox-Ansicht in PanelShell gewrappt |
| ContactsPage | Contacts-Panel | Kontaktliste in PanelShell gewrappt |
| FinancePage | Finance-Panel | Uebersicht in PanelShell gewrappt |
| DocumentVaultPage (3 Tabs) | Documents-Panel | Dokumentenliste, Tabs werden Filter |
| MyAIPage (5 Tabs) | Memory-Panel | FSRS-Review + Memory-Timeline. Cognitive Dashboard → Dashboard-Widget |
| AgentTeamsPage | Agents-Panel | Agent-Execution in PanelShell gewrappt |

### Features die in Chat-Tools aufgehen

- Workshop/Proactive → Smart Suggestions im Dashboard + Chat-AI
- Business Dashboard → Dashboard-Widget + Chat-Abfragen
- Learning Dashboard → Memory-Panel + Chat-Abfragen
- Browser/ScreenMemory → Chat-Tool (`/browse`, `/screen`)
- Insights/Analytics → Dashboard-Widgets + Chat-Abfragen

### Features die in Settings wandern

- Governance Dashboard → Settings-Unterseite
- MCP Connections → Settings-Unterseite
- Extension Marketplace → Settings-Unterseite

### Settings-Tabs nach Migration (11 Tabs)

| Tab | Route | Inhalt |
|-----|-------|--------|
| Profil | `/settings/profile` | User-Profil, Avatar |
| Allgemein | `/settings/general` | Theme, Sprache, Benachrichtigungen |
| KI | `/settings/ai` | Modell, Thinking, Temperatur |
| Datenschutz | `/settings/privacy` | Memory Governance, DSGVO, Export |
| Automationen | `/settings/automations` | Automation-Regeln |
| Integrationen | `/settings/integrations` | API-Keys, OAuth-Verbindungen |
| Daten | `/settings/data` | Export, Import, Sync |
| Extensions | `/settings/extensions` | Extension Marketplace |
| MCP | `/settings/mcp` | MCP Server Connections |
| Governance | `/settings/governance` | Approval-Queue, Policies, Audit Log |
| System | `/settings/system` | System Admin (nur Admin-Rolle) |

### Entfallende Seiten

- Hub Page (Aggregator ohne eigene Funktion)
- Canvas Page → Artifact-Bearbeitung wird in Chat integriert. Code/Markdown-Bloecke in AI-Antworten erhalten einen "Bearbeiten"-Button der einen inline Editor oeffnet. Legacy-URLs (`/canvas`, `/wissen/editor`) redirecten zu `/chat`.

### Migrations-Reihenfolge

1. Shell bauen (CockpitLayout mit Rail + Chat + PanelShell) — altes Routing bleibt parallel
2. Meistgenutzte Panels: Tasks, Email, Ideas
3. Restliche Panels: Calendar, Contacts, Documents, Memory, Finance, Agents
4. Dashboard neu als kompaktes Widget-Grid
5. Alte Seiten und Routing entfernen
6. Mobile-Anpassung (Bottom-Bar + Sheet-Panels)

---

## 7. Technische Architektur

### Komponenten-Hierarchie

```
App.tsx
├── CockpitLayout (ersetzt AppLayout)
│   ├── Rail
│   │   ├── ChatIcon (aktiv-indikator)
│   │   ├── DashboardIcon
│   │   ├── SessionList (letzte 5, expandierbar)
│   │   ├── ContextSwitcher (Farbring)
│   │   └── SettingsIcon
│   ├── ChatArea
│   │   ├── ChatSessionTabs
│   │   ├── ContextHeader
│   │   ├── ChatMessages (bestehendes GeneralChat)
│   │   └── ChatInput (erweitert)
│   └── PanelArea
│       └── PanelShell
│           ├── PanelHeader
│           ├── PanelContent (lazy-loaded)
│           └── ResizeHandle
├── DashboardPage (Route: /dashboard)
└── SettingsPage (Route: /settings, /settings/:tab)
```

### State-Management

```typescript
// Neuer PanelContext (React Context + useReducer)
type PanelType = 'tasks' | 'email' | 'ideas' | 'calendar' | 'contacts'
  | 'documents' | 'memory' | 'finance' | 'agents' | 'search';

type PanelState = {
  activePanel: PanelType | null;
  pinned: boolean;
  width: number;       // 360-600px
  filter?: string;     // z.B. "today", "unread"
};

type PanelAction =
  | { type: 'OPEN_PANEL'; panel: PanelType; filter?: string }
  | { type: 'CLOSE_PANEL' }
  | { type: 'TOGGLE_PIN' }
  | { type: 'SET_WIDTH'; width: number };

// Reducer-Semantik: OPEN_PANEL setzt IMMER pinned: false.
// Pin wird nicht auf neue Panels uebertragen.
// CLOSE_PANEL setzt activePanel: null, pinned: false.
// TOGGLE_PIN flippt nur den pinned-Wert des aktuellen Panels.
```

### Routing

| Route | Rendert |
|-------|---------|
| `/` oder `/chat` | CockpitLayout (Chat + optionales Panel) |
| `/chat?panel=tasks` | CockpitLayout mit Tasks-Panel offen |
| `/chat?panel=tasks&filter=today` | Tasks-Panel mit Today-Filter |
| `/dashboard` | DashboardPage (volle Breite) |
| `/settings` | SettingsPage |
| `/settings/:tab` | SettingsPage mit aktivem Tab |

Panels werden ueber URL Query-Parameter gesteuert. PanelContext synct mit URL.

### AI-Integration: open_panel Tool

Neues Claude-Tool das Panels programmatisch oeffnet:

```typescript
// Tool-Definition
{
  name: 'open_panel',
  description: 'Opens a context panel in the UI',
  input_schema: {
    type: 'object',
    properties: {
      panel: { type: 'string', enum: ['tasks', 'email', 'ideas', ...] },
      filter: { type: 'string', description: 'Optional filter parameter' }
    },
    required: ['panel']
  }
}
```

**SSE-Integration:** Das bestehende SSE-Streaming in `GeneralChat` sendet bereits `tool_use_start` und `tool_use_end` Events. Fuer `open_panel` wird ein neuer SSE Event-Typ `panel_action` eingefuehrt:

```typescript
// SSE Event vom Backend
event: panel_action
data: {"action":"open","panel":"tasks","filter":"today"}
```

Der SSE-Handler in `GeneralChat` (der bereits im ChatArea-Subtree lebt) ruft `panelDispatch({ type: 'OPEN_PANEL', panel, filter })` auf. `PanelContext` ist ein Provider oberhalb von `ChatArea` und `PanelArea`, daher ist der Dispatch erreichbar.

Das Tool-Result zurueck an Claude ist ein synthetisches Success-Result: `{ success: true, panel: "tasks" }`. Die Panel-Oeffnung ist ein UI-Seiteneffekt.

### Keyboard-Shortcuts

| Shortcut | Aktion |
|----------|--------|
| `⌘K` | Command Palette |
| `⌘1`-`⌘9` | Panel-Schnellzugriff |
| `⌘/` | Search-Panel |
| `Esc` | Panel schliessen |
| `⌘D` | Dashboard |
| `⌘,` | Settings |
| `⌘T` | Neuer Chat-Tab |
| `⌘[` / `⌘]` | Chat-Tab wechseln |
| `Alt+W` | Chat-Tab schliessen (⌘W ist Browser-reserviert) |

---

## Nicht im Scope (Phase 2B/2C)

- Visual Design Overhaul (Farben, Typografie, Shadows) → Phase 2B
- Onboarding-Redesign → Phase 2C
- Tailwind-Migration → Phase 2B
- Neue Design System Komponenten → Phase 2B
