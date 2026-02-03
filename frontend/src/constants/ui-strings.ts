/**
 * UI Strings - Zentrale Textdefinitionen
 *
 * Alle Benutzer-sichtbaren Texte werden hier zentral verwaltet.
 * Dies ermöglicht:
 * - Konsistente Terminologie
 * - Einfache Lokalisierung
 * - Zentrale Wartung
 */

// ============================================
// NAVIGATION & ACTIONS
// ============================================

export const NAV_STRINGS = {
  back: 'Zurück',
  home: 'Startseite',
  ideas: 'Gedanken',
  chat: 'Chat',
  insights: 'Insights',
  archive: 'Archiv',
  more: 'Mehr',
  settings: 'Einstellungen',
  profile: 'Profil',
  newChat: '+ Neuer Chat',
} as const;

export const ACTION_STRINGS = {
  save: 'Speichern',
  cancel: 'Abbrechen',
  delete: 'Löschen',
  edit: 'Bearbeiten',
  archive: 'Archivieren',
  restore: 'Wiederherstellen',
  send: 'Senden',
  submit: 'Absenden',
  reset: 'Zurücksetzen',
  clear: 'Löschen',
  close: 'Schließen',
  refresh: 'Aktualisieren',
  retry: 'Erneut versuchen',
} as const;

// ============================================
// CHAT & MESSAGING
// ============================================

export const CHAT_STRINGS = {
  placeholder: {
    default: 'Frag mich etwas...',
    withImage: 'Frage zum Bild...',
  },
  status: {
    typing: 'schreibt...',
    thinking: 'Denke nach...',
    processing: 'Verarbeite...',
    sending: 'Sende...',
    loading: 'Lädt...',
  },
  actions: {
    send: 'Nachricht senden',
    newChat: 'Neue Unterhaltung starten',
    newChatTooltip: 'Startet eine neue Unterhaltung (bisherige bleibt erhalten)',
  },
  hints: {
    enterToSend: 'Enter zum Senden',
    shiftEnterNewline: 'Shift+Enter für neue Zeile',
    combined: 'Enter zum Senden · Shift+Enter für neue Zeile',
  },
  image: {
    singular: 'Bild',
    plural: 'Bilder',
    attached: 'Bild angehängt',
    attachedPlural: 'Bilder angehängt',
  },
} as const;

// ============================================
// COMMAND CENTER & INPUT
// ============================================

export const INPUT_STRINGS = {
  placeholder: 'Was beschäftigt dich? Teile deine Gedanken, Ideen oder Aufgaben...',
  hints: {
    keyboard: '⌘/Ctrl + Enter zum Senden',
    voice: 'Oder sprich einfach',
  },
  modes: {
    voice: 'Sprachmemo',
    chat: 'Chat-Modus',
    backToVoice: 'Zurück zu Sprachmemo',
    openChat: 'Chat-Modus öffnen',
  },
  actions: {
    structure: 'Gedanken strukturieren',
    structureTooltip: 'Gedanken strukturieren und speichern',
    processing: 'Verarbeitung läuft',
  },
} as const;

// ============================================
// IDEAS & CARDS
// ============================================

export const IDEA_STRINGS = {
  actions: {
    delete: 'Gedanke löschen',
    archive: 'Archivieren',
    restore: 'Wiederherstellen',
  },
  dialogs: {
    deleteTitle: 'Gedanke löschen',
    deleteMessage: 'Möchtest du diese Idee wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
    confirmDelete: 'Löschen',
    cancel: 'Abbrechen',
  },
  feedback: {
    deleted: 'Gedanke gelöscht',
    archived: 'Archiviert!',
    restored: 'Gedanke wiederhergestellt',
  },
  sections: {
    nextSteps: 'Nächste Schritte:',
    context: 'Kontext:',
    keywords: 'Schlüsselwörter:',
  },
} as const;

// ============================================
// SEARCH & FILTER
// ============================================

export const SEARCH_STRINGS = {
  placeholder: "Semantische Suche... (z.B. 'Ideen für Automatisierung')",
  clear: 'Suche löschen',
  results: {
    singular: 'Ergebnis',
    plural: 'Ergebnisse',
    found: 'gefunden',
  },
  reset: '× Suche zurücksetzen',
  filters: {
    type: 'Typ',
    priority: 'Priorität',
    category: 'Kategorie',
    clearAll: 'Alle Filter zurücksetzen',
  },
} as const;

// ============================================
// STATS & ANALYTICS
// ============================================

export const STATS_STRINGS = {
  sections: {
    byType: 'NACH TYP',
    byPriority: 'NACH PRIORITÄT',
    byCategory: 'NACH KATEGORIE',
  },
  labels: {
    total: 'Gesamt',
    today: 'Heute',
    thisWeek: 'Diese Woche',
    thisMonth: 'Dieser Monat',
    highPriority: 'Hohe Priorität',
  },
} as const;

// ============================================
// ERROR MESSAGES
// ============================================

