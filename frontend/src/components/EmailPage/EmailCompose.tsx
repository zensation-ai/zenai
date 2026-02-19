/**
 * EmailCompose - Compose, reply, forward emails
 */

import { useState, useCallback } from 'react';
import type { AIContext } from '../ContextSwitcher';
import type { Email, EmailAccount } from './types';
import './EmailCompose.css';

interface EmailComposeProps {
  context: AIContext;
  accounts: EmailAccount[];
  replyTo?: Email | null;
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

export function EmailCompose({ context: _context, accounts, replyTo, onSend, onCancel }: EmailComposeProps) {
  const [to, setTo] = useState(replyTo ? replyTo.from_address : '');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(
    replyTo
      ? (replyTo.subject?.startsWith('Re: ') ? replyTo.subject : `Re: ${replyTo.subject || ''}`)
      : ''
  );
  const [body, setBody] = useState(
    replyTo?.ai_reply_suggestions?.[0]?.body || ''
  );
  const [accountId, setAccountId] = useState(accounts.find(a => a.is_default)?.id || accounts[0]?.id || '');
  const [sending, setSending] = useState(false);
  const [showCc, setShowCc] = useState(false);

  const handleSend = useCallback(async () => {
    if (!to.trim()) return;

    setSending(true);
    try {
      const toAddresses = to.split(',').map(e => e.trim()).filter(Boolean).map(email => ({ email }));
      const ccAddresses = cc ? cc.split(',').map(e => e.trim()).filter(Boolean).map(email => ({ email })) : undefined;

      await onSend({
        to_addresses: toAddresses,
        cc_addresses: ccAddresses,
        subject: subject || undefined,
        body_text: body,
        body_html: body ? body.split('\n').filter(Boolean).map(
          line => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
        ).join('') : undefined,
        account_id: accountId || undefined,
      });
    } finally {
      setSending(false);
    }
  }, [to, cc, subject, body, accountId, onSend]);

  return (
    <div className="email-compose">
      <div className="email-compose-header">
        <h2>{replyTo ? 'Antwort' : 'Neue E-Mail'}</h2>
        <button className="email-compose-close" onClick={onCancel}>&times;</button>
      </div>

      <div className="email-compose-form">
        {/* Account Selector */}
        {accounts.length > 1 && (
          <div className="email-compose-field">
            <label>Von</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.display_name ? `${a.display_name} <${a.email_address}>` : a.email_address}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* To */}
        <div className="email-compose-field">
          <label>An</label>
          <div className="email-compose-to-row">
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="empfaenger@example.com"
              autoFocus={!replyTo}
            />
            {!showCc && (
              <button className="email-compose-cc-toggle" onClick={() => setShowCc(true)}>CC</button>
            )}
          </div>
        </div>

        {/* CC */}
        {showCc && (
          <div className="email-compose-field">
            <label>CC</label>
            <input
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@example.com"
            />
          </div>
        )}

        {/* Subject */}
        <div className="email-compose-field">
          <label>Betreff</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Betreff eingeben..."
          />
        </div>

        {/* Body */}
        <div className="email-compose-body">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Nachricht schreiben..."
            rows={12}
            autoFocus={!!replyTo}
          />
        </div>

        {/* Reply context */}
        {replyTo && (
          <div className="email-compose-reply-context">
            <div className="email-compose-reply-label">Antwort auf:</div>
            <div className="email-compose-reply-info">
              <strong>{replyTo.from_name || replyTo.from_address}</strong>
              <span>{replyTo.subject}</span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="email-compose-actions">
        <button className="email-compose-cancel" onClick={onCancel}>Abbrechen</button>
        <button
          className="email-compose-send"
          onClick={handleSend}
          disabled={sending || !to.trim()}
        >
          {sending ? 'Wird gesendet...' : '📤 Senden'}
        </button>
      </div>
    </div>
  );
}
