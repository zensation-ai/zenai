/**
 * AISettingsPage - KI-Einstellungen
 *
 * Tabs: ai, automations, proactive-rules, context-rules, on-device-ai
 */

import { memo, Suspense, lazy } from 'react';
import { AIContext } from '../ContextSwitcher';
import { HubPage, type TabDef } from '../HubPage';
import { SkeletonLoader } from '../SkeletonLoader';
import { useSettings } from '../../hooks/useSettings';
import { useTabNavigation } from '../../hooks/useTabNavigation';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Page } from '../../types';

const AutomationDashboard = lazy(() => import('../AutomationDashboard').then(m => ({ default: m.AutomationDashboard })));
const ProactiveRulesPanel = lazy(() => import('../ProactiveRulesPanel').then(m => ({ default: m.ProactiveRulesPanel })));
const ContextRulesPanel = lazy(() => import('../ContextRulesPanel').then(m => ({ default: m.ContextRulesPanel })));
const OnDeviceAISettings = lazy(() => import('../OnDeviceAI/OnDeviceAISettings').then(m => ({ default: m.OnDeviceAISettings })));

type AITab = 'ai' | 'automations' | 'proactive-rules' | 'context-rules' | 'on-device-ai';

interface AISettingsPageProps {
  context: AIContext;
  onBack: () => void;
  onNavigate: (page: Page) => void;
  initialTab?: AITab;
}

const TABS: readonly TabDef<AITab>[] = [
  { id: 'ai', label: 'KI', icon: '🧠', description: 'KI-Modell und Antwort-Stil' },
  { id: 'automations', label: 'Automationen', icon: '⚡', description: 'Workflows und AI-Vorschläge' },
  { id: 'proactive-rules', label: 'Proaktiv-Regeln', icon: '🎯', description: 'Proaktive Event-Regeln verwalten' },
  { id: 'context-rules', label: 'Kontext-Regeln', icon: '🧭', description: 'Domain-basierte Kontext-Steuerung' },
  { id: 'on-device-ai', label: 'Lokale KI', icon: '🖥️', description: 'On-Device KI und Datenschutz-Modus' },
];

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
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={label} className="min-w-[140px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const TabLoader = () => (
  <div className="py-4">
    <SkeletonLoader type="card" count={3} />
  </div>
);

export const AISettingsPage = memo(({
  context,
  onBack,
  onNavigate,
  initialTab = 'ai',
}: AISettingsPageProps) => {
  const { activeTab, handleTabChange } = useTabNavigation<AITab>({
    initialTab,
    validTabs: TABS.map(t => t.id),
    defaultTab: 'ai',
    basePath: '/system/ki',
    rootTab: 'ai',
  });
  const { settings, updateSetting } = useSettings();

  const renderTabContent = () => {
    switch (activeTab) {
      case 'ai':
        return (
          <div className="flex flex-col gap-8">
            <div className="glass rounded-lg border border-glass-border overflow-hidden">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary px-5 pt-4 pb-2 m-0">KI-Modell</h3>
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-border/10">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-text">Aktives Modell</span>
                  <span className="text-xs text-text-secondary">Primäres Sprachmodell für Antworten</span>
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
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-border/10">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-text">Fallback</span>
                  <span className="text-xs text-text-secondary">Lokales Modell bei Ausfall</span>
                </div>
                <span className="text-sm text-text-muted bg-surface-hover px-3 py-1 rounded-md">Ollama</span>
              </div>
            </div>

            <div className="glass rounded-lg border border-glass-border overflow-hidden">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary px-5 pt-4 pb-2 m-0">Verhalten</h3>
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-border/10">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-text">Proaktive Vorschläge</span>
                  <span className="text-xs text-text-secondary">KI schlägt eigenständig Ideen vor</span>
                </div>
                <Switch
                  checked={settings.proactiveSuggestions}
                  onCheckedChange={(val) => updateSetting('proactiveSuggestions', val)}
                  aria-label="Proaktive Vorschläge"
                />
              </div>
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-border/10">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-text">Memory-System</span>
                  <span className="text-xs text-text-secondary">HiMeS 4-Layer Architektur</span>
                </div>
                <Switch
                  checked={settings.memorySystem}
                  onCheckedChange={(val) => updateSetting('memorySystem', val)}
                  aria-label="Memory-System"
                />
              </div>
            </div>
          </div>
        );

      case 'automations':
        return (
          <Suspense fallback={<TabLoader />}>
            <AutomationDashboard context={context} onBack={() => handleTabChange('ai')} embedded />
          </Suspense>
        );

      case 'proactive-rules':
        return (
          <Suspense fallback={<TabLoader />}>
            <ProactiveRulesPanel context={context} />
          </Suspense>
        );

      case 'context-rules':
        return (
          <Suspense fallback={<TabLoader />}>
            <ContextRulesPanel context={context} />
          </Suspense>
        );

      case 'on-device-ai':
        return (
          <Suspense fallback={<TabLoader />}>
            <OnDeviceAISettings context={context} />
          </Suspense>
        );

      default:
        return null;
    }
  };

  return (
    <HubPage
      title="KI-Einstellungen"
      icon="🧠"
      subtitle="Modell, Automationen und Kontext-Regeln"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onBack={onBack}
      context={context}
      onNavigate={onNavigate}
      ariaLabel="KI-Einstellungen"
    >
      {renderTabContent()}
    </HubPage>
  );
});

AISettingsPage.displayName = 'AISettingsPage';
