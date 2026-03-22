/**
 * Phase 138: Style Learner Tests
 */

import {
  detectFormality,
  detectTechnicality,
  detectVerbosity,
  detectLanguage,
  buildStyleProfile,
  recommendStyle,
  StyleProfile,
} from '../../../../services/adaptive/style-learner';

// ===========================================
// Tests: detectFormality
// ===========================================

describe('detectFormality', () => {
  it('returns 0.5 for empty string', () => {
    expect(detectFormality('')).toBe(0.5);
  });

  it('returns 0.5 for whitespace-only', () => {
    expect(detectFormality('   ')).toBe(0.5);
  });

  it('returns high score for formal text', () => {
    const text = 'Sehr geehrte Damen und Herren, bitte senden Sie mir die Unterlagen.';
    const score = detectFormality(text);
    expect(score).toBeGreaterThan(0.6);
  });

  it('returns low score for casual text', () => {
    const text = 'hey cool lol das ist nice';
    const score = detectFormality(text);
    expect(score).toBeLessThan(0.3);
  });

  it('returns ~0.5 for neutral text', () => {
    const text = 'Ich habe heute einen Kuchen gebacken.';
    const score = detectFormality(text);
    expect(score).toBe(0.5); // no formal or casual indicators
  });

  it('handles mixed formal and casual', () => {
    const text = 'Dear Sir, lol that was cool';
    const score = detectFormality(text);
    expect(score).toBeGreaterThan(0.2);
    expect(score).toBeLessThan(0.8);
  });

  it('detects multi-word formal indicators', () => {
    const text = 'Mit freundlichen Grüßen, Max Mustermann';
    const score = detectFormality(text);
    expect(score).toBeGreaterThan(0.5);
  });
});

// ===========================================
// Tests: detectTechnicality
// ===========================================

