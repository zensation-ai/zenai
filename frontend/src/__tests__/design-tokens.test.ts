import { describe, it, expect, test } from 'vitest';
import { opacity } from '../design-system/tokens';
import { springs, springCSS, springFallback } from '../design-system/springs';
import { colors } from '../design-system/colors';

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

describe('Calm Neurodesign Color Tokens', () => {
  it('exports new accent colors (5 semantic hues)', () => {
    expect(colors.accent).toBeDefined();
    expect(colors.accent.primary).toMatch(/^hsl\(/);
    expect(colors.accent.secondary).toMatch(/^hsl\(/);
    expect(colors.calmSuccess).toBeDefined();
    expect(colors.calmWarning).toBeDefined();
    expect(colors.calmDanger).toBeDefined();
  });

  it('exports 4 context colors', () => {
    expect(colors.context.personal).toMatch(/^hsl\(/);
    expect(colors.context.work).toMatch(/^hsl\(/);
    expect(colors.context.learning).toMatch(/^hsl\(/);
    expect(colors.context.creative).toMatch(/^hsl\(/);
  });

  it('exports light and dark surface scales', () => {
    expect(colors.calmSurface.light.bg).toMatch(/^hsl\(/);
    expect(colors.calmSurface.light.s1).toMatch(/^hsl\(/);
    expect(colors.calmSurface.dark.bg).toMatch(/^hsl\(/);
  });

  it('exports new text color scales', () => {
    expect(colors.calmText.light.primary).toMatch(/^hsl\(/);
    expect(colors.calmText.dark.primary).toMatch(/^hsl\(/);
  });

  it('exports new glass tokens', () => {
    expect(colors.calmGlass.light.bg).toMatch(/^rgba\(/);
    expect(colors.calmGlass.dark.bg).toMatch(/^rgba\(/);
  });

  // CRITICAL: backward compatibility — ALL old aggregate properties still exist
  it('preserves ALL legacy aggregate properties', () => {
    expect(colors.brand).toBeDefined();
    expect(colors.brand.primary).toBe('#ff6b35');
    expect(colors.brandDark).toBeDefined();
    expect(colors.surfaceLight).toBeDefined();
    expect(colors.surfaceLight.background).toBe('#dce5eb');
    expect(colors.surfaceDark).toBeDefined();
    expect(colors.glassLight).toBeDefined();
    expect(colors.glassDark).toBeDefined();
    expect(colors.textLight).toBeDefined();
    expect(colors.textDark).toBeDefined();
    expect(colors.textOnDark).toBeDefined();
    expect(colors.borderLight).toBeDefined();
    expect(colors.borderDark).toBeDefined();
    expect(colors.semantic).toBeDefined();
    expect(colors.warm).toBeDefined();
    expect(colors.petrol).toBeDefined();
    expect(colors.header).toBeDefined();
    expect(colors.sidebar).toBeDefined();
    expect(colors.neuro).toBeDefined();
    expect(colors.gradients).toBeDefined();
  });
});
