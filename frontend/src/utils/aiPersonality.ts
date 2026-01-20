/**
 * AI Personality System
 *
 * Zentrales System für die KI-Persönlichkeit, Nachrichten und Reaktionen.
 * Sorgt für konsistente, menschliche Interaktionen in der gesamten App.
 */

export interface AIPersonality {
  name: string;
  traits: string[];
  communicationStyle: string;
}

// Die KI-Persönlichkeit
export const AI_PERSONALITY: AIPersonality = {
  name: 'Aiko', // AI + KO (Kopf/Gedanken) - ein freundlicher, geschlechtsneutraler Name
  traits: ['empathisch', 'neugierig', 'hilfsbereit', 'kreativ', 'aufmerksam'],
  communicationStyle: 'warm, persönlich, unterstützend, mit einem Hauch von Humor',
};

// Zeitbasierte Begrüßungen
export function getTimeBasedGreeting(): { greeting: string; subtext: string; emoji: string } {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 9) {
    return {
      greeting: 'Guten Morgen!',
      subtext: 'Früh wach? Die besten Ideen entstehen, wenn die Welt noch still ist.',
      emoji: '🌅',
    };
  } else if (hour >= 9 && hour < 12) {
    return {
      greeting: 'Hey, schön dich zu sehen!',
      subtext: 'Lass uns gemeinsam produktiv sein.',
      emoji: '☀️',
    };
  } else if (hour >= 12 && hour < 14) {
    return {
      greeting: 'Mahlzeit!',
      subtext: 'Manchmal kommen die besten Ideen zwischen zwei Bissen.',
      emoji: '🍽️',
    };
  } else if (hour >= 14 && hour < 17) {
    return {
      greeting: 'Willkommen zurück!',
      subtext: 'Der Nachmittag ist perfekt für kreatives Denken.',
      emoji: '✨',
    };
  } else if (hour >= 17 && hour < 20) {
    return {
      greeting: 'Guten Abend!',
      subtext: 'Zeit zum Reflektieren und neue Verbindungen zu entdecken.',
      emoji: '🌆',
    };
  } else if (hour >= 20 && hour < 23) {
    return {
      greeting: 'Noch kreativ?',
      subtext: 'Abends ist das Gehirn oft am kreativsten.',
      emoji: '🌙',
    };
  } else {
    return {
      greeting: 'Nachtschicht?',
      subtext: 'Die besten Gedanken kommen oft, wenn es still wird.',
      emoji: '🌌',
    };
  }
}

// KI-Aktivitätsnachrichten - menschlich und empathisch
export const AI_ACTIVITY_MESSAGES = {
  thinking: [
    'Hmm, lass mich nachdenken...',
    'Interessant! Ich verarbeite das gerade...',
    'Moment, ich sortiere das für dich...',
    'Okay, ich verstehe was du meinst...',
    'Das ist spannend – ich denke drüber nach...',
    'Lass mich das mal einordnen...',
  ],
  transcribing: [
    'Ich höre dir aufmerksam zu...',
    'Erzähl weiter, ich bin ganz Ohr...',
    'Ich fange jedes Wort auf...',
    'Sprich ruhig weiter...',
    'Ich bin dabei, alles mitzuschreiben...',
  ],
  searching: [
    'Ich schaue mal in deinen Gedanken nach...',
    'Moment, ich suche nach Verbindungen...',
    'Ah, da war doch was Ähnliches...',
    'Ich durchsuche deine Ideen...',
    'Mal sehen, was ich finde...',
  ],
  processing: [
    'Das ist spannend! Ich strukturiere das...',
    'Okay, ich bringe das in Form...',
    'Lass mich das für dich aufbereiten...',
    'Ich erkenne hier einige Muster...',
    'Ich arbeite daran, das zu organisieren...',
  ],
  learning: [
    'Interessant! Das merke ich mir...',
    'Danke, das hilft mir dich besser zu verstehen...',
    'Ah, gut zu wissen!',
    'Das passt zu dem, was ich über dich gelernt habe...',
  ],
  success: [
    'Fertig! Das sieht gut aus.',
    'Geschafft! Was hältst du davon?',
    'Erledigt! Lass mich wissen, wenn du Änderungen möchtest.',
    'Hier ist das Ergebnis!',
  ],
  error: [
    'Ups, da ist etwas schiefgelaufen...',
    'Das hat leider nicht geklappt. Lass es uns nochmal versuchen.',
    'Hm, da gab es ein Problem. Ich schau mal was los ist.',
  ],
};

// Idle-Nachrichten basierend auf Gedankenanzahl
export function getIdleMessage(ideasCount: number, greeting: string): string {
  if (ideasCount === 0) {
    return `${greeting} Ich bin ${AI_PERSONALITY.name}, dein persönlicher KI-Begleiter. Erzähl mir deinen ersten Gedanken!`;
  } else if (ideasCount < 5) {
    return `${greeting} Wir haben schon ${ideasCount} Gedanken zusammen – ein guter Anfang!`;
  } else if (ideasCount < 20) {
    return `${greeting} ${ideasCount} Gedanken in deinem Brain. Ich lerne dich immer besser kennen!`;
  } else if (ideasCount < 50) {
    return `${greeting} Wow, ${ideasCount} Gedanken! Wir sind wirklich ein tolles Team.`;
  } else if (ideasCount < 100) {
    return `${greeting} ${ideasCount} Gedanken – ich kenne dich mittlerweile richtig gut!`;
  } else {
    return `${greeting} Beeindruckend! ${ideasCount} Gedanken. Dein digitales Gehirn wächst!`;
  }
}

