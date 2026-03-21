/**
 * Guided Tour Step Definitions — Demo Mode
 *
 * Defines the 8-step tour that highlights ZenAI's key features.
 * Uses data-tour attributes for reliable element targeting.
 */

export interface TourStep {
  id: string;
  targetSelector: string;
  title: string;
  description: string;
  page: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'chat',
    targetSelector: '[data-tour="chat-hub"]',
    title: 'Chatte mit deiner KI',
    description: 'Sie kennt deinen Kontext, nutzt 55 Tools und merkt sich alles.',
    page: '/',
    position: 'right',
  },
  {
    id: 'ideas',
    targetSelector: '[data-tour="ideas"]',
    title: 'Gedanken festhalten',
    description: 'Ideen erfassen, entwickeln und mit KI-Unterstützung weiterentwickeln.',
    page: '/ideen',
    position: 'bottom',
  },
  {
    id: 'kanban',
    targetSelector: '[data-tour="kanban"]',
    title: 'Aufgaben organisieren',
    description: 'Kanban-Board mit Drag-and-Drop, Projekten und Abhängigkeiten.',
    page: '/planer/tasks',
    position: 'bottom',
  },
  {
    id: 'memory',
    targetSelector: '[data-tour="memory"]',
    title: 'KI-Transparenz',
    description: 'Sieh genau was deine KI sich merkt — Working Memory, Fakten, Prozeduren.',
    page: '/meine-ki',
    position: 'left',
  },
  {
    id: 'agents',
    targetSelector: '[data-tour="agents"]',
    title: 'Multi-Agenten Teams',
    description: 'Researcher, Writer, Coder und Reviewer arbeiten als Team zusammen.',
    page: '/ideen/workshop',
    position: 'bottom',
  },
  {
    id: 'insights',
    targetSelector: '[data-tour="insights"]',
    title: 'Knowledge Graph',
    description: 'Automatisch erkannte Verbindungen zwischen deinen Gedanken.',
    page: '/cockpit/trends',
    position: 'bottom',
  },
  {
    id: 'voice',
    targetSelector: '[data-tour="voice"]',
    title: 'Sprich mit deiner KI',
    description: 'Echtzeit-Sprachinteraktion mit Transkription und Audio-Visualisierung.',
    page: '/meine-ki/voice-chat',
    position: 'right',
  },
  {
    id: 'business',
    targetSelector: '[data-tour="business"]',
    title: 'Business Dashboard',
    description: 'Revenue, Traffic, SEO und System-Gesundheit auf einen Blick.',
    page: '/cockpit',
    position: 'bottom',
  },
];
