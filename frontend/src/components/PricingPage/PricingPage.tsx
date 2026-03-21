/**
 * PricingPage — 3-tier pricing with monthly/yearly toggle
 *
 * Tiers: Free | Pro (highlighted) | Enterprise
 */

import { useState } from 'react';
import { Button } from '../../design-system/components/Button';
import { Badge } from '../../design-system/components/Badge';
import './PricingPage.css';

interface PricingTier {
  id: string;
  name: string;
  monthlyPrice: string;
  yearlyPrice: string;
  subtitle: string;
  highlighted: boolean;
  badge?: string;
  features: string[];
  cta: string;
  ctaVariant: 'primary' | 'secondary' | 'ghost';
  ctaHref: string;
  ctaExternal?: boolean;
}

const TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyPrice: '0',
    yearlyPrice: '0',
    subtitle: 'Für den Einstieg',
    highlighted: false,
    features: [
      '50 AI-Credits/Monat',
      '1 Kontext',
      'Basic RAG',
      'Standard-Antwortzeit',
    ],
    cta: 'Kostenlos starten',
    ctaVariant: 'ghost',
    ctaHref: '/auth',
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: '29',
    yearlyPrice: '23',
    subtitle: 'Für Profis & Teams',
    highlighted: true,
    badge: 'Empfohlen',
    features: [
      '2.000 AI-Credits/Monat',
      '4 Kontexte (Privat, Arbeit, Lernen, Kreativ)',
      'Advanced RAG + Knowledge Graph',
      'Multi-Agent Teams (5 Credits/Aufruf)',
      'Voice Chat (2 Credits/Minute)',
      'Code-Ausführung (3 Credits/Aufruf)',
      'Priority-Antwortzeit',
      'Zusätzliche Credits: 500 für €9',
    ],
    cta: 'Pro testen',
    ctaVariant: 'primary',
    ctaHref: '/demo',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 'Individuell',
    yearlyPrice: 'Individuell',
    subtitle: 'Für Unternehmen',
    highlighted: false,
    features: [
      'Unbegrenzte Credits',
      'Team Management',
      'Single Sign-On (SSO)',
      'SLA-Garantie',
      'Priority Support',
      'Custom Integrationen',
      'Dedizierte Infrastruktur',
    ],
    cta: 'Kontakt',
    ctaVariant: 'secondary',
    ctaHref: 'mailto:enterprise@zensation.ai',
    ctaExternal: true,
  },
];

interface FeatureRow {
  label: string;
  free: string | boolean;
  pro: string | boolean;
  enterprise: string | boolean;
}

const FEATURE_TABLE: FeatureRow[] = [
  { label: 'AI-Credits / Monat', free: '50', pro: '2.000', enterprise: 'Unbegrenzt' },
  { label: 'Zusatz-Credits kaufbar', free: false, pro: true, enterprise: 'Inklusive' },
  { label: 'Kontexte', free: '1', pro: '4', enterprise: '4' },
  { label: 'Basic RAG', free: true, pro: true, enterprise: true },
  { label: 'Advanced RAG', free: false, pro: true, enterprise: true },
  { label: 'Knowledge Graph', free: false, pro: true, enterprise: true },
  { label: 'Multi-Agent Teams', free: false, pro: true, enterprise: true },
  { label: 'Voice Chat', free: false, pro: true, enterprise: true },
  { label: 'Code-Ausführung', free: false, pro: true, enterprise: true },
  { label: 'SSO', free: false, pro: false, enterprise: true },
  { label: 'Team Management', free: false, pro: false, enterprise: true },
  { label: 'SLA-Garantie', free: false, pro: false, enterprise: true },
  { label: 'Priority Support', free: false, pro: false, enterprise: true },
  { label: 'Custom Integrationen', free: false, pro: false, enterprise: true },
];

function FeatureValue({ value }: { value: string | boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <span className="pricing-check" aria-label="Enthalten">✓</span>
    ) : (
      <span className="pricing-dash" aria-label="Nicht enthalten">—</span>
    );
  }
  return <span className="pricing-value">{value}</span>;
}

