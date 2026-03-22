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

const TasksPanel = lazy(() => import('./panels/TasksPanel'));
const EmailPanel = lazy(() => import('./panels/EmailPanel'));
const IdeasPanel = lazy(() => import('./panels/IdeasPanel'));
const CalendarPanel = lazy(() => import('./panels/CalendarPanel'));
const ContactsPanel = lazy(() => import('./panels/ContactsPanel'));
const DocumentsPanel = lazy(() => import('./panels/DocumentsPanel'));
const MemoryPanel = lazy(() => import('./panels/MemoryPanel'));
const FinancePanel = lazy(() => import('./panels/FinancePanel'));
const AgentsPanel = lazy(() => import('./panels/AgentsPanel'));
const SearchPanel = lazy(() => import('./panels/SearchPanel'));

export const panelRegistry: PanelDefinition[] = [
  { id: 'tasks', icon: CheckSquare, label: 'Aufgaben', shortcut: '⌘1', component: TasksPanel },
  { id: 'email', icon: Mail, label: 'Email', shortcut: '⌘2', component: EmailPanel },
  { id: 'ideas', icon: Lightbulb, label: 'Ideen', shortcut: '⌘3', component: IdeasPanel },
  { id: 'calendar', icon: Calendar, label: 'Kalender', shortcut: '⌘4', component: CalendarPanel },
  { id: 'contacts', icon: Users, label: 'Kontakte', shortcut: '⌘5', component: ContactsPanel },
  { id: 'documents', icon: FileText, label: 'Dokumente', shortcut: '⌘6', component: DocumentsPanel },
  { id: 'memory', icon: Brain, label: 'Gedaechtnis', shortcut: '⌘7', component: MemoryPanel },
  { id: 'finance', icon: DollarSign, label: 'Finanzen', shortcut: '⌘8', component: FinancePanel },
  { id: 'agents', icon: Bot, label: 'Agenten', shortcut: '⌘9', component: AgentsPanel },
  { id: 'search', icon: Search, label: 'Suche', shortcut: '⌘/', component: SearchPanel },
];

export function getPanelDefinition(id: PanelType): PanelDefinition | undefined {
  return panelRegistry.find(p => p.id === id);
}
