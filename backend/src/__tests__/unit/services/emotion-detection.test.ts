/**
 * Phase 90: Emotion Detection, Voice Personas & Voice Commands Tests
 */

import {
  detectFromText,
  detectFromProsody,
  combineSignals,
  getAdaptiveResponseStyle,
} from '../../../services/voice/emotion-detection';
import type { EmotionResult } from '../../../services/voice/emotion-detection';
import { getPersona, getPersonaById, listPersonas, getPersonaPromptAddendum } from '../../../services/voice/voice-personas';
import { parseCommand } from '../../../services/voice/voice-commands';

// ============================================================
// Text-Based Emotion Detection
// ============================================================

describe('detectFromText', () => {
  it('should detect happy emotion from German keywords', () => {
    const result = detectFromText('Ich freue mich so sehr, das ist wunderbar!');
    expect(result.primary).toBe('happy');
    expect(result.valence).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0.4);
  });

  it('should detect happy emotion from English keywords', () => {
    const result = detectFromText('I am so happy and grateful, this is amazing!');
    expect(result.primary).toBe('happy');
    expect(result.valence).toBeGreaterThan(0);
  });

  it('should detect sad emotion from German keywords', () => {
    const result = detectFromText('Ich bin so traurig und einsam, alles ist hoffnungslos');
    expect(result.primary).toBe('sad');
    expect(result.valence).toBeLessThan(0);
  });

  it('should detect sad emotion from English keywords', () => {
    const result = detectFromText('I feel so sad and lonely, everything is hopeless');
    expect(result.primary).toBe('sad');
    expect(result.valence).toBeLessThan(0);
  });

  it('should detect stress from German keywords', () => {
    const result = detectFromText('Ich bin total gestresst, die Deadline ist morgen und ich bin ueberlastet');
    expect(result.primary).toBe('stressed');
    expect(result.arousal).toBeGreaterThan(0.5);
  });

  it('should detect stress from English keywords', () => {
    const result = detectFromText('I am so stressed and overwhelmed, the deadline is urgent');
    expect(result.primary).toBe('stressed');
    expect(result.arousal).toBeGreaterThan(0.5);
  });

  it('should detect excitement from German keywords', () => {
    const result = detectFromText('Das ist wahnsinn, ich bin so aufgeregt und gespannt!');
    expect(result.primary).toBe('excited');
    expect(result.energy).toBeGreaterThan(0.5);
  });

  it('should detect frustration from German keywords', () => {
    const result = detectFromText('Verdammt, das ist nervig und aergerlich, ich hasse das');
    expect(result.primary).toBe('frustrated');
    expect(result.valence).toBeLessThan(0);
  });

  it('should detect frustration from English keywords', () => {
    const result = detectFromText('This is so frustrating and annoying, I hate this stupid thing');
    expect(result.primary).toBe('frustrated');
    expect(result.valence).toBeLessThan(0);
  });

  it('should detect calm emotion from German keywords', () => {
    const result = detectFromText('Ich bin ganz ruhig und entspannt, alles ist friedlich');
    expect(result.primary).toBe('calm');
    expect(result.arousal).toBeLessThan(0.5);
  });

  it('should return neutral for text without emotional words', () => {
    const result = detectFromText('Die Besprechung ist um 14 Uhr im Konferenzraum');
    expect(result.primary).toBe('neutral');
  });

  it('should return neutral for empty text', () => {
    const result = detectFromText('');
    expect(result.primary).toBe('neutral');
    expect(result.confidence).toBe(0);
  });

  it('should return neutral for whitespace-only text', () => {
    const result = detectFromText('   ');
    expect(result.primary).toBe('neutral');
  });

  it('should boost arousal with exclamation marks', () => {
    const baseline = detectFromText('Ich freue mich');
    const excited = detectFromText('Ich freue mich!!!');
    expect(excited.arousal).toBeGreaterThan(baseline.arousal);
  });

  it('should boost energy with ALL CAPS words', () => {
    const baseline = detectFromText('das ist toll');
    const caps = detectFromText('das ist TOLL SUPER');
    expect(caps.energy).toBeGreaterThanOrEqual(baseline.energy);
  });
});

// ============================================================
// Prosody-Based Emotion Detection
// ============================================================

