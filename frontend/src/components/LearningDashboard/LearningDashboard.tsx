import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { showToast } from '../Toast';
import { useConfirm } from '../ConfirmDialog';
import { getTimeBasedGreeting, EMPTY_STATE_MESSAGES } from '../../utils/aiPersonality';
import '../../neurodesign.css';
import '../LearningDashboard.css';
import { logError } from '../../utils/errors';
import { HubPage, type TabDef } from '../HubPage';
import { SkeletonLoader } from '../SkeletonLoader';
import { LearningDashboardProps, DashboardData, ProfileData } from './types';
import type { LearningTab } from './types';
import { useTabNavigation } from '../../hooks/useTabNavigation';
import { OverviewTab } from './OverviewTab';
import { FocusTab } from './FocusTab';
import { SuggestionsTab } from './SuggestionsTab';
import { ResearchTab } from './ResearchTab';
import { FeedbackTab } from './FeedbackTab';
import { ProfileTab } from './ProfileTab';

const VALID_TABS: readonly LearningTab[] = ['overview', 'focus', 'suggestions', 'research', 'feedback', 'profile'];

const BASE_TABS: readonly TabDef<LearningTab>[] = [
  { id: 'overview', label: 'Übersicht', icon: '📊' },
  { id: 'focus', label: 'Fokus-Themen', icon: '🎯' },
  { id: 'suggestions', label: 'Vorschläge', icon: '💡' },
  { id: 'research', label: 'Recherchen', icon: '🔬' },
  { id: 'feedback', label: 'Feedback', icon: '💬' },
  { id: 'profile', label: 'Profil', icon: '👤' },
];

