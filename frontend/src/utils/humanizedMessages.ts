/**
 * Humanized Messages System
 *
 * Erweitert das AI Personality System um:
 * - Fortschritts-Tracking & Lob
 * - Kontextbezogene variable Nachrichten
 * - Tageszeit-abhängige Kommunikation
 * - Achievement-System
 * - Emotionale Verbindung
 *
 * Research-basiert:
 * - Conversational UI Best Practices 2025/2026
 * - Micro-copy Guidelines (3 C's: Clear, Concise, Consistent)
 * - Emotional Design Patterns
 */

import { AI_PERSONALITY, getTimeBasedGreeting, getRandomMessage } from './aiPersonality';

// ============================================
// PROGRESS TRACKING & ACHIEVEMENTS
// ============================================

export interface UserProgress {
  ideasToday: number;
  ideasThisWeek: number;
  totalIdeas: number;
  streakDays: number;
  archivedToday: number;
  connectionsFound: number;
  lastActiveDate: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  threshold: number;
  category: 'ideas' | 'streak' | 'connections' | 'exploration';
}

export const ACHIEVEMENTS: Achievement[] = [
  // Ideas
  { id: 'first_idea', title: 'Der erste Funke', description: 'Deine erste Idee festgehalten', icon: '✨', threshold: 1, category: 'ideas' },
  { id: 'idea_10', title: 'Gedankensammler', description: '10 Ideen gesammelt', icon: '💭', threshold: 10, category: 'ideas' },
  { id: 'idea_50', title: 'Ideen-Maschine', description: '50 Ideen gesammelt', icon: '🚀', threshold: 50, category: 'ideas' },
  { id: 'idea_100', title: 'Kreativ-Genie', description: '100 Ideen gesammelt', icon: '🧠', threshold: 100, category: 'ideas' },
  { id: 'idea_500', title: 'Gedanken-Imperium', description: '500 Ideen gesammelt', icon: '👑', threshold: 500, category: 'ideas' },

  // Streaks
  { id: 'streak_3', title: 'Auf Kurs', description: '3 Tage in Folge aktiv', icon: '🔥', threshold: 3, category: 'streak' },
  { id: 'streak_7', title: 'Wochenroutine', description: '7 Tage in Folge aktiv', icon: '⭐', threshold: 7, category: 'streak' },
  { id: 'streak_30', title: 'Gewohnheitstier', description: '30 Tage in Folge aktiv', icon: '🏆', threshold: 30, category: 'streak' },

  // Connections
  { id: 'connections_5', title: 'Verknüpfer', description: '5 Verbindungen entdeckt', icon: '🔗', threshold: 5, category: 'connections' },
  { id: 'connections_25', title: 'Netzwerker', description: '25 Verbindungen entdeckt', icon: '🕸️', threshold: 25, category: 'connections' },
];

// ============================================
// PROGRESS-BASED PRAISE MESSAGES
// ============================================

export function getProgressPraise(progress: UserProgress): string | null {
  const { ideasToday, ideasThisWeek, streakDays, archivedToday } = progress;

  // Tageszeit-basierte Anpassung
  const hour = new Date().getHours();
  const isEvening = hour >= 18;
  const isMorning = hour >= 5 && hour < 12;

  // Tägliche Erfolge
  if (ideasToday === 1) {
    return isMorning
      ? 'Der Tag beginnt produktiv! Dein erster Gedanke ist festgehalten. 💫'
      : 'Und schon ist der erste Gedanke des Tages da! 💫';
  }

  if (ideasToday === 5) {
    return 'Wow, 5 Gedanken heute! Du bist richtig im Flow. 🌊';
  }

  if (ideasToday === 10) {
    return 'Unglaublich! 10 Gedanken an einem Tag – du bist eine Ideenmaschine! 🚀';
  }

  // Wöchentliche Erfolge
  if (ideasThisWeek === 20 && ideasToday > 0) {
    return '20 Gedanken diese Woche! Dein Gehirn läuft auf Hochtouren. 🧠';
  }

  // Streak-Meilensteine
  if (streakDays === 3) {
    return '3 Tage in Folge aktiv! Eine Gewohnheit bildet sich. 🔥';
  }

  if (streakDays === 7) {
    return 'Eine ganze Woche dabei! Du hast Ausdauer. ⭐';
  }

  if (streakDays === 30) {
    return '30 Tage! Du bist jetzt offiziell ein Gewohnheitstier. 🏆';
  }

  // Archivierung
  if (archivedToday === 5) {
    return 'Aufgeräumt! 5 Gedanken gut sortiert ins Archiv. 📁';
  }

  // Abend-Reflexion
  if (isEvening && ideasToday >= 3) {
    return `Ein produktiver Tag geht zu Ende – ${ideasToday} Gedanken festgehalten! 🌙`;
  }

  return null;
}