describe('detectFromProsody', () => {
  it('should detect high arousal and energy from high pitch + fast rate', () => {
    const result = detectFromProsody({
      speechRate: 200,   // very fast
      avgPitch: 250,     // high pitch
      pitchVariation: 60,
      volume: 0.8,
    });
    expect(result.arousal).toBeGreaterThan(0.6);
    expect(result.energy).toBeGreaterThan(0.6);
    // Prosody alone yields limited valence signal, so primary may vary
    expect(['excited', 'happy', 'neutral', 'stressed']).toContain(result.primary);
  });

  it('should detect calm/sad from low pitch + slow rate', () => {
    const result = detectFromProsody({
      speechRate: 80,    // very slow
      avgPitch: 100,     // low pitch
      pitchVariation: 10,
      volume: 0.2,
    });
    expect(result.arousal).toBeLessThan(0.5);
    expect(result.energy).toBeLessThan(0.5);
    expect(['calm', 'sad', 'neutral']).toContain(result.primary);
  });

  it('should return moderate values for average prosody', () => {
    const result = detectFromProsody({
      speechRate: 130,
      avgPitch: 170,
      pitchVariation: 30,
      volume: 0.5,
    });
    expect(result.arousal).toBeGreaterThan(0.3);
    expect(result.arousal).toBeLessThan(0.7);
    expect(result.confidence).toBeLessThan(0.6);
  });

  it('should handle missing prosody signals with defaults', () => {
    const result = detectFromProsody({});
    expect(result.primary).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should detect stress from high pause frequency', () => {
    const result = detectFromProsody({
      speechRate: 160,
      avgPitch: 200,
      pauseFrequency: 15, // many pauses
      volume: 0.7,
    });
    expect(result.valence).toBeLessThan(0.3);
  });

  it('should increase confidence with more extreme signals', () => {
    const mild = detectFromProsody({ speechRate: 140, avgPitch: 180 });
    const extreme = detectFromProsody({ speechRate: 220, avgPitch: 280, volume: 0.9 });
    expect(extreme.confidence).toBeGreaterThan(mild.confidence);
  });
});

// ============================================================
// Combined Signal Detection
// ============================================================

describe('combineSignals', () => {
  it('should weight prosody higher than text (0.6 vs 0.4)', () => {
    const textEmotion: EmotionResult = {
      primary: 'happy', confidence: 0.8, arousal: 0.3, valence: 0.5, energy: 0.3,
    };
    const prosodyEmotion: EmotionResult = {
      primary: 'stressed', confidence: 0.7, arousal: 0.9, valence: -0.3, energy: 0.8,
    };
    const combined = combineSignals(textEmotion, prosodyEmotion);
    // Arousal should be closer to prosody (0.9) than text (0.3)
    expect(combined.arousal).toBeGreaterThan(0.6);
  });

  it('should boost confidence when both signals agree', () => {
    const emotion: EmotionResult = {
      primary: 'happy', confidence: 0.6, arousal: 0.6, valence: 0.5, energy: 0.6,
    };
    const combined = combineSignals(emotion, emotion);
    expect(combined.confidence).toBeGreaterThan(0.6);
  });

  it('should not boost confidence when signals disagree', () => {
    const text: EmotionResult = {
      primary: 'happy', confidence: 0.6, arousal: 0.5, valence: 0.5, energy: 0.5,
    };
    const prosody: EmotionResult = {
      primary: 'sad', confidence: 0.6, arousal: 0.2, valence: -0.5, energy: 0.2,
    };
    const combined = combineSignals(text, prosody);
    // No agreement bonus
    expect(combined.confidence).toBeLessThanOrEqual(0.6 + 0.01);
  });

  it('should clamp all values to valid ranges', () => {
    const extreme: EmotionResult = {
      primary: 'excited', confidence: 1.5, arousal: 1.5, valence: 2, energy: 1.5,
    };
    const combined = combineSignals(extreme, extreme);
    expect(combined.confidence).toBeLessThanOrEqual(1);
    expect(combined.arousal).toBeLessThanOrEqual(1);
    expect(combined.valence).toBeLessThanOrEqual(1);
    expect(combined.energy).toBeLessThanOrEqual(1);
  });
});

