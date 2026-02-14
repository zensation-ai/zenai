/**
 * Feature Hint Configuration
 *
 * Defines contextual hints shown on first visit to each page.
 * Shown after onboarding is complete.
 */

export interface FeatureHint {
  id: string;
  /** Path prefix to match (e.g., '/ideas' matches '/ideas' and '/ideas/incubator') */
  pathPrefix: string;
  title: string;
  description: string;
  icon: string;
  tips: string[];
  shortcut?: string;
}

export const STORAGE_KEY_PREFIX = 'zenai_hint_seen_';

export const FEATURE_HINTS: FeatureHint[] = [
  {
    id: 'ideas',
    pathPrefix: '/ideas',
    title: 'Gedanken',
    description: 'Hier landen alle deine Ideen, Aufgaben und Fragen. Sprich oder schreib einfach drauf los.',
    icon: '💭',
    tips: [
      'Tippe oder sprich deinen Gedanken ins Eingabefeld',
      'Die KI strukturiert automatisch Titel, Typ und Priorität',
      'Nutze die Tabs oben für Inkubator, Archiv und Sortieren',
      'Klick auf den Stern, um Favoriten zu markieren',
    ],
    shortcut: 'Cmd+N',
  },
  {
    id: 'chat',
    pathPrefix: '/chat',
    title: 'Chat',
    description: 'Dein persönlicher KI-Assistent. Stelle Fragen, lass dir helfen oder brainstorme.',
    icon: '💬',
    tips: [
      'Die KI kennt deine Gedanken und kann darauf Bezug nehmen',
      'Nutze Bilder per Drag & Drop für visuelle Analyse',
      'Code-Blöcke werden automatisch als Artifacts dargestellt',
    ],
  },
  {
    id: 'calendar',
    pathPrefix: '/calendar',
    title: 'Planer',
    description: 'Termine, Aufgaben und Projekte an einem Ort. Kanban und Gantt inklusive.',
    icon: '📅',
    tips: [
      'Wechsle zwischen Kalender, Aufgaben, Kanban und Gantt',
      'Erstelle Aufgaben direkt aus Gedanken heraus',
      'Nutze Drag & Drop im Kanban-Board',
    ],
  },
  {
    id: 'workshop',
    pathPrefix: '/workshop',
    title: 'Werkstatt',
    description: 'Die KI arbeitet proaktiv an deinen Gedanken weiter — Vorschläge, Entwicklung und Agenten.',
    icon: '🧪',
    tips: [
      'Unter Vorschläge findest du KI-generierte Verbesserungen',
      'Entwicklung zeigt, wie sich deine Ideen weiterentwickeln',
      'Agenten-Teams können komplexe Aufgaben automatisieren',
    ],
  },
  {
    id: 'documents',
    pathPrefix: '/documents',
    title: 'Wissensbasis',
    description: 'Dokumente hochladen, bearbeiten und mit der KI durchsuchen.',
    icon: '📚',
    tips: [
      'Lade Dokumente hoch — die KI kann sie durchsuchen',
      'Der integrierte Editor unterstützt Markdown',
      'Medien und Meeting-Protokolle findest du in den Tabs',
    ],
  },
  {
    id: 'insights',
    pathPrefix: '/insights',
    title: 'Insights',
    description: 'Statistiken, Zusammenfassungen und Verbindungen zwischen deinen Gedanken.',
    icon: '📊',
    tips: [
      'Statistiken zeigen deine Produktivitätsmuster',
      'Die KI erstellt tägliche Zusammenfassungen',
      'Der Wissensgraph zeigt Verbindungen zwischen Ideen',
    ],
  },
  {
    id: 'business',
    pathPrefix: '/business',
    title: 'Business',
    description: 'Geschäftsmetriken, Stripe-Integration und Analytics auf einen Blick.',
    icon: '💼',
    tips: [
      'Verbinde Stripe, Google Analytics und Search Console',
      'Erstelle Business-Pläne und Wettbewerbsanalysen',
      'Lighthouse-Audits prüfen deine Website-Performance',
    ],
  },
  {
    id: 'learning',
    pathPrefix: '/learning',
    title: 'Lernen',
    description: 'Die KI erkennt deine Lernziele und erstellt personalisierte Lernpfade.',
    icon: '📖',
    tips: [
      'Erfasse Lernziele als Gedanken — die KI erkennt sie automatisch',
      'Lernaufgaben werden mit Smart Content angereichert',
      'Fortschritte werden über Insights nachverfolgt',
    ],
  },
  {
    id: 'my-ai',
    pathPrefix: '/my-ai',
    title: 'Meine KI',
    description: 'Personalisiere die KI, verwalte ihr Wissen und nutze den Sprach-Chat.',
    icon: '🧠',
    tips: [
      'Unter KI anpassen definierst du Tonalität und Vorlieben',
      'KI-Wissen zeigt, was die KI über dich gelernt hat',
      'Der Sprach-Chat ermöglicht freihändige Konversation',
    ],
  },
];