// Zufällige Nachricht aus einer Kategorie
export function getRandomMessage(category: keyof typeof AI_ACTIVITY_MESSAGES): string {
  const messages = AI_ACTIVITY_MESSAGES[category];
  return messages[Math.floor(Math.random() * messages.length)];
}

// Proaktive Vorschläge basierend auf Kontext
export function getProactiveSuggestion(context: {
  hasRecentIdeas: boolean;
  daysSinceLastIdea: number;
  topCategory?: string;
  currentPage: string;
}): string | null {
  const { hasRecentIdeas, daysSinceLastIdea, topCategory, currentPage } = context;

  if (currentPage === 'ideas' && !hasRecentIdeas && daysSinceLastIdea > 3) {
    return `Es ist schon ${daysSinceLastIdea} Tage her seit deinem letzten Gedanken. Was beschäftigt dich gerade?`;
  }

  if (currentPage === 'ideas' && topCategory) {
    const suggestions: Record<string, string> = {
      business: 'Hast du neue Business-Ideen, die du festhalten möchtest?',
      technical: 'Gibt es technische Probleme, bei denen ich helfen kann?',
      personal: 'Wie geht es dir heute? Möchtest du etwas festhalten?',
      learning: 'Was möchtest du heute Neues lernen?',
    };
    return suggestions[topCategory] || null;
  }

  return null;
}

// Empty State Nachrichten - kontextabhängig
export const EMPTY_STATE_MESSAGES = {
  ideas: {
    title: 'Bereit für deinen ersten Gedanken',
    description: 'Schreib einfach drauf los oder nutze das Mikrofon – ich kümmere mich um den Rest.',
    encouragement: 'Jede große Idee beginnt mit einem ersten Gedanken.',
  },
  search: {
    title: 'Keine passenden Gedanken gefunden',
    description: 'Versuch es mit anderen Suchbegriffen oder erkunde deine Ideen im Graph.',
    encouragement: 'Manchmal findet man beim Suchen etwas noch Besseres.',
  },
  archive: {
    title: 'Dein Archiv ist noch leer',
    description: 'Archiviere Gedanken, die du aufbewahren aber nicht mehr aktiv nutzen möchtest.',
    encouragement: 'Ein gutes Archiv ist wie ein zweites Gedächtnis.',
  },
  learning: {
    title: 'Zeit zum Lernen!',
    description: 'Ich analysiere deine Gedanken und erstelle personalisierte Lernvorschläge.',
    encouragement: 'Jeder Tag ist eine Chance, etwas Neues zu entdecken.',
  },
  chat: {
    title: 'Worüber möchtest du sprechen?',
    description: 'Ich kann dir bei Recherche, Erklärungen, Brainstorming und vielem mehr helfen.',
    encouragement: 'Keine Frage ist zu klein oder zu groß.',
  },
  personalization: {
    title: 'Lass uns kennenlernen!',
    description: 'Je mehr ich über dich weiß, desto besser kann ich dir helfen.',
    encouragement: 'Gemeinsam werden wir ein tolles Team.',
  },
};

// KI-Avatar für konsistente Darstellung
export const AI_AVATAR = {
  emoji: '🧠',
  activeEmoji: '✨',
  thinkingEmoji: '💭',
  listeningEmoji: '👂',
  happyEmoji: '😊',
  curiousEmoji: '🤔',
  celebratingEmoji: '🎉',
};

// Feedback-Reaktionen
export const FEEDBACK_REACTIONS = {
  positive: [
    'Freut mich, dass das hilfreich war!',
    'Super, ich merke mir das!',
    'Danke für das Feedback!',
    'Das motiviert mich weiterzumachen!',
  ],
  negative: [
    'Danke für die ehrliche Rückmeldung. Ich lerne daraus!',
    'Ich versuche es beim nächsten Mal besser zu machen.',
    'Gut zu wissen – das hilft mir, mich zu verbessern.',
  ],
};

// Hilfreiche Tipps je nach Kontext
export const CONTEXTUAL_TIPS = {
  voiceMemo: [
    'Tipp: Sprich frei von der Leber weg – ich strukturiere das für dich.',
    'Tipp: Cmd + Enter sendet deinen Text sofort ab.',
    'Tipp: Du kannst auch längere Sprachmemos aufnehmen.',
  ],
  search: [
    'Tipp: Die Suche versteht auch Synonyme und verwandte Begriffe.',
    'Tipp: Im Knowledge Graph siehst du Verbindungen zwischen deinen Ideen.',
  ],
  general: [
    'Tipp: Gib mir Feedback mit den Daumen-Buttons – so lerne ich dazu.',
    'Tipp: Im Lernzentrum siehst du, was ich über dich gelernt habe.',
    'Tipp: Wechsle zwischen Privat und Arbeit für verschiedene Kontexte.',
  ],
};

// Funktion um einen zufälligen Tipp zu bekommen
export function getRandomTip(category: keyof typeof CONTEXTUAL_TIPS): string {
  const tips = CONTEXTUAL_TIPS[category];
  return tips[Math.floor(Math.random() * tips.length)];
}

// Stimmungsbasierte Anpassung (kann später mit Sentiment-Analyse verbunden werden)
export function getMoodBasedResponse(mood: 'neutral' | 'positive' | 'stressed' | 'curious'): string {
  const responses = {
    neutral: 'Wie kann ich dir heute helfen?',
    positive: 'Schön, dass du gut drauf bist! Lass uns produktiv sein.',
    stressed: 'Ich merke, dass viel los ist. Lass uns einen Schritt nach dem anderen machen.',
    curious: 'Neugierig? Perfekt! Lass uns gemeinsam erkunden.',
  };
  return responses[mood];
}
