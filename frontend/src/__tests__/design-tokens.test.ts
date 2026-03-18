import { opacity } from '../design-system/tokens';
import { springs, springCSS, springFallback } from '../design-system/springs';

describe('Design Tokens', () => {
  test('opacity tokens are between 0 and 1', () => {
    Object.values(opacity).forEach(val => {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    });
  });

  test('opacity.disabled is WCAG compliant (>= 0.38)', () => {
    expect(opacity.disabled).toBeGreaterThanOrEqual(0.38);
  });

  test('all opacity keys are unique values', () => {
    const values = Object.values(opacity);
    expect(new Set(values).size).toBe(values.length);
  });

  test('springs presets have stiffness and damping', () => {
    Object.values(springs).forEach(preset => {
      expect(preset).toHaveProperty('stiffness');
      expect(preset).toHaveProperty('damping');
    });
  });

  test('springCSS has CSS string values for all spring presets', () => {
    Object.values(springCSS).forEach(value => {
      expect(typeof value).toBe('string');
    });
  });

  test('springFallback has cubic-bezier strings for all presets', () => {
    Object.values(springFallback).forEach(value => {
      expect(typeof value).toBe('string');
      expect(value).toMatch(/cubic-bezier/);
    });
  });
});
