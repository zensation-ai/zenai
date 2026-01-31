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
  generic: 'Ein Fehler ist aufgetreten',
  network: 'Netzwerkfehler - Bitte überprüfe deine Verbindung',
  timeout: 'Die Anfrage hat zu lange gedauert',
  notFound: 'Nicht gefunden',
  unauthorized: 'Nicht autorisiert',
  chat: {
    createSession: 'Konnte keine neue Chat-Session erstellen',
    sendMessage: 'Nachricht fehlgeschlagen',
    loadHistory: 'Chat-Verlauf konnte nicht geladen werden',
  },
  idea: {
    delete: 'Löschen fehlgeschlagen',
    archive: 'Archivieren fehlgeschlagen',
    restore: 'Wiederherstellen fehlgeschlagen',
    save: 'Speichern fehlgeschlagen',
  },
  search: {
    failed: 'Suche fehlgeschlagen',
    noResults: 'Keine Ergebnisse gefunden',
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