// ============================================
// ACTION-SPECIFIC FEEDBACK
// ============================================

export interface ActionFeedback {
  message: string;
  subMessage?: string;
  icon?: string;
  duration?: number;
}

export function getActionFeedback(
  action: 'archive' | 'save' | 'delete' | 'publish' | 'connect' | 'share' | 'learn' | 'voice' | 'search',
  context?: { count?: number; name?: string }
): ActionFeedback {
  const feedbackMap: Record<string, ActionFeedback[]> = {
    archive: [
      { message: 'Sicher verwahrt!', subMessage: 'Du findest es jederzeit im Archiv', icon: '📦' },
      { message: 'Gut sortiert!', subMessage: 'Ordnung ist das halbe Leben', icon: '✓' },
      { message: 'Ab ins Archiv!', subMessage: 'Aufgeräumt und aufbewahrt', icon: '📁' },
    ],
    save: [
      { message: 'Gespeichert!', icon: '💾' },
      { message: 'Festgehalten!', icon: '✓' },
      { message: 'Sicher gespeichert!', icon: '✨' },
    ],
    delete: [
      { message: 'Weg damit!', subMessage: 'Manchmal muss man loslassen', icon: '🗑️' },
      { message: 'Gelöscht', subMessage: 'Platz für Neues', icon: '✓' },
    ],
    publish: [
      { message: 'Veröffentlicht!', subMessage: 'Deine Idee ist jetzt sichtbar', icon: '🎉' },
      { message: 'Live!', subMessage: 'Andere können jetzt darauf zugreifen', icon: '🚀' },
    ],
    connect: [
      { message: 'Verbunden!', subMessage: 'Eine neue Verknüpfung entdeckt', icon: '🔗' },
      { message: 'Verknüpft!', subMessage: 'Deine Gedanken wachsen zusammen', icon: '🕸️' },
    ],
    share: [
      { message: 'Geteilt!', subMessage: 'Wissen wächst, wenn man es teilt', icon: '📤' },
      { message: 'Auf dem Weg!', subMessage: 'Erfolgreich geteilt', icon: '✈️' },
    ],
    learn: [
      { message: 'Notiert!', subMessage: 'Ich merke mir das für später', icon: '📚' },
      { message: 'Verstanden!', subMessage: 'Ich lerne dich besser kennen', icon: '🧠' },
    ],
    voice: [
      { message: 'Aufgenommen!', subMessage: 'Wird jetzt verarbeitet...', icon: '🎙️' },
      { message: 'Verstanden!', icon: '✓' },
    ],
    search: [
      { message: 'Gefunden!', icon: '🔍' },
      { message: 'Hier ist es!', icon: '✓' },
    ],
  };

  const options = feedbackMap[action] || [{ message: 'Erledigt!', icon: '✓' }];
  const selected = options[Math.floor(Math.random() * options.length)];

  // Kontextuelle Anpassung
  if (context?.count && context.count > 1) {
    selected.message = `${context.count}x ${selected.message}`;
  }

  if (context?.name && action === 'archive') {
    selected.subMessage = `"${context.name}" ist jetzt archiviert`;
  }

  return selected;
}

// ============================================
// CONTEXTUAL LOADING MESSAGES
// ============================================

export interface LoadingContext {
  type: 'ideas' | 'search' | 'ai' | 'save' | 'sync' | 'upload' | 'analyze' | 'connect';
  progress?: number;
  itemName?: string;
}

