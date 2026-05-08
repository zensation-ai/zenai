import { useState, useCallback } from 'react';
import { safeLocalStorage } from '../utils/storage';

export interface DiscoverableFeature {
  id: string;
  label: string;
  description: string;
}

export const DISCOVERABLE_FEATURES: DiscoverableFeature[] = [
  { id: 'chat', label: 'Chat gestartet', description: 'Erste Unterhaltung mit der KI' },
  { id: 'idea_created', label: 'Gedanke erfasst', description: 'Ersten Gedanken erstellt' },
  { id: 'memory_used', label: 'Erinnerung genutzt', description: 'KI-Gedächtnis verwendet' },
  { id: 'rag_search', label: 'Wissenssuche', description: 'Semantic Search genutzt' },
  { id: 'document_uploaded', label: 'Dokument hochgeladen', description: 'Datei in Wissensbasis' },
  { id: 'calendar_event', label: 'Termin erstellt', description: 'Erstes Kalenderevent' },
  { id: 'streak_3', label: '3-Tage-Streak', description: '3 Tage in Folge aktiv' },
  { id: 'voice_used', label: 'Spracheingabe', description: 'Voice-Feature genutzt' },
  { id: 'agent_run', label: 'Agent gestartet', description: 'KI-Agent ausgeführt' },
  { id: 'context_switch', label: 'Kontext gewechselt', description: 'Zwischen Kontexten navigiert' },
  { id: 'code_executed', label: 'Code ausgeführt', description: 'Code-Sandbox verwendet' },
  { id: 'web_search', label: 'Websuche', description: 'Web-Suche in Chat genutzt' },
];

const STORAGE_KEY = 'zenai_feature_discovery';
const DISMISSED_KEY = 'zenai_feature_discovery_dismissed';

interface DiscoveryState {
  discovered: Set<string>;
  dismissed: boolean;
}

function readState(): DiscoveryState {
  const raw = safeLocalStorage('get', STORAGE_KEY);
  const dismissed = safeLocalStorage('get', DISMISSED_KEY) === 'true';
  try {
    const ids: string[] = raw ? JSON.parse(raw) : [];
    return { discovered: new Set(ids), dismissed };
  } catch {
    return { discovered: new Set(), dismissed };
  }
}

function writeDiscovered(ids: Set<string>): void {
  safeLocalStorage('set', STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

export function useFeatureDiscovery() {
  const [state, setState] = useState<DiscoveryState>(readState);

  const markDiscovered = useCallback((featureId: string) => {
    setState(prev => {
      if (prev.discovered.has(featureId)) return prev;
      const next = new Set(prev.discovered);
      next.add(featureId);
      writeDiscovered(next);
      return { ...prev, discovered: next };
    });
  }, []);

  const dismiss = useCallback(() => {
    safeLocalStorage('set', DISMISSED_KEY, 'true');
    setState(prev => ({ ...prev, dismissed: true }));
  }, []);

  const completedCount = state.discovered.size;
  const totalCount = DISCOVERABLE_FEATURES.length;
  const visible = !state.dismissed && completedCount < totalCount;

  return {
    features: DISCOVERABLE_FEATURES,
    discovered: state.discovered,
    completedCount,
    totalCount,
    visible,
    markDiscovered,
    dismiss,
  };
}
