# Phase 2C: Onboarding — Chat-First Welcome Experience

> **Erstellt:** 2026-03-22
> **Phase:** 2C (UX Revolution, Teil 3 von 3)
> **Ansatz:** Kein Wizard. AI begruesst im Chat, Context-Auswahl inline, dezente Shortcut-Hints.
> **Abhaengigkeit:** Phase 2A (Cockpit) + 2B (Visual Polish) muessen fertig sein

---

## Problem

Das bestehende Onboarding ist ein 4-Step Fullscreen-Wizard der den alten Seiten-Modus erklaert. Nach dem Cockpit-Redesign (Phase 2A) ist der Wizard inhaltlich veraltet und UX-maessig ein Fremdkoerper. Der Wizard unterbricht den Flow — User wollen sofort loslegen.

## Loesung

Drei leichtgewichtige Onboarding-Mechanismen die im Chat-Flow stattfinden:

1. **Welcome Chat Message** — AI begruesst beim ersten Start mit klickbaren Suggestion-Chips
2. **Inline Context Selector** — Kontext-Auswahl als Chat-Karten statt Fullscreen-Modal
3. **Shortcut Hints** — Dezente Toasts bei den ersten 3 Maus-Aktionen

## Erfolgskriterien

- Kein Fullscreen-Modal/Wizard beim ersten Start
- User sieht sofort den Chat und kann lostippen
- Context ist nach 1 Klick gewaehlt
- Bestehender OnboardingWizard wird in Cockpit-Mode deaktiviert (nicht geloescht — Legacy-Mode nutzt ihn noch)

---

## 1. Welcome Chat Message

Beim allerersten Start (kein Chat-Verlauf, kein Context gewaehlt) sendet die AI automatisch eine Begruessung.

### Inhalt

```
Willkommen bei ZenAI! 👋

Ich bin dein persoenlicher AI-Assistent. Du kannst mir Fragen stellen,
Aufgaben delegieren, oder mich bitten Informationen zu finden.

Probier etwas aus:
```

### Suggestion Chips (klickbar, unter der Nachricht)

| Chip | Aktion bei Klick |
|------|-----------------|
| "Zeig mir meine Aufgaben" | Sendet Text als Chat-Nachricht → AI oeffnet Tasks-Panel |
| "Schreib eine Email" | Sendet Text → AI oeffnet Email-Panel |
| "Was kannst du alles?" | Sendet Text → AI antwortet mit Feature-Uebersicht |
| "⌘K fuer alle Befehle" | Oeffnet Command Palette |

### Trigger-Logik

- Pruefen: `localStorage.getItem('zenai-onboarding-complete')` ist NICHT `'true'`
- UND: Chat-Session hat 0 Nachrichten
- Dann: Welcome-Message als AI-Nachricht in den Chat injizieren (nicht per API, rein client-seitig)
- Nach Anzeige: `localStorage.setItem('zenai-welcome-shown', 'true')` setzen

### Komponente

`WelcomeChatMessage` — rendert die Begruessung + Chips. Wird im Chat als spezielle Nachricht angezeigt (kein normales AI-Message-Styling, sondern eigenes Welcome-Design).

---

## 2. Inline Context Selector

Direkt nach der Welcome-Message (oder als erste Aktion wenn kein Context gewaehlt) erscheint eine Context-Auswahl als klickbare Karten IM Chat.

### Inhalt

```
Waehle deinen Startbereich:
```

### Context Cards (4 nebeneinander, klickbar)

| Context | Farbe | Label | Beschreibung |
|---------|-------|-------|-------------|
| Personal | `--context-personal` (#0EA5E9) | Persoenlich | Privates, Hobbys, Gesundheit |
| Work | `--context-work` (#3B82F6) | Arbeit | Projekte, Meetings, Emails |
| Learning | `--context-learning` (#10B981) | Lernen | Kurse, Notizen, Wissen |
| Creative | `--context-creative` (#8B5CF6) | Kreativ | Ideen, Schreiben, Design |

### Verhalten

- Klick auf eine Card → `onContextChange(context)` aufrufen + `localStorage.setItem('zenai-onboarding-complete', 'true')`
- Cards verschwinden nach Auswahl (einmalig)
- Pruefen: Nur anzeigen wenn `zenai-onboarding-complete` NICHT gesetzt

### Komponente

`ContextSelectorCards` — rendert die 4 Context-Karten. Wird als Chat-Element nach der Welcome-Message angezeigt.

---

## 3. Shortcut Hints

Dezente Toast-Hinweise wenn der User eine Aktion per Maus macht die einen Keyboard-Shortcut hat.

### Verhalten

- Erste 3 Maus-Aktionen die einen Shortcut haben → Toast erscheint
- Toast: "Tipp: ⌘1 oeffnet Aufgaben direkt"
- Toast verschwindet nach 3 Sekunden (oder bei Klick)
- Max 3 Hints total → `localStorage.setItem('zenai-shortcut-hints', '3')` zaehlt hoch
- Nicht-blockierend, nicht-modal

### Trigger-Situationen

| Maus-Aktion | Shortcut-Hint |
|-------------|--------------|
| Klick auf Panel-Command in CommandPalette | "Tipp: ⌘1-9 oeffnet Panels direkt" |
| Klick auf Close-Button im Panel | "Tipp: Esc schliesst Panels" |
| Klick auf Command Palette Trigger | "Tipp: ⌘K oeffnet die Befehlspalette" |

### Komponente

`ShortcutHint` — Positioniert am unteren Rand, Slide-Up Animation, Auto-Dismiss nach 3s.

---

## 4. Deaktivierung des alten Wizards

Im Cockpit-Mode (`zenai-cockpit-mode === 'true'`) wird der bestehende `OnboardingWizard` NICHT gerendert. Stattdessen greifen die neuen Chat-basierten Onboarding-Mechanismen.

Im Legacy-Mode bleibt der alte Wizard aktiv (keine Aenderung).

### Aenderung in App.tsx

```typescript
// Cockpit mode: kein Wizard, onboarding passiert im Chat
if (cockpitMode) {
  // OnboardingWizard wird nicht gerendert
  // WelcomeChatMessage + ContextSelectorCards werden in CockpitShell gerendert
}
```

---

## Nicht in Scope

- Interaktives Tutorial / Guided Tour (zu aufwaendig)
- Onboarding-Analytics (welche Chips werden geklickt)
- Personalisierte Begruessung basierend auf User-Daten
- Aenderungen am bestehenden OnboardingWizard (bleibt fuer Legacy-Mode)
