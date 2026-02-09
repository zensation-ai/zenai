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
import { useSettings } from '../hooks/useSettings';
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
  { id: 'general' as const, label: 'Allgemein', icon: '\u2699\uFE0F', description: 'Erscheinungsbild und Verhalten' },
  { id: 'ai' as const, label: 'KI', icon: '\uD83E\uDDE0', description: 'KI-Modell und Antwort-Stil' },
  { id: 'privacy' as const, label: 'Datenschutz', icon: '\uD83D\uDD12', description: 'Daten-Kontrolle und Privatsph\u00E4re' },
];

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (val: boolean) => void; label: string }) {
  return (
    <label className="settings-toggle" aria-label={label}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="settings-toggle-slider" />
    </label>
  );
}

function SettingsSelect({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
  label: string;
}) {
  return (
    <select
      className="settings-select neuro-focus-ring"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export const SettingsDashboard = memo(({
  context,
  onBack,
  onNavigate,
  initialTab = 'general'
}: SettingsDashboardProps) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const { settings, updateSetting } = useSettings();

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
                  <span className="settings-item-desc">Wähle dein bevorzugtes Erscheinungsbild</span>
                </div>
                <SettingsSelect
                  value={settings.theme}
                  onChange={(val) => updateSetting('theme', val as 'dark' | 'light' | 'auto')}
                  label="Farbschema"
                  options={[
                    { value: 'dark', label: 'Dunkel' },
                    { value: 'light', label: 'Hell' },
                    { value: 'auto', label: 'Automatisch' },
                  ]}
                />
              </div>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Sprache</span>
                  <span className="settings-item-desc">Anzeigesprache der App</span>
                </div>
                <SettingsSelect
                  value={settings.language}
                  onChange={(val) => updateSetting('language', val as 'de' | 'en')}
                  label="Sprache"
                  options={[
                    { value: 'de', label: 'Deutsch' },
                    { value: 'en', label: 'English' },
                  ]}
                />
              </div>
            </div>

            <div className="settings-group">
              <h3 className="settings-group-title">Verhalten</h3>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Startseite</span>
                  <span className="settings-item-desc">Was beim App-Start angezeigt wird</span>
                </div>
                <SettingsSelect
                  value={settings.startPage}
                  onChange={(val) => updateSetting('startPage', val as 'home' | 'ideas' | 'insights')}
                  label="Startseite"
                  options={[
                    { value: 'home', label: 'Dashboard' },
                    { value: 'ideas', label: 'Gedanken' },
                    { value: 'insights', label: 'Insights' },
                  ]}
                />
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
                  <span className="settings-item-desc">Primäres Sprachmodell für Antworten</span>
                </div>
                <SettingsSelect
                  value={settings.aiModel}
                  onChange={(val) => updateSetting('aiModel', val as 'claude-sonnet' | 'claude-haiku' | 'ollama')}
                  label="KI-Modell"
                  options={[
                    { value: 'claude-sonnet', label: 'Claude Sonnet' },
                    { value: 'claude-haiku', label: 'Claude Haiku' },
                    { value: 'ollama', label: 'Ollama (Lokal)' },
                  ]}
                />
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
                <ToggleSwitch
                  checked={settings.proactiveSuggestions}
                  onChange={(val) => updateSetting('proactiveSuggestions', val)}
                  label="Proaktive Vorschläge"
                />
              </div>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">Memory-System</span>
                  <span className="settings-item-desc">HiMeS 4-Layer Architektur</span>
                </div>
                <ToggleSwitch
                  checked={settings.memorySystem}
                  onChange={(val) => updateSetting('memorySystem', val)}
                  label="Memory-System"
                />
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
                <ToggleSwitch
                  checked={settings.dataProcessing}
                  onChange={(val) => updateSetting('dataProcessing', val)}
                  label="Datenverarbeitung"
                />
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
            aria-selected={activeTab === tab.id ? true : undefined}
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
