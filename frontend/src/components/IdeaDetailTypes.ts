import type { AIContext } from './ContextSwitcher';

export interface Idea {
  id: string;
  title: string;
  type: string;
  category: string;
  priority: string;
  summary: string;
  next_steps: string[];
  context_needed: string[];
  keywords: string[];
  raw_transcript?: string;
  created_at: string;
  updated_at?: string;
}

export interface Relation {
  sourceId: string;
  targetId: string;
  relationType: string;
  strength: number;
  reason: string;
  target_title?: string;
  target_summary?: string;
}

export interface Suggestion {
  id: string;
  title: string;
  summary: string;
  similarity: number;
}

export interface Draft {
  id: string;
  ideaId: string;
  draftType: string;
  content: string;
  wordCount: number;
  status: string;
}

export interface IdeaDetailProps {
  idea: Idea;
  onClose: () => void;
  onNavigate?: (ideaId: string) => void;
  onConvertToTask?: (idea: Idea) => void;
  onOpenInChat?: (idea: Idea) => void;
  onMarkComplete?: (idea: Idea) => void;
  onMove?: (id: string, targetContext: AIContext) => void;
}

export const typeLabels: Record<string, { label: string; icon: string }> = {
  idea: { label: 'Idee', icon: '💡' },
  task: { label: 'Aufgabe', icon: '✅' },
  insight: { label: 'Erkenntnis', icon: '🔍' },
  problem: { label: 'Problem', icon: '⚠️' },
  question: { label: 'Frage', icon: '❓' },
};

export const categoryLabels: Record<string, string> = {
  business: 'Business',
  technical: 'Technik',
  personal: 'Persönlich',
  learning: 'Lernen',
};

export const priorityLabels: Record<string, string> = {
  high: 'Hoch',
  medium: 'Mittel',
  low: 'Niedrig',
};

export const relationLabels: Record<string, string> = {
  similar_to: 'Ähnlich zu',
  builds_on: 'Baut auf',
  supports: 'Unterstützt',
  enables: 'Ermöglicht',
  related_tech: 'Verwandte Technologie',
  contradicts: 'Widerspricht',
  part_of: 'Teil von',
};

export const draftTypeLabels: Record<string, { label: string; icon: string; sectionTitle: string }> = {
  email: { label: 'E-Mail', icon: '📧', sectionTitle: 'Entwurf' },
  article: { label: 'Artikel', icon: '📝', sectionTitle: 'Entwurf' },
  proposal: { label: 'Angebot', icon: '📋', sectionTitle: 'Entwurf' },
  document: { label: 'Dokument', icon: '📄', sectionTitle: 'Entwurf' },
  generic: { label: 'Text', icon: '📃', sectionTitle: 'Entwurf' },
  reading: { label: 'Leseinhalt', icon: '📚', sectionTitle: 'Vorbereitet von deiner KI' },
  research: { label: 'Recherche', icon: '🔬', sectionTitle: 'Recherche-Ergebnis' },
  learning: { label: 'Lernmaterial', icon: '🎓', sectionTitle: 'Lernmaterial' },
  plan: { label: 'Plan', icon: '📋', sectionTitle: 'Plan' },
  analysis: { label: 'Analyse', icon: '📊', sectionTitle: 'Analyse' },
};