// ============================================================
// Adaptive Response Style
// ============================================================

describe('getAdaptiveResponseStyle', () => {
  it('should return calm+concise for stressed user', () => {
    const style = getAdaptiveResponseStyle({
      primary: 'stressed', confidence: 0.8, arousal: 0.8, valence: -0.3, energy: 0.7,
    });
    expect(style.tone).toBe('calm');
    expect(style.verbosity).toBe('concise');
    expect(style.systemPromptAddendum).toContain('gestresst');
  });

  it('should return empathetic for sad user', () => {
    const style = getAdaptiveResponseStyle({
      primary: 'sad', confidence: 0.7, arousal: 0.2, valence: -0.6, energy: 0.2,
    });
    expect(style.tone).toBe('empathetic');
    expect(style.systemPromptAddendum).toContain('traurig');
  });

  it('should return enthusiastic+detailed for happy user', () => {
    const style = getAdaptiveResponseStyle({
      primary: 'happy', confidence: 0.8, arousal: 0.6, valence: 0.7, energy: 0.6,
    });
    expect(style.tone).toBe('enthusiastic');
    expect(style.verbosity).toBe('detailed');
  });

  it('should return enthusiastic for excited user', () => {
    const style = getAdaptiveResponseStyle({
      primary: 'excited', confidence: 0.8, arousal: 0.9, valence: 0.5, energy: 0.9,
    });
    expect(style.tone).toBe('enthusiastic');
  });

  it('should return supportive+concise for frustrated user', () => {
    const style = getAdaptiveResponseStyle({
      primary: 'frustrated', confidence: 0.7, arousal: 0.7, valence: -0.5, energy: 0.7,
    });
    expect(style.tone).toBe('supportive');
    expect(style.verbosity).toBe('concise');
    expect(style.systemPromptAddendum).toContain('frustriert');
  });

  it('should return calm for calm user', () => {
    const style = getAdaptiveResponseStyle({
      primary: 'calm', confidence: 0.7, arousal: 0.2, valence: 0.2, energy: 0.2,
    });
    expect(style.tone).toBe('calm');
  });

  it('should return professional/normal for low confidence', () => {
    const style = getAdaptiveResponseStyle({
      primary: 'stressed', confidence: 0.2, arousal: 0.8, valence: -0.3, energy: 0.7,
    });
    expect(style.tone).toBe('professional');
    expect(style.verbosity).toBe('normal');
    expect(style.systemPromptAddendum).toBe('');
  });

  it('should return professional for neutral emotion', () => {
    const style = getAdaptiveResponseStyle({
      primary: 'neutral', confidence: 0.5, arousal: 0.3, valence: 0, energy: 0.3,
    });
    expect(style.tone).toBe('professional');
  });
});

// ============================================================
// Voice Persona Service
// ============================================================

describe('Voice Personas', () => {
  it('should return 4 default personas', () => {
    const personas = listPersonas();
    expect(personas).toHaveLength(4);
  });

  it('should return work persona for work context', () => {
    const persona = getPersona('work');
    expect(persona.id).toBe('work-professional');
    expect(persona.context).toBe('work');
    expect(persona.personality_traits).toContain('formal');
  });

  it('should return personal persona for personal context', () => {
    const persona = getPersona('personal');
    expect(persona.id).toBe('personal-warm');
    expect(persona.personality_traits).toContain('friendly');
  });

  it('should return learning persona for learning context', () => {
    const persona = getPersona('learning');
    expect(persona.id).toBe('learning-patient');
    expect(persona.speaking_rate).toBe(0.9);
  });

  it('should return creative persona for creative context', () => {
    const persona = getPersona('creative');
    expect(persona.id).toBe('creative-expressive');
    expect(persona.personality_traits).toContain('playful');
  });

  it('should fall back to work persona for unknown context', () => {
    const persona = getPersona('unknown');
    expect(persona.id).toBe('work-professional');
  });

  it('should find persona by ID', () => {
    const persona = getPersonaById('learning-patient');
    expect(persona).toBeDefined();
    expect(persona!.name).toBe('Tutor');
  });

  it('should return undefined for unknown persona ID', () => {
    const persona = getPersonaById('nonexistent');
    expect(persona).toBeUndefined();
  });

  it('should generate prompt addendum from traits', () => {
    const persona = getPersona('work');
    const addendum = getPersonaPromptAddendum(persona);
    expect(addendum).toContain('Professional');
    expect(addendum).toContain('formelle');
  });

  it('should return empty string for persona with no matching traits', () => {
    const persona = { ...getPersona('work'), personality_traits: [] };
    const addendum = getPersonaPromptAddendum(persona);
    expect(addendum).toBe('');
  });
});