export function getLoadingMessage(context: LoadingContext): {
  message: string;
  subMessage?: string;
  showProgress?: boolean;
} {
  const { type, progress, itemName } = context;

  const messages: Record<string, { message: string; subMessage?: string }[]> = {
    ideas: [
      { message: 'Gedanken werden geladen...', subMessage: 'Deine Ideen kommen gleich' },
      { message: 'Lade dein Brain...', subMessage: 'Einen Moment noch' },
    ],
    search: [
      { message: 'Durchsuche deine Gedanken...', subMessage: 'Das kann einen Moment dauern' },
      { message: 'Suche nach Verbindungen...', subMessage: 'Ich schaue überall nach' },
    ],
    ai: [
      { message: `${AI_PERSONALITY.name} denkt nach...`, subMessage: 'KI arbeitet' },
      { message: 'Verarbeite deine Eingabe...', subMessage: 'Fast fertig' },
      { message: 'Analysiere...', subMessage: 'KI-Magie im Gange' },
    ],
    save: [
      { message: 'Speichere...', subMessage: itemName ? `"${itemName}" wird gesichert` : undefined },
      { message: 'Wird gespeichert...', subMessage: 'Nur einen Moment' },
    ],
    sync: [
      { message: 'Synchronisiere...', subMessage: 'Alles wird abgeglichen' },
      { message: 'Gleiche ab...', subMessage: 'Daten werden synchronisiert' },
    ],
    upload: [
      { message: 'Lade hoch...', subMessage: progress ? `${progress}% abgeschlossen` : undefined },
      { message: 'Übertrage...', subMessage: itemName ? `"${itemName}" wird hochgeladen` : undefined },
    ],
    analyze: [
      { message: 'Analysiere Muster...', subMessage: 'Suche nach Zusammenhängen' },
      { message: 'Erkenne Verbindungen...', subMessage: 'KI-Analyse läuft' },
    ],
    connect: [
      { message: 'Verbinde...', subMessage: 'Stelle Verbindung her' },
      { message: 'Verbindung wird aufgebaut...', subMessage: 'Gleich geht\'s los' },
    ],
  };

  const options = messages[type] || [{ message: 'Lädt...' }];
  const selected = options[Math.floor(Math.random() * options.length)];

  return {
    ...selected,
    showProgress: progress !== undefined,
  };
}

// ============================================
// HUMANIZED EMPTY STATES
// ============================================

export interface EmptyStateContent {
  title: string;
  description: string;
  encouragement: string;
  icon: string;
  actionLabel?: string;
  actionHint?: string;
}

export function getEmptyStateContent(
  type: 'inbox' | 'ideas' | 'search' | 'archive' | 'connections' | 'learning' | 'chat' | 'favorites' | 'recent',
  context?: { searchQuery?: string; category?: string }
): EmptyStateContent {
  const timeGreeting = getTimeBasedGreeting();

  const states: Record<string, EmptyStateContent> = {
    inbox: {
      title: 'Dein Posteingang ist leer',
      description: 'Keine neuen Gedanken warten auf dich. Zeit für frische Ideen!',
      encouragement: `${timeGreeting.emoji} ${timeGreeting.subtext}`,
      icon: '📥',
      actionLabel: 'Neuen Gedanken erfassen',
      actionHint: 'Cmd+N oder Mikrofon',
    },
    ideas: {
      title: 'Bereit für deinen ersten Gedanken',
      description: 'Schreib einfach drauf los oder nutze das Mikrofon – ich kümmere mich um den Rest.',
      encouragement: 'Jede große Idee beginnt mit einem ersten Gedanken. Was bewegt dich gerade?',
      icon: '💡',
      actionLabel: 'Los geht\'s',
      actionHint: 'Tippe einfach los oder drücke das Mikrofon',
    },
    search: {
      title: context?.searchQuery
        ? `Nichts gefunden für "${context.searchQuery}"`
        : 'Keine Ergebnisse',
      description: context?.searchQuery
        ? 'Vielleicht mit anderen Begriffen versuchen?'
        : 'Starte eine Suche, um deine Gedanken zu durchforsten.',
      encouragement: 'Manchmal findet man beim Suchen etwas noch Besseres.',
      icon: '🔍',
      actionLabel: 'Suche anpassen',
    },
    archive: {
      title: 'Dein Archiv ist noch leer',
      description: 'Archiviere Gedanken, die du aufbewahren aber nicht mehr aktiv nutzen möchtest.',
      encouragement: 'Ein gutes Archiv ist wie ein zweites Gedächtnis. Alles da, wenn du es brauchst.',
      icon: '📦',
    },
    connections: {
      title: 'Noch keine Verbindungen',
      description: 'Je mehr Gedanken du sammelst, desto mehr Verbindungen entdecke ich.',
      encouragement: 'Dein Wissensnetz wächst mit jeder neuen Idee!',
      icon: '🕸️',
      actionLabel: 'Gedanken hinzufügen',
    },
    learning: {
      title: 'Bereit zum Lernen!',
      description: 'Ich analysiere deine Gedanken und erstelle personalisierte Lernvorschläge.',
      encouragement: 'Jeder Tag ist eine Chance, etwas Neues zu entdecken.',
      icon: '📚',
      actionLabel: 'Lernzentrum öffnen',
    },
    chat: {
      title: 'Worüber möchtest du sprechen?',
      description: 'Ich kann dir bei Recherche, Erklärungen, Brainstorming und vielem mehr helfen.',
      encouragement: 'Keine Frage ist zu klein oder zu groß. Was liegt dir auf dem Herzen?',
      icon: '💬',
      actionLabel: 'Gespräch starten',
    },
    favorites: {
      title: 'Noch keine Favoriten',
      description: 'Markiere wichtige Gedanken als Favorit, um sie schnell wiederzufinden.',
      encouragement: 'Deine besten Ideen verdienen einen besonderen Platz!',
      icon: '⭐',
    },
    recent: {
      title: 'Keine kürzlichen Aktivitäten',
      description: 'Hier siehst du bald deine neuesten Gedanken und Aktionen.',
      encouragement: 'Leg los – ich merke mir, woran du arbeitest!',
      icon: '🕐',
      actionLabel: 'Jetzt starten',
    },
  };

  return states[type] || states.ideas;
}

