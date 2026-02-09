/**
 * SettingsDashboard - Echte App-Einstellungen
 *
 * Tabs:
 * - Allgemein: Erscheinungsbild, Sprache, Startseite
 * - KI: Modell-Praeferenzen, Antwort-Stil, Tool-Einstellungen
 * - Datenschutz: Daten-Kontrolle, Loeschen, Export-Hinweis
 */

import { useState, memo } from 'react';
import { AIContext } from './ContextSwitcher';
import { PageHeader } from './PageHeader';
import '../neurodesign.css';
import './SettingsDashboard.css';

type SettingsTab = 'general' | 'ai' | 'privacy';

interface SettingsDashboardProps {
  context: AIContext;
  currentPage: string;
  onBack: () => void;
  onNavigate: (page: string) => void;
  initialTab?: SettingsTab;
}

const TABS = [
  { id: 'general' as const, label: 'Allgemein', icon: '⚙️', description: 'Erscheinungsbild und Verhalten' },
  { id: 'ai' as const, label: 'KI', icon: '🧠', description: 'KI-Modell und Antwort-Stil' },
  { id: 'privacy' as const, label: 'Datenschutz', icon: '🔒', description: 'Daten-Kontrolle und Privatsphäre' },
];

export const SettingsDashboard = memo(({
  context,
  onBack,
  onNavigate,
  initialTab = 'general'
}: SettingsDashboardProps) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="settings-section-content">
            <div className="settings-group">
              <h3 className="settings-group-title">Erscheinungsbild</h3>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Farbschema</span>
                  <span className="settings-item-desc">Midnight Dark Petrol</span>
                </div>
                <span className="settings-item-value">Dunkel</span>
              </div>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Sprache</span>
                  <span className="settings-item-desc">Anzeigesprache der App</span>
                </div>
                <span className="settings-item-value">Deutsch</span>
              </div>
            </div>

            <div className="settings-group">
              <h3 className="settings-group-title">Verhalten</h3>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Startseite</span>
                  <span className="settings-item-desc">Was beim App-Start angezeigt wird</span>
                </div>
                <span className="settings-item-value">Dashboard</span>
              </div>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Kontext</span>
                  <span className="settings-item-desc">Aktueller Arbeitsbereich</span>
                </div>
                <span className="settings-item-value">{context}</span>
              </div>
            </div>

            <div className="settings-group">
              <h3 className="settings-group-title">Schnellzugriff</h3>
              <div className="settings-quick-links">
                <button type="button" className="settings-quick-link" onClick={() => onNavigate('profile')}>
                  <span>👤</span> Profil bearbeiten
                </button>
                <button type="button" className="settings-quick-link" onClick={() => onNavigate('notifications')}>
                  <span>🔔</span> Benachrichtigungen
                </button>
                <button type="button" className="settings-quick-link" onClick={() => onNavigate('integrations')}>
                  <span>🔗</span> Integrationen
                </button>
              </div>
            </div>
          </div>
        );

      case 'ai':
        return (
          <div className="settings-section-content">
            <div className="settings-group">
              <h3 className="settings-group-title">KI-Modell</h3>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Aktives Modell</span>
                  <span className="settings-item-desc">Claude Sonnet (Standard)</span>
                </div>
                <span className="settings-item-value">claude-sonnet</span>
              </div>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Fallback</span>
                  <span className="settings-item-desc">Lokales Modell bei Ausfall</span>
                </div>
                <span className="settings-item-value">Ollama</span>
              </div>
            </div>

            <div className="settings-group">
              <h3 className="settings-group-title">Verhalten</h3>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Proaktive Vorschläge</span>
                  <span className="settings-item-desc">KI schlägt eigenständig Ideen vor</span>
                </div>
                <span className="settings-item-value">Aktiv</span>
              </div>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Memory-System</span>
                  <span className="settings-item-desc">HiMeS 4-Layer Architektur</span>
                </div>
                <span className="settings-item-value">Aktiv</span>
              </div>
            </div>

            <div className="settings-group">
              <h3 className="settings-group-title">Schnellzugriff</h3>
              <div className="settings-quick-links">
                <button type="button" className="settings-quick-link" onClick={() => onNavigate('my-ai')}>
                  <span>🤖</span> Meine KI anpassen
                </button>
                <button type="button" className="settings-quick-link" onClick={() => onNavigate('automations')}>
                  <span>⚡</span> Automationen
                </button>
              </div>
            </div>
          </div>
        );

      case 'privacy':
        return (
          <div className="settings-section-content">
            <div className="settings-group">
              <h3 className="settings-group-title">Daten</h3>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Datenverarbeitung</span>
                  <span className="settings-item-desc">KI-Analyse deiner Gedanken</span>
                </div>
                <span className="settings-item-value">Aktiv</span>
              </div>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Speicherort</span>
                  <span className="settings-item-desc">Supabase (PostgreSQL + pgvector)</span>
                </div>
                <span className="settings-item-value">EU</span>
              </div>
            </div>

            <div className="settings-group">
              <h3 className="settings-group-title">Aktionen</h3>
              <div className="settings-quick-links">
                <button type="button" className="settings-quick-link" onClick={() => onNavigate('export')}>
                  <span>📤</span> Daten exportieren
                </button>
                <button type="button" className="settings-quick-link" onClick={() => onNavigate('sync')}>
                  <span>🔄</span> Sync verwalten
                </button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="settings-dashboard" data-context={context}>
      <PageHeader
        title="Einstellungen"
        icon="⚙️"
        subtitle="App-Konfiguration und Datenschutz"
        onBack={onBack}
        backLabel="Zurück"
        onNavigate={(page) => onNavigate(page)}
      />

      <nav className="settings-tabs" role="tablist" aria-label="Einstellungs-Kategorien">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`settings-tab neuro-hover-lift neuro-focus-ring ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            aria-current={activeTab === tab.id ? 'true' : undefined}
            aria-controls={`tabpanel-${tab.id}`}
            title={tab.description}
          >
            <span className="tab-icon" aria-hidden="true">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      <main className="settings-content" id={`tabpanel-${activeTab}`} role="tabpanel">
        {renderTabContent()}
      </main>
    </div>
  );
});

SettingsDashboard.displayName = 'SettingsDashboard';
