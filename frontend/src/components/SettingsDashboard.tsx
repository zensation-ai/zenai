/**
 * SettingsDashboard - Zentrale Einstellungs-Übersicht
 *
 * Konsolidiert alle Einstellungen, KI-Tools und Inhalte
 * Neurowissenschaftliche Optimierungen:
 * - Tab-basierte Navigation für kognitive Entlastung (Miller's Law: 7±2)
 * - Card Grid für bessere Scannability
 * - Progressive Disclosure der Komplexität
 * - Pattern identisch zu InsightsDashboard/AIWorkshop
 */

import { useState, memo } from 'react';
import { PageHeader } from './PageHeader';
import { getBreadcrumbs } from './Breadcrumbs';
import '../neurodesign.css';
import './SettingsDashboard.css';

type SettingsTab = 'tools' | 'content' | 'preferences';

interface SettingsDashboardProps {
  context: 'personal' | 'work';
  currentPage: string;
  onBack: () => void;
  onNavigate: (page: string) => void;
  initialTab?: SettingsTab;
}

const TABS = [
  { id: 'tools' as const, label: 'KI-Tools', icon: '🧠', description: 'KI-Features und Werkzeuge' },
  { id: 'content' as const, label: 'Medien & Notizen', icon: '📁', description: 'Meetings, Medien und Stories' },
  { id: 'preferences' as const, label: 'Einstellungen', icon: '⚙️', description: 'App-Konfiguration' },
];

const SETTINGS_ITEMS = {
  tools: [
    { page: 'ai-workshop', icon: '🧠', label: 'KI-Werkstatt', description: 'Inkubator, Vorschläge, Evolution' },
    { page: 'learning', icon: '📚', label: 'Lernen', description: 'Lernziele und intelligentes Lernen' },
    { page: 'triage', icon: '📋', label: 'Sortieren', description: 'Gedanken schnell organisieren' },
    { page: 'personalization', icon: '🎨', label: 'Personalisierung', description: 'KI auf dich anpassen' },
  ],
  content: [
    { page: 'meetings', icon: '📅', label: 'Meetings', description: 'Meeting-Notizen verwalten' },
    { page: 'media', icon: '🖼️', label: 'Medien', description: 'Bilder und Dateien' },
    { page: 'stories', icon: '📖', label: 'Stories', description: 'Deine Gedanken-Geschichten' },
  ],
  preferences: [
    { page: 'automations', icon: '⚡', label: 'Automationen', description: 'Workflows automatisieren' },
    { page: 'integrations', icon: '🔗', label: 'Integrationen', description: 'Externe Dienste verbinden' },
    { page: 'profile', icon: '👤', label: 'Profil', description: 'Dein Nutzerprofil' },
    { page: 'notifications', icon: '🔔', label: 'Benachrichtigungen', description: 'Benachrichtigungseinstellungen' },
    { page: 'export', icon: '📤', label: 'Export', description: 'Daten exportieren' },
    { page: 'sync', icon: '🔄', label: 'Sync', description: 'Geräte synchronisieren' },
  ],
};

export const SettingsDashboard = memo(({
  context,
  currentPage,
  onBack,
  onNavigate,
  initialTab = 'tools'
}: SettingsDashboardProps) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const currentItems = SETTINGS_ITEMS[activeTab];

  return (
    <div className="settings-dashboard" data-context={context}>
      <PageHeader
        title="Einstellungen"
        icon="⚙️"
        subtitle="Passe My Brain an deine Bedürfnisse an"
        onBack={onBack}
        backLabel="Zurück"
        breadcrumbs={getBreadcrumbs('settings')}
        onNavigate={(page) => onNavigate(page)}
      />

      {/* Tab Navigation - Identisch zu InsightsDashboard Pattern */}
      <nav className="settings-tabs liquid-glass-nav" role="tablist" aria-label="Einstellungs-Kategorien">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`settings-tab neuro-hover-lift neuro-focus-ring ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            title={tab.description}
          >
            <span className="tab-icon" aria-hidden="true">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Card Grid */}
      <main className="settings-content" id={`tabpanel-${activeTab}`} role="tabpanel">
        <div className="settings-grid">
          {currentItems.map((item) => (
            <button
              key={item.page}
              type="button"
              className={`settings-card liquid-glass-card neuro-hover-lift neuro-focus-ring ${currentPage === item.page ? 'active' : ''}`}
              onClick={() => onNavigate(item.page)}
              aria-label={`${item.label}: ${item.description}`}
            >
              <div className="card-header">
                <span className="card-icon-large" aria-hidden="true">{item.icon}</span>
              </div>
              <div className="card-body">
                <h3 className="card-title">{item.label}</h3>
                <p className="card-description">{item.description}</p>
              </div>
              <div className="card-footer">
                <span className="card-arrow" aria-hidden="true">→</span>
              </div>
              <span className="card-glow" aria-hidden="true" />
            </button>
          ))}
        </div>
      </main>
    </div>
  );
});

SettingsDashboard.displayName = 'SettingsDashboard';
