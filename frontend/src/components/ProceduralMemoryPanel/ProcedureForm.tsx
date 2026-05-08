/**
 * ProcedureForm — Create/edit form for procedures.
 *
 * Extracted from ProceduralMemoryPanel.tsx (Phase 121).
 */

import { useState, useCallback, type CSSProperties } from 'react';
import axios from 'axios';
import { OUTCOME_STYLES } from './types';

interface ProcedureFormProps {
  context: string;
  onSaved: () => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}

export function ProcedureForm({ context, onSaved, onCancel, onError }: ProcedureFormProps) {
  const [recordForm, setRecordForm] = useState({
    trigger: '',
    steps: [''],
    tools_used: [''],
    outcome: 'success' as 'success' | 'failure' | 'partial',
    context_tags: [''],
  });
  const [recording, setRecording] = useState(false);

  const handleRecordProcedure = useCallback(async () => {
    if (!recordForm.trigger.trim()) return;
    setRecording(true);
    try {
      const payload = {
        trigger: recordForm.trigger.trim(),
        steps: recordForm.steps.filter(s => s.trim()),
        tools_used: recordForm.tools_used.filter(t => t.trim()),
        outcome: recordForm.outcome,
        context_tags: recordForm.context_tags.filter(t => t.trim()),
      };
      if (payload.steps.length === 0) {
        onError('Mindestens ein Schritt ist erforderlich');
        setRecording(false);
        return;
      }
      await axios.post(`/api/${context}/memory/procedures`, payload);
      setRecordForm({ trigger: '', steps: [''], tools_used: [''], outcome: 'success', context_tags: [''] });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Fehler beim Speichern der Prozedur');
    } finally {
      setRecording(false);
    }
  }, [context, recordForm, onSaved, onError]);

  const addListItem = (field: 'steps' | 'tools_used' | 'context_tags') => {
    setRecordForm(prev => ({ ...prev, [field]: [...prev[field], ''] }));
  };

  const removeListItem = (field: 'steps' | 'tools_used' | 'context_tags', index: number) => {
    setRecordForm(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const updateListItem = (field: 'steps' | 'tools_used' | 'context_tags', index: number, value: string) => {
    setRecordForm(prev => ({
      ...prev,
      [field]: prev[field].map((item, i) => (i === index ? value : item)),
    }));
  };

  return (
    <div className="p-5 mb-4 rounded-[14px] border border-white/[0.08] bg-white/[0.03] backdrop-blur-[16px]">
      <h4 className="m-0 mb-4 text-[0.95rem] font-semibold">
        Neue Prozedur erfassen
      </h4>

      {/* Trigger */}
      <div className="mb-3">
        <label className="block text-[0.72rem] font-medium text-white/50 mb-1 uppercase tracking-[0.03em]">
          Trigger
        </label>
        <input
          type="text"
          value={recordForm.trigger}
          onChange={e => setRecordForm(f => ({ ...f, trigger: e.target.value }))}
          placeholder="Wann wird diese Prozedur ausgelöst?"
          className="w-full box-border py-2 px-3 rounded-lg border border-white/10 bg-white/[0.04] text-inherit text-[0.85rem] outline-none"
        />
      </div>

      {/* Steps */}
      <div className="mb-3">
        <label className="block text-[0.72rem] font-medium text-white/50 mb-1 uppercase tracking-[0.03em]">
          Schritte
        </label>
        {recordForm.steps.map((step, idx) => (
          <div key={idx} className="flex gap-1.5 mb-1.5">
            <span className="opacity-40 text-[0.8rem] py-2 min-w-[1.5rem]">{idx + 1}.</span>
            <input
              type="text"
              value={step}
              onChange={e => updateListItem('steps', idx, e.target.value)}
              placeholder={`Schritt ${idx + 1}`}
              className="flex-1 py-[0.45rem] px-[0.65rem] rounded-md border border-white/10 bg-white/[0.04] text-inherit text-[0.82rem] outline-none"
            />
            {recordForm.steps.length > 1 && (
              <button
                onClick={() => removeListItem('steps', idx)}
                className="py-[0.3rem] px-2 rounded-md border border-red-500/20 bg-transparent text-red-400 cursor-pointer text-xs"
              >
                x
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => addListItem('steps')}
          className="py-[0.3rem] px-[0.6rem] rounded-md border border-white/[0.08] bg-transparent text-white/50 cursor-pointer text-xs"
        >
          + Schritt
        </button>
      </div>

      {/* Tools Used */}
      <div className="mb-3">
        <label className="block text-[0.72rem] font-medium text-white/50 mb-1 uppercase tracking-[0.03em]">
          Verwendete Tools
        </label>
        <div className="flex flex-wrap gap-1.5">
          {recordForm.tools_used.map((tool, idx) => (
            <div key={idx} className="flex gap-1">
              <input
                type="text"
                value={tool}
                onChange={e => updateListItem('tools_used', idx, e.target.value)}
                placeholder="Tool-Name"
                className="w-[120px] py-[0.35rem] px-[0.55rem] rounded-md border border-violet-500/20 bg-violet-500/5 text-[#3da5b8] text-[0.78rem] outline-none"
              />
              {recordForm.tools_used.length > 1 && (
                <button
                  onClick={() => removeListItem('tools_used', idx)}
                  className="py-[0.2rem] px-[0.4rem] rounded border-0 bg-transparent text-red-400 cursor-pointer text-[0.7rem]"
                >
                  x
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => addListItem('tools_used')}
            className="py-[0.3rem] px-2 rounded-md border border-white/[0.08] bg-transparent text-white/50 cursor-pointer text-[0.72rem]"
          >
            + Tool
          </button>
        </div>
      </div>

      {/* Outcome */}
      <div className="mb-3">
        <label className="block text-[0.72rem] font-medium text-white/50 mb-1 uppercase tracking-[0.03em]">
          Ergebnis
        </label>
        <div className="flex gap-2">
          {(['success', 'partial', 'failure'] as const).map(outcome => {
            const style = OUTCOME_STYLES[outcome];
            const isSelected = recordForm.outcome === outcome;
            return (
              <button
                key={outcome}
                onClick={() => setRecordForm(f => ({ ...f, outcome }))}
                className={`py-[0.4rem] px-3 rounded-lg cursor-pointer text-[0.8rem] transition-all duration-150 border bg-[var(--bg)] text-[var(--c)] [border-color:var(--bd)] ${isSelected ? 'font-semibold' : 'font-normal'}`}
                style={{
                  '--bd': isSelected ? style.color : 'rgba(255,255,255,0.1)',
                  '--bg': isSelected ? `${style.color}22` : 'transparent',
                  '--c': isSelected ? style.color : 'rgba(255,255,255,0.5)',
                } as CSSProperties}
              >
                {style.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Context Tags */}
      <div className="mb-4">
        <label className="block text-[0.72rem] font-medium text-white/50 mb-1 uppercase tracking-[0.03em]">
          Kontext-Tags
        </label>
        <div className="flex flex-wrap gap-1.5">
          {recordForm.context_tags.map((tag, idx) => (
            <div key={idx} className="flex gap-1">
              <input
                type="text"
                value={tag}
                onChange={e => updateListItem('context_tags', idx, e.target.value)}
                placeholder="Tag"
                className="w-[100px] py-[0.35rem] px-[0.55rem] rounded-md border border-white/10 bg-white/[0.04] text-inherit text-[0.78rem] outline-none"
              />
              {recordForm.context_tags.length > 1 && (
                <button
                  onClick={() => removeListItem('context_tags', idx)}
                  className="py-[0.2rem] px-[0.4rem] rounded border-0 bg-transparent text-red-400 cursor-pointer text-[0.7rem]"
                >
                  x
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => addListItem('context_tags')}
            className="py-[0.3rem] px-2 rounded-md border border-white/[0.08] bg-transparent text-white/50 cursor-pointer text-[0.72rem]"
          >
            + Tag
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleRecordProcedure}
          disabled={!recordForm.trigger.trim() || recording}
          className="py-2 px-5 rounded-lg border-0 text-white text-[0.85rem] font-medium transition-opacity duration-200 [background:linear-gradient(135deg,#144A56_0%,#1a6b7a_100%)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {recording ? 'Speichere...' : 'Prozedur speichern'}
        </button>
        <button
          onClick={onCancel}
          className="py-2 px-4 rounded-lg border border-white/10 bg-transparent text-white/60 text-[0.85rem] cursor-pointer"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
