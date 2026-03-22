# Phase 2B: Visual Polish — Refined ZenSation Design

> **Erstellt:** 2026-03-22
> **Phase:** 2B (UX Revolution, Teil 2 von 3)
> **Stil:** "Refined ZenSation" — Linear-Minimalismus + ZenSation-Brand-Waerme
> **Abhaengigkeit:** Phase 2A (AI Cockpit) muss fertig sein

---

## Problem

Das Token-System existiert (Phase 102 Calm Neurodesign) aber wird kaum genutzt: 155 CSS-Dateien mit hardcoded Hex-Farben, 146 TSX-Dateien mit Inline-Styles. Die Cockpit-Komponenten aus Phase 2A sind funktional aber visuell flach. Das Ergebnis wirkt wie ein Dev-Tool, nicht wie ein $29/Monat Premium-Produkt.

## Loesung

Zweistufig: (1) Bestehende `:root` Tokens in `index.css` mit Midnight Dark Petrol Farbsystem AKTUALISIEREN (nicht neue Datei, sondern bestehende ueberschreiben), (2) Premium-Schliff auf die sichtbarsten Komponenten (P1-P3).

## Erfolgskriterien

- Alle Cockpit-Komponenten (P1), Layout-Shell (P2) und Chat (P3) nutzen ausschliesslich CSS Custom Properties
- Kein hardcoded Hex in P1-P3 Dateien
- Midnight Petrol (#0A1A24) als Haupthintergrund im Dark Mode
- Light Mode funktioniert konsistent (Off-white #FAFAFA Basis)
- Visuell auf Augenhoehe mit Linear/Superhuman bei einem Screenshot

---

## 1. Farbsystem: Midnight Petrol

### Strategie: Bestehende Tokens in index.css aktualisieren

Es wird KEINE neue Token-Datei erstellt. Stattdessen werden die bestehenden `:root` Custom Properties in `frontend/src/index.css` mit den neuen Midnight Petrol Werten aktualisiert. Das bestehende Theme-System bleibt erhalten:

- `:root` = Light Mode (bestehende Konvention beibehalten)
- `[data-theme="dark"]` und `@media (prefers-color-scheme: dark)` = Dark Mode
- `ThemeContext.tsx` steuert weiterhin den Wechsel

### Token-Werte (zu aktualisieren in index.css)

**Dark Mode** (`[data-theme="dark"]` Block):

| Bestehender Token | Neuer Wert | Verwendung |
|-------------------|-----------|------------|
| `--surface-bg` | `#0A1A24` | Haupthintergrund (Midnight Petrol) |
| `--surface-s1` | `#0F2230` | Rail, Panel-Header, erhoehte Flaechen |
| `--surface-s2` | `#142A3A` | Cards, Widgets, Chat-Bubbles (AI) |
| `--surface-s3` | `#1A3345` | Hover-States |
| `--text-primary` | `#E5E5E5` | Haupttext |
| `--text-secondary` | `rgba(255,255,255,0.55)` | Sekundaertext |
| `--text-tertiary` | `rgba(255,255,255,0.3)` | Hints, Placeholder |
| `--border` | `rgba(255,255,255,0.06)` | Borders |
| `--border-hover` | `rgba(255,255,255,0.12)` | Borders bei Hover |
| `--glass-bg` | `rgba(10,26,36,0.8)` | Glassmorphism Overlay |
| `--glass-border` | `rgba(255,255,255,0.08)` | Glassmorphism Border |
| `--glass-blur` | `16px` | Glassmorphism Blur |

**Light Mode** (`:root` Block):

| Token | Neuer Wert |
|-------|-----------|
| `--surface-bg` | `#FAFAFA` |
| `--surface-s1` | `#F5F5F5` |
| `--surface-s2` | `#EFEFEF` |
| `--surface-s3` | `#E8E8E8` |
| `--text-primary` | `#1A1A1A` |
| `--text-secondary` | `rgba(0,0,0,0.55)` |
| `--text-tertiary` | `rgba(0,0,0,0.3)` |
| `--border` | `rgba(0,0,0,0.08)` |
| `--border-hover` | `rgba(0,0,0,0.15)` |
| `--glass-bg` | `rgba(250,250,250,0.85)` |
| `--glass-border` | `rgba(0,0,0,0.06)` |
| `--glass-blur` | `12px` |

**Neue Tokens (hinzufuegen, beide Modes gleich):**

| Token | Wert | Verwendung |
|-------|------|------------|
| `--accent` | `#FF6B35` | CTAs, Active States (Sunset Orange) |
| `--accent-hover` | `#FF8F5A` | Accent Hover |
| `--accent-muted` | `rgba(255,107,53,0.15)` | Accent Hintergrund-Tint |
| `--accent-ai` | `#6366F1` | AI-Elemente (Thinking, Tool-Pills) |
| `--accent-ai-muted` | `rgba(99,102,241,0.15)` | AI Hintergrund-Tint |
| `--success` | `#22C55E` | Erfolg |
| `--warning` | `#F59E0B` | Warnung |
| `--danger` | `#EF4444` | Fehler |
| `--context-personal` | `#0EA5E9` | Context-Ring |
| `--context-work` | `#3B82F6` | Context-Ring |
| `--context-learning` | `#10B981` | Context-Ring |
| `--context-creative` | `#8B5CF6` | Context-Ring |

Glassmorphism NUR auf: Command Palette, Modals, Panel-Overlays (Mobile). Nicht auf normale Cards oder Widgets.

---

## 2. Token-Durchsetzung

### Scope (P1-P3)

| Prio | Scope | Dateien (ca.) |
|------|-------|---------------|
| **P1** | Cockpit-Komponenten | `cockpit/*.css` (ohne `panels/` und `__tests__/`): ~12 CSS-Dateien |
| **P2** | Layout-Shell | `layout/*.tsx`, `layout/*.css`, AppLayout: ~10 Dateien |
| **P3** | Chat | `GeneralChat/*.tsx`, `GeneralChat/*.css`: ~8 Dateien |

**Explizit ausgeschlossen:** `cockpit/panels/` (sind Wrapper ohne eigenes Styling), `cockpit/__tests__/`, alle Seiten-Komponenten (Ideas, Email, etc.)

### Token-Namens-Migration

Die bestehenden Cockpit-CSS-Dateien nutzen Token-Namen aus Phase 2A die sich von den kanonischen Token-Namen unterscheiden. Diese muessen zuerst umbenannt werden:

| Alter Token (in Cockpit CSS) | Neuer kanonischer Token |
|-------------------------------|------------------------|
| `--surface-primary` | `--surface-bg` |
| `--surface-secondary` | `--surface-s1` |
| `--surface-hover` | `--surface-s3` |
| `--border-primary` | `--border` |
| `--color-accent` | `--accent` |
| `--color-accent-muted` | `--accent-muted` |
| `--text-primary` | `--text-primary` (bleibt) |
| `--text-secondary` | `--text-secondary` (bleibt) |
| `--text-tertiary` | `--text-tertiary` (bleibt) |

### Hardcoded-Werte-zu-Token Regeln

| Hardcoded Pattern | Kontext | Ersetzt durch |
|-------------------|---------|--------------|
| `#0a1a24`, `#0C0C12`, `#0a0a0f`, `#111` | Background | `var(--surface-bg)` |
| `#1a1a1f`, `#0F2230` | Erhoehte Flaeche | `var(--surface-s1)` |
| `#142A3A` | Card/Widget | `var(--surface-s2)` |
| `#1A3345` | Hover | `var(--surface-s3)` |
| `rgba(255,255,255,0.06)` | Als `border-*` Property | `var(--border)` |
| `rgba(255,255,255,0.06)` | Als `background` Property | `var(--surface-s3)` |
| `rgba(255,255,255,0.5)` | Text | `var(--text-secondary)` |
| `rgba(255,255,255,0.4)` | Text | `var(--text-secondary)` |
| `rgba(255,255,255,0.3)` | Text/Placeholder | `var(--text-tertiary)` |
| `#6366f1` | AI-Farbe | `var(--accent-ai)` |
| `rgba(99,102,241,0.15)` | AI-Background | `var(--accent-ai-muted)` |
| `#e5e5e5`, `#fff` (als Text) | Text | `var(--text-primary)` |

**Entscheidungsregel:** Wenn `rgba(255,255,255,0.06)` auf einer `border`-Property steht → `var(--border)`. Wenn es auf `background` steht → `var(--surface-s3)`. Kontext (CSS-Property) bestimmt das Token.

### Inline-Style Behandlung

In P1-P3 Dateien: statische Farben/Spacing aus `style={{}}` extrahieren in CSS-Klassen. Dynamische Werte (berechnete Breiten, Positionen) duerfen bleiben.

---

## 3. Komponenten-Polish

### Rail

- Background: `var(--surface-s1)` statt `var(--surface-bg)`
- Active-Indicator: `::before` Pseudo-Element, `position: absolute; left: 0; width: 2px; height: 20px; background: var(--accent); border-radius: 0 2px 2px 0;` — ersetzt den bestehenden `.rail__item--active` Background-Fill
- Hover: `var(--surface-s3)` Background (bleibt)

### PanelShell

- Header-Background: `var(--surface-s1)`
- Border-Left: `var(--border)` (bleibt)
- Subtiler Box-Shadow: `inset 2px 0 8px rgba(0,0,0,0.15)`
- Close/Pin Buttons: Hover mit `var(--surface-s3)`

### ChatSessionTabs

- Aktiver Tab: Pill-Shape mit `var(--accent-ai-muted)` Background + `var(--accent-ai)` Text
- Inaktive Tabs: `var(--text-tertiary)`, hover `var(--text-secondary)`
- Tab-Bar Border-Bottom: `var(--border)`

### Chat-Bubbles

- User-Nachricht: `var(--accent-ai-muted)` Background (Indigo-Tint)
- AI-Nachricht: `var(--surface-s2)` Background
- Border-Radius: 16px (konsistent, modern)
- Timestamps: on-hover sichtbar, `var(--text-tertiary)`

### Chat-Input

- Background: `var(--surface-s1)`
- Border: `var(--border)`, Focus: `var(--accent)` (1px)
- Border-Radius: 12px
- Placeholder: `var(--text-tertiary)`

### Dashboard-Widgets

- Background: `var(--surface-s2)`
- Border: `var(--border)`
- Hover: `var(--surface-s3)` Background + `translateY(-2px)` + `var(--border-hover)` + `box-shadow: 0 4px 12px rgba(0,0,0,0.2)`
- Border-Radius: 12px

### Tool-Pills

- Background: `var(--accent-ai-muted)`
- Text: `var(--accent-ai)`
- Aktiv: Pulse-Animation beibehalten

### Command Palette

- Overlay: `var(--glass-bg)` + `backdrop-filter: blur(var(--glass-blur))`
- Border: `var(--glass-border)`
- Selected Item: `var(--accent-ai-muted)` Background
- Input: wie Chat-Input Style

### ActionButtons (Klarstellung)

- Primary Button (`--primary`): `var(--accent)` Background (Sunset Orange) — CTAs
- Secondary Button: transparent + `var(--border)` Border
- Danger Button: transparent + `var(--danger)` Border/Text
- Die bestehende Indigo-Farbe fuer Primary Buttons wird durch Accent Orange ersetzt. Indigo (`--accent-ai`) ist fuer AI-bezogene visuelle Elemente (Bubbles, Pills), nicht fuer Buttons.

---

## 4. Nicht in Scope

- Tailwind-Migration (kein Mehrwert, zu viel Risiko)
- Emoji-zu-Icon Audit (separates Ticket)
- Neue Design System Komponenten (Phase 68 Komponenten reichen)
- P4/P5 Token-Migration (`cockpit/panels/`, restliche 100+ Seiten-Dateien)
- Animations-Ueberarbeitung (Phase 2A Springs reichen)
- Onboarding → Phase 2C
