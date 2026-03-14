/**
 * Tests for A2A Agent Card Generator
 */

import { generateAgentCard, isValidSkill, A2A_SKILLS } from '../../../../services/a2a/agent-card';

describe('A2A Agent Card', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.API_URL;
    delete process.env.RAILWAY_STATIC_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('generateAgentCard', () => {
    it('should return a valid agent card with all required fields', () => {
      const card = generateAgentCard();

      expect(card).toHaveProperty('name');
      expect(card).toHaveProperty('description');
      expect(card).toHaveProperty('url');
      expect(card).toHaveProperty('version');
      expect(card).toHaveProperty('capabilities');
      expect(card).toHaveProperty('authentication');
      expect(card).toHaveProperty('skills');
    });

    it('should have correct name and version', () => {
      const card = generateAgentCard();

      expect(card.name).toBe('ZenAI Agent');
      expect(card.version).toBe('1.0.0');
    });

    it('should have streaming capability enabled', () => {
      const card = generateAgentCard();

      expect(card.capabilities.streaming).toBe(true);
      expect(card.capabilities.pushNotifications).toBe(false);
    });

    it('should have Bearer authentication scheme', () => {
      const card = generateAgentCard();

      expect(card.authentication.schemes).toContain('Bearer');
    });

    it('should expose 5 skills', () => {
      const card = generateAgentCard();

      expect(card.skills).toHaveLength(5);
    });

    it('should use API_URL from environment when available', () => {
      process.env.API_URL = 'https://my-api.example.com';

      const card = generateAgentCard();

      expect(card.url).toBe('https://my-api.example.com');
    });

    it('should use RAILWAY_STATIC_URL as fallback', () => {
      process.env.RAILWAY_STATIC_URL = 'my-app.railway.app';

      const card = generateAgentCard();

      expect(card.url).toBe('https://my-app.railway.app');
    });

    it('should default to localhost when no env vars set', () => {
      const card = generateAgentCard();

      expect(card.url).toBe('http://localhost:3000');
    });

    it('should include all expected skill IDs', () => {
      const card = generateAgentCard();
      const skillIds = card.skills.map(s => s.id);

      expect(skillIds).toContain('research');
      expect(skillIds).toContain('code-review');
      expect(skillIds).toContain('knowledge-query');
      expect(skillIds).toContain('content-creation');
      expect(skillIds).toContain('task-execution');
    });

    it('should have inputModes and outputModes for each skill', () => {
      const card = generateAgentCard();

      for (const skill of card.skills) {
        expect(skill.inputModes).toContain('text');
        expect(skill.outputModes).toContain('text');
        expect(skill.name).toBeTruthy();
        expect(skill.description).toBeTruthy();
      }
    });
  });

  describe('isValidSkill', () => {
    it('should return true for valid skill IDs', () => {
      expect(isValidSkill('research')).toBe(true);
      expect(isValidSkill('code-review')).toBe(true);
      expect(isValidSkill('knowledge-query')).toBe(true);
    });

    it('should return false for invalid skill IDs', () => {
      expect(isValidSkill('invalid-skill')).toBe(false);
      expect(isValidSkill('')).toBe(false);
      expect(isValidSkill('RESEARCH')).toBe(false);
    });
  });
});
