/**
 * ChatHub-specific types — Phase 104
 */

import type { AIContext } from '../ContextSwitcher';

/** Props for the ChatHub page component */
export interface ChatHubProps {
  context: AIContext;
  onContextChange?: (context: AIContext) => void;
}

/** A Smart Surface card (extends SmartSuggestion with rendering hints) */
export interface SmartSurfaceCard {
  id: string;
  type: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  priority: number;
  /** Icon name from Lucide */
  icon?: string;
  /** Primary action label (e.g. "Reply", "Mark Done") */
  actionLabel?: string;
}

/** Suggestion chip shown when Intent Bar is empty + focused */
export interface SuggestionChip {
  id: string;
  label: string;
  /** The prompt text injected into the Intent Bar on click */
  prompt: string;
  /** Optional icon name from Lucide */
  icon?: string;
}

/** Content type for AdaptiveResult rendering */
export type AdaptiveResultType =
  | 'text'
  | 'task_card'
  | 'email_composer'
  | 'code_block'
  | 'table'
  | 'event_card'
  | 'agent_progress'
  | 'expandable_cards';

/** SlidePanel configuration */
export interface SlidePanelConfig {
  /** Unique ID for the panel instance */
  id: string;
  /** Panel title shown in header */
  title: string;
  /** Content type determines which child component renders */
  type: string;
  /** Arbitrary data passed to the panel content */
  data?: Record<string, unknown>;
}