describe('detectTechnicality', () => {
  it('returns 0 for empty string', () => {
    expect(detectTechnicality('')).toBe(0);
  });

  it('returns high score for technical text', () => {
    const text = 'The API endpoint uses a GraphQL schema with TypeScript interfaces and async middleware.';
    const score = detectTechnicality(text);
    expect(score).toBeGreaterThan(0.3);
  });

  it('returns low score for non-technical text', () => {
    const text = 'Today the weather was nice and I went for a walk in the park.';
    const score = detectTechnicality(text);
    expect(score).toBe(0);
  });

  it('handles mixed content', () => {
    const text = 'I set up the container yesterday and went home. The weather was nice and warm outside and everyone enjoyed the beautiful sunset in the garden.';
    const score = detectTechnicality(text);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(0.5);
  });

  it('caps at 1.0', () => {
    const text = 'api function algorithm interface database class endpoint schema';
    const score = detectTechnicality(text);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ===========================================
// Tests: detectVerbosity
// ===========================================

describe('detectVerbosity', () => {
  it('returns 0 for zero or negative', () => {
    expect(detectVerbosity(0)).toBe(0);
    expect(detectVerbosity(-5)).toBe(0);
  });

  it('returns 0.2 for short messages (< 20 words)', () => {
    expect(detectVerbosity(5)).toBe(0.2);
    expect(detectVerbosity(19)).toBe(0.2);
  });

  it('returns 0.8 for long messages (> 80 words)', () => {
    expect(detectVerbosity(100)).toBe(0.8);
    expect(detectVerbosity(200)).toBe(0.8);
  });

  it('returns 0.5 for medium messages (50 words)', () => {
    expect(detectVerbosity(50)).toBe(0.5);
  });

  it('returns 0.2 at boundary 20', () => {
    expect(detectVerbosity(20)).toBeCloseTo(0.2, 5);
  });

  it('returns 0.8 at boundary 80', () => {
    expect(detectVerbosity(80)).toBeCloseTo(0.8, 5);
  });

  it('interpolates linearly between 20 and 80', () => {
    // 50 words → 0.2 + (30/60)*0.6 = 0.2 + 0.3 = 0.5
    expect(detectVerbosity(50)).toBeCloseTo(0.5, 5);
  });
});

// ===========================================
// Tests: detectLanguage
// ===========================================

describe('detectLanguage', () => {
  it('returns en for empty array', () => {
    expect(detectLanguage([])).toBe('en');
  });

  it('detects German text', () => {
    const texts = ['Ich bin der Meinung, dass die Arbeit nicht einfach ist.'];
    expect(detectLanguage(texts)).toBe('de');
  });

  it('detects English text', () => {
    const texts = ['The system is designed to handle the data for analysis.'];
    expect(detectLanguage(texts)).toBe('en');
  });

  it('detects mixed language', () => {
    const texts = [
      'Das ist ein gutes Design.',
      'The implementation is working well.',
    ];
    expect(detectLanguage(texts)).toBe('mixed');
  });

  it('returns en when no indicators found', () => {
    const texts = ['xyz abc 123 qqq zzz'];
    expect(detectLanguage(texts)).toBe('en');
  });

  it('handles multiple German messages', () => {
    const texts = [
      'Ich und die haben das nicht gemacht.',
      'Das ist auch ein Problem für den Kunden.',
    ];
    expect(detectLanguage(texts)).toBe('de');
  });
});

// ===========================================
// Tests: buildStyleProfile
// ===========================================

describe('buildStyleProfile', () => {
  it('returns defaults for empty messages', () => {
    const profile = buildStyleProfile([]);
    expect(profile.formality).toBe(0.5);
    expect(profile.technicality).toBe(0);
    expect(profile.verbosity).toBe(0);
    expect(profile.language).toBe('en');
  });

  it('returns defaults for messages with empty text', () => {
    const profile = buildStyleProfile([{ text: '' }, { text: '' }]);
    expect(profile.formality).toBe(0.5);
  });

  it('builds profile from formal technical German messages', () => {
    const messages = [
      { text: 'Sehr geehrte Damen, bitte prüfen Sie die API Endpunkte und das Schema.' },
      { text: 'Bezüglich der Deployment Pipeline und dem Docker Container.' },
    ];
    const profile = buildStyleProfile(messages);
    expect(profile.formality).toBeGreaterThan(0.5);
    expect(profile.technicality).toBeGreaterThan(0);
    expect(profile.language).toBe('de');
  });

  it('builds profile from casual English messages', () => {
    const messages = [
      { text: 'hey cool thanks' },
      { text: 'lol nice one' },
    ];
    const profile = buildStyleProfile(messages);
    expect(profile.formality).toBeLessThan(0.3);
    expect(profile.language).toBe('en');
  });

  it('computes verbosity from average word count', () => {
    // Each message ~10 words → avg ~10 → verbosity 0.2
    const messages = [
      { text: 'one two three four five six seven eight nine ten' },
      { text: 'one two three four five six seven eight nine ten' },
    ];
    const profile = buildStyleProfile(messages);
    expect(profile.verbosity).toBe(0.2);
  });
});

// ===========================================
// Tests: recommendStyle
// ===========================================

describe('recommendStyle', () => {
  it('recommends formal tone for high formality', () => {
    const profile: StyleProfile = { formality: 0.8, technicality: 0.2, verbosity: 0.5, language: 'de' };
    const rec = recommendStyle(profile);
    expect(rec.tone).toBe('formal');
    expect(rec.language).toBe('de');
  });

  it('recommends casual tone for low formality', () => {
    const profile: StyleProfile = { formality: 0.2, technicality: 0, verbosity: 0.3, language: 'en' };
    const rec = recommendStyle(profile);
    expect(rec.tone).toBe('casual');
  });

  it('recommends neutral tone for mid formality', () => {
    const profile: StyleProfile = { formality: 0.5, technicality: 0, verbosity: 0.5, language: 'en' };
    const rec = recommendStyle(profile);
    expect(rec.tone).toBe('neutral');
  });

  it('recommends technical vocabulary for high technicality', () => {
    const profile: StyleProfile = { formality: 0.5, technicality: 0.7, verbosity: 0.5, language: 'en' };
    const rec = recommendStyle(profile);
    expect(rec.vocabulary).toBe('technical');
    expect(rec.codeExamples).toBe('include');
  });

  it('recommends simple vocabulary for low technicality', () => {
    const profile: StyleProfile = { formality: 0.5, technicality: 0.2, verbosity: 0.5, language: 'en' };
    const rec = recommendStyle(profile);
    expect(rec.vocabulary).toBe('simple');
    expect(rec.codeExamples).toBe('minimal');
  });

  it('recommends detailed responses for high verbosity', () => {
    const profile: StyleProfile = { formality: 0.5, technicality: 0, verbosity: 0.8, language: 'en' };
    const rec = recommendStyle(profile);
    expect(rec.responseLength).toBe('detailed');
  });

  it('recommends concise responses for low verbosity', () => {
    const profile: StyleProfile = { formality: 0.5, technicality: 0, verbosity: 0.2, language: 'en' };
    const rec = recommendStyle(profile);
    expect(rec.responseLength).toBe('concise');
  });

  it('includes language in recommendations', () => {
    const profile: StyleProfile = { formality: 0.5, technicality: 0, verbosity: 0.5, language: 'mixed' };
    const rec = recommendStyle(profile);
    expect(rec.language).toBe('mixed');
  });
});
