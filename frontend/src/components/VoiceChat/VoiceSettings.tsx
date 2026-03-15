/**
 * Voice Settings Panel
 *
 * Collapsible settings for voice chat: TTS voice, language,
 * VAD sensitivity, silence threshold, auto-send toggle.
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './VoiceSettings.css';

interface VoiceSettingsProps {
  context: string;
}

interface VoiceSettingsData {
  stt_provider: string;
  tts_provider: string;
  tts_voice: string;
  language: string;
  vad_sensitivity: number;
  silence_threshold_ms: number;
  auto_send: boolean;
}

interface VoiceInfo {
  id: string;
  name: string;
  language?: string;
  provider?: string;
}

const LANGUAGES = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Francais' },
  { code: 'es', label: 'Espanol' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Portugues' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
];

const DEFAULT_SETTINGS: VoiceSettingsData = {
  stt_provider: 'whisper',
  tts_provider: 'edge-tts',
  tts_voice: '',
  language: 'de',
  vad_sensitivity: 0.5,
  silence_threshold_ms: 1500,
  auto_send: true,
};

export const VoiceSettings: React.FC<VoiceSettingsProps> = ({ context }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<VoiceSettingsData>(DEFAULT_SETTINGS);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Load settings and voices when panel opens
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [settingsRes, voicesRes] = await Promise.all([
          axios.get(`/api/${context}/voice/settings`).catch(() => null),
          axios.get(`/api/${context}/voice/voices`).catch(() => null),
        ]);

        if (settingsRes?.data?.data) {
          setSettings((prev) => ({ ...prev, ...settingsRes.data.data }));
        } else if (settingsRes?.data) {
          // Handle flat response shape
          const d = settingsRes.data;
          if (d.tts_voice !== undefined) {
            setSettings((prev) => ({ ...prev, ...d }));
          }
        }

        if (voicesRes?.data?.data) {
          setVoices(voicesRes.data.data);
        } else if (Array.isArray(voicesRes?.data)) {
          setVoices(voicesRes.data);
        } else if (Array.isArray(voicesRes?.data?.voices)) {
          setVoices(voicesRes.data.voices);
        }
      } catch {
        setError('Einstellungen konnten nicht geladen werden');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isOpen, context]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await axios.put(`/api/${context}/voice/settings`, settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }, [context, settings]);

  const updateSetting = useCallback(<K extends keyof VoiceSettingsData>(
    key: K,
    value: VoiceSettingsData[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  return (
    <div className="voice-settings">
      <button
        className="voice-settings-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
        </svg>
        <span>Sprach-Einstellungen</span>
        <svg
          className={`voice-settings-chevron ${isOpen ? 'voice-settings-chevron-open' : ''}`}
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="currentColor"
        >
          <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
        </svg>
      </button>

      {isOpen && (
        <div className="voice-settings-panel">
          {loading ? (
            <div className="voice-settings-loading">Lade Einstellungen...</div>
          ) : (
            <>
              {/* TTS Voice */}
              <div className="voice-settings-field">
                <label className="voice-settings-label">TTS Stimme</label>
                <select
                  className="voice-settings-select"
                  value={settings.tts_voice}
                  onChange={(e) => updateSetting('tts_voice', e.target.value)}
                >
                  <option value="">Standard</option>
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}{v.language ? ` (${v.language})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Language */}
              <div className="voice-settings-field">
                <label className="voice-settings-label">Sprache</label>
                <select
                  className="voice-settings-select"
                  value={settings.language}
                  onChange={(e) => updateSetting('language', e.target.value)}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* VAD Sensitivity */}
              <div className="voice-settings-field">
                <label className="voice-settings-label">
                  VAD Empfindlichkeit
                  <span className="voice-settings-value">
                    {Math.round(settings.vad_sensitivity * 100)}%
                  </span>
                </label>
                <input
                  type="range"
                  className="voice-settings-slider"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.vad_sensitivity}
                  onChange={(e) => updateSetting('vad_sensitivity', parseFloat(e.target.value))}
                />
                <div className="voice-settings-range-labels">
                  <span>Niedrig</span>
                  <span>Hoch</span>
                </div>
              </div>

              {/* Silence Threshold */}
              <div className="voice-settings-field">
                <label className="voice-settings-label">
                  Stille-Schwelle
                  <span className="voice-settings-value">
                    {settings.silence_threshold_ms}ms
                  </span>
                </label>
                <input
                  type="range"
                  className="voice-settings-slider"
                  min="500"
                  max="3000"
                  step="100"
                  value={settings.silence_threshold_ms}
                  onChange={(e) => updateSetting('silence_threshold_ms', parseInt(e.target.value, 10))}
                />
                <div className="voice-settings-range-labels">
                  <span>500ms</span>
                  <span>3000ms</span>
                </div>
              </div>

              {/* Auto-Send */}
              <div className="voice-settings-field voice-settings-toggle-field">
                <label className="voice-settings-label">Auto-Senden</label>
                <button
                  className={`voice-settings-toggle-btn ${settings.auto_send ? 'voice-settings-toggle-on' : ''}`}
                  onClick={() => updateSetting('auto_send', !settings.auto_send)}
                  role="switch"
                  aria-checked={settings.auto_send}
                >
                  <span className="voice-settings-toggle-knob" />
                </button>
              </div>

              {/* Error / Success */}
              {error && <div className="voice-settings-error">{error}</div>}
              {saved && <div className="voice-settings-saved">Gespeichert</div>}

              {/* Save Button */}
              <button
                className="voice-settings-save"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Speichere...' : 'Einstellungen speichern'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default VoiceSettings;
