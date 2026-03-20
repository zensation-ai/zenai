export type WissenViewMode = 'dokumente' | 'canvas' | 'medien' | 'verbindungen' | 'lernen';

export interface WissenSmartPageProps {
  context: string;
  initialTab?: string;
}

export const WISSEN_VIEWS: { id: WissenViewMode; label: string }[] = [
  { id: 'dokumente', label: 'Dokumente' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'medien', label: 'Medien' },
  { id: 'verbindungen', label: 'Verbindungen' },
  { id: 'lernen', label: 'Lernen' },
];
