/**
 * SetupChecklist - Post-onboarding completion widget
 *
 * Shown on Dashboard after onboarding, tracking:
 * - Onboarding completed
 * - First idea created
 * - Chat tried
 * - Profile customized
 *
 * Dismissible, uses localStorage to track progress.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Page } from '../types';
import { safeLocalStorage } from '../utils/storage';
import './SetupChecklist.css';

interface SetupChecklistProps {
  onNavigate: (page: Page) => void;
  ideasCount: number;
}

interface ChecklistItem {
  id: string;
  label: string;
  page: Page;
  storageKey: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'onboarding', label: 'Onboarding abgeschlossen', page: 'home', storageKey: 'zenai_onboarding_completed' },
  { id: 'first-idea', label: 'Erste Idee erstellt', page: 'ideas', storageKey: 'zenai_checklist_first_idea' },
  { id: 'chat-tried', label: 'Chat ausprobiert', page: 'chat', storageKey: 'zenai_checklist_chat_tried' },
  { id: 'profile', label: 'Profil angepasst', page: 'settings', storageKey: 'zenai_checklist_profile' },
];

const DISMISSED_KEY = 'zenai_checklist_dismissed';

export function SetupChecklist({ onNavigate, ideasCount }: SetupChecklistProps) {
  const [dismissed, setDismissed] = useState(() => {
    return safeLocalStorage('get', DISMISSED_KEY) === 'true';
  });

  const [completed, setCompleted] = useState<Record<string, boolean>>(() => {
    const state: Record<string, boolean> = {};
    for (const item of CHECKLIST_ITEMS) {
      state[item.id] = safeLocalStorage('get', item.storageKey) === 'true';
    }
    return state;
  });

  // Mark first-idea as completed when ideas exist
  useEffect(() => {
    if (ideasCount > 0 && !completed['first-idea']) {
      safeLocalStorage('set', 'zenai_checklist_first_idea', 'true');
      setCompleted((prev) => ({ ...prev, 'first-idea': true }));
    }
  }, [ideasCount, completed]);

  const completedCount = useMemo(() => {
    return Object.values(completed).filter(Boolean).length;
  }, [completed]);

  const totalCount = CHECKLIST_ITEMS.length;

  const handleDismiss = useCallback(() => {
    safeLocalStorage('set', DISMISSED_KEY, 'true');
    setDismissed(true);
  }, []);

  const handleItemClick = useCallback((item: ChecklistItem) => {
    onNavigate(item.page);
  }, [onNavigate]);

  if (dismissed || completedCount === totalCount) {
    return null;
  }

  return (
    <div className="setup-checklist" role="region" aria-label="Setup-Fortschritt">
      <div className="setup-checklist-header">
        <h3 className="setup-checklist-title">Erste Schritte</h3>
        <button
          type="button"
          className="setup-checklist-dismiss"
          onClick={handleDismiss}
          aria-label="Checkliste ausblenden"
        >
          &times;
        </button>
      </div>

      <div className="setup-checklist-progress">
        <div className="setup-checklist-bar">
          <div
            className="setup-checklist-bar-fill"
            style={{ width: `${(completedCount / totalCount) * 100}%` }}
          />
        </div>
        <span className="setup-checklist-count">{completedCount}/{totalCount} erledigt</span>
      </div>

      <ul className="setup-checklist-items">
        {CHECKLIST_ITEMS.map((item) => (
          <li key={item.id} className="setup-checklist-item">
            <button
              type="button"
              className={`setup-checklist-item-btn ${completed[item.id] ? 'completed' : ''}`}
              onClick={() => handleItemClick(item)}
            >
              <span className="setup-checklist-check" aria-hidden="true">
                {completed[item.id] ? '✓' : '○'}
              </span>
              <span className="setup-checklist-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