// ============================================
// FRIENDLY ERROR MESSAGES
// ============================================

export interface ErrorContent {
  title: string;
  description: string;
  suggestion: string;
  icon: string;
  retryLabel?: string;
  helpLink?: string;
}

export function getErrorContent(
  errorType: 'network' | 'server' | 'auth' | 'notFound' | 'permission' | 'validation' | 'timeout' | 'unknown',
  context?: { fieldName?: string; details?: string }
): ErrorContent {
  const errors: Record<string, ErrorContent> = {
    network: {
      title: 'Keine Verbindung',
      description: 'Ich kann gerade nicht mit dem Server kommunizieren.',
      suggestion: 'Prüfe deine Internetverbindung und versuche es dann erneut.',
      icon: '📡',
      retryLabel: 'Erneut verbinden',
    },
    server: {
      title: 'Ein kleines Problem',
      description: 'Der Server hat gerade Schluckauf. Das passiert manchmal.',
      suggestion: 'Warte einen Moment und versuche es dann nochmal.',
      icon: '🔧',
      retryLabel: 'Nochmal versuchen',
    },
    auth: {
      title: 'Sitzung abgelaufen',
      description: 'Du wurdest automatisch abgemeldet.',
      suggestion: 'Bitte melde dich erneut an, um fortzufahren.',
      icon: '🔐',
      retryLabel: 'Neu anmelden',
    },
    notFound: {
      title: 'Nicht gefunden',
      description: 'Das gesuchte Element existiert nicht mehr oder wurde verschoben.',
      suggestion: 'Vielleicht findest du es über die Suche?',
      icon: '🔍',
    },
    permission: {
      title: 'Zugriff verweigert',
      description: 'Du hast keine Berechtigung für diese Aktion.',
      suggestion: 'Kontaktiere einen Administrator, wenn du Zugang benötigst.',
      icon: '🚫',
    },
    validation: {
      title: context?.fieldName
        ? `Problem mit ${context.fieldName}`
        : 'Eingabe überprüfen',
      description: context?.details || 'Bitte überprüfe deine Eingabe.',
      suggestion: 'Korrigiere die markierten Felder und versuche es erneut.',
      icon: '⚠️',
    },
    timeout: {
      title: 'Das dauert zu lange',
      description: 'Die Anfrage hat zu lange gebraucht.',
      suggestion: 'Versuche es erneut oder warte einen Moment.',
      icon: '⏱️',
      retryLabel: 'Erneut versuchen',
    },
    unknown: {
      title: 'Ups, etwas ist schiefgelaufen',
      description: 'Ein unerwarteter Fehler ist aufgetreten.',
      suggestion: 'Versuche es nochmal. Falls das Problem bestehen bleibt, kontaktiere den Support.',
      icon: '🤔',
      retryLabel: 'Nochmal versuchen',
    },
  };

  return errors[errorType] || errors.unknown;
}

