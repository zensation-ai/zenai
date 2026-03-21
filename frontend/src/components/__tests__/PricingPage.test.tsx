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
    // Monthly label is active, €29 shown for Pro
    expect(screen.getByText('€29')).toBeInTheDocument();
  });

  it('switches to yearly pricing when toggle clicked', () => {
    render(<PricingPage />);
    const toggle = screen.getByRole('switch', { name: /jährliche abrechnung/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    // Pro should show €23 (yearly price)
    expect(screen.getByText('€23')).toBeInTheDocument();
  });

  it('renders the feature comparison table', () => {
    render(<PricingPage />);
    expect(screen.getByRole('table', { name: /feature-vergleich/i })).toBeInTheDocument();
    // Check credits row and other feature rows
    expect(screen.getByText('AI-Credits / Monat')).toBeInTheDocument();
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

  it('shows credits info section', () => {
    render(<PricingPage />);
    expect(screen.getByText('Credits erklärt')).toBeInTheDocument();
    expect(screen.getByText(/1 Credit = 1 einfache Nachricht/i)).toBeInTheDocument();
  });

  it('shows credit costs in tier cards', () => {
    render(<PricingPage />);
    // Free tier credits
    expect(screen.getByText(/50 AI-Credits\/Monat/i)).toBeInTheDocument();
    // Pro tier credits
    expect(screen.getByText(/2\.000 AI-Credits\/Monat/i)).toBeInTheDocument();
    // Enterprise unlimited
    expect(screen.getByText(/Unbegrenzte Credits/i)).toBeInTheDocument();
  });

  it('shows additional credits purchase option for Pro', () => {
    render(<PricingPage />);
    // "500 für €9" appears in both the Pro feature list and the credits info box
    expect(screen.getAllByText(/500 für €9/i).length).toBeGreaterThanOrEqual(1);
  });
});
