/**
 * CreateAgentTab — NL Agent Builder UI
 *
 * NL description textarea → blueprint preview → save/activate.
 * Phase 143
 */

import { useState, useCallback, type CSSProperties } from 'react';
import axios from 'axios';
import { logError } from '../../utils/errors';
import type { AIContext } from '../ContextSwitcher';
import type { GeneratedBlueprint, AgentBlueprint } from './types';

interface CreateAgentTabProps {
  context: AIContext;
}

const QUICK_STARTS = [
  { label: 'Email Assistent', icon: '📧', prompt: 'Ein Agent der meine eingehenden Emails nach Dringlichkeit sortiert und Antwortvorschläge macht' },
  { label: 'Meeting Prep', icon: '📋', prompt: 'Ein Agent der vor jedem Kalendertermin eine Zusammenfassung der Teilnehmer und relevanter Kontexte erstellt' },
  { label: 'Research Monitor', icon: '🔬', prompt: 'Ein Agent der täglich nach Neuigkeiten zu AI und Machine Learning sucht und relevante Findings speichert' },
  { label: 'Task Planer', icon: '🎯', prompt: 'Ein Agent der jeden Morgen meine Aufgaben nach Priorität sortiert und einen Tagesplan vorschlägt' },
  { label: 'Content Creator', icon: '📅', prompt: 'Ein Agent der wöchentlich Content-Ideen basierend auf Trends und meinem Wissen vorschlägt' },
  { label: 'Knowledge Curator', icon: '🧠', prompt: 'Ein Agent der neue Ideen automatisch mit bestehendem Wissen verknüpft und Duplikate erkennt' },
];

