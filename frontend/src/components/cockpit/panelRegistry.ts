import { lazy, type LazyExoticComponent, type ComponentType } from 'react';
import {
  CheckSquare, Mail, Lightbulb, Calendar, Users,
  FileText, Brain, DollarSign, Bot, Search,
} from 'lucide-react';
import type { PanelType } from '../../contexts/PanelContext';
import type { AIContext } from '../ContextSwitcher';

export interface PanelProps {
  filter?: string;
  onClose: () => void;
  context: AIContext;
}

export interface PanelDefinition {
  id: PanelType;
  icon: typeof CheckSquare;
  label: string;
  shortcut: string;
  component: LazyExoticComponent<ComponentType<PanelProps>>;
}

// Placeholder component for panels not yet wired
const PlaceholderPanel = lazy(() =>
  Promise.resolve({
    default: (_props: PanelProps) => null,
  })
);

export const panelRegistry: PanelDefinition[] = [
  { id: 'tasks', icon: CheckSquare, label: 'Aufgaben', shortcut: '⌘1', component: PlaceholderPanel },
  { id: 'email', icon: Mail, label: 'Email', shortcut: '⌘2', component: PlaceholderPanel },
  { id: 'ideas', icon: Lightbulb, label: 'Ideen', shortcut: '⌘3', component: PlaceholderPanel },
  { id: 'calendar', icon: Calendar, label: 'Kalender', shortcut: '⌘4', component: PlaceholderPanel },
  { id: 'contacts', icon: Users, label: 'Kontakte', shortcut: '⌘5', component: PlaceholderPanel },
  { id: 'documents', icon: FileText, label: 'Dokumente', shortcut: '⌘6', component: PlaceholderPanel },
  { id: 'memory', icon: Brain, label: 'Gedaechtnis', shortcut: '⌘7', component: PlaceholderPanel },
  { id: 'finance', icon: DollarSign, label: 'Finanzen', shortcut: '⌘8', component: PlaceholderPanel },
  { id: 'agents', icon: Bot, label: 'Agenten', shortcut: '⌘9', component: PlaceholderPanel },
  { id: 'search', icon: Search, label: 'Suche', shortcut: '⌘/', component: PlaceholderPanel },
];

export function getPanelDefinition(id: PanelType): PanelDefinition | undefined {
  return panelRegistry.find(p => p.id === id);
}
