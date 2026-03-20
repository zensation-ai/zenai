/**
 * Cockpit Types - Business + Finance + Insights hub
 */

export type CockpitViewMode = 'uebersicht' | 'business' | 'finanzen' | 'trends';

export interface CockpitSmartPageProps {
  context: string;
  initialTab?: string;
}

export type TimeRange = '7d' | '30d' | '90d' | '1y';

export const COCKPIT_VIEWS: { id: CockpitViewMode; label: string }[] = [
  { id: 'uebersicht', label: 'Übersicht' },
  { id: 'business', label: 'Business' },
  { id: 'finanzen', label: 'Finanzen' },
  { id: 'trends', label: 'Trends' },
];

export const TIME_RANGES: { id: TimeRange; label: string }[] = [
  { id: '7d', label: '7 Tage' },
  { id: '30d', label: '30 Tage' },
  { id: '90d', label: '90 Tage' },
  { id: '1y', label: '1 Jahr' },
];