// ============================================================
// Voice Command Parser
// ============================================================

describe('parseCommand', () => {
  // Create idea commands
  it('should parse German create idea command', () => {
    const result = parseCommand('Erstelle eine Idee: Neues Feature fuer den Chat');
    expect(result.type).toBe('create_idea');
    expect(result.content).toBe('Neues Feature fuer den Chat');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('should parse English create idea command', () => {
    const result = parseCommand('Create a new idea: Better voice integration');
    expect(result.type).toBe('create_idea');
    expect(result.content).toBe('Better voice integration');
  });

  it('should parse "Neue Idee:" pattern', () => {
    const result = parseCommand('Neue Idee: Automatisches Backup');
    expect(result.type).toBe('create_idea');
    expect(result.content).toBe('Automatisches Backup');
  });

  it('should parse "Notiere" pattern', () => {
    const result = parseCommand('Notiere dir das hier');
    expect(result.type).toBe('create_idea');
    expect(result.content).toContain('das hier');
  });

  // List tasks commands
  it('should parse German list tasks command', () => {
    const result = parseCommand('Zeige mir meine Aufgaben');
    expect(result.type).toBe('list_tasks');
  });

  it('should parse English list tasks command', () => {
    const result = parseCommand('Show my tasks');
    expect(result.type).toBe('list_tasks');
  });

  it('should parse "Welche Aufgaben habe ich" pattern', () => {
    const result = parseCommand('Welche Aufgaben habe ich');
    expect(result.type).toBe('list_tasks');
  });

  // Search commands
  it('should parse German search command', () => {
    const result = parseCommand('Suche nach TypeScript Patterns');
    expect(result.type).toBe('search');
    expect(result.content).toBe('TypeScript Patterns');
    expect(result.parameters.query).toBe('TypeScript Patterns');
  });

  it('should parse English search command', () => {
    const result = parseCommand('Search for voice recognition');
    expect(result.type).toBe('search');
    expect(result.content).toBe('voice recognition');
  });

  it('should parse "Finde" pattern', () => {
    const result = parseCommand('Finde alle React Komponenten');
    expect(result.type).toBe('search');
  });

  // Navigate commands
  it('should parse German navigate command', () => {
    const result = parseCommand('Oeffne den Kalender');
    expect(result.type).toBe('navigate');
    expect(result.parameters.target).toBe('calendar');
  });

  it('should parse English navigate command', () => {
    const result = parseCommand('Go to dashboard');
    expect(result.type).toBe('navigate');
    expect(result.parameters.target).toBe('dashboard');
  });

  it('should parse "Gehe zu" pattern', () => {
    const result = parseCommand('Gehe zu Einstellungen');
    expect(result.type).toBe('navigate');
    expect(result.parameters.target).toBe('settings');
  });

  // Reminder commands
  it('should parse German reminder command', () => {
    const result = parseCommand('Erinnere mich an das Meeting morgen');
    expect(result.type).toBe('reminder');
    expect(result.content).toBe('das Meeting morgen');
  });

  it('should parse English reminder command', () => {
    const result = parseCommand('Remind me to check the report');
    expect(result.type).toBe('reminder');
    expect(result.content).toBe('check the report');
  });

  // General (fallback)
  it('should return general for unrecognized text', () => {
    const result = parseCommand('Wie wird das Wetter morgen?');
    expect(result.type).toBe('general');
    expect(result.content).toBe('Wie wird das Wetter morgen?');
    expect(result.confidence).toBe(1.0);
  });

  it('should return general for empty text', () => {
    const result = parseCommand('');
    expect(result.type).toBe('general');
    expect(result.confidence).toBe(0);
  });

  it('should return general for whitespace', () => {
    const result = parseCommand('   ');
    expect(result.type).toBe('general');
  });
});
