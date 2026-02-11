/**
 * useAIQuestions - Proactive AI Question Trigger System
 *
 * Decides when and what proactive questions the AI should ask the user.
 * Uses localStorage for cooldown/session tracking to prevent spamming.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Page, StructuredIdea } from '../types';
import type { QuestionCategory } from '../components/AIQuestionBubble';
import { safeLocalStorage } from '../utils/storage';

export interface AIQuestion {
  id: string;
  question: string;
  emoji: string;
  category: QuestionCategory;
  actionLabel: string;
  dismissLabel?: string;
  action: () => void;
}

interface UseAIQuestionsParams {
  currentPage: Page;
  ideasCount: number;
  ideas: StructuredIdea[];
  onNavigate: (page: Page, options?: { tab?: string }) => void;
}

interface QuestionState {
  lastShown: number;       // timestamp
  sessionCount: number;    // questions shown this session
  dismissedIds: string[];  // question IDs dismissed by user
  visitedPages: string[];  // pages visited (for first-visit trigger)
}

const STORAGE_KEY = 'zenai_ai_questions_state';
const MIN_COOLDOWN_MS = 5 * 60 * 1000;  // 5 minutes between any questions
const MAX_PER_SESSION = 3;
const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes idle
const RETURN_THRESHOLD_DAYS = 3;

function loadState(): QuestionState {
  try {
    const raw = safeLocalStorage('get', STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {
    lastShown: 0,
    sessionCount: 0,
    dismissedIds: [],
    visitedPages: [],
  };
}

function saveState(state: QuestionState): void {
  safeLocalStorage('set', STORAGE_KEY, JSON.stringify(state));
}

export function useAIQuestions({
  currentPage,
  ideasCount,
  ideas,
  onNavigate,
}: UseAIQuestionsParams) {
  const [currentQuestion, setCurrentQuestion] = useState<AIQuestion | null>(null);
  const stateRef = useRef<QuestionState>(loadState());
  const lastActivityRef = useRef(Date.now());
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Track user activity to detect idle
  useEffect(() => {
    const resetIdle = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener('click', resetIdle, { passive: true });
    window.addEventListener('keydown', resetIdle, { passive: true });
    return () => {
      window.removeEventListener('click', resetIdle);
      window.removeEventListener('keydown', resetIdle);
    };
  }, []);

  const canShowQuestion = useCallback((questionId: string): boolean => {
    const state = stateRef.current;
    if (state.sessionCount >= MAX_PER_SESSION) return false;
    if (Date.now() - state.lastShown < MIN_COOLDOWN_MS) return false;
    if (state.dismissedIds.includes(questionId)) return false;
    return true;
  }, []);

  const showQuestion = useCallback((question: AIQuestion) => {
    if (!canShowQuestion(question.id)) return;
    setCurrentQuestion(question);
    stateRef.current.lastShown = Date.now();
    stateRef.current.sessionCount += 1;
    saveState(stateRef.current);
  }, [canShowQuestion]);

  const dismiss = useCallback(() => {
    if (currentQuestion) {
      stateRef.current.dismissedIds.push(currentQuestion.id);
      saveState(stateRef.current);
    }
    setCurrentQuestion(null);
  }, [currentQuestion]);

  // ---- Trigger: Untagged ideas ----
  useEffect(() => {
    if (currentPage !== 'ideas' || currentQuestion) return;
    if (ideasCount < 5) return; // need enough ideas to be meaningful

    // Check for ideas with generic/empty categories
    const untaggedCount = ideas.filter(i =>
      !i.category || i.category === 'personal'
    ).length;

    if (untaggedCount >= 3 && canShowQuestion('untagged-ideas')) {
      const timer = setTimeout(() => {
        showQuestion({
          id: 'untagged-ideas',
          question: `${untaggedCount} Gedanken haben noch keine spezifische Kategorie. Soll ich sie automatisch zuordnen?`,
          emoji: '🏷️',
          category: 'suggestion',
          actionLabel: 'Ja, zuordnen!',
          action: () => {
            onNavigate('ideas', { tab: 'triage' });
            setCurrentQuestion(null);
          },
        });
      }, 10000); // Wait 10s after page load
      return () => clearTimeout(timer);
    }
  }, [currentPage, ideasCount, ideas, currentQuestion, canShowQuestion, showQuestion, onNavigate]);

  // ---- Trigger: Idle on ideas page ----
  useEffect(() => {
    if (currentPage !== 'ideas' || currentQuestion) return;

    idleTimerRef.current = setTimeout(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= IDLE_THRESHOLD_MS && canShowQuestion('idle-nudge')) {
        showQuestion({
          id: 'idle-nudge',
          question: 'Was beschäftigt dich gerade? Soll ich helfen, einen Gedanken zu formulieren?',
          emoji: '💭',
          category: 'question',
          actionLabel: 'Ja, lass uns reden',
          action: () => {
            onNavigate('chat');
            setCurrentQuestion(null);
          },
        });
      }
    }, IDLE_THRESHOLD_MS);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [currentPage, currentQuestion, canShowQuestion, showQuestion, onNavigate]);

  // ---- Trigger: First visit to a page ----
  useEffect(() => {
    if (currentQuestion) return;
    const state = stateRef.current;
    if (state.visitedPages.includes(currentPage)) return;

    // Mark as visited
    state.visitedPages.push(currentPage);
    saveState(state);

    // Only show welcome for non-obvious pages
    const welcomePages: Partial<Record<Page, string>> = {
      'workshop': 'Willkommen in der Werkstatt! Hier findest du proaktive KI-Vorschläge und die Evolution deiner Gedanken.',
      'insights': 'Hier siehst du Statistiken und Zusammenhänge deiner Gedanken. Soll ich dir die Highlights zeigen?',
      'documents': 'In der Wissensbasis kannst du Dokumente analysieren lassen und dein Wissen organisieren.',
      'my-ai': 'Hier kannst du deine KI personalisieren. Je mehr ich über dich lerne, desto besser kann ich helfen.',
    };

    const welcomeMessage = welcomePages[currentPage];
    if (welcomeMessage && canShowQuestion(`welcome-${currentPage}`)) {
      const timer = setTimeout(() => {
        showQuestion({
          id: `welcome-${currentPage}`,
          question: welcomeMessage,
          emoji: '👋',
          category: 'insight',
          actionLabel: 'Verstanden!',
          dismissLabel: 'Nicht mehr zeigen',
          action: () => setCurrentQuestion(null),
        });
      }, 2000); // Brief delay after page transition
      return () => clearTimeout(timer);
    }
  }, [currentPage, currentQuestion, canShowQuestion, showQuestion]);

  // ---- Trigger: Returning user ----
  useEffect(() => {
    const lastVisit = safeLocalStorage('get', 'zenai_last_visit');
    const now = Date.now();
    safeLocalStorage('set', 'zenai_last_visit', String(now));

    if (!lastVisit) return; // First ever visit

    const daysSinceLastVisit = (now - Number(lastVisit)) / (1000 * 60 * 60 * 24);
    if (daysSinceLastVisit >= RETURN_THRESHOLD_DAYS && canShowQuestion('welcome-back')) {
      const timer = setTimeout(() => {
        showQuestion({
          id: 'welcome-back',
          question: `Schön, dass du wieder da bist! Du hast ${ideasCount} Gedanken. Soll ich dir zeigen, was neu ist?`,
          emoji: '🎉',
          category: 'celebration',
          actionLabel: 'Zeig mir!',
          action: () => {
            onNavigate('insights');
            setCurrentQuestion(null);
          },
        });
      }, 3000);
      return () => clearTimeout(timer);
    }
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    currentQuestion,
    dismiss,
  };
}