export const ERROR_STRINGS = {
  // Base error types
  generic: 'Ein Fehler ist aufgetreten',
  network: 'Netzwerkfehler - Bitte überprüfe deine Verbindung',
  timeout: 'Die Anfrage hat zu lange gedauert - Versuch es erneut',
  notFound: 'Nicht gefunden',
  unauthorized: 'Nicht autorisiert - Bitte melde dich erneut an',
  offline: 'Du bist offline - Änderungen werden lokal gespeichert',
  quota: 'Zu viele Anfragen - Bitte warte einen Moment',
  conflict: 'Konflikt - Lade die Seite neu für aktuelle Daten',
  server: 'Serverfehler - Wir arbeiten daran',

  // Contextual error messages with more detail
  chat: {
    createSession: 'Konnte keine neue Chat-Session erstellen - Versuch es erneut',
    sendMessage: 'Nachricht konnte nicht gesendet werden',
    sendMessageNetwork: 'Nachricht konnte nicht gesendet werden - Überprüfe deine Internetverbindung',
    sendMessageTimeout: 'Nachricht konnte nicht gesendet werden - Anfrage hat zu lange gedauert',
    sendMessageOffline: 'Du bist offline - Nachricht wird gesendet, sobald du wieder online bist',
    loadHistory: 'Chat-Verlauf konnte nicht geladen werden - Versuch es erneut',
  },
  idea: {
    delete: 'Löschen fehlgeschlagen - Versuch es erneut',
    archive: 'Archivieren fehlgeschlagen - Versuch es erneut',
    restore: 'Wiederherstellen fehlgeschlagen - Versuch es erneut',
    save: 'Speichern fehlgeschlagen - Versuch es erneut',
    saveOffline: 'Du bist offline - Gedanke wird gespeichert, sobald du wieder online bist',
    saveConflict: 'Konflikt erkannt - Jemand hat diesen Gedanken gerade bearbeitet',
  },
  search: {
    failed: 'Suche fehlgeschlagen - Versuch es erneut',
    noResults: 'Keine Ergebnisse gefunden - Versuch andere Suchbegriffe',
  },
  sync: {
    failed: 'Synchronisierung fehlgeschlagen',
    pending: 'Änderungen warten auf Synchronisierung',
    conflict: 'Sync-Konflikt - Lokale und Server-Daten unterscheiden sich',
  },
} as const;

// ============================================
// SUCCESS MESSAGES
// ============================================

export const SUCCESS_STRINGS = {
  chat: {
    newSession: 'Neue Chat-Session gestartet',
    messageSent: 'Nachricht gesendet',
  },
  idea: {
    created: 'Gedanke erfolgreich strukturiert!',
    deleted: 'Gedanke gelöscht',
    archived: 'Gedanke archiviert',
    restored: 'Gedanke wiederhergestellt',
  },
  settings: {
    saved: 'Einstellungen gespeichert',
  },
} as const;

// ============================================
// ACCESSIBILITY
// ============================================

export const A11Y_STRINGS = {
  buttons: {
    close: 'Schließen',
    menu: 'Menü öffnen',
    menuClose: 'Menü schließen',
    expand: 'Aufklappen',
    collapse: 'Zuklappen',
    search: 'Suchen',
    filter: 'Filtern',
  },
  status: {
    loading: 'Wird geladen...',
    processing: 'Wird verarbeitet...',
    saving: 'Wird gespeichert...',
  },
  navigation: {
    main: 'Hauptnavigation',
    footer: 'Footer-Navigation',
    skipToContent: 'Zum Hauptinhalt springen',
  },
} as const;

// ============================================
// LOADING & EMPTY STATES
// ============================================

export const STATE_STRINGS = {
  loading: {
    default: 'Wird geladen...',
    ideas: 'Gedanken werden geladen...',
    chat: 'Chat wird geladen...',
    stats: 'Statistiken werden berechnet...',
  },
  empty: {
    ideas: {
      title: 'Noch keine Gedanken',
      message: 'Teile deinen ersten Gedanken per Sprache oder Text.',
    },
    chat: {
      title: 'Starte eine Unterhaltung',
      message: 'Frag mich etwas oder teile einen Gedanken.',
    },
    search: {
      title: 'Keine Ergebnisse',
      message: 'Versuche es mit anderen Suchbegriffen.',
    },
    archive: {
      title: 'Archiv ist leer',
      message: 'Archivierte Gedanken erscheinen hier.',
    },
  },
} as const;

// ============================================
// INSIGHTS DASHBOARD (Consolidated View)
// ============================================

export const INSIGHTS_STRINGS = {
  title: 'Insights',
  tabs: {
    dashboard: {
      label: 'Dashboard',
      description: 'Übersicht und Statistiken',
    },
    analytics: {
      label: 'Analytics',
      description: 'Detaillierte Analysen',
    },
    digest: {
      label: 'Digest',
      description: 'Tägliche Zusammenfassung',
    },
    knowledge: {
      label: 'Wissen',
      description: 'Wissensgraph',
    },
  },
} as const;

// ============================================
// AI WORKSHOP (Consolidated View)
// ============================================

export const AI_WORKSHOP_STRINGS = {
  title: 'KI-Werkstatt',
  tabs: {
    incubator: {
      label: 'Inkubator',
      description: 'Ideen entwickeln',
    },
    proactive: {
      label: 'Proaktiv',
      description: 'KI-Vorschläge',
    },
    evolution: {
      label: 'Evolution',
      description: 'Ideen-Entwicklung',
    },
  },
} as const;

// ============================================
// MOBILE NAVIGATION
// ============================================

export const MOBILE_NAV_STRINGS = {
  toggle: 'Navigation öffnen',
  close: 'Navigation schließen',
  drawer: 'Mobile Navigation',
} as const;
