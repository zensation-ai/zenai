/**
 * ProcedureForm — Create/edit form for procedures.
 *
 * Extracted from ProceduralMemoryPanel.tsx (Phase 121).
 */

import { useState, useCallback } from 'react';
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
    <div style={{
      padding: '1.25rem',
      marginBottom: '1rem',
      borderRadius: '14px',
      border: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.03)',
      backdropFilter: 'blur(16px)',
    }}>
      <h4 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontWeight: 600 }}>
        Neue Prozedur erfassen
      </h4>

      {/* Trigger */}
      <div style={{ marginBottom: '0.75rem' }}>
        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          Trigger
        </label>
        <input
          type="text"
          value={recordForm.trigger}
          onChange={e => setRecordForm(f => ({ ...f, trigger: e.target.value }))}
          placeholder="Wann wird diese Prozedur ausgeloest?"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '0.55rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)',
            color: 'inherit',
            fontSize: '0.85rem',
            outline: 'none',
          }}
        />
      </div>

      {/* Steps */}
      <div style={{ marginBottom: '0.75rem' }}>
        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          Schritte
        </label>
        {recordForm.steps.map((step, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.375rem' }}>
            <span style={{ opacity: 0.4, fontSize: '0.8rem', padding: '0.5rem 0', minWidth: '1.5rem' }}>{idx + 1}.</span>
            <input
              type="text"
              value={step}
              onChange={e => updateListItem('steps', idx, e.target.value)}
              placeholder={`Schritt ${idx + 1}`}
              style={{
                flex: 1,
                padding: '0.45rem 0.65rem',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)',
                color: 'inherit',
                fontSize: '0.82rem',
                outline: 'none',
              }}
            />
            {recordForm.steps.length > 1 && (
              <button
                onClick={() => removeListItem('steps', idx)}
                style={{
                  padding: '0.3rem 0.5rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(239,68,68,0.2)',
                  background: 'transparent',
                  color: '#f87171',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                }}
              >
                x
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => addListItem('steps')}
          style={{
            padding: '0.3rem 0.6rem',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'transparent',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            fontSize: '0.75rem',
          }}
        >
          + Schritt
        </button>
      </div>

      {/* Tools Used */}
      <div style={{ marginBottom: '0.75rem' }}>
        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          Verwendete Tools
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          {recordForm.tools_used.map((tool, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '0.25rem' }}>
              <input
                type="text"
                value={tool}
                onChange={e => updateListItem('tools_used', idx, e.target.value)}
                placeholder="Tool-Name"
                style={{
                  width: '120px',
                  padding: '0.35rem 0.55rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(139,92,246,0.2)',
                  background: 'rgba(139,92,246,0.05)',
                  color: '#a78bfa',
                  fontSize: '0.78rem',
                  outline: 'none',
                }}
              />
              {recordForm.tools_used.length > 1 && (
                <button
                  onClick={() => removeListItem('tools_used', idx)}
                  style={{
                    padding: '0.2rem 0.4rem',
                    borderRadius: '4px',
                    border: 'none',
                    background: 'transparent',
                    color: '#f87171',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                  }}
                >
                  x
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => addListItem('tools_used')}
            style={{
              padding: '0.3rem 0.5rem',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'transparent',
              color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              fontSize: '0.72rem',
            }}
          >
            + Tool
          </button>
        </div>
      </div>

      {/* Outcome */}
      <div style={{ marginBottom: '0.75rem' }}>
        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          Ergebnis
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['success', 'partial', 'failure'] as const).map(outcome => {
            const style = OUTCOME_STYLES[outcome];
            const isSelected = recordForm.outcome === outcome;
            return (
              <button
                key={outcome}
                onClick={() => setRecordForm(f => ({ ...f, outcome }))}
                style={{
                  padding: '0.4rem 0.75rem',
                  borderRadius: '8px',
                  border: `1px solid ${isSelected ? style.color : 'rgba(255,255,255,0.1)'}`,
                  background: isSelected ? `${style.color}22` : 'transparent',
                  color: isSelected ? style.color : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: isSelected ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {style.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Context Tags */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          Kontext-Tags
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          {recordForm.context_tags.map((tag, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '0.25rem' }}>
              <input
                type="text"
                value={tag}
                onChange={e => updateListItem('context_tags', idx, e.target.value)}
                placeholder="Tag"
                style={{
                  width: '100px',
                  padding: '0.35rem 0.55rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'inherit',
                  fontSize: '0.78rem',
                  outline: 'none',
                }}
              />
              {recordForm.context_tags.length > 1 && (
                <button
                  onClick={() => removeListItem('context_tags', idx)}
                  style={{
                    padding: '0.2rem 0.4rem',
                    borderRadius: '4px',
                    border: 'none',
                    background: 'transparent',
                    color: '#f87171',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                  }}
                >
                  x
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => addListItem('context_tags')}
            style={{
              padding: '0.3rem 0.5rem',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'transparent',
              color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              fontSize: '0.72rem',
            }}
          >
            + Tag
          </button>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={handleRecordProcedure}
          disabled={!recordForm.trigger.trim() || recording}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '8px',
            border: 'none',
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            color: '#fff',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: recording ? 'not-allowed' : 'pointer',
            opacity: !recordForm.trigger.trim() || recording ? 0.4 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          {recording ? 'Speichere...' : 'Prozedur speichern'}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent',
            color: 'rgba(255,255,255,0.6)',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
