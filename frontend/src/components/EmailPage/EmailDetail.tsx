/**
 * EmailDetail - Premium email detail view
 *
 * Features:
 * - Inline quick reply
 * - Timeline thread view
 * - AI insights bar (summary, actions, category, priority, sentiment)
 * - Keyboard shortcuts hint
 */

import { useState, useEffect, useRef } from 'react';
import type { Email, ReplySuggestion } from './types';
import {
  CATEGORY_LABELS, PRIORITY_LABELS,
  formatEmailDateTime, stringToColor, getInitials,
} from './types';
import './EmailDetail.css';

interface EmailDetailProps {
  email: Email;
  thread: Email[];
  onBack: () => void;
  onReply: (email: Email, prefillBody?: string) => void;
  onReplyAll: (email: Email) => void;
  onForward: (email: Email) => void;
  onStar: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onGetReplySuggestions: () => Promise<ReplySuggestion[]>;
  onAIProcess: () => Promise<Email | null>;
  onInlineReply: (body: string) => Promise<void>;
}

export function EmailDetail({
  email, thread, onBack, onReply, onReplyAll, onForward,
  onStar, onArchive, onDelete,
  onGetReplySuggestions, onAIProcess, onInlineReply,
}: EmailDetailProps) {
  const [suggestions, setSuggestions] = useState<ReplySuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const [aiProcessing, setAIProcessing] = useState(false);
  const [inlineReplyText, setInlineReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [showInlineReply, setShowInlineReply] = useState(false);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load cached suggestions
  useEffect(() => {
    if (email.direction === 'inbound' && (email.ai_reply_suggestions?.length ?? 0) > 0) {
      setSuggestions(email.ai_reply_suggestions);
    } else {
      setSuggestions([]);
    }
    setShowInlineReply(false);
    setInlineReplyText('');
  }, [email.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-resize iframe
  useEffect(() => {
    if (iframeRef.current) {
      const iframe = iframeRef.current;
      const onLoad = () => {
        try {
          const body = iframe.contentDocument?.body;
          if (body) {
            iframe.style.height = Math.max(200, body.scrollHeight + 32) + 'px';
          }
        } catch { /* cross-origin, use default height */ }
      };
      iframe.addEventListener('load', onLoad);
      return () => iframe.removeEventListener('load', onLoad);
    }
  }, [email.body_html]);

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

  const handleInlineReply = async () => {
    if (!inlineReplyText.trim()) return;
    setSendingReply(true);
    await onInlineReply(inlineReplyText);
    setInlineReplyText('');
    setShowInlineReply(false);
    setSendingReply(false);
  };

  const handleSuggestionClick = (suggestion: ReplySuggestion) => {
    onReply(email, suggestion.body);
  };

  const openInlineReply = () => {
    setShowInlineReply(true);
    setTimeout(() => replyTextareaRef.current?.focus(), 100);
  };

  const hasThread = thread.length > 1;
  const otherThreadEmails = thread.filter(t => t.id !== email.id);
  const avatarColor = stringToColor(email.from_address);
  const initials = getInitials(email.from_name, email.from_address);

  return (
    <div className="ed-container">
      {/* ── Toolbar ───────────────────────────────────────── */}
      <div className="ed-toolbar">
        <button className="ed-back" onClick={onBack} title="Zurueck (Esc)">
          ← <span className="ed-back-label">Zurueck</span>
        </button>
        <div className="ed-actions">
          <button className="ed-act" onClick={() => onReply(email)} title="Antworten (r)">
            ↩ <span className="ed-act-label">Antworten</span>
          </button>
          <button className="ed-act" onClick={() => onReplyAll(email)} title="Allen antworten (a)">
            ↩↩ <span className="ed-act-label">Allen</span>
          </button>
          <button className="ed-act" onClick={() => onForward(email)} title="Weiterleiten (f)">
            ↪ <span className="ed-act-label">Weiterleiten</span>
          </button>
          <div className="ed-act-divider" />
          <button className="ed-act" onClick={onStar} title={email.is_starred ? 'Stern entfernen (s)' : 'Stern setzen (s)'}>
            {email.is_starred ? '★' : '☆'}
          </button>
          <button className="ed-act" onClick={onArchive} title="Archivieren (e)">📦</button>
          <button className="ed-act ed-act--danger" onClick={onDelete} title="Loeschen (#)">🗑</button>
        </div>
      </div>

      {/* ── Scrollable content ────────────────────────────── */}
      <div className="ed-scroll">
        {/* Subject */}
        <div className="ed-header">
          <h2 className="ed-subject">{email.subject ?? '(Kein Betreff)'}</h2>

          {/* AI Badges */}
          <div className="ed-badges">
            {email.ai_category && CATEGORY_LABELS[email.ai_category] && (
              <span className="ed-badge" style={{ backgroundColor: CATEGORY_LABELS[email.ai_category].color + '18', color: CATEGORY_LABELS[email.ai_category].color }}>
                {CATEGORY_LABELS[email.ai_category].icon} {CATEGORY_LABELS[email.ai_category].label}
              </span>
            )}
            {email.ai_priority && PRIORITY_LABELS[email.ai_priority] && (
              <span className="ed-badge" style={{ backgroundColor: PRIORITY_LABELS[email.ai_priority].color + '18', color: PRIORITY_LABELS[email.ai_priority].color }}>
                {PRIORITY_LABELS[email.ai_priority].icon} {PRIORITY_LABELS[email.ai_priority].label}
              </span>
            )}
            {email.ai_sentiment && (
              <span className="ed-badge ed-badge--muted">
                {email.ai_sentiment === 'positive' ? '😊' : email.ai_sentiment === 'negative' ? '😟' : '😐'}
              </span>
            )}
            {email.has_attachments && (
              <span className="ed-badge ed-badge--muted">📎 {email.attachments?.length ?? 0}</span>
            )}
          </div>
        </div>

        {/* Sender info */}
        <div className="ed-sender-bar">
          <div className="ed-sender-avatar" style={{ backgroundColor: avatarColor + '20', color: avatarColor }}>
            {initials}
          </div>
          <div className="ed-sender-info">
            <div className="ed-sender-top">
              <strong className="ed-sender-name">{email.from_name ?? email.from_address}</strong>
              {email.from_name && (
                <span className="ed-sender-email">&lt;{email.from_address}&gt;</span>
              )}
            </div>
            <div className="ed-sender-meta">
              An: {(email.to_addresses ?? []).map(a => a.name ?? a.email).join(', ')}
              {(email.cc_addresses?.length ?? 0) > 0 && (
                <> &middot; CC: {(email.cc_addresses ?? []).map(a => a.name ?? a.email).join(', ')}</>
              )}
            </div>
          </div>
          <span className="ed-date">{formatEmailDateTime(email.received_at ?? email.sent_at ?? email.created_at)}</span>
        </div>

        {/* AI Summary Card */}
        {email.ai_summary && (
          <div className="ed-ai-card">
            <div className="ed-ai-card-header">
              <span className="ed-ai-icon">✦</span>
              <span className="ed-ai-label">KI-Zusammenfassung</span>
            </div>
            <p className="ed-ai-text">{email.ai_summary}</p>
          </div>
        )}

        {/* AI Action Items */}
        {(email.ai_action_items?.length ?? 0) > 0 && (
          <div className="ed-ai-card ed-ai-card--actions">
            <div className="ed-ai-card-header">
              <span className="ed-ai-icon">☐</span>
              <span className="ed-ai-label">Erkannte Aufgaben</span>
            </div>
            <ul className="ed-action-list">
              {(email.ai_action_items ?? []).map((item, i) => (
                <li key={i} className="ed-action-item">
                  <span className="ed-action-check">○</span>
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* AI Process Button */}
        {!email.ai_processed_at && email.direction === 'inbound' && (
          <button className="ed-ai-trigger" onClick={handleAIProcess} disabled={aiProcessing}>
            {aiProcessing ? (
              <><span className="ed-ai-spinner" /> Analysiere...</>
            ) : (
              <><span className="ed-ai-icon">✦</span> KI-Analyse starten</>
            )}
          </button>
        )}

        {/* Email Body */}
        <div className="ed-body">
          {email.body_html ? (
            <iframe
              ref={iframeRef}
              className="ed-iframe"
              sandbox="allow-same-origin"
              title="E-Mail Inhalt"
              srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
                body{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:14px;line-height:1.6;color:#333;margin:0;padding:16px;word-break:break-word;}
                a{color:#4A90D9;}img{max-width:100%;height:auto;}
                blockquote{margin:8px 0;padding:0 12px;border-left:3px solid #ddd;color:#666;}
                pre{background:#f5f5f5;padding:12px;border-radius:6px;overflow-x:auto;font-size:13px;}
                @media(prefers-color-scheme:dark){body{color:#e0e8ef;background:transparent;}blockquote{border-color:#444;color:#8899aa;}pre{background:#1a2a3a;}}
              </style></head><body>${email.body_html}</body></html>`}
            />
          ) : (
            <pre className="ed-text">{email.body_text ?? '(Kein Inhalt)'}</pre>
          )}
        </div>

        {/* Attachments */}
        {(email.attachments?.length ?? 0) > 0 && (
          <div className="ed-attachments">
            <div className="ed-section-label">📎 Anhaenge</div>
            <div className="ed-attachment-grid">
              {(email.attachments ?? []).map((att, i) => (
                <div key={i} className="ed-attachment">
                  <span className="ed-attachment-icon">
                    {att.content_type?.startsWith('image/') ? '🖼' :
                     att.content_type?.includes('pdf') ? '📄' : '📁'}
                  </span>
                  <div className="ed-attachment-info">
                    <span className="ed-attachment-name">{att.filename}</span>
                    <span className="ed-attachment-type">{att.content_type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Thread View */}
        {hasThread && (
          <div className="ed-thread">
            <button className="ed-thread-toggle" onClick={() => setShowThread(!showThread)}>
              <span className={`ed-thread-arrow ${showThread ? 'ed-thread-arrow--open' : ''}`}>▶</span>
              Konversation ({thread.length} Nachrichten)
            </button>
            {showThread && (
              <div className="ed-thread-list">
                {otherThreadEmails.map(t => {
                  const tColor = stringToColor(t.from_address);
                  const tInitials = getInitials(t.from_name, t.from_address);
                  return (
                    <div key={t.id} className={`ed-thread-item ${t.direction === 'outbound' ? 'ed-thread-item--sent' : ''}`}>
                      <div className="ed-thread-avatar" style={{ backgroundColor: tColor + '20', color: tColor }}>
                        {t.direction === 'outbound' ? '→' : tInitials}
                      </div>
                      <div className="ed-thread-content">
                        <div className="ed-thread-header">
                          <strong>{t.from_name ?? t.from_address}</strong>
                          <span className="ed-thread-date">
                            {formatEmailDateTime(t.received_at ?? t.sent_at)}
                          </span>
                        </div>
                        <p className="ed-thread-body">
                          {t.ai_summary ?? (t.body_text ? t.body_text.substring(0, 300) + (t.body_text.length > 300 ? '...' : '') : '(Kein Inhalt)')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Reply Suggestions */}
        {email.direction === 'inbound' && (
          <div className="ed-suggestions">
            {suggestions.length === 0 && !loadingSuggestions && (
              <button className="ed-ai-trigger ed-ai-trigger--suggestions" onClick={handleGetSuggestions}>
                <span className="ed-ai-icon">💡</span> Antwort-Vorschlaege generieren
              </button>
            )}
            {loadingSuggestions && (
              <div className="ed-suggestions-loading">
                <span className="ed-ai-spinner" /> Generiere Vorschlaege...
              </div>
            )}
            {suggestions.length > 0 && (
              <div className="ed-suggestions-grid">
                <div className="ed-section-label">💡 Schnellantworten</div>
                <div className="ed-suggestions-row">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      className="ed-suggestion"
                      onClick={() => handleSuggestionClick(s)}
                    >
                      <span className="ed-suggestion-tone">
                        {s.tone === 'formell' ? '👔 Formell' : s.tone === 'freundlich' ? '😊 Freundlich' : '⚡ Kurz'}
                      </span>
                      <span className="ed-suggestion-preview">
                        {s.body.substring(0, 100)}{s.body.length > 100 ? '...' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Inline Quick Reply */}
        {email.direction === 'inbound' && (
          <div className="ed-inline-reply">
            {!showInlineReply ? (
              <button className="ed-reply-trigger" onClick={openInlineReply}>
                ↩ Schnellantwort schreiben...
              </button>
            ) : (
              <div className="ed-reply-form">
                <textarea
                  ref={replyTextareaRef}
                  className="ed-reply-textarea"
                  placeholder="Antwort schreiben..."
                  value={inlineReplyText}
                  onChange={(e) => setInlineReplyText(e.target.value)}
                  rows={4}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      handleInlineReply();
                    }
                  }}
                />
                <div className="ed-reply-actions">
                  <span className="ed-reply-hint">Ctrl+Enter zum Senden</span>
                  <div className="ed-reply-buttons">
                    <button className="ed-reply-cancel" onClick={() => { setShowInlineReply(false); setInlineReplyText(''); }}>
                      Abbrechen
                    </button>
                    <button
                      className="ed-reply-send"
                      onClick={handleInlineReply}
                      disabled={sendingReply || !inlineReplyText.trim()}
                    >
                      {sendingReply ? 'Sende...' : '↩ Senden'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
