/**
 * UserSettingsPage - Benutzer-Einstellungen
 *
 * Tabs: profile, account, general, privacy, data
 */

import { memo, Suspense, lazy, useCallback, useState, useMemo } from 'react';
import { AIContext } from '../ContextSwitcher';
import { HubPage, type TabDef } from '../HubPage';
import { SkeletonLoader } from '../SkeletonLoader';
import { useSettings } from '../../hooks/useSettings';
import { useTheme } from '../../contexts/ThemeContext';
import { useTabNavigation } from '../../hooks/useTabNavigation';
import { FEATURE_HINTS, STORAGE_KEY_PREFIX } from '../../constants/featureHints';
import { useBillingStatus } from '../../hooks/queries/useBilling';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { Page } from '../../types';

const ProfileDashboard = lazy(() => import('../ProfileDashboard').then(m => ({ default: m.ProfileDashboard })));
const MemoryGovernance = lazy(() => import('../MemoryGovernance').then(m => ({ default: m.MemoryGovernance })));
const DataManagement = lazy(() => import('../DataManagement').then(m => ({ default: m.DataManagement })));

// Inlined from SettingsDashboard — shared components
const AccountTab = lazy(() => import('./AccountTab').then(m => ({ default: m.AccountTab })));
const BillingTab = lazy(() => import('./BillingTab').then(m => ({ default: m.BillingTab })));
const ConsentTab = lazy(() => import('./ConsentTab').then(m => ({ default: m.ConsentTab })));

type UserTab = 'profile' | 'account' | 'general' | 'privacy' | 'consent' | 'data' | 'billing';

interface UserSettingsPageProps {
  context: AIContext;
  onBack: () => void;
  onNavigate: (page: Page) => void;
  initialTab?: UserTab;
}

