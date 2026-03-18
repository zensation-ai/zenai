/**
 * Design System Glass Variants Tests
 *
 * Tests for glass token exports, glass variant rendering on
 * Button, Card, and Input components.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button, Card, Input } from '../design-system/components';
import { glassTokens, neuroTokens, tokens } from '../design-system/tokens';

// ---------------------------------------------------------------------------
// Token Tests
// ---------------------------------------------------------------------------

describe('Glass & Neuro Tokens', () => {
  it('exports glassTokens with required properties', () => {
    expect(glassTokens).toBeDefined();
    expect(glassTokens.background).toContain('--glass-bg');
    expect(glassTokens.border).toContain('--glass-border');
    expect(glassTokens.backdropBlur).toContain('--glass-blur');
    expect(glassTokens.shadow).toContain('--glass-shadow');
  });

  it('exports neuroTokens with required properties', () => {
    expect(neuroTokens).toBeDefined();
    expect(neuroTokens.hoverLift).toBe('translateY(-2px)');
    expect(neuroTokens.focusRingColor).toContain('--accent-primary');
    expect(neuroTokens.focusRingWidth).toBe('2px');
  });

  it('includes glass and neuro in full tokens tree', () => {
    expect(tokens.glass).toBe(glassTokens);
    expect(tokens.neuro).toBe(neuroTokens);
  });
});

// ---------------------------------------------------------------------------
// Button Glass Variant
// ---------------------------------------------------------------------------

describe('Button glass variant', () => {
  it('renders with ds-button--glass class', () => {
    render(<Button variant="glass">Glass Button</Button>);
    const btn = screen.getByRole('button', { name: 'Glass Button' });
    expect(btn.className).toContain('ds-button--glass');
  });

  it('defaults to primary variant', () => {
    render(<Button>Default</Button>);
    const btn = screen.getByRole('button', { name: 'Default' });
    expect(btn.className).toContain('ds-button--primary');
    expect(btn.className).not.toContain('ds-button--glass');
  });
});

// ---------------------------------------------------------------------------
// Card Glass Variant
// ---------------------------------------------------------------------------

describe('Card glass variant', () => {
  it('renders with ds-card--glass class', () => {
    render(<Card variant="glass">Glass card content</Card>);
    const card = document.querySelector('.ds-card--glass');
    expect(card).not.toBeNull();
  });

  it('renders with interactive hover', () => {
    render(<Card variant="glass" interactive>Interactive glass</Card>);
    const card = document.querySelector('.ds-card--glass.ds-card--interactive');
    expect(card).not.toBeNull();
  });

  it('defaults to surface variant', () => {
    render(<Card>Surface card</Card>);
    const card = document.querySelector('.ds-card--surface');
    expect(card).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Input Glass Variant
// ---------------------------------------------------------------------------

describe('Input glass variant', () => {
  it('renders with ds-input-wrapper--glass class', () => {
    render(<Input variant="glass" placeholder="Glass input" />);
    const wrapper = document.querySelector('.ds-input-wrapper--glass');
    expect(wrapper).not.toBeNull();
  });

  it('renders default variant without glass class', () => {
    render(<Input placeholder="Default input" />);
    const wrapper = document.querySelector('.ds-input-wrapper');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).not.toContain('ds-input-wrapper--glass');
  });

  it('glass variant works with label', () => {
    render(<Input variant="glass" label="E-Mail" placeholder="name@example.com" />);
    expect(screen.getByLabelText('E-Mail')).toBeDefined();
    const wrapper = document.querySelector('.ds-input-wrapper--glass');
    expect(wrapper).not.toBeNull();
  });

  it('glass variant works with error state', () => {
    render(<Input variant="glass" error="Pflichtfeld" />);
    const wrapper = document.querySelector('.ds-input-wrapper--glass.ds-input-wrapper--error');
    expect(wrapper).not.toBeNull();
    expect(screen.getByRole('alert')).toBeDefined();
  });
});