// ============================================
// TOOLTIP CONTENT SYSTEM
// ============================================

export interface TooltipContent {
  label: string;
  action?: string;
  shortcut?: string;
  hint?: string;
}

export const BUTTON_TOOLTIPS: Record<string, TooltipContent> = {
  // Navigation
  home: { label: 'Startseite', action: 'Zur Übersicht', shortcut: 'Cmd+H' },
  inbox: { label: 'Posteingang', action: 'Neue Gedanken ansehen', shortcut: 'Cmd+I' },
  archive: { label: 'Archiv', action: 'Archivierte Ideen durchsuchen', shortcut: 'Cmd+A' },
  search: { label: 'Suche', action: 'Gedanken durchsuchen', shortcut: 'Cmd+K' },
  settings: { label: 'Einstellungen', action: 'App konfigurieren', shortcut: 'Cmd+,' },

  // Ideen-Aktionen
  newIdea: { label: 'Neuer Gedanke', action: 'Idee erfassen', shortcut: 'Cmd+N', hint: 'Tippe einfach los!' },
  voice: { label: 'Spracheingabe', action: 'Per Stimme diktieren', shortcut: 'Cmd+M', hint: 'Ich schreibe mit' },
  saveIdea: { label: 'Speichern', action: 'Änderungen sichern', shortcut: 'Cmd+S' },
  archiveIdea: { label: 'Archivieren', action: 'Ins Archiv verschieben', hint: 'Bleibt erhalten, nur versteckt' },
  deleteIdea: { label: 'Löschen', action: 'Unwiderruflich entfernen', hint: 'Kann nicht rückgängig gemacht werden' },
  favoriteIdea: { label: 'Favorit', action: 'Als Favorit markieren', shortcut: 'Cmd+D' },
  shareIdea: { label: 'Teilen', action: 'Mit anderen teilen', shortcut: 'Cmd+Shift+S' },

  // AI-Funktionen
  askAI: { label: `${AI_PERSONALITY.name} fragen`, action: 'KI um Hilfe bitten', hint: 'Frag mich alles!' },
  generateIdeas: { label: 'Ideen generieren', action: 'KI-Vorschläge erhalten', hint: 'Basierend auf deinen Gedanken' },
  summarize: { label: 'Zusammenfassen', action: 'Kernpunkte extrahieren' },
  analyze: { label: 'Analysieren', action: 'Verbindungen entdecken' },

  // Ansicht
  gridView: { label: 'Kachel-Ansicht', action: 'Als Kacheln anzeigen', shortcut: 'Cmd+1' },
  listView: { label: 'Listen-Ansicht', action: 'Als Liste anzeigen', shortcut: 'Cmd+2' },
  graphView: { label: 'Graph-Ansicht', action: 'Verbindungen visualisieren', shortcut: 'Cmd+3' },

  // Filter & Sortierung
  filter: { label: 'Filter', action: 'Ergebnisse eingrenzen', hint: 'Nach Kategorie, Datum, etc.' },
  sort: { label: 'Sortieren', action: 'Reihenfolge ändern' },

  // Sonstiges
  help: { label: 'Hilfe', action: 'Tipps & Anleitungen', shortcut: 'Cmd+?' },
  feedback: { label: 'Feedback', action: 'Rückmeldung geben', hint: 'Deine Meinung zählt!' },
  undo: { label: 'Rückgängig', action: 'Letzte Aktion zurücknehmen', shortcut: 'Cmd+Z' },
  redo: { label: 'Wiederholen', action: 'Rückgängig rückgängig machen', shortcut: 'Cmd+Shift+Z' },
};

// ============================================
// PLACEHOLDER TEXTS (Inspirierend)
// ============================================