const TABS: readonly TabDef<UserTab>[] = [
  { id: 'profile', label: 'Profil', icon: '👤', description: 'Benutzerprofil und Business-Daten' },
  { id: 'account', label: 'Konto', icon: '🔐', description: 'Passwort, MFA und Sessions' },
  { id: 'general', label: 'Allgemein', icon: '⚙️', description: 'Erscheinungsbild und Verhalten' },
  { id: 'privacy', label: 'Datenschutz', icon: '🔒', description: 'Daten-Kontrolle und Privatsphäre' },
  { id: 'consent', label: 'Consent', icon: '✅', description: 'Einwilligungen (DSGVO Art. 6/7)' },
  { id: 'data', label: 'Daten', icon: '📦', description: 'Export und Synchronisation' },
  { id: 'billing', label: 'Abonnement', icon: '💳', description: 'Plan, Upgrades und Zahlungsverwaltung' },
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

export const UserSettingsPage = memo(({
  context,
  onBack,
  onNavigate,
  initialTab = 'general',
}: UserSettingsPageProps) => {
  const { activeTab, handleTabChange } = useTabNavigation<UserTab>({
    initialTab,
    validTabs: TABS.map(t => t.id),
    defaultTab: 'general',
    basePath: '/system/benutzer',
    rootTab: 'general',
  });

  const { data: billingStatus } = useBillingStatus();
  const tabsWithBadge = useMemo<readonly TabDef<UserTab>[]>(() => {
    const plan = billingStatus?.plan ?? 'free';
    const PLAN_LABELS = { free: 'Free', pro: 'Pro', enterprise: 'Enterprise' } as const;
    return TABS.map(t =>
      t.id === 'billing' ? { ...t, badge: PLAN_LABELS[plan] } : t,
    );
  }, [billingStatus?.plan]);
  const { settings, updateSetting } = useSettings();
  const { setTheme } = useTheme();

  // Map between settings 'auto' and ThemeContext 'system'
  const handleThemeChange = useCallback((val: string) => {
    updateSetting('theme', val as 'dark' | 'light' | 'auto');
    const themeMap: Record<string, 'dark' | 'light' | 'system'> = {
      dark: 'dark',
      light: 'light',
      auto: 'system',
    };
    setTheme(themeMap[val] ?? 'dark');
  }, [updateSetting, setTheme]);

  const [hintsResetMsg, setHintsResetMsg] = useState(false);
  const handleResetHints = useCallback(() => {
    FEATURE_HINTS.forEach(hint => {
      try { localStorage.removeItem(`${STORAGE_KEY_PREFIX}${hint.id}`); } catch { /* noop */ }
    });
    setHintsResetMsg(true);
    setTimeout(() => setHintsResetMsg(false), 4000);
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <Suspense fallback={<TabLoader />}>
            <ProfileDashboard onBack={() => handleTabChange('general')} context={context} embedded />
          </Suspense>
        );

      case 'account':
        return (
          <Suspense fallback={<TabLoader />}>
            <AccountTab />
          </Suspense>
        );

      case 'general':
        return (
          <div className="flex flex-col gap-8">
            <div className="glass rounded-lg border border-glass-border overflow-hidden">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary px-5 pt-4 pb-2 m-0">Erscheinungsbild</h2>
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-border/10">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-text">Farbschema</span>
                  <span className="text-xs text-text-secondary">Wähle dein bevorzugtes Erscheinungsbild</span>
                </div>
                <SettingsSelect
                  value={settings.theme}
                  onChange={handleThemeChange}
                  label="Farbschema"
                  options={[
                    { value: 'dark', label: 'Dunkel' },
                    { value: 'light', label: 'Hell' },
                    { value: 'auto', label: 'Automatisch' },
                  ]}
                />
              </div>
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-border/10">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-text">Sprache</span>
                  <span className="text-xs text-text-secondary">Anzeigesprache der App</span>
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

            <div className="glass rounded-lg border border-glass-border overflow-hidden">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary px-5 pt-4 pb-2 m-0">Verhalten</h2>
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-border/10">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-text">Startseite</span>
                  <span className="text-xs text-text-secondary">Was beim App-Start angezeigt wird</span>
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
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-border/10">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-text">Kontext</span>
                  <span className="text-xs text-text-secondary">Aktueller Arbeitsbereich</span>
                </div>
                <span className="text-sm text-text-muted bg-surface-hover px-3 py-1 rounded-md">{{ operations: 'Operativ', finance: 'Finanzen', people: 'Team', strategy: 'Strategie' }[context] || context}</span>
              </div>
            </div>

            <div className="glass rounded-lg border border-glass-border overflow-hidden">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary px-5 pt-4 pb-2 m-0">Hilfe</h2>
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-border/10">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-text">Feature-Hinweise zurücksetzen</span>
                  <span className="text-xs text-text-secondary">Zeigt die Einführungshinweise auf jeder Seite erneut an</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetHints}
                >
                  {hintsResetMsg ? '\u2713 Zurückgesetzt' : 'Zurücksetzen'}
                </Button>
              </div>
            </div>
          </div>
        );

      case 'privacy':
        return (
          <Suspense fallback={<TabLoader />}>
            <MemoryGovernance context={context} />
          </Suspense>
        );

      case 'consent':
        return (
          <Suspense fallback={<TabLoader />}>
            <ConsentTab />
          </Suspense>
        );

      case 'data':
        return (
          <Suspense fallback={<TabLoader />}>
            <DataManagement context={context} />
          </Suspense>
        );

      case 'billing':
        return (
          <Suspense fallback={<TabLoader />}>
            <BillingTab />
          </Suspense>
        );

      default:
        return null;
    }
  };

  return (
    <HubPage
      title="Benutzer"
      icon="👤"
      subtitle="Profil, Konto und Daten"
      tabs={tabsWithBadge}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onBack={onBack}
      context={context}
      onNavigate={onNavigate}
      ariaLabel="Benutzer-Einstellungen"
    >
      {renderTabContent()}
    </HubPage>
  );
});

UserSettingsPage.displayName = 'UserSettingsPage';
