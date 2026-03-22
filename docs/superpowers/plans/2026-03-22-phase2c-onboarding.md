# Phase 2C: Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fullscreen onboarding wizard with chat-first welcome experience: AI greeting, inline context selection, shortcut hints.

**Architecture:** 3 new presentational components rendered inside CockpitShell. State tracked via localStorage flags. No backend changes.

**Tech Stack:** React, TypeScript, CSS, localStorage.

**Spec:** `docs/superpowers/specs/2026-03-22-phase2c-onboarding-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `frontend/src/components/cockpit/WelcomeChatMessage.tsx` | Welcome greeting + suggestion chips |
| `frontend/src/components/cockpit/WelcomeChatMessage.css` | Welcome styles |
| `frontend/src/components/cockpit/ContextSelectorCards.tsx` | 4 context cards for first-time selection |
| `frontend/src/components/cockpit/ContextSelectorCards.css` | Context card styles |
| `frontend/src/components/cockpit/ShortcutHint.tsx` | Toast hint for keyboard shortcuts |
| `frontend/src/components/cockpit/ShortcutHint.css` | Hint toast styles |
| `frontend/src/components/cockpit/__tests__/WelcomeChatMessage.test.tsx` | Welcome tests |
| `frontend/src/components/cockpit/__tests__/ContextSelectorCards.test.tsx` | Context selector tests |
| `frontend/src/components/cockpit/__tests__/ShortcutHint.test.tsx` | Shortcut hint tests |

### Modified Files

| File | Changes |
|------|---------|
| `frontend/src/App.tsx` | Disable OnboardingWizard in cockpit mode, pass onboarding props to CockpitShell |

---

## Task 1: WelcomeChatMessage Component

**Files:**
- Create: `frontend/src/components/cockpit/WelcomeChatMessage.tsx`
- Create: `frontend/src/components/cockpit/WelcomeChatMessage.css`
- Create: `frontend/src/components/cockpit/__tests__/WelcomeChatMessage.test.tsx`

- [ ] **Step 1: Write tests**

```typescript
// frontend/src/components/cockpit/__tests__/WelcomeChatMessage.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomeChatMessage } from '../WelcomeChatMessage';

