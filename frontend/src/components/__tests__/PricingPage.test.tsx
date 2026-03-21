/**
 * Tests for PricingPage component
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PricingPage } from '../PricingPage/PricingPage';

describe('PricingPage', () => {
  it('renders all 3 tier names', () => {
    render(<PricingPage />);
    // Use getAllBy since "Free" appears in both the card heading and comparison table header
    expect(screen.getAllByText('Free').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Pro').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Enterprise').length).toBeGreaterThanOrEqual(1);
    // Verify tier card headings specifically
    const headings = screen.getAllByRole('heading', { level: 2 });
    const headingTexts = headings.map(h => h.textContent);
    expect(headingTexts).toContain('Free');
    expect(headingTexts).toContain('Pro');
    expect(headingTexts).toContain('Enterprise');
  });

  it('shows monthly pricing by default', () => {
    render(<PricingPage />);
    // Monthly label is active, €19 shown for Pro
    expect(screen.getByText('€19')).toBeInTheDocument();
  });

  it('switches to yearly pricing when toggle clicked', () => {
    render(<PricingPage />);
    const toggle = screen.getByRole('switch', { name: /jährliche abrechnung/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    // Pro should show €15 (yearly price)
    expect(screen.getByText('€15')).toBeInTheDocument();
  });

  it('renders the feature comparison table', () => {
    render(<PricingPage />);
    expect(screen.getByRole('table', { name: /feature-vergleich/i })).toBeInTheDocument();
    // Check some feature rows
    expect(screen.getByText('Ideen')).toBeInTheDocument();
    expect(screen.getByText('Knowledge Graph')).toBeInTheDocument();
    expect(screen.getByText('SSO')).toBeInTheDocument();
  });

  it('renders CTA buttons for each tier', () => {
    render(<PricingPage />);
    expect(screen.getByText('Kostenlos starten')).toBeInTheDocument();
    expect(screen.getByText('Pro testen')).toBeInTheDocument();
    expect(screen.getByText('Kontakt')).toBeInTheDocument();
  });

  it('shows recommended badge on Pro tier', () => {
    render(<PricingPage />);
    expect(screen.getByText('Empfohlen')).toBeInTheDocument();
  });

  it('shows yearly savings hint', () => {
    render(<PricingPage />);
    expect(screen.getByText('20% sparen')).toBeInTheDocument();
  });
});
