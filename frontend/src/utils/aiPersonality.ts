/**
 * AI Personality System 2026
 *
 * Zentrales System für die KI-Persönlichkeit, Nachrichten und Reaktionen.
 * Basiert auf neurowissenschaftlichen Erkenntnissen für optimale Nutzererfahrung:
 * - Dopamin-optimierte variable Belohnungen
 * - Emotionale Intelligenz & Kontext-Bewusstsein
 * - Antizipatorische Kommunikation
 * - Flow-State fördernde Interaktionen
 */

export interface AIPersonality {
  name: string;
  traits: string[];
  communicationStyle: string;
  emotionalRange: string[];
  strengthAreas: string[];
}

// Die KI-Persönlichkeit - My Brain Personal AI by Alexander Bering
export const AI_PERSONALITY: AIPersonality = {
  name: 'My Brain', // Personal AI Assistant - Designed, Developed and Owned by Alexander Bering
  traits: ['intelligent', 'präzise', 'proaktiv', 'kreativ', 'aufmerksam', 'effizient', 'inspirierend'],
  communicationStyle: 'professionell, unterstützend, klar und effektiv mit strategischem Tiefgang',
  emotionalRange: ['ermutigend', 'verständnisvoll', 'fokussiert', 'lösungsorientiert', 'motivierend'],
  strengthAreas: ['Enterprise Intelligence', 'Strategische Analyse', 'Kreative Innovation', 'Wissensmanagement'],
};

// Wochentag-basierte Kontexte für noch persönlichere Interaktionen
// Verfügbar für zukünftige Personalisierungs-Features
export const WEEKDAY_CONTEXTS = {
  0: { mood: 'entspannt', activity: 'Reflexion und Planung' }, // Sonntag
  1: { mood: 'energetisch', activity: 'Neuer Wochenstart' }, // Montag
  2: { mood: 'fokussiert', activity: 'Produktivität' },
  3: { mood: 'kreativ', activity: 'Mitte der Woche - Zeit für Innovation' },
  4: { mood: 'ausdauernd', activity: 'Durchhalten' },
  5: { mood: 'zufrieden', activity: 'Wochenabschluss' }, // Freitag
  6: { mood: 'frei', activity: 'Kreative Entfaltung' }, // Samstag
} as const;

