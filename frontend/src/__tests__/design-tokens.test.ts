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

import { typography } from '../design-system/typography';

describe('Calm Neurodesign Typography Tokens', () => {
  it('exports modular scale sizes', () => {
    expect(typography.size.xs).toBe('0.75rem');
    expect(typography.size.sm).toBe('0.875rem');
    expect(typography.size.base).toBe('1rem');
    expect(typography.size.lg).toBe('1.125rem');
    expect(typography.size.xl).toBe('1.25rem');
    expect(typography.size['2xl']).toBe('1.5rem');
    expect(typography.size['3xl']).toBe('1.875rem');
  });

  it('exports font weights', () => {
    expect(typography.weight.normal).toBe(400);
    expect(typography.weight.medium).toBe(500);
    expect(typography.weight.semibold).toBe(600);
    expect(typography.weight.bold).toBe(700);
  });

  it('exports line heights', () => {
    expect(typography.leading.tight).toBe(1.3);
    expect(typography.leading.normal).toBe(1.55);
    expect(typography.leading.relaxed).toBe(1.7);
  });

  it('exports font families', () => {
    expect(typography.family.sans).toContain('Inter');
    expect(typography.family.mono).toContain('JetBrains Mono');
  });

  // CRITICAL: backward compat
  it('preserves ALL legacy aggregate properties', () => {
    expect(typography.fontFamily).toBeDefined();
    expect(typography.fontFamily.sans).toContain('Inter');
    expect(typography.fontSize).toBeDefined();
    expect(typography.fontSize.base).toBe('0.875rem');
    expect(typography.fontWeight).toBeDefined();
    expect(typography.fontWeight.bold).toBe(700);
    expect(typography.lineHeight).toBeDefined();
    expect(typography.lineHeight.base).toBe(1.6);
    expect(typography.letterSpacing).toBeDefined();
    expect(typography.fontFeatureSettings).toBeDefined();
  });
});
