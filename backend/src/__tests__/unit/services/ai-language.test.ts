import {
  detectLanguage,
  getLanguageInstruction,
  getLanguageSystemPrompt,
  getLanguageName,
  isValidLanguage,
  getSystemPromptLanguageSuffix,
} from '../../../services/ai-language';

describe('AI Language Service', () => {
  describe('detectLanguage', () => {
    test('detects German text', () => {
      expect(
        detectLanguage('Ich möchte eine neue Idee erstellen und sie mit meinem Team teilen')
      ).toBe('de');
    });

    test('detects English text', () => {
      expect(
        detectLanguage('I want to create a new idea and share it with my team')
      ).toBe('en');
    });

    test('detects French text', () => {
      expect(
        detectLanguage('Je voudrais créer une nouvelle idée et la partager avec mon équipe')
      ).toBe('fr');
    });

    test('detects Spanish text', () => {
      expect(
        detectLanguage('Quiero crear una nueva idea y compartirla con mi equipo')
      ).toBe('es');
    });

    test('defaults to German for ambiguous text', () => {
      expect(detectLanguage('AI')).toBe('de');
    });

    test('defaults to German for empty text', () => {
      expect(detectLanguage('')).toBe('de');
    });

    test('detects German with common phrases', () => {
      expect(detectLanguage('Können wir das bitte noch einmal besprechen?')).toBe('de');
    });

    test('detects English with common phrases', () => {
      expect(detectLanguage('Could you please help me with this task?')).toBe('en');
    });

    test('detects French with common phrases', () => {
      expect(detectLanguage('Est-ce que vous pourriez nous aider avec cette tâche?')).toBe('fr');
    });

    test('detects Spanish with common phrases', () => {
      expect(detectLanguage('¿Podrían ayudarnos con esta tarea por favor?')).toBe('es');
    });
  });

  describe('getLanguageInstruction', () => {
    test('returns correct instruction for each language', () => {
      expect(getLanguageInstruction('de')).toBe('Antworte auf Deutsch.');
      expect(getLanguageInstruction('en')).toBe('Respond in English.');
      expect(getLanguageInstruction('fr')).toBe('Réponds en français.');
      expect(getLanguageInstruction('es')).toBe('Responde en español.');
    });
  });

  describe('getLanguageSystemPrompt', () => {
    test('returns correct prompts', () => {
      expect(getLanguageSystemPrompt('de')).toContain('Deutsch');
      expect(getLanguageSystemPrompt('en')).toContain('English');
      expect(getLanguageSystemPrompt('fr')).toContain('français');
      expect(getLanguageSystemPrompt('es')).toContain('español');
    });

    test('prompts include professionalism instruction', () => {
      expect(getLanguageSystemPrompt('en')).toContain('professional');
      expect(getLanguageSystemPrompt('de')).toContain('professionelle');
    });
  });

  describe('getLanguageName', () => {
    test('returns English names for all languages', () => {
      expect(getLanguageName('de')).toBe('German');
      expect(getLanguageName('en')).toBe('English');
      expect(getLanguageName('fr')).toBe('French');
      expect(getLanguageName('es')).toBe('Spanish');
    });
  });

  describe('isValidLanguage', () => {
    test('validates supported languages', () => {
      expect(isValidLanguage('de')).toBe(true);
      expect(isValidLanguage('en')).toBe(true);
      expect(isValidLanguage('fr')).toBe(true);
      expect(isValidLanguage('es')).toBe(true);
    });

    test('rejects unsupported languages', () => {
      expect(isValidLanguage('xx')).toBe(false);
      expect(isValidLanguage('jp')).toBe(false);
      expect(isValidLanguage('')).toBe(false);
      expect(isValidLanguage('DE')).toBe(false);
    });
  });

  describe('getSystemPromptLanguageSuffix', () => {
    test('uses preferred language when provided', () => {
      expect(getSystemPromptLanguageSuffix('hello', 'fr')).toBe('Réponds en français.');
    });

    test('uses preferred language even when message is different language', () => {
      expect(getSystemPromptLanguageSuffix('Ich möchte etwas wissen', 'en')).toBe(
        'Respond in English.'
      );
    });

    test('detects language from message when no preferred', () => {
      expect(
        getSystemPromptLanguageSuffix('I would like to know more about this feature')
      ).toBe('Respond in English.');
    });

    test('detects German from message when no preferred', () => {
      expect(
        getSystemPromptLanguageSuffix('Ich möchte mehr über diese Funktion erfahren')
      ).toBe('Antworte auf Deutsch.');
    });
  });
});