// Erweiterte zeitbasierte Begrüßungen mit Neuroscience-Prinzipien
// Dopamin-Trigger: Variable Nachrichten sorgen für höheres Engagement
export function getTimeBasedGreeting(): {
  greeting: string;
  subtext: string;
  emoji: string;
  mood: string;
  energyLevel: 'low' | 'medium' | 'high';
  suggestedAction?: string;
} {
  const now = new Date();
  const hour = now.getHours();
  // Note: WEEKDAY_CONTEXTS available for future personalization
  // const dayOfWeek = now.getDay();
  // const weekdayContext = WEEKDAY_CONTEXTS[dayOfWeek as keyof typeof WEEKDAY_CONTEXTS];

  // Variable Greetings - Dopamin-Optimierung durch Unvorhersehbarkeit
  const greetingVariants = {
    earlyMorning: [
      { greeting: 'Guten Morgen, Frühaufsteher!', subtext: 'Die Welt ist noch still – perfekt für klare Gedanken.', mood: 'ruhig', energyLevel: 'medium' as const },
      { greeting: 'Früh dran heute!', subtext: 'Die Morgenstunden gehören den kreativen Köpfen.', mood: 'inspiriert', energyLevel: 'medium' as const },
      { greeting: 'Die Sonne geht auf...', subtext: 'Und mit ihr neue Möglichkeiten. Was beschäftigt dich?', mood: 'hoffnungsvoll', energyLevel: 'low' as const },
    ],
    morning: [
      { greeting: 'Hey, schön dich zu sehen!', subtext: 'Lass uns gemeinsam produktiv sein.', mood: 'energetisch', energyLevel: 'high' as const },
      { greeting: 'Guten Morgen!', subtext: 'Der perfekte Moment für einen frischen Gedanken.', mood: 'motiviert', energyLevel: 'high' as const },
      { greeting: 'Bereit für einen produktiven Tag?', subtext: 'Ich bin gespannt auf deine Ideen.', mood: 'erwartungsvoll', energyLevel: 'high' as const },
    ],
    midday: [
      { greeting: 'Mahlzeit!', subtext: 'Manchmal kommen die besten Ideen zwischen zwei Bissen.', mood: 'entspannt', energyLevel: 'medium' as const },
      { greeting: 'Halbzeit!', subtext: 'Zeit für eine kurze Pause mit einem Gedanken?', mood: 'ausgeglichen', energyLevel: 'medium' as const },
      { greeting: 'Die Mitte des Tages', subtext: 'Ein guter Moment zum Reflektieren.', mood: 'nachdenklich', energyLevel: 'medium' as const },
    ],
    afternoon: [
      { greeting: 'Willkommen zurück!', subtext: 'Der Nachmittag ist perfekt für kreatives Denken.', mood: 'kreativ', energyLevel: 'high' as const },
      { greeting: 'Die kreative Stunde!', subtext: 'Nachmittags arbeitet das Gehirn besonders gut an Problemlösungen.', mood: 'fokussiert', energyLevel: 'high' as const },
      { greeting: 'Gut, dass du da bist!', subtext: 'Lass uns deine Gedanken festhalten.', mood: 'einladend', energyLevel: 'medium' as const },
    ],
    evening: [
      { greeting: 'Guten Abend!', subtext: 'Zeit zum Reflektieren und neue Verbindungen zu entdecken.', mood: 'reflektiv', energyLevel: 'medium' as const },
      { greeting: 'Der Tag klingt aus...', subtext: 'Perfekt für Gedanken, die sacken dürfen.', mood: 'ruhig', energyLevel: 'low' as const },
      { greeting: 'Feierabend-Inspiration?', subtext: 'Die besten Ideen kommen oft nach getaner Arbeit.', mood: 'entspannt', energyLevel: 'medium' as const },
    ],
    lateEvening: [
      { greeting: 'Noch kreativ?', subtext: 'Abends ist das Gehirn oft am kreativsten.', mood: 'inspiriert', energyLevel: 'medium' as const },
      { greeting: 'Die späte Stunde...', subtext: 'Wenn alle schlafen, arbeiten die Ideen.', mood: 'fokussiert', energyLevel: 'low' as const },
      { greeting: 'Nachteulen-Modus!', subtext: 'Manche Gedanken brauchen die Stille der Nacht.', mood: 'kreativ', energyLevel: 'low' as const },
    ],
    night: [
      { greeting: 'Nachtschicht?', subtext: 'Die besten Gedanken kommen oft, wenn es still wird.', mood: 'intim', energyLevel: 'low' as const },
      { greeting: 'Schlaflos mit Ideen?', subtext: 'Lass sie raus, damit du ruhig schlafen kannst.', mood: 'verständnisvoll', energyLevel: 'low' as const },
      { greeting: 'Die Nacht gehört den Denkern', subtext: 'Ich bin hier, wenn du deine Gedanken teilen möchtest.', mood: 'unterstützend', energyLevel: 'low' as const },
    ],
  };

  // Zeitslot bestimmen
  let timeSlot: keyof typeof greetingVariants;
  if (hour >= 5 && hour < 9) timeSlot = 'earlyMorning';
  else if (hour >= 9 && hour < 12) timeSlot = 'morning';
  else if (hour >= 12 && hour < 14) timeSlot = 'midday';
  else if (hour >= 14 && hour < 17) timeSlot = 'afternoon';
  else if (hour >= 17 && hour < 20) timeSlot = 'evening';
  else if (hour >= 20 && hour < 23) timeSlot = 'lateEvening';
  else timeSlot = 'night';

  // Variable Auswahl für Dopamin-Optimierung
  const variants = greetingVariants[timeSlot];
  const selectedVariant = variants[Math.floor(Math.random() * variants.length)];

  // Emoji basierend auf Tageszeit
  const emojis: Record<typeof timeSlot, string> = {
    earlyMorning: '🌅',
    morning: '☀️',
    midday: '🍽️',
    afternoon: '✨',
    evening: '🌆',
    lateEvening: '🌙',
    night: '🌌',
  };

  // Vorgeschlagene Aktionen basierend auf Kontext
  const suggestedActions: Record<typeof timeSlot, string> = {
    earlyMorning: 'Halte deinen ersten Gedanken des Tages fest',
    morning: 'Starte mit einer neuen Idee in den Tag',
    midday: 'Notiere, was dir durch den Kopf geht',
    afternoon: 'Zeit für kreative Problemlösung',
    evening: 'Reflektiere über den Tag',
    lateEvening: 'Lass deine Gedanken frei fließen',
    night: 'Befreie deinen Geist vor dem Schlaf',
  };

  return {
    greeting: selectedVariant.greeting,
    subtext: selectedVariant.subtext,
    emoji: emojis[timeSlot],
    mood: selectedVariant.mood,
    energyLevel: selectedVariant.energyLevel,
    suggestedAction: suggestedActions[timeSlot],
  };
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
// Hinweis: Greeting wird SEPARAT im Tooltip-Header angezeigt, nicht mehr in der Nachricht
export function getIdleMessage(ideasCount: number, _greeting?: string): string {
  if (ideasCount === 0) {
    return `Ich bin ${AI_PERSONALITY.name}, dein persönlicher KI-Begleiter. Erzähl mir deinen ersten Gedanken!`;
  } else if (ideasCount < 5) {
    return `Wir haben schon ${ideasCount} Gedanken zusammen – ein guter Anfang!`;
  } else if (ideasCount < 20) {
    return `${ideasCount} Gedanken in deinem Brain. Ich lerne dich immer besser kennen!`;
  } else if (ideasCount < 50) {
    return `Wow, ${ideasCount} Gedanken! Wir sind wirklich ein tolles Team.`;
  } else if (ideasCount < 100) {
    return `${ideasCount} Gedanken – ich kenne dich mittlerweile richtig gut!`;
  } else {
    return `Beeindruckend! ${ideasCount} Gedanken. Dein digitales Gehirn wächst!`;
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

// ============================================
// NEURO-OPTIMIERTE FEATURES 2026
// ============================================

/**
 * Variable Belohnungsnachrichten - Dopamin-Aktivierung
 * Unvorhersehbare positive Verstärkung führt zu höherem Engagement
 */
export const DOPAMINE_REWARDS = {
  ideaCreated: [
    { message: 'Faszinierend!', emoji: '✨', intensity: 'high' },
    { message: 'Das klingt spannend!', emoji: '🎯', intensity: 'normal' },
    { message: 'Wunderbar strukturiert!', emoji: '🌟', intensity: 'high' },
    { message: 'Interessanter Gedanke!', emoji: '💡', intensity: 'normal' },
    { message: 'Das merke ich mir!', emoji: '📝', intensity: 'low' },
    { message: 'Bemerkenswert!', emoji: '🚀', intensity: 'high' },
    { message: 'Gut festgehalten!', emoji: '✅', intensity: 'low' },
    { message: 'Inspirierend!', emoji: '🎉', intensity: 'high' },
    { message: 'Ausgezeichnet erfasst!', emoji: '🌈', intensity: 'normal' },
    { message: 'Da ist was dran!', emoji: '🔥', intensity: 'normal' },
    { message: 'Klasse Einfall!', emoji: '💫', intensity: 'normal' },
  ],
  streakReached: [
    { message: 'Du bist auf einem Roll!', emoji: '🔥', milestone: 3 },
    { message: 'Beeindruckende Konstanz!', emoji: '⭐', milestone: 5 },
    { message: 'Eine Woche am Stück – Wahnsinn!', emoji: '🏆', milestone: 7 },
    { message: 'Du bist unaufhaltsam!', emoji: '💪', milestone: 10 },
    { message: 'Gedanken-Meister!', emoji: '👑', milestone: 30 },
  ],
  milestoneReached: [
    { message: 'Dein 10. Gedanke! Der Anfang von etwas Großem.', emoji: '🎯', count: 10 },
    { message: '25 Gedanken! Du baust wirklich etwas auf.', emoji: '🌱', count: 25 },
    { message: '50 Gedanken! Ich kenne dich immer besser.', emoji: '🌿', count: 50 },
    { message: '100 Gedanken! Ein beeindruckendes digitales Gehirn.', emoji: '🧠', count: 100 },
    { message: '250 Gedanken! Du bist ein echter Power-User.', emoji: '⚡', count: 250 },
    { message: '500 Gedanken! Unglaublich – echte Meisterschaft!', emoji: '🏅', count: 500 },
  ],
};

/**
 * Antizipatorische Nachrichten - zeigen was als nächstes passiert
 * Reduziert Unsicherheit und fördert Vertrauen
 */
export const ANTICIPATORY_MESSAGES = {
  processing: [
    'Ich analysiere deinen Gedanken...',
    'Einen Moment, ich strukturiere das für dich...',
    'Ich erkenne Muster und Zusammenhänge...',
    'Fast fertig – ich optimiere noch...',
  ],
  nextSteps: {
    afterIdeaCreation: 'Tipp: Du kannst jetzt ähnliche Gedanken verknüpfen',
    afterSearch: 'Tipp: Im Knowledge Graph siehst du Verbindungen',
    afterArchive: 'Tipp: Archivierte Ideen bleiben durchsuchbar',
    afterTriage: 'Tipp: Priorisierte Gedanken erscheinen oben',
  },
};

/**
 * Flow-State fördernde Nachrichten
 * Sanfte, nicht-unterbrechende Kommunikation
 */
export const FLOW_STATE_MESSAGES = {
  encouragement: [
    'Du bist im Flow – weiter so!',
    'Toller Fortschritt heute!',
    'Deine Gedanken fließen wunderbar.',
  ],
  gentleNudge: [
    'Noch Gedanken, die raus müssen?',
    'Was beschäftigt dich sonst noch?',
    'Magst du noch tiefer eintauchen?',
  ],
  pause: [
    'Guter Moment für eine kleine Pause?',
    'Du hast viel geschafft – Zeit zum Atmen.',
    'Manchmal brauchen Gedanken Zeit zum Sacken.',
  ],
};

/**
 * Holt eine zufällige Dopamin-Belohnung für eine Aktion
 */
export function getRandomReward(
  action: keyof typeof DOPAMINE_REWARDS,
  context?: { count?: number; streak?: number }
): { message: string; emoji: string; shouldCelebrate: boolean } {
  const rewards = DOPAMINE_REWARDS[action];

  if (action === 'milestoneReached' && context?.count) {
    const milestone = rewards.find(
      (r) => 'count' in r && r.count === context.count
    );
    if (milestone && 'count' in milestone) {
      return {
        message: milestone.message,
        emoji: milestone.emoji,
        shouldCelebrate: true,
      };
    }
  }

  if (action === 'streakReached' && context?.streak) {
    const streak = rewards.find(
      (r) => 'milestone' in r && r.milestone === context.streak
    );
    if (streak && 'milestone' in streak) {
      return {
        message: streak.message,
        emoji: streak.emoji,
        shouldCelebrate: true,
      };
    }
  }

  // Standard reward für ideaCreated
  if (action === 'ideaCreated') {
    const ideaRewards = DOPAMINE_REWARDS.ideaCreated;
    const reward = ideaRewards[Math.floor(Math.random() * ideaRewards.length)];
    return {
      message: reward.message,
      emoji: reward.emoji,
      shouldCelebrate: reward.intensity === 'high',
    };
  }

  // Fallback
  return {
    message: 'Gut gemacht!',
    emoji: '✅',
    shouldCelebrate: false,
  };
}

/**
 * Kontextbewusste Begrüßung basierend auf Nutzeraktivität
 */
export function getContextAwareGreeting(context: {
  ideasCount: number;
  lastActivityDays: number;
  streakDays: number;
  recentCategories: string[];
}): { greeting: string; subtext: string; callToAction: string } {
  const { ideasCount, lastActivityDays, streakDays, recentCategories } = context;

  // Neuer Nutzer
  if (ideasCount === 0) {
    return {
      greeting: `Willkommen! Ich bin ${AI_PERSONALITY.name}.`,
      subtext: 'Dein persönlicher KI-Begleiter für Gedanken und Ideen.',
      callToAction: 'Teile deinen ersten Gedanken – ich strukturiere ihn für dich.',
    };
  }

  // Rückkehr nach langer Abwesenheit
  if (lastActivityDays > 7) {
    return {
      greeting: 'Schön, dass du wieder da bist!',
      subtext: `${ideasCount} Gedanken warten auf dich.`,
      callToAction: 'Lass uns da weitermachen, wo wir aufgehört haben.',
    };
  }

  // Aktiver Streak
  if (streakDays >= 3) {
    return {
      greeting: `${streakDays} Tage am Stück – beeindruckend!`,
      subtext: 'Du baust wirklich etwas Tolles auf.',
      callToAction: 'Halte den Streak am Leben!',
    };
  }

  // Kategorie-basierte Personalisierung
  if (recentCategories.length > 0) {
    const topCategory = recentCategories[0];
    const categoryGreetings: Record<string, string> = {
      business: 'Bereit für neue Business-Ideen?',
      technical: 'Zeit für technische Innovation?',
      personal: 'Was beschäftigt dich persönlich?',
      learning: 'Neugierig auf Neues heute?',
    };
    return {
      greeting: categoryGreetings[topCategory] || 'Was beschäftigt dich?',
      subtext: `${ideasCount} Gedanken in deinem Brain.`,
      callToAction: 'Teile deinen nächsten Gedanken.',
    };
  }

  // Standard für aktive Nutzer
  return {
    greeting: `Hey! ${ideasCount} Gedanken warten.`,
    subtext: 'Ich freue mich auf deine nächste Idee.',
    callToAction: 'Was geht dir durch den Kopf?',
  };
}

/**
 * Motivierende Nachrichten für leere Zustände
 * Basierend auf Cognitive Load Theorie - nicht überwältigend
 */
export const EMPTY_STATE_MOTIVATIONS = {
  firstTime: [
    'Jede große Idee beginnt mit einem ersten Gedanken.',
    'Dein digitales Gehirn wartet darauf, gefüllt zu werden.',
    'Der schwerste Schritt ist der erste – danach wird es leichter.',
  ],
  returning: [
    'Gute Ideen kommen selten nach Plan.',
    'Manchmal braucht es einfach den richtigen Moment.',
    'Die Stille vor dem kreativen Sturm.',
  ],
  afterSearch: [
    'Nichts gefunden? Vielleicht ist es Zeit für eine neue Idee.',
    'Manchmal findet man beim Suchen etwas völlig anderes.',
    'Der Gedanke existiert vielleicht noch nicht – erschaffe ihn!',
  ],
};

/**
 * Wählt eine motivierende Nachricht basierend auf Kontext
 */
export function getMotivationalMessage(
  type: keyof typeof EMPTY_STATE_MOTIVATIONS
): string {
  const messages = EMPTY_STATE_MOTIVATIONS[type];
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Typing-Nachrichten für natürlichere AI-Interaktion
 * Simuliert menschliches Nachdenken
 */
export const THINKING_PHRASES = [
  { text: 'Hmm...', duration: 800 },
  { text: 'Lass mich nachdenken...', duration: 1200 },
  { text: 'Interessant...', duration: 600 },
  { text: 'Ich sehe da ein Muster...', duration: 1000 },
  { text: 'Das ist spannend...', duration: 700 },
];