export function LearningDashboard({ context, onBack, initialTab = 'overview' }: LearningDashboardProps) {
  const greeting = getTimeBasedGreeting();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const { activeTab, handleTabChange } = useTabNavigation<LearningTab>({
    initialTab,
    validTabs: VALID_TABS,
    defaultTab: 'overview',
    basePath: '/learning',
    rootTab: 'overview',
  });
  const [newFocus, setNewFocus] = useState({ name: '', description: '', keywords: '' });
  const [showAddFocus, setShowAddFocus] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const confirm = useConfirm();

  // AbortController ref to prevent memory leaks on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadDashboard = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/${context}/learning/dashboard`, { signal });
      setData(response.data?.dashboard ?? null);
    } catch (error) {
      // Don't update state if request was aborted
      if (axios.isCancel(error)) return;
      logError('LearningDashboard:loadData', error);
      showToast('Dashboard konnte nicht geladen werden', 'error');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    // Abort any previous request
    abortControllerRef.current?.abort();

    // Create new AbortController
    abortControllerRef.current = new AbortController();
    loadDashboard(abortControllerRef.current.signal);

    // Cleanup: abort on unmount or context change
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadDashboard]);

  // Manual reload handler (for after actions)
  const handleReload = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    loadDashboard(abortControllerRef.current.signal);
  }, [loadDashboard]);

  const handleToggleFocus = async (id: string, isActive: boolean) => {
    try {
      await axios.put(`/api/${context}/focus/${id}/toggle`, { is_active: !isActive });
      showToast(isActive ? 'Fokus deaktiviert' : 'Fokus aktiviert', 'success');
      handleReload();
    } catch (error) {
      showToast('Fehler beim Umschalten', 'error');
    }
  };

  const handleDeleteFocus = async (id: string, name: string) => {
    const confirmed = await confirm({
      title: 'Fokus-Thema löschen',
      message: `Möchtest du "${name}" wirklich löschen?`,
      confirmText: 'Löschen',
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      await axios.delete(`/api/${context}/focus/${id}`);
      showToast('Fokus gelöscht', 'success');
      handleReload();
    } catch (error) {
      showToast('Löschen fehlgeschlagen', 'error');
    }
  };

  const handleAddFocus = async () => {
    if (!newFocus.name.trim()) {
      showToast('Name ist erforderlich', 'error');
      return;
    }

    try {
      await axios.post(`/api/${context}/focus`, {
        name: newFocus.name.trim(),
        description: newFocus.description.trim() || undefined,
        keywords: newFocus.keywords.split(',').map(k => k.trim()).filter(k => k),
      });
      showToast('Fokus-Thema erstellt', 'success');
      setNewFocus({ name: '', description: '', keywords: '' });
      setShowAddFocus(false);
      handleReload();
    } catch (error) {
      showToast('Erstellen fehlgeschlagen', 'error');
    }
  };

  const handleRespondToSuggestion = async (id: string, response: 'accepted' | 'dismissed') => {
    try {
      await axios.put(`/api/${context}/suggestions/${id}/respond`, { response });
      showToast(response === 'accepted' ? 'Vorschlag angenommen' : 'Vorschlag abgelehnt', 'success');
      handleReload();
    } catch (error) {
      showToast('Fehler beim Antworten', 'error');
    }
  };

  const handleViewResearch = async (id: string) => {
    try {
      await axios.put(`/api/${context}/research/${id}/viewed`);
      handleReload();
    } catch (error) {
      logError('LearningDashboard:markAsViewed', error);
      showToast('Aktion fehlgeschlagen', 'error');
    }
  };

  const handleTriggerLearning = async () => {
    try {
      showToast('Lernprozess gestartet...', 'info');
      await axios.post(`/api/${context}/learning/run`);
      showToast('Lernprozess abgeschlossen', 'success');
      handleReload();
    } catch (error) {
      showToast('Lernprozess fehlgeschlagen', 'error');
    }
  };

  const handleCreatePresets = async () => {
    try {
      await axios.post(`/api/${context}/focus/presets`);
      showToast('Preset-Fokus-Themen erstellt', 'success');
      handleReload();
    } catch (error) {
      showToast('Erstellen fehlgeschlagen', 'error');
    }
  };

  const handleAnalyzeProfile = async () => {
    try {
      showToast('Profil-Analyse gestartet...', 'info');
      await axios.post(`/api/${context}/profile/analyze`, { days_back: 30 });
      showToast('Profil-Analyse abgeschlossen', 'success');
      handleReload();
    } catch (error) {
      showToast('Analyse fehlgeschlagen', 'error');
    }
  };

  const handleOpenEditProfile = async () => {
    try {
      const response = await axios.get(`/api/${context}/profile`);
      const profile = response.data.profile;
      setProfileData({
        company_name: profile?.company_name ?? '',
        industry: profile?.industry ?? '',
        role: profile?.role ?? '',
        tech_stack: profile?.tech_stack ?? [],
        pain_points: profile?.pain_points ?? [],
        goals: profile?.goals ?? [],
      });
      setShowEditProfile(true);
    } catch (error) {
      showToast('Profil konnte nicht geladen werden', 'error');
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await axios.put(`/api/${context}/profile`, profileData);
      showToast('Profil gespeichert', 'success');
      setShowEditProfile(false);
      handleReload();
    } catch (error) {
      showToast('Speichern fehlgeschlagen', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  // Tabs with dynamic badges from data
  const tabs = useMemo((): readonly TabDef<LearningTab>[] => {
    if (!data) return BASE_TABS;
    return BASE_TABS.map(tab => {
      switch (tab.id) {
        case 'focus': return { ...tab, badge: data.focus.stats.active_focus_areas || undefined };
        case 'suggestions': return { ...tab, badge: data.suggestions.active.length || undefined };
        case 'research': return { ...tab, badge: data.research.pending.length || undefined };
        default: return tab;
      }
    });
  }, [data]);

  const headerActions = (
    <button
      type="button"
      className="trigger-learning-button neuro-button"
      onClick={handleTriggerLearning}
      aria-label="KI-Lernprozess starten"
    >
      Lernen starten
    </button>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <div className="loading-state neuro-loading-contextual">
          <SkeletonLoader type="card" count={3} />
          <p className="neuro-loading-submessage">{EMPTY_STATE_MESSAGES.learning.description}</p>
        </div>
      );
    }

    if (!data) {
      return (
        <div className="error-state neuro-error-friendly">Dashboard konnte nicht geladen werden</div>
      );
    }

    return (
      <>
        {activeTab === 'overview' && (
          <OverviewTab
            data={data}
            handleRespondToSuggestion={handleRespondToSuggestion}
            handleViewResearch={handleViewResearch}
          />
        )}

        {activeTab === 'focus' && (
          <FocusTab
            activeAreas={data.focus.active_areas}
            stats={data.focus.stats}
            showAddFocus={showAddFocus}
            newFocus={newFocus}
            onToggleFocus={handleToggleFocus}
            onDeleteFocus={handleDeleteFocus}
            onAddFocus={handleAddFocus}
            onCreatePresets={handleCreatePresets}
            onSetShowAddFocus={setShowAddFocus}
            onSetNewFocus={setNewFocus}
          />
        )}

        {activeTab === 'suggestions' && (
          <SuggestionsTab
            suggestions={data.suggestions.active}
            onRespondToSuggestion={handleRespondToSuggestion}
          />
        )}

        {activeTab === 'research' && (
          <ResearchTab
            research={data.research.pending}
            onViewResearch={handleViewResearch}
          />
        )}

        {activeTab === 'feedback' && (
          <FeedbackTab
            stats={data.feedback.stats}
            insights={data.feedback.insights}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileTab
            profileStats={data.profile?.stats}
            showEditProfile={showEditProfile}
            profileData={profileData}
            savingProfile={savingProfile}
            onOpenEditProfile={handleOpenEditProfile}
            onAnalyzeProfile={handleAnalyzeProfile}
            onSaveProfile={handleSaveProfile}
            onSetShowEditProfile={setShowEditProfile}
            onSetProfileData={setProfileData}
          />
        )}
      </>
    );
  };

  return (
    <HubPage
      title={`${greeting.emoji} KI-Lernzentrum`}
      icon="📚"
      subtitle={greeting.subtext}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onBack={onBack}
      headerActions={headerActions}
      ariaLabel="KI-Lernzentrum Navigation"
    >
      {renderContent()}
    </HubPage>
  );
}

export default LearningDashboard;
