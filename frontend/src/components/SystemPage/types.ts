/**
 * System Types - Settings & Administration hub
 */

export type SystemTab =
  | 'profil' | 'konto'
  | 'allgemein' | 'ki'
  | 'sicherheit' | 'datenschutz'
  | 'integrationen' | 'erweiterungen'
  | 'system' | 'daten';

export interface SystemSmartPageProps {
  context: string;
  initialTab?: string;
}

export interface SystemSection {
  id: string;
  label: string;
  tabs: { id: SystemTab; label: string }[];
}

export const SYSTEM_SECTIONS: SystemSection[] = [
  {
    id: 'account',
    label: 'Profil & Konto',
    tabs: [
      { id: 'profil', label: 'Profil' },
      { id: 'konto', label: 'Konto' },
    ],
  },
  {
    id: 'general',
    label: 'Allgemein & KI',
    tabs: [
      { id: 'allgemein', label: 'Allgemein' },
      { id: 'ki', label: 'KI-Einstellungen' },
    ],
  },
  {
    id: 'security',
    label: 'Sicherheit & Datenschutz',
    tabs: [
      { id: 'sicherheit', label: 'Sicherheit' },
      { id: 'datenschutz', label: 'Datenschutz' },
    ],
  },
  {
    id: 'extensions',
    label: 'Integrationen & Erweiterungen',
    tabs: [
      { id: 'integrationen', label: 'Integrationen' },
      { id: 'erweiterungen', label: 'Erweiterungen' },
    ],
  },
  {
    id: 'system',
    label: 'System & Daten',
    tabs: [
      { id: 'system', label: 'System' },
      { id: 'daten', label: 'Daten' },
    ],
  },
];

/** Flat list of all tab IDs for validation */
export const ALL_SYSTEM_TABS: SystemTab[] = SYSTEM_SECTIONS.flatMap(s => s.tabs.map(t => t.id));
