/**
 * Document Vault Page - Types, Interfaces & Constants
 */

import type { AIContext } from '../ContextSwitcher';

export type DocumentsTab = 'documents' | 'editor' | 'media';

export type ViewMode = 'grid' | 'list';

export interface DocumentVaultPageProps {
  onBack: () => void;
  context: AIContext;
  initialTab?: DocumentsTab;
}

// Folder icon mapping
export const FOLDER_ICONS: Record<string, string> = {
  'folder': '📁',
  'inbox': '📥',
  'archive': '📦',
  'briefcase': '💼',
  'file-text': '📝',
  'receipt': '🧾',
};

export function getFolderIcon(icon?: string): string {
  return icon ? (FOLDER_ICONS[icon] || '📁') : '📁';
}

