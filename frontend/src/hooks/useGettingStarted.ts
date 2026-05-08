// frontend/src/hooks/useGettingStarted.ts
import { useState, useCallback } from 'react';
import type { Page } from '../types/idea'; // canonical Page union type

export interface ChecklistStep {
  id: string;
  title: string;
  description: string;
  page?: Page;   // Page identifier for onNavigate (not a URL string)
  done: boolean;
}

const STORAGE_KEY = 'zenai_getting_started_v1';

const DEFAULT_STEPS: Omit<ChecklistStep, 'done'>[] = [
  {
    id: 'first_chat',
    title: 'Erste Chat-Nachricht senden',
    description: 'Starte ein Gespräch mit deiner KI',
    page: 'hub',
  },
  {
    id: 'first_idea',
    title: 'Erste Idee erfassen',
    description: 'Schreib einen Gedanken oder eine Idee auf',
    page: 'ideas',
  },
  {
    id: 'explore_memory',
    title: 'KI-Wissen erkunden',
    description: 'Sieh, was deine KI über dich gelernt hat',
    page: 'my-ai',
  },
  {
    id: 'create_task',
    title: 'Erste Aufgabe anlegen',
    description: 'Plane deinen nächsten Schritt im Planer',
    page: 'calendar',
  },
  {
    id: 'explore_ai_workshop',
    title: 'KI-Werkstatt besuchen',
    description: 'Entdecke proaktive Vorschläge und Agenten',
    page: 'workshop',
  },
];

function loadProgress(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProgress(progress: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function useGettingStarted() {
  const [progress, setProgress] = useState<Record<string, boolean>>(loadProgress);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(`${STORAGE_KEY}_dismissed`) === 'true'
  );

  const steps: ChecklistStep[] = DEFAULT_STEPS.map((s) => ({
    ...s,
    done: progress[s.id] ?? false,
  }));

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  const markDone = useCallback((id: string) => {
    setProgress((prev) => {
      const next = { ...prev, [id]: true };
      saveProgress(next);
      return next;
    });
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(`${STORAGE_KEY}_dismissed`, 'true');
    setDismissed(true);
  }, []);

  // Auto-dismiss when all done
  const visible = !dismissed && !allDone;

  return { steps, completedCount, allDone, visible, markDone, dismiss };
}
