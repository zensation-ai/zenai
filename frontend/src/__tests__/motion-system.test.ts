/**
 * Motion System Tests — Phase 101-C5
 * Verifies spring physics configs, CSS fallbacks, and motion variants.
 */

import { springs, springCSS, springFallback } from '../design-system/springs';
import { motionVariants, reducedMotionVariants } from '../design-system/motion-variants';

describe('Spring Physics System', () => {
  test('all spring presets have required properties', () => {
    Object.values(springs).forEach(spring => {
      expect(spring).toHaveProperty('stiffness');
      expect(spring).toHaveProperty('damping');
      expect(spring).toHaveProperty('mass');
    });
  });

  test('CSS springs have matching fallbacks', () => {
    Object.keys(springCSS).forEach(key => {
      expect(springFallback).toHaveProperty(key);
    });
  });

  test('motion variants have initial/animate', () => {
    ['fadeIn', 'slideUp', 'scaleIn'].forEach(name => {
      const variant = motionVariants[name as keyof typeof motionVariants];
      expect(variant).toHaveProperty('initial');
      expect(variant).toHaveProperty('animate');
    });
  });

  test('reduced motion variants exist for all standard variants', () => {
    Object.keys(motionVariants).forEach(key => {
      expect(reducedMotionVariants).toHaveProperty(key);
    });
  });

  test('spring values are positive numbers', () => {
    Object.values(springs).forEach(spring => {
      expect(spring.stiffness).toBeGreaterThan(0);
      expect(spring.damping).toBeGreaterThan(0);
      expect(spring.mass).toBeGreaterThan(0);
    });
  });
});

describe('Spring Preset Coverage', () => {
  const presetNames = ['snappy', 'gentle', 'bouncy', 'stiff', 'wobbly'] as const;

  test('all expected presets exist in springs', () => {
    presetNames.forEach(name => {
      expect(springs).toHaveProperty(name);
    });
  });

  test('all expected presets exist in springCSS', () => {
    presetNames.forEach(name => {
      expect(springCSS).toHaveProperty(name);
    });
  });

  test('all expected presets exist in springFallback', () => {
    presetNames.forEach(name => {
      expect(springFallback).toHaveProperty(name);
    });
  });

  test('CSS values are non-empty strings', () => {
    Object.values(springCSS).forEach(val => {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    });
  });

  test('fallback values are non-empty strings', () => {
    Object.values(springFallback).forEach(val => {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    });
  });
});

describe('Motion Variants Library', () => {
  test('all variants have exit state', () => {
    ['fadeIn', 'slideUp', 'scaleIn', 'listItem', 'slideInRight', 'bounceIn'].forEach(name => {
      const variant = motionVariants[name as keyof typeof motionVariants];
      expect(variant).toHaveProperty('exit');
    });
  });

  test('stagger variant has staggerChildren in animate transition', () => {
    const animate = motionVariants.stagger.animate as { transition?: { staggerChildren?: number } };
    expect(animate?.transition?.staggerChildren).toBeGreaterThan(0);
  });

  test('reduced motion stagger is an empty object variant', () => {
    const stagger = reducedMotionVariants.stagger;
    expect(stagger).toHaveProperty('initial');
    expect(stagger).toHaveProperty('animate');
    expect(stagger).toHaveProperty('exit');
  });

  test('reduced motion variants use only opacity animations', () => {
    (['fadeIn', 'slideUp', 'scaleIn', 'listItem', 'slideInRight', 'bounceIn'] as const).forEach(name => {
      const variant = reducedMotionVariants[name];
      const initial = variant.initial as Record<string, unknown>;
      // No positional transforms in reduced motion
      expect(initial).not.toHaveProperty('y');
      expect(initial).not.toHaveProperty('x');
      expect(initial).not.toHaveProperty('scale');
    });
  });
});