export const PLACEHOLDER_TEXTS = {
  ideaInput: [
    'Was beschäftigt dich gerade?',
    'Welcher Gedanke möchte festgehalten werden?',
    'Erzähl mir von deiner Idee...',
    'Hier ist Platz für deine Gedanken...',
    'Was liegt dir auf dem Herzen?',
    'Dein nächster Geistesblitz...',
    'Gedanken fließen lassen...',
    'Was fällt dir gerade ein?',
  ],
  searchInput: [
    'Nach Gedanken suchen...',
    'Was möchtest du finden?',
    'Durchsuche dein Brain...',
    'Wonach suchst du?',
    'Finde deine Ideen...',
  ],
  chatInput: [
    `Frag ${AI_PERSONALITY.name} etwas...`,
    'Womit kann ich helfen?',
    'Schreib mir...',
    'Was möchtest du wissen?',
    'Lass uns darüber sprechen...',
  ],
  noteInput: [
    'Notizen hinzufügen...',
    'Ergänzende Gedanken...',
    'Details festhalten...',
    'Kontext hinzufügen...',
  ],
};

// ============================================
// TIME-OF-DAY SPECIFIC MESSAGES
// ============================================

export function getTimeAwareMessage(baseMessage: string): string {
  const hour = new Date().getHours();
  const timePrefix = (() => {
    if (hour >= 5 && hour < 9) return 'So früh schon aktiv! ';
    if (hour >= 22 || hour < 5) return 'Nachtarbeit! ';
    if (hour >= 12 && hour < 14) return 'Mittagspause-Kreativität! ';
    return '';
  })();
  return timePrefix + baseMessage;
}

// ============================================
// CONTEXTUAL MICRO-COPY
// ============================================

export interface MicroCopy {
  label: string;
  description?: string;
  confirmation?: string;
}

export const MICRO_COPY: Record<string, MicroCopy> = {
  // Aktionen
  confirmDelete: {
    label: 'Wirklich löschen?',
    description: 'Diese Aktion kann nicht rückgängig gemacht werden.',
    confirmation: 'Ja, löschen',
  },
  confirmArchive: {
    label: 'Archivieren?',
    description: 'Du findest es jederzeit im Archiv wieder.',
    confirmation: 'Archivieren',
  },
  unsavedChanges: {
    label: 'Ungespeicherte Änderungen',
    description: 'Möchtest du die Änderungen speichern bevor du gehst?',
    confirmation: 'Speichern',
  },

  // Zustände
  noResults: {
    label: 'Keine Ergebnisse',
    description: 'Versuch es mit anderen Suchbegriffen.',
  },
  connectionLost: {
    label: 'Verbindung unterbrochen',
    description: 'Deine Änderungen werden gespeichert, sobald du wieder online bist.',
  },
  syncComplete: {
    label: 'Alles synchronisiert',
    description: 'Deine Daten sind auf dem neuesten Stand.',
  },

  // Feedback
  copied: {
    label: 'Kopiert!',
    description: 'In der Zwischenablage.',
  },
  saved: {
    label: 'Gespeichert',
    description: 'Änderungen wurden übernommen.',
  },
  sent: {
    label: 'Gesendet',
    description: 'Deine Nachricht ist unterwegs.',
  },
};

// ============================================
// CELEBRATORY MESSAGES (für Meilensteine)
// ============================================

export const CELEBRATION_MESSAGES: Record<string, string[]> = {
  firstIdea: [
    'Dein erstes Kapitel beginnt!',
    'Der erste Funke ist gezündet!',
    'Eine Reise von tausend Ideen beginnt mit einer.',
  ],
  tenIdeas: [
    'Zehn Gedanken – zehn Möglichkeiten!',
    'Ein solides Fundament entsteht.',
    'Deine Gedankenwelt nimmt Form an.',
  ],
  hundredIdeas: [
    'Drei Ziffern! Du bist im Ideen-Club!',
    '100 Gedanken – eine beeindruckende Sammlung!',
    'Dein digitales Gehirn wächst prächtig.',
  ],
  weekStreak: [
    'Eine Woche konsequent dabei!',
    'Sieben Tage, sieben Chancen genutzt.',
    'Routine entwickelt sich.',
  ],
  monthStreak: [
    'Ein ganzer Monat! Unglaublich!',
    '30 Tage Durchhaltevermögen.',
    'Du hast echte Ausdauer bewiesen.',
  ],
};