export function PricingPage() {
  const [yearly, setYearly] = useState(false);

  const handleCtaClick = (tier: PricingTier) => {
    if (tier.ctaExternal) {
      window.location.href = tier.ctaHref;
    } else {
      window.location.href = tier.ctaHref;
    }
  };

  return (
    <div className="pricing-page" role="main" aria-label="Preise">
      {/* Hero */}
      <div className="pricing-hero">
        <Badge color="info" size="sm" className="pricing-hero-badge">Transparent & Fair</Badge>
        <h1 className="pricing-title">Einfache Preise,<br />keine Überraschungen</h1>
        <p className="pricing-subtitle">
          Starte kostenlos und wechsle zu Pro, wenn du mehr brauchst.
        </p>

        {/* Billing Toggle */}
        <div className="pricing-toggle" role="group" aria-label="Abrechnungszeitraum wählen">
          <span className={`pricing-toggle-label ${!yearly ? 'active' : ''}`}>Monatlich</span>
          <button
            type="button"
            className={`pricing-toggle-switch ${yearly ? 'on' : ''}`}
            role="switch"
            aria-checked={yearly}
            aria-label="Jährliche Abrechnung"
            onClick={() => setYearly(v => !v)}
          >
            <span className="pricing-toggle-thumb" />
          </button>
          <span className={`pricing-toggle-label ${yearly ? 'active' : ''}`}>
            Jährlich
            <span className="pricing-toggle-savings">20% sparen</span>
          </span>
        </div>
      </div>

      {/* Tier Cards */}
      <div className="pricing-cards">
        {TIERS.map(tier => (
          <div
            key={tier.id}
            className={`pricing-card ${tier.highlighted ? 'pricing-card--highlighted' : ''}`}
            data-tier={tier.id}
          >
            {tier.badge && (
              <div className="pricing-card-badge">
                <Badge color="info" size="sm">{tier.badge}</Badge>
              </div>
            )}

            <div className="pricing-card-header">
              <h2 className="pricing-card-name">{tier.name}</h2>
              <p className="pricing-card-subtitle">{tier.subtitle}</p>
            </div>

            <div className="pricing-card-price">
              {tier.monthlyPrice === 'Individuell' ? (
                <span className="pricing-price-custom">Individuell</span>
              ) : (
                <>
                  <span className="pricing-price-amount">
                    €{yearly ? tier.yearlyPrice : tier.monthlyPrice}
                  </span>
                  <span className="pricing-price-period">/ Monat</span>
                  {yearly && tier.id === 'pro' && (
                    <div className="pricing-price-note">jährlich abgerechnet</div>
                  )}
                </>
              )}
            </div>

            <ul className="pricing-feature-list" aria-label={`Features im ${tier.name}-Tarif`}>
              {tier.features.map(feature => (
                <li key={feature} className="pricing-feature-item">
                  <span className="pricing-feature-check" aria-hidden="true">✓</span>
                  {feature}
                </li>
              ))}
            </ul>

            <div className="pricing-card-cta">
              <Button
                variant={tier.ctaVariant}
                size="lg"
                style={{ width: '100%' }}
                onClick={() => handleCtaClick(tier)}
              >
                {tier.cta}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Credits Info Box */}
      <div className="pricing-credits-info">
        <h3 className="pricing-credits-title">Credits erklärt</h3>
        <p className="pricing-credits-text">
          1 Credit = 1 einfache Nachricht. Komplexere Anfragen (RAG, Tools, Agenten) kosten 2–5 Credits.
        </p>
        <ul className="pricing-credits-list">
          <li>Einfache Nachricht: <strong>1 Credit</strong></li>
          <li>Nachricht mit RAG/Tools: <strong>2–3 Credits</strong></li>
          <li>Multi-Agent Aufruf: <strong>5 Credits</strong></li>
          <li>Voice Chat: <strong>2 Credits/Minute</strong></li>
          <li>Code-Ausführung: <strong>3 Credits</strong></li>
        </ul>
        <p className="pricing-credits-addon">
          Zusätzliche Credits (nur Pro): <strong>500 für €9</strong>
        </p>
      </div>

      {/* Feature Comparison Table */}
      <div className="pricing-comparison">
        <h2 className="pricing-comparison-title">Feature-Vergleich</h2>
        <div className="pricing-table-wrapper">
          <table className="pricing-table" aria-label="Feature-Vergleich aller Tarife">
            <thead>
              <tr>
                <th className="pricing-table-feature-col" scope="col">Feature</th>
                <th scope="col">Free</th>
                <th scope="col" className="pricing-table-pro-col">Pro</th>
                <th scope="col">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {FEATURE_TABLE.map(row => (
                <tr key={row.label}>
                  <td className="pricing-table-label">{row.label}</td>
                  <td><FeatureValue value={row.free} /></td>
                  <td className="pricing-table-pro-col"><FeatureValue value={row.pro} /></td>
                  <td><FeatureValue value={row.enterprise} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CTA Footer */}
      <div className="pricing-footer-cta">
        <p className="pricing-footer-text">Fragen? Wir helfen gerne.</p>
        <a href="mailto:hello@zensation.ai" className="pricing-footer-link">
          hello@zensation.ai
        </a>
      </div>
    </div>
  );
}

export default PricingPage;
