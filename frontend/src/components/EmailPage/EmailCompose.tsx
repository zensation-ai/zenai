/**
 * EmailCompose - Floating compose modal (Gmail-style)
 *
 * Features:
 * - Floating window anchored bottom-right
 * - Smart reply/forward prefill
 * - Draft editing support
 * - KI Smart Compose (AI-generated drafts)
 * - KI Text Improve
 * - Account selector
 * - CC/BCC toggle
 * - Ctrl+Enter to send
 * - Signature support
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Email, EmailAccount, ComposeMode } from './types';
import './EmailCompose.css';

const AUTO_SAVE_DELAY_MS = 3000;

interface EmailComposeProps {
  accounts: EmailAccount[];
  mode: ComposeMode;
  replyTo?: Email;
  prefillBody?: string;
  prefillSubject?: string;
  prefillTo?: string;
  prefillCc?: string;
  prefillAccountId?: string;
  draftId?: string;
  onSend: (data: {
    to_addresses: Array<{ email: string; name?: string }>;
    cc_addresses?: Array<{ email: string; name?: string }>;
    subject?: string;
    body_html?: string;
    body_text?: string;
    account_id?: string;
  }) => Promise<void>;
  onCancel: () => void;
  onSaveDraft?: (data: {
    to_addresses: Array<{ email: string; name?: string }>;
    subject?: string;
    body_text?: string;
    account_id?: string;
  }) => Promise<{ id: string } | null>;
  onUpdateDraft?: (id: string, data: {
    to_addresses?: Array<{ email: string; name?: string }>;
    subject?: string;
    body_text?: string;
    account_id?: string;
  }) => Promise<unknown>;
  onAICompose?: (data: {
    prompt: string;
    tone?: 'formell' | 'freundlich' | 'kurz' | 'neutral';
    reply_to?: { from: string; subject: string; body: string };
  }) => Promise<{ subject: string; body_text: string; body_html: string } | null>;
  onAIImprove?: (text: string, instruction: string) => Promise<string | null>;
}

function buildSubject(mode: ComposeMode, original?: Email | null, prefill?: string): string {
  if (prefill) return prefill;
  if (!original?.subject) return '';
  const sub = original.subject;
  if (mode === 'reply' || mode === 'reply-all') {
    return sub.startsWith('Re: ') ? sub : `Re: ${sub}`;
  }
  if (mode === 'forward') {
    return sub.startsWith('Fwd: ') ? sub : `Fwd: ${sub}`;
  }
  return '';
}

function buildTo(mode: ComposeMode, original?: Email | null, prefill?: string): string {
  if (prefill) return prefill;
  if (!original) return '';
  if (mode === 'reply') return original.from_address;
  if (mode === 'reply-all') {
    const all = [original.from_address, ...(original.to_addresses ?? []).map(a => a.email)];
    return [...new Set(all)].join(', ');
  }
  return '';
}

function buildCc(mode: ComposeMode, original?: Email | null, prefill?: string): string {
  if (prefill) return prefill;
  if (mode === 'reply-all' && original?.cc_addresses?.length) {
    return original.cc_addresses.map(a => a.email).join(', ');
  }
  return '';
}

const AI_TONES = [
  { value: 'formell', label: 'Formell', icon: '👔' },
  { value: 'freundlich', label: 'Freundlich', icon: '😊' },
  { value: 'kurz', label: 'Kurz & knapp', icon: '⚡' },
  { value: 'neutral', label: 'Neutral', icon: '📝' },
] as const;

const AI_IMPROVE_OPTIONS = [
  { label: 'Professioneller', instruction: 'Mache den Text professioneller und geschaeftlicher' },
  { label: 'Freundlicher', instruction: 'Mache den Text freundlicher und waermer' },
  { label: 'Kuerzer', instruction: 'Kuerze den Text auf das Wesentliche' },
  { label: 'Fehler korrigieren', instruction: 'Korrigiere Grammatik- und Rechtschreibfehler' },
];

export function EmailCompose({
  accounts, mode, replyTo, prefillBody, prefillSubject, prefillTo, prefillCc, prefillAccountId, draftId,
  onSend, onCancel, onSaveDraft, onUpdateDraft, onAICompose, onAIImprove,
}: EmailComposeProps) {
  const [to, setTo] = useState(buildTo(mode, replyTo, prefillTo));
  const [cc, setCc] = useState(buildCc(mode, replyTo, prefillCc));
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(buildSubject(mode, replyTo, prefillSubject));
  const [body, setBody] = useState(prefillBody || '');
  const [accountId, setAccountId] = useState(
    prefillAccountId || accounts.find(a => a.is_default)?.id || accounts[0]?.id || ''
  );
  const [sending, setSending] = useState(false);
  const [showCc, setShowCc] = useState(!!buildCc(mode, replyTo, prefillCc));
  const [showBcc, setShowBcc] = useState(false);
  const [minimized, setMinimized] = useState(false);

  // AI state
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiPrompt, setAIPrompt] = useState('');
  const [aiTone, setAITone] = useState<'formell' | 'freundlich' | 'kurz' | 'neutral'>('neutral');
  const [aiLoading, setAILoading] = useState(false);
  const [showImproveMenu, setShowImproveMenu] = useState(false);

  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(draftId);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save draft with debounce
  useEffect(() => {
    // Only auto-save for new compositions or existing drafts
    if (mode !== 'new' && !currentDraftId) return;
    if (!body.trim() && !subject.trim() && !to.trim()) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      const toAddresses = to.split(',').map(e => e.trim()).filter(Boolean).map(email => ({ email }));
      if (toAddresses.length === 0 && !body.trim() && !subject.trim()) return;

      setAutoSaveStatus('saving');

      if (currentDraftId && onUpdateDraft) {
        await onUpdateDraft(currentDraftId, {
          to_addresses: toAddresses.length > 0 ? toAddresses : undefined,
          subject: subject || undefined,
          body_text: body || undefined,
          account_id: accountId || undefined,
        });
      } else if (onSaveDraft && toAddresses.length > 0) {
        const result = await onSaveDraft({
          to_addresses: toAddresses,
          subject: subject || undefined,
          body_text: body || undefined,
          account_id: accountId || undefined,
        });
        if (result?.id) setCurrentDraftId(result.id);
      }

      setAutoSaveStatus('saved');
      if (autoSaveIdleTimerRef.current) clearTimeout(autoSaveIdleTimerRef.current);
      autoSaveIdleTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 2000);
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (autoSaveIdleTimerRef.current) clearTimeout(autoSaveIdleTimerRef.current);
    };
  }, [to, subject, body, accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus management
  useEffect(() => {
    if (mode === 'new' || mode === 'forward') {
      if (!prefillTo) toRef.current?.focus();
      else bodyRef.current?.focus();
    } else {
      bodyRef.current?.focus();
    }
  }, [mode, prefillTo]);

  // Signature append
  useEffect(() => {
    const account = accounts.find(a => a.id === accountId);
    if (account?.signature_text && !body && !prefillBody) {
      setBody('\n\n' + account.signature_text);
    }
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const textToHtml = useCallback((text: string): string => {
    return text.split('\n').map(line => {
      if (line.trim() === '') return '<br>';
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<p>${escaped}</p>`;
    }).join('');
  }, []);

  const handleSend = useCallback(async () => {
    if (!to.trim()) return;
    setSending(true);
    try {
      const toAddresses = to.split(',').map(e => e.trim()).filter(Boolean).map(email => ({ email }));
      const ccAddresses = cc ? cc.split(',').map(e => e.trim()).filter(Boolean).map(email => ({ email })) : undefined;
      const bccAddresses = bcc ? bcc.split(',').map(e => e.trim()).filter(Boolean).map(email => ({ email })) : undefined;

      await onSend({
        to_addresses: toAddresses,
        cc_addresses: ccAddresses?.length ? ccAddresses : undefined,
        subject: subject || undefined,
        body_text: body,
        body_html: body ? textToHtml(body) : undefined,
        account_id: accountId || undefined,
        ...(bccAddresses?.length ? { bcc_addresses: bccAddresses } : {}),
      });
    } finally {
      setSending(false);
    }
  }, [to, cc, bcc, subject, body, accountId, onSend, textToHtml]);

  // AI Smart Compose
  const handleAICompose = useCallback(async () => {
    if (!onAICompose || !aiPrompt.trim()) return;
    setAILoading(true);
    try {
      const result = await onAICompose({
        prompt: aiPrompt.trim(),
        tone: aiTone,
        reply_to: replyTo ? {
          from: replyTo.from_name || replyTo.from_address,
          subject: replyTo.subject || '',
          body: replyTo.body_text || '',
        } : undefined,
      });
      if (result) {
        setBody(result.body_text);
        if (result.subject && !subject) setSubject(result.subject);
        setShowAIPanel(false);
        setAIPrompt('');
      }
    } finally {
      setAILoading(false);
    }
  }, [onAICompose, aiPrompt, aiTone, replyTo, subject]);

  // AI Improve
  const handleAIImprove = useCallback(async (instruction: string) => {
    if (!onAIImprove || !body.trim()) return;
    setAILoading(true);
    setShowImproveMenu(false);
    try {
      const improved = await onAIImprove(body, instruction);
      if (improved) setBody(improved);
    } finally {
      setAILoading(false);
    }
  }, [onAIImprove, body]);

  const modeLabel = draftId ? 'Entwurf bearbeiten' :
    mode === 'reply' ? 'Antwort' :
    mode === 'reply-all' ? 'Antwort an alle' :
    mode === 'forward' ? 'Weiterleiten' : 'Neue E-Mail';

  if (minimized) {
    return (
      <div className="ec-minimized" onClick={() => setMinimized(false)}>
        <span className="ec-minimized-label">{modeLabel}</span>
        {subject && <span className="ec-minimized-subject"> — {subject}</span>}
        <button className="ec-minimized-close" onClick={(e) => { e.stopPropagation(); onCancel(); }}>&times;</button>
      </div>
    );
  }

  return (
    <div className="ec-overlay">
      <div className="ec-window">
        {/* Header */}
        <div className="ec-header">
          <span className="ec-header-title">{modeLabel}</span>
          <div className="ec-header-actions">
            <button className="ec-header-btn" onClick={() => setMinimized(true)} title="Minimieren">−</button>
            <button className="ec-header-btn" onClick={onCancel} title="Schliessen">&times;</button>
          </div>
        </div>

        {/* Form */}
        <div className="ec-form">
          {/* Account Selector */}
          {accounts.length > 1 && (
            <div className="ec-field">
              <label className="ec-label">Von</label>
              <select className="ec-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.display_name ? `${a.display_name} <${a.email_address}>` : a.email_address}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* To */}
          <div className="ec-field">
            <label className="ec-label">An</label>
            <div className="ec-field-row">
              <input
                ref={toRef}
                type="text"
                className="ec-input"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="empfaenger@beispiel.de"
              />
              <div className="ec-field-toggles">
                {!showCc && <button className="ec-toggle" onClick={() => setShowCc(true)}>Cc</button>}
                {!showBcc && <button className="ec-toggle" onClick={() => setShowBcc(true)}>Bcc</button>}
              </div>
            </div>
          </div>

          {/* CC */}
          {showCc && (
            <div className="ec-field">
              <label className="ec-label">Cc</label>
              <input type="text" className="ec-input" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@beispiel.de" />
            </div>
          )}

          {/* BCC */}
          {showBcc && (
            <div className="ec-field">
              <label className="ec-label">Bcc</label>
              <input type="text" className="ec-input" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="bcc@beispiel.de" />
            </div>
          )}

          {/* Subject */}
          <div className="ec-field">
            <label className="ec-label">Betreff</label>
            <input type="text" className="ec-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Betreff..." />
          </div>
        </div>

        {/* AI Compose Panel */}
        {showAIPanel && onAICompose && (
          <div className="ec-ai-panel">
            <div className="ec-ai-header">
              <span className="ec-ai-icon">✦</span>
              <span>KI-Entwurf erstellen</span>
              <button className="ec-ai-close" onClick={() => setShowAIPanel(false)}>&times;</button>
            </div>
            <textarea
              className="ec-ai-prompt"
              value={aiPrompt}
              onChange={(e) => setAIPrompt(e.target.value)}
              placeholder="Beschreibe was die E-Mail enthalten soll... z.B. 'Danke fuer das Angebot, bitte um Verlaengerung der Frist um 2 Wochen'"
              rows={3}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleAICompose();
              }}
            />
            <div className="ec-ai-tones">
              {AI_TONES.map(t => (
                <button
                  key={t.value}
                  className={`ec-ai-tone ${aiTone === t.value ? 'ec-ai-tone--active' : ''}`}
                  onClick={() => setAITone(t.value)}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            <button
              className="ec-ai-generate"
              onClick={handleAICompose}
              disabled={aiLoading || !aiPrompt.trim()}
            >
              {aiLoading ? '✦ Generiere...' : '✦ Text generieren'}
            </button>
          </div>
        )}

        {/* Body */}
        <div className="ec-body">
          <textarea
            ref={bodyRef}
            className="ec-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Nachricht schreiben..."
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                handleSend();
              }
            }}
          />
          {aiLoading && !showAIPanel && (
            <div className="ec-ai-loading-overlay">
              <span className="ec-ai-spinner" /> KI arbeitet...
            </div>
          )}
        </div>

        {/* Reply context */}
        {replyTo && (mode === 'reply' || mode === 'reply-all') && (
          <div className="ec-context">
            <div className="ec-context-label">Antwort auf:</div>
            <div className="ec-context-sender">{replyTo.from_name || replyTo.from_address}</div>
            <div className="ec-context-subject">{replyTo.subject}</div>
          </div>
        )}

        {/* Forward quote */}
        {replyTo && mode === 'forward' && (
          <div className="ec-context">
            <div className="ec-context-label">Weitergeleitete Nachricht:</div>
            <div className="ec-context-sender">Von: {replyTo.from_name || replyTo.from_address}</div>
            <div className="ec-context-subject">{replyTo.subject}</div>
          </div>
        )}

        {/* Footer */}
        <div className="ec-footer">
          <div className="ec-footer-left">
            {/* AI buttons */}
            {onAICompose && (
              <button
                className="ec-ai-btn"
                onClick={() => setShowAIPanel(!showAIPanel)}
                title="KI-Entwurf erstellen"
              >
                ✦ KI
              </button>
            )}
            {onAIImprove && body.trim() && (
              <div className="ec-improve-container">
                <button
                  className="ec-ai-btn"
                  onClick={() => setShowImproveMenu(!showImproveMenu)}
                  title="Text verbessern"
                >
                  ✏ Verbessern
                </button>
                {showImproveMenu && (
                  <div className="ec-improve-menu">
                    {AI_IMPROVE_OPTIONS.map(opt => (
                      <button
                        key={opt.label}
                        className="ec-improve-option"
                        onClick={() => handleAIImprove(opt.instruction)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="ec-footer-hint">
              {autoSaveStatus === 'saving' && <span className="ec-autosave">Speichert...</span>}
              {autoSaveStatus === 'saved' && <span className="ec-autosave ec-autosave--saved">✓ Gespeichert</span>}
              {autoSaveStatus === 'idle' && <><kbd>Ctrl</kbd>+<kbd>Enter</kbd> senden</>}
            </div>
          </div>
          <div className="ec-footer-actions">
            <button className="ec-cancel" onClick={onCancel}>Verwerfen</button>
            <button
              className="ec-send"
              onClick={handleSend}
              disabled={sending || !to.trim()}
            >
              {sending ? 'Wird gesendet...' : 'Senden'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