export function getCelebrationMessage(milestone: keyof typeof CELEBRATION_MESSAGES): string {
  const messages = CELEBRATION_MESSAGES[milestone];
  return messages[Math.floor(Math.random() * messages.length)];
}

// ============================================
// PERSONALITY TRAITS FOR RESPONSES
// ============================================

export type ResponseTone = 'encouraging' | 'playful' | 'professional' | 'empathetic';

export function getPersonalizedResponse(
  baseMessage: string,
  tone: ResponseTone = 'encouraging'
): string {
  const prefixes: Record<ResponseTone, string[]> = {
    encouraging: ['Super! ', 'Toll! ', 'Weiter so! ', 'Klasse! ', ''],
    playful: ['Yay! ', 'Woohoo! ', 'Nice! ', '', ''],
    professional: ['Erledigt. ', 'Abgeschlossen. ', '', '', ''],
    empathetic: ['Verstehe. ', 'Klar. ', 'Alles klar. ', '', ''],
  };

  const prefix = prefixes[tone][Math.floor(Math.random() * prefixes[tone].length)];
  return prefix + baseMessage;
}

export function getRandomPlaceholder(type: keyof typeof PLACEHOLDER_TEXTS): string {
  const options = PLACEHOLDER_TEXTS[type];
  return options[Math.floor(Math.random() * options.length)];
}

// ============================================
// AI ACTIVITY INDICATOR MESSAGES
// ============================================

export interface AIStatusMessage {
  message: string;
  subMessage?: string;
  icon: string;
  pulseColor?: string;
}

export function getAIStatusMessage(
  status: 'idle' | 'listening' | 'thinking' | 'processing' | 'success' | 'error' | 'offline'
): AIStatusMessage {
  const statuses: Record<string, AIStatusMessage> = {
    idle: {
      message: `${AI_PERSONALITY.name} ist bereit`,
      subMessage: 'Wie kann ich helfen?',
      icon: '🧠',
    },
    listening: {
      message: 'Ich höre zu...',
      subMessage: 'Sprich ruhig weiter',
      icon: '👂',
      pulseColor: 'var(--neuro-anticipation)',
    },
    thinking: {
      message: 'Denke nach...',
      subMessage: getRandomMessage('thinking'),
      icon: '💭',
      pulseColor: 'var(--neuro-reward)',
    },
    processing: {
      message: 'Verarbeite...',
      subMessage: getRandomMessage('processing'),
      icon: '⚡',
      pulseColor: 'var(--neuro-reward)',
    },
    success: {
      message: 'Fertig!',
      subMessage: getRandomMessage('success'),
      icon: '✨',
      pulseColor: 'var(--neuro-success)',
    },
    error: {
      message: 'Etwas ging schief',
      subMessage: 'Versuchen wir es nochmal',
      icon: '😕',
      pulseColor: 'var(--danger)',
    },
    offline: {
      message: 'Offline',
      subMessage: 'Verbindung wird gesucht...',
      icon: '📡',
      pulseColor: 'var(--text-secondary)',
    },
  };

  return statuses[status] || statuses.idle;
}

// ============================================
// SESSION-BASED ENCOURAGEMENT
// ============================================

export function getSessionEncouragement(sessionDuration: number, actionsCompleted: number): string | null {
  // Session duration in minutes
  if (sessionDuration >= 60 && actionsCompleted > 10) {
    return 'Eine Stunde produktive Arbeit! Zeit für eine kleine Pause? ☕';
  }

  if (sessionDuration >= 30 && actionsCompleted >= 5) {
    return 'Du bist richtig im Flow! Weiter so. 🌊';
  }

  if (actionsCompleted === 1) {
    return 'Der erste Schritt ist getan. Auf geht\'s! 🚀';
  }

  if (actionsCompleted === 10) {
    return '10 Aktionen! Du machst das großartig. 🌟';
  }

  return null;
}

// ============================================
// EXPORT UTILITY FUNCTIONS
// ============================================

export const HumanizedMessages = {
  getProgressPraise,
  getActionFeedback,
  getLoadingMessage,
  getEmptyStateContent,
  getErrorContent,
  getRandomPlaceholder,
  getAIStatusMessage,
  getSessionEncouragement,
  BUTTON_TOOLTIPS,
  ACHIEVEMENTS,
};

export default HumanizedMessages;
