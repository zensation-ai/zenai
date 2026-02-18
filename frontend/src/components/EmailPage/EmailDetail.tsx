/**
 * EmailDetail - Single email view with thread, AI features
 */

import { useState, useEffect } from 'react';
import type { Email, ReplySuggestion } from './types';
import { CATEGORY_LABELS, PRIORITY_LABELS } from './types';
import './EmailDetail.css';

interface EmailDetailProps {
  email: Email;
  thread: Email[];
  onBack: () => void;
  onReply: (email: Email) => void;
  onStar: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onGetReplySuggestions: () => Promise<ReplySuggestion[]>;
  onAIProcess: () => Promise<Email | null>;
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function EmailDetail({ email, thread, onBack, onReply, onStar, onArchive, onDelete, onGetReplySuggestions, onAIProcess }: EmailDetailProps) {
  const [suggestions, setSuggestions] = useState<ReplySuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const [aiProcessing, setAIProcessing] = useState(false);

  const handleGetSuggestions = async () => {
    setLoadingSuggestions(true);
    const result = await onGetReplySuggestions();
    setSuggestions(result);
    setLoadingSuggestions(false);
  };

  const handleAIProcess = async () => {
    setAIProcessing(true);
    await onAIProcess();
    setAIProcessing(false);
  };

  // Load suggestions on mount if inbound
  useEffect(() => {
    if (email.direction === 'inbound' && email.ai_reply_suggestions.length > 0) {
      setSuggestions(email.ai_reply_suggestions);
    }
  }, [email.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasThread = thread.length > 1;

  return (
    <div className="email-detail">
      {/* Toolbar */}
      <div className="email-detail-toolbar">
        <button className="email-detail-back" onClick={onBack} aria-label="Zurueck">
          ← Zurueck
        </button>
        <div className="email-detail-actions">
          <button onClick={onStar} title={email.is_starred ? 'Stern entfernen' : 'Stern setzen'}>
            {email.is_starred ? '★' : '☆'}
          </button>
          <button onClick={() => onReply(email)} title="Antworten">↩ Antworten</button>
          <button onClick={onArchive} title="Archivieren">📦 Archivieren</button>
          <button onClick={onDelete} title="Loeschen" className="email-detail-delete">🗑 Loeschen</button>
        </div>
      </div>

      {/* Subject & Meta */}
      <div className="email-detail-header">
        <h2 className="email-detail-subject">{email.subject || '(Kein Betreff)'}</h2>
        <div className="email-detail-meta">
          <div className="email-detail-from">
            <strong>{email.from_name || email.from_address}</strong>
            {email.from_name && <span className="email-detail-addr">&lt;{email.from_address}&gt;</span>}
          </div>
          <div className="email-detail-to">
            An: {email.to_addresses.map(a => a.name || a.email).join(', ')}
            {email.cc_addresses.length > 0 && (
              <> | CC: {email.cc_addresses.map(a => a.name || a.email).join(', ')}</>
            )}
          </div>
          <div className="email-detail-date">
            {formatDateTime(email.received_at || email.sent_at || email.created_at)}
          </div>
        </div>

        {/* AI Badges */}
        <div className="email-detail-badges">
          {email.ai_category && CATEGORY_LABELS[email.ai_category] && (
            <span className="email-badge" style={{ backgroundColor: CATEGORY_LABELS[email.ai_category].color + '30', color: CATEGORY_LABELS[email.ai_category].color }}>
              {CATEGORY_LABELS[email.ai_category].label}
            </span>
          )}
          {email.ai_priority && PRIORITY_LABELS[email.ai_priority] && (
            <span className="email-badge" style={{ backgroundColor: PRIORITY_LABELS[email.ai_priority].color + '30', color: PRIORITY_LABELS[email.ai_priority].color }}>
              {PRIORITY_LABELS[email.ai_priority].label}
            </span>
          )}
          {email.ai_sentiment && (
            <span className="email-badge email-badge--sentiment">
              {email.ai_sentiment === 'positive' ? '😊' : email.ai_sentiment === 'negative' ? '😟' : '😐'} {email.ai_sentiment}
            </span>
          )}
          {email.has_attachments && <span className="email-badge">📎 {email.attachments.length} Anhang</span>}
        </div>
      </div>

      {/* AI Summary */}
      {email.ai_summary && (
        <div className="email-detail-ai-summary">
          <div className="email-detail-ai-label">🤖 KI-Zusammenfassung</div>
          <p>{email.ai_summary}</p>
        </div>
      )}

      {/* AI Action Items */}
      {email.ai_action_items.length > 0 && (
        <div className="email-detail-ai-actions">
          <div className="email-detail-ai-label">📋 Erkannte Aufgaben</div>
          <ul>
            {email.ai_action_items.map((item, i) => (
              <li key={i}>{item.text}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Re-process AI button */}
      {!email.ai_processed_at && email.direction === 'inbound' && (
        <button className="email-detail-ai-btn" onClick={handleAIProcess} disabled={aiProcessing}>
          {aiProcessing ? 'Verarbeite...' : '🤖 KI-Analyse starten'}
        </button>
      )}

      {/* Email Body - sandboxed iframe to prevent XSS from untrusted HTML */}
      <div className="email-detail-body">
        {email.body_html ? (
          <iframe
            className="email-detail-iframe"
            sandbox="allow-same-origin"
            title="E-Mail Inhalt"
            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#333;margin:0;padding:12px;word-break:break-word;}a{color:#4A90D9;}img{max-width:100%;height:auto;}</style></head><body>${email.body_html}</body></html>`}
            style={{ width: '100%', minHeight: '200px', border: 'none' }}
          />
        ) : (
          <pre className="email-detail-text">{email.body_text || '(Kein Inhalt)'}</pre>
        )}
      </div>

      {/* Attachments */}
      {email.attachments.length > 0 && (
        <div className="email-detail-attachments">
          <div className="email-detail-ai-label">📎 Anhaenge</div>
          {email.attachments.map((att, i) => (
            <div key={i} className="email-attachment">
              <span>{att.filename}</span>
              <span className="email-attachment-type">{att.content_type}</span>
            </div>
          ))}
        </div>
      )}

      {/* Thread View */}
      {hasThread && (
        <div className="email-detail-thread">
          <button className="email-thread-toggle" onClick={() => setShowThread(!showThread)}>
            {showThread ? '▼' : '▶'} Thread ({thread.length} Nachrichten)
          </button>
          {showThread && (
            <div className="email-thread-list">
              {thread.filter(t => t.id !== email.id).map(t => (
                <div key={t.id} className={`email-thread-item ${t.direction === 'outbound' ? 'email-thread-item--sent' : ''}`}>
                  <div className="email-thread-item-header">
                    <strong>{t.from_name || t.from_address}</strong>
                    <span>{formatDateTime(t.received_at || t.sent_at)}</span>
                  </div>
                  <p>{t.ai_summary || (t.body_text ? t.body_text.substring(0, 200) + '...' : '(Kein Inhalt)')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reply Suggestions */}
      {email.direction === 'inbound' && (
        <div className="email-detail-suggestions">
          {suggestions.length === 0 && !loadingSuggestions && (
            <button className="email-detail-ai-btn" onClick={handleGetSuggestions}>
              💡 Antwort-Vorschlaege generieren
            </button>
          )}
          {loadingSuggestions && <p className="email-loading-text">Generiere Vorschlaege...</p>}
          {suggestions.length > 0 && (
            <div className="email-suggestions-grid">
              <div className="email-detail-ai-label">💡 Antwort-Vorschlaege</div>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="email-suggestion-chip"
                  onClick={() => onReply({ ...email, ai_reply_suggestions: [s] })}
                  title={s.body}
                >
                  <span className="email-suggestion-tone">
                    {s.tone === 'formell' ? '👔' : s.tone === 'freundlich' ? '😊' : '⚡'}
                    {s.tone}
                  </span>
                  <span className="email-suggestion-preview">
                    {s.body.substring(0, 80)}...
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