export function CreateAgentTab({ context }: CreateAgentTabProps) {
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedBlueprint | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async (text?: string) => {
    const desc = text || description;
    if (!desc.trim()) return;

    setGenerating(true);
    setError(null);
    setGenerated(null);
    setSaved(false);

    try {
      const res = await axios.post('/api/agents/builder/generate', {
        description: desc,
        context,
      });
      if (res.data?.data) {
        setGenerated(res.data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Generierung fehlgeschlagen');
      logError('CreateAgentTab:generate', err);
    } finally {
      setGenerating(false);
    }
  }, [description, context]);

  const handleSave = useCallback(async () => {
    if (!generated?.blueprint) return;

    setSaving(true);
    setError(null);

    try {
      const bp = generated.blueprint as Partial<AgentBlueprint>;
      const id = bp.name?.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) || 'custom_agent';
      await axios.post('/api/agents/builder/save', {
        blueprint: { ...bp, id, type: bp.type || 'autonomous' },
      });
      setSaved(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Speichern fehlgeschlagen');
      logError('CreateAgentTab:save', err);
    } finally {
      setSaving(false);
    }
  }, [generated]);

  return (
    <div className="create-agent-tab">
      {/* NL Input Section */}
      <div className="agent-teams-section liquid-glass neuro-stagger-item mb-6">
        <h3 className="m-0 mb-4 text-lg">
          Agent erstellen
        </h3>
        <p className="text-[0.85rem] opacity-70 mb-4">
          Beschreibe in natuerlicher Sprache, was dein Agent tun soll. Die KI generiert automatisch die passende Konfiguration.
        </p>

        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="z.B. Ein Agent der jeden Morgen meine wichtigsten Emails zusammenfasst und Antwortvorschläge macht..."
          maxLength={2000}
          className="w-full min-h-[100px] p-3 rounded-lg text-[0.9rem] resize-y font-[inherit] text-inherit border border-glass-border bg-[var(--glass-bg)]"
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-[0.7rem] opacity-50">{description.length}/2000</span>
          <button
            type="button"
            className="neuro-hover-lift px-6 py-2 rounded-lg border-0 text-white text-[0.9rem] bg-[var(--accent-primary,#3b82f6)] [cursor:var(--cur)] [opacity:var(--op)]"
            disabled={!description.trim() || generating}
            onClick={() => handleGenerate()}
            style={{
              '--cur': !description.trim() || generating ? 'not-allowed' : 'pointer',
              '--op': !description.trim() || generating ? 0.5 : 1,
            } as CSSProperties}
          >
            {generating ? 'Generiere...' : 'Generieren'}
          </button>
        </div>
      </div>

      {/* Quick Starts */}
      {!generated && (
        <div className="agent-teams-section liquid-glass neuro-stagger-item mb-6">
          <h4 className="m-0 mb-3 text-[0.95rem]">Schnellstart-Vorlagen</h4>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
            {QUICK_STARTS.map(qs => (
              <button
                key={qs.label}
                type="button"
                className="liquid-glass neuro-hover-lift p-3 rounded-[10px] bg-transparent text-left text-inherit border border-glass-border [cursor:var(--cur)]"
                onClick={() => {
                  setDescription(qs.prompt);
                  handleGenerate(qs.prompt);
                }}
                disabled={generating}
                style={{ '--cur': generating ? 'wait' : 'pointer' } as CSSProperties}
              >
                <span className="text-xl">{qs.icon}</span>
                <div className="font-semibold text-[0.85rem] mt-1">{qs.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 mb-4 rounded-lg bg-red-500/10 text-red-500 text-[0.85rem]">
          {error}
        </div>
      )}

      {/* Generated Preview */}
      {generated && (
        <div className="agent-teams-section liquid-glass neuro-stagger-item">
          <div className="flex justify-between items-center mb-4">
            <h3 className="m-0 text-lg">
              {generated.blueprint.icon} {generated.blueprint.name}
            </h3>
            <div className="flex gap-2 items-center">
              <span className={`text-xs px-2 py-px rounded-xl ${generated.confidence > 0.7 ? 'bg-green-500/20 text-green-500' : 'bg-amber-500/20 text-amber-500'}`}>
                {Math.round(generated.confidence * 100)}% Konfidenz
              </span>
            </div>
          </div>

          <div className="text-[0.85rem] opacity-80 mb-4">{generated.blueprint.description}</div>
          <div className="text-[0.8rem] opacity-60 mb-3">{generated.reasoning}</div>

          {/* Blueprint details */}
          <div className="grid grid-cols-2 gap-2 text-[0.8rem] mb-4">
            <div><strong>Kategorie:</strong> {generated.blueprint.category}</div>
            <div><strong>Typ:</strong> {generated.blueprint.type}</div>
            <div><strong>Max Aktionen/Tag:</strong> {generated.blueprint.maxActionsPerDay}</div>
            <div><strong>Token Budget:</strong> {generated.blueprint.tokenBudgetDaily?.toLocaleString('de-DE')}</div>
            <div><strong>Genehmigung:</strong> {generated.blueprint.approvalRequired ? 'Ja' : 'Nein'}</div>
            <div><strong>Kontext:</strong> {generated.blueprint.defaultContext}</div>
          </div>

          {/* Tools */}
          <div className="mb-4">
            <strong className="text-[0.8rem]">Tools:</strong>
            <div className="flex flex-wrap gap-1 mt-1">
              {generated.blueprint.tools?.map(tool => (
                <span key={tool} className="text-[0.7rem] px-1.5 py-px rounded bg-[var(--glass-bg)]">
                  {tool}
                </span>
              ))}
            </div>
          </div>

          {/* Warnings */}
          {generated.warnings.length > 0 && (
            <div className="mb-4 p-2 rounded-md bg-amber-500/10 text-[0.8rem]">
              {generated.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              className="neuro-hover-lift px-4 py-2 rounded-lg bg-transparent text-inherit cursor-pointer border border-glass-border"
              onClick={() => { setGenerated(null); setSaved(false); }}
            >
              Verwerfen
            </button>
            <button
              type="button"
              className="neuro-hover-lift px-6 py-2 rounded-lg border-0 text-white bg-[var(--bg)] [cursor:var(--cur)] [opacity:var(--op)]"
              disabled={saving || saved}
              onClick={handleSave}
              style={{
                '--bg': saved ? '#22c55e' : 'var(--accent-primary, #3b82f6)',
                '--cur': saving || saved ? 'not-allowed' : 'pointer',
                '--op': saving ? 0.5 : 1,
              } as CSSProperties}
            >
              {saved ? 'Gespeichert!' : saving ? 'Speichere...' : 'Speichern'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
