/**
 * Document Vault Page - Types, Interfaces & Constants
 */

export type DocumentsTab = 'documents' | 'editor' | 'media' | 'meetings';

export type ViewMode = 'grid' | 'list';

export interface DocumentVaultPageProps {
  onBack: () => void;
  context: string;
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

export const DOC_TABS: { id: DocumentsTab; label: string; icon: string }[] = [
  { id: 'documents', label: 'Dokumente', icon: '📄' },
  { id: 'editor', label: 'Editor', icon: '✏️' },
  { id: 'media', label: 'Medien', icon: '🖼️' },
  { id: 'meetings', label: 'Meetings', icon: '📅' },
];