describe('WelcomeChatMessage', () => {
  const defaultProps = {
    onSendMessage: vi.fn(),
    onOpenCommandPalette: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it('renders welcome text', () => {
    render(<WelcomeChatMessage {...defaultProps} />);
    expect(screen.getByText(/Willkommen bei ZenAI/)).toBeInTheDocument();
  });

  it('renders 4 suggestion chips', () => {
    render(<WelcomeChatMessage {...defaultProps} />);
    expect(screen.getByText('Zeig mir meine Aufgaben')).toBeInTheDocument();
    expect(screen.getByText('Schreib eine Email')).toBeInTheDocument();
    expect(screen.getByText('Was kannst du alles?')).toBeInTheDocument();
  });

  it('sends message when chip clicked', () => {
    render(<WelcomeChatMessage {...defaultProps} />);
    fireEvent.click(screen.getByText('Zeig mir meine Aufgaben'));
    expect(defaultProps.onSendMessage).toHaveBeenCalledWith('Zeig mir meine Aufgaben');
  });

  it('opens command palette when shortcut chip clicked', () => {
    render(<WelcomeChatMessage {...defaultProps} />);
    fireEvent.click(screen.getByText(/alle Befehle/));
    expect(defaultProps.onOpenCommandPalette).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement WelcomeChatMessage**

```typescript
// frontend/src/components/cockpit/WelcomeChatMessage.tsx
import { Brain } from 'lucide-react';
import './WelcomeChatMessage.css';

interface WelcomeChatMessageProps {
  onSendMessage: (message: string) => void;
  onOpenCommandPalette: () => void;
}

const SUGGESTIONS = [
  { label: 'Zeig mir meine Aufgaben', type: 'message' as const },
  { label: 'Schreib eine Email', type: 'message' as const },
  { label: 'Was kannst du alles?', type: 'message' as const },
  { label: '⌘K fuer alle Befehle', type: 'command' as const },
];

export function WelcomeChatMessage({ onSendMessage, onOpenCommandPalette }: WelcomeChatMessageProps) {
  return (
    <div className="welcome-message">
      <div className="welcome-message__icon">
        <Brain size={24} />
      </div>
      <div className="welcome-message__content">
        <h3 className="welcome-message__title">Willkommen bei ZenAI!</h3>
        <p className="welcome-message__text">
          Ich bin dein persoenlicher AI-Assistent. Du kannst mir Fragen stellen,
          Aufgaben delegieren, oder mich bitten Informationen zu finden.
        </p>
        <div className="welcome-message__chips">
          {SUGGESTIONS.map(s => (
            <button
              key={s.label}
              className="welcome-message__chip"
              onClick={() => s.type === 'command' ? onOpenCommandPalette() : onSendMessage(s.label)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

```css
/* frontend/src/components/cockpit/WelcomeChatMessage.css */
.welcome-message {
  display: flex;
  gap: 12px;
  padding: 20px;
  margin: 16px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.welcome-message__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--accent-ai-muted);
  color: var(--accent-ai);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.welcome-message__title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 6px;
  color: var(--text-primary);
}

.welcome-message__text {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 14px;
  line-height: 1.5;
}

.welcome-message__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.welcome-message__chip {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: background 150ms, border-color 150ms;
}

.welcome-message__chip:hover {
  background: var(--surface-3);
  border-color: var(--accent-ai);
}
```

- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cockpit/WelcomeChatMessage.tsx frontend/src/components/cockpit/WelcomeChatMessage.css frontend/src/components/cockpit/__tests__/WelcomeChatMessage.test.tsx
git commit -m "feat(onboarding): add WelcomeChatMessage with suggestion chips"
```

---

## Task 2: ContextSelectorCards Component

**Files:**
- Create: `frontend/src/components/cockpit/ContextSelectorCards.tsx`
- Create: `frontend/src/components/cockpit/ContextSelectorCards.css`
- Create: `frontend/src/components/cockpit/__tests__/ContextSelectorCards.test.tsx`

- [ ] **Step 1: Write tests**

```typescript
// frontend/src/components/cockpit/__tests__/ContextSelectorCards.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextSelectorCards } from '../ContextSelectorCards';

describe('ContextSelectorCards', () => {
  const onSelect = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it('renders 4 context cards', () => {
    render(<ContextSelectorCards onSelect={onSelect} />);
    expect(screen.getByText('Persoenlich')).toBeInTheDocument();
    expect(screen.getByText('Arbeit')).toBeInTheDocument();
    expect(screen.getByText('Lernen')).toBeInTheDocument();
    expect(screen.getByText('Kreativ')).toBeInTheDocument();
  });

  it('calls onSelect with context when card clicked', () => {
    render(<ContextSelectorCards onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Arbeit'));
    expect(onSelect).toHaveBeenCalledWith('work');
  });

  it('shows descriptions', () => {
    render(<ContextSelectorCards onSelect={onSelect} />);
    expect(screen.getByText(/Projekte, Meetings/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement ContextSelectorCards**

```typescript
// frontend/src/components/cockpit/ContextSelectorCards.tsx
import './ContextSelectorCards.css';

type AIContext = 'personal' | 'work' | 'learning' | 'creative';

interface ContextSelectorCardsProps {
  onSelect: (context: AIContext) => void;
}

const CONTEXTS = [
  { id: 'personal' as const, label: 'Persoenlich', desc: 'Privates, Hobbys, Gesundheit', color: 'var(--context-personal)' },
  { id: 'work' as const, label: 'Arbeit', desc: 'Projekte, Meetings, Emails', color: 'var(--context-work)' },
  { id: 'learning' as const, label: 'Lernen', desc: 'Kurse, Notizen, Wissen', color: 'var(--context-learning)' },
  { id: 'creative' as const, label: 'Kreativ', desc: 'Ideen, Schreiben, Design', color: 'var(--context-creative)' },
];

export function ContextSelectorCards({ onSelect }: ContextSelectorCardsProps) {
  return (
    <div className="context-selector">
      <p className="context-selector__label">Waehle deinen Startbereich:</p>
      <div className="context-selector__grid">
        {CONTEXTS.map(ctx => (
          <button
            key={ctx.id}
            className="context-selector__card"
            onClick={() => onSelect(ctx.id)}
            style={{ '--ctx-color': ctx.color } as React.CSSProperties}
          >
            <div className="context-selector__dot" />
            <span className="context-selector__name">{ctx.label}</span>
            <span className="context-selector__desc">{ctx.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

```css
/* frontend/src/components/cockpit/ContextSelectorCards.css */
.context-selector {
  padding: 0 16px 16px;
}

.context-selector__label {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 10px 52px;
}

.context-selector__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-left: 52px;
}

.context-selector__card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  font: inherit;
  transition: border-color 150ms, background 150ms;
}

.context-selector__card:hover {
  border-color: var(--ctx-color);
  background: var(--surface-3);
}

.context-selector__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ctx-color);
}

.context-selector__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.context-selector__desc {
  font-size: 11px;
  color: var(--text-tertiary);
}

@media (max-width: 480px) {
  .context-selector__grid {
    grid-template-columns: 1fr;
    margin-left: 0;
  }
}
```

- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cockpit/ContextSelectorCards.tsx frontend/src/components/cockpit/ContextSelectorCards.css frontend/src/components/cockpit/__tests__/ContextSelectorCards.test.tsx
git commit -m "feat(onboarding): add ContextSelectorCards for inline context selection"
```

---

## Task 3: ShortcutHint Component

**Files:**
- Create: `frontend/src/components/cockpit/ShortcutHint.tsx`
- Create: `frontend/src/components/cockpit/ShortcutHint.css`
- Create: `frontend/src/components/cockpit/__tests__/ShortcutHint.test.tsx`

- [ ] **Step 1: Write tests**

```typescript
// frontend/src/components/cockpit/__tests__/ShortcutHint.test.tsx
import { render, screen, act } from '@testing-library/react';
import { ShortcutHint } from '../ShortcutHint';

describe('ShortcutHint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it('renders hint text', () => {
    render(<ShortcutHint message="Tipp: Cmd+1 oeffnet Aufgaben" visible={true} />);
    expect(screen.getByText(/Cmd\+1/)).toBeInTheDocument();
  });

  it('renders nothing when not visible', () => {
    const { container } = render(<ShortcutHint message="Tipp" visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('auto-dismisses after 3 seconds', () => {
    const onDismiss = vi.fn();
    render(<ShortcutHint message="Tipp" visible={true} onDismiss={onDismiss} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(onDismiss).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement ShortcutHint**

```typescript
// frontend/src/components/cockpit/ShortcutHint.tsx
import { useEffect } from 'react';
import './ShortcutHint.css';

interface ShortcutHintProps {
  message: string;
  visible: boolean;
  onDismiss?: () => void;
}

export function ShortcutHint({ message, visible, onDismiss }: ShortcutHintProps) {
  useEffect(() => {
    if (!visible || !onDismiss) return;
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <div className="shortcut-hint" role="status" onClick={onDismiss}>
      {message}
    </div>
  );
}
```

```css
/* frontend/src/components/cockpit/ShortcutHint.css */
.shortcut-hint {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  z-index: 100;
  animation: hint-slide-up 200ms ease-out;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

@keyframes hint-slide-up {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
```

- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/cockpit/ShortcutHint.tsx frontend/src/components/cockpit/ShortcutHint.css frontend/src/components/cockpit/__tests__/ShortcutHint.test.tsx
git commit -m "feat(onboarding): add ShortcutHint toast for keyboard shortcut discovery"
```

---

## Task 4: Integrate into CockpitShell + Disable old Wizard

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add onboarding state and components to CockpitShell**

In the CockpitShell component (inside App.tsx), add:

```typescript
// Onboarding state
const onboardingComplete = localStorage.getItem('zenai-onboarding-complete') === 'true';
const welcomeShown = localStorage.getItem('zenai-welcome-shown') === 'true';
const [showWelcome, setShowWelcome] = useState(!onboardingComplete && !welcomeShown);
const [showContextSelector, setShowContextSelector] = useState(!onboardingComplete);
```

Render WelcomeChatMessage + ContextSelectorCards ABOVE GeneralChat inside the CockpitLayout children:

```tsx
<CockpitLayout ...>
  <ChatSessionTabs ... />
  {showWelcome && (
    <WelcomeChatMessage
      onSendMessage={(msg) => { /* send to chat */ setShowWelcome(false); localStorage.setItem('zenai-welcome-shown', 'true'); }}
      onOpenCommandPalette={() => { /* open palette */ }}
    />
  )}
  {showContextSelector && (
    <ContextSelectorCards
      onSelect={(ctx) => {
        onContextChange(ctx);
        setShowContextSelector(false);
        localStorage.setItem('zenai-onboarding-complete', 'true');
      }}
    />
  )}
  <GeneralChat ... />
</CockpitLayout>
```

- [ ] **Step 2: Disable OnboardingWizard in cockpit mode**

Find where `OnboardingWizard` is rendered in App.tsx. Add cockpit mode check:

```typescript
{!cockpitMode && showOnboarding && <OnboardingWizard ... />}
```

- [ ] **Step 3: Run all tests**

Run: `cd frontend && npx vitest run`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(onboarding): integrate chat-first onboarding into CockpitShell, disable old wizard"
```

---

## Summary

| Task | Component | Tests | Commit |
|------|-----------|-------|--------|
| 1 | WelcomeChatMessage | 4 | 1 |
| 2 | ContextSelectorCards | 3 | 1 |
| 3 | ShortcutHint | 3 | 1 |
| 4 | App.tsx integration | — | 1 |
| **Total** | **3 new + 1 modified** | **10** | **4** |
