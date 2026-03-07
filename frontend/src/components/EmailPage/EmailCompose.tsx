/**
 * EmailCompose - Floating compose modal (Gmail-style)
 *
 * Features:
 * - Floating window anchored bottom-right
 * - Smart reply/forward prefill
 * - Account selector
 * - CC/BCC toggle
 * - Ctrl+Enter to send
 * - Signature support
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Email, EmailAccount, ComposeMode } from './types';
import './EmailCompose.css';

interface EmailComposeProps {
  accounts: EmailAccount[];
  mode: ComposeMode;
  replyTo?: Email;
  prefillBody?: string;
  onSend: (data: {
    to_addresses: Array<{ email: string; name?: string }>;
    cc_addresses?: Array<{ email: string; name?: string }>;
    subject?: string;
    body_html?: string;
    body_text?: string;
    account_id?: string;
  }) => Promise<void>;
  onCancel: () => void;
}

function buildSubject(mode: ComposeMode, original?: Email | null): string {
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

function buildTo(mode: ComposeMode, original?: Email | null): string {
  if (!original) return '';
  if (mode === 'reply') return original.from_address;
  if (mode === 'reply-all') {
    const all = [original.from_address, ...(original.to_addresses ?? []).map(a => a.email)];
    return [...new Set(all)].join(', ');
  }
  return ''; // forward: empty
}

function buildCc(mode: ComposeMode, original?: Email | null): string {
  if (mode === 'reply-all' && original?.cc_addresses?.length) {
    return original.cc_addresses.map(a => a.email).join(', ');
  }
  return '';
}

export function EmailCompose({ accounts, mode, replyTo, prefillBody, onSend, onCancel }: EmailComposeProps) {
  const [to, setTo] = useState(buildTo(mode, replyTo));
  const [cc, setCc] = useState(buildCc(mode, replyTo));
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(buildSubject(mode, replyTo));
  const [body, setBody] = useState(prefillBody || '');
  const [accountId, setAccountId] = useState(accounts.find(a => a.is_default)?.id || accounts[0]?.id || '');
  const [sending, setSending] = useState(false);
  const [showCc, setShowCc] = useState(!!buildCc(mode, replyTo));
  const [showBcc, setShowBcc] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  // Focus management
  useEffect(() => {
    if (mode === 'new' || mode === 'forward') {
      toRef.current?.focus();
    } else {
      bodyRef.current?.focus();
    }
  }, [mode]);

  // Signature append
  useEffect(() => {
    const account = accounts.find(a => a.id === accountId);
    if (account?.signature_text && !body && !prefillBody) {
      setBody('\n\n' + account.signature_text);
    }
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

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
        body_html: body ? body.split('\n').filter(Boolean).map(
          line => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
        ).join('') : undefined,
        account_id: accountId || undefined,
        ...(bccAddresses?.length ? { bcc_addresses: bccAddresses } : {}),
      });
    } finally {
      setSending(false);
    }
  }, [to, cc, bcc, subject, body, accountId, onSend]);

  const modeLabel = mode === 'reply' ? 'Antwort' : mode === 'reply-all' ? 'Antwort an alle' : mode === 'forward' ? 'Weiterleiten' : 'Neue E-Mail';

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
          <div className="ec-footer-hint">
            <kbd>Ctrl</kbd>+<kbd>Enter</kbd> senden &middot; <kbd>Esc</kbd> schliessen
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
