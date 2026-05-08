/**
 * Sprint 1.1 (2026-04-16) — AiOutputBadge tests.
 * Verifies that the EU AI Act Art. 50 disclosure badge:
 *   - Always renders the visible "🤖 KI-generiert" label.
 *   - Carries an aria-label with the EU AI Act Art. 50 disclosure text.
 *   - Optionally renders the model id when supplied.
 *   - Honors the `label` override (i18n).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AiOutputBadge from '../shared/AiOutputBadge';

describe('AiOutputBadge', () => {
  it('renders the default German "KI-generiert" label and emoji', () => {
    render(<AiOutputBadge />);
    expect(screen.getByText('KI-generiert')).toBeInTheDocument();
    expect(screen.getByText('🤖')).toBeInTheDocument();
  });

  it('exposes an EU AI Act Art. 50 disclosure as aria-label and tooltip', () => {
    render(<AiOutputBadge />);
    const badge = screen.getByRole('note');
    expect(badge).toHaveAttribute(
      'aria-label',
      expect.stringContaining('EU AI Act Art. 50'),
    );
    expect(badge).toHaveAttribute('title', expect.stringContaining('EU AI Act Art. 50'));
  });

  it('honors a custom tooltip prop', () => {
    render(<AiOutputBadge tooltip="Custom disclosure" />);
    const badge = screen.getByRole('note');
    expect(badge).toHaveAttribute('aria-label', 'Custom disclosure');
    expect(badge).toHaveAttribute('title', 'Custom disclosure');
  });

  it('renders the model name after a separator when provided', () => {
    render(<AiOutputBadge model="Claude Opus 4.6" />);
    expect(screen.getByText('· Claude Opus 4.6')).toBeInTheDocument();
  });

  it('honors the label override (e.g. for i18n)', () => {
    render(<AiOutputBadge label="AI-generated" />);
    expect(screen.getByText('AI-generated')).toBeInTheDocument();
    expect(screen.queryByText('KI-generiert')).not.toBeInTheDocument();
  });

  it('exposes a stable data-* hook for downstream selectors', () => {
    render(<AiOutputBadge />);
    expect(screen.getByRole('note')).toHaveAttribute('data-ai-output-badge');
  });
});
