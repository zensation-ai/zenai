/**
 * Meine KI Types - AI personalization hub
 */

export type MeineKIViewMode = 'persona' | 'wissen' | 'prozeduren' | 'stimme';

export interface MeineKISmartPageProps {
  context: string;
  initialTab?: string;
}

export const MEINE_KI_VIEWS: { id: MeineKIViewMode; label: string }[] = [
  { id: 'persona', label: 'Persona' },
  { id: 'wissen', label: 'Wissen' },
  { id: 'prozeduren', label: 'Prozeduren' },
  { id: 'stimme', label: 'Stimme' },
];
