/**
 * EmailDetail - Premium email detail view
 *
 * Features:
 * - Inline quick reply
 * - Timeline thread view
 * - AI insights bar (summary, actions, category, priority, sentiment)
 * - Keyboard shortcuts hint
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import DOMPurify from 'dompurify';
import type { Email, ReplySuggestion } from './types';
import {
  CATEGORY_LABELS, PRIORITY_LABELS,
  formatEmailDateTime, stringToColor, getInitials,
} from './types';
import { showToast } from '../Toast';
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
  onGetThreadSummary?: () => Promise<string | null>;
}

export function EmailDetail({
  email, thread, onBack, onReply, onReplyAll, onForward,
  onStar, onArchive, onDelete,
  onGetReplySuggestions, onAIProcess, onInlineReply, onGetThreadSummary,
}: EmailDetailProps) {
  const [suggestions, setSuggestions] = useState<ReplySuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const [aiProcessing, setAIProcessing] = useState(false);
  const [inlineReplyText, setInlineReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [showInlineReply, setShowInlineReply] = useState(false);
  const [threadSummary, setThreadSummary] = useState<string | null>(null);
  const [loadingThreadSummary, setLoadingThreadSummary] = useState(false);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Cleanup focus timer on unmount
  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    };
  }, []);

  // Load cached suggestions and reset state on email change
  useEffect(() => {
    if (email.direction === 'inbound' && (email.ai_reply_suggestions?.length ?? 0) > 0) {
      setSuggestions(email.ai_reply_suggestions);
    } else {
      setSuggestions([]);
    }
    setShowInlineReply(false);
    setInlineReplyText('');
    setThreadSummary(null);
  }, [email.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGetSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const result = await onGetReplySuggestions();
      setSuggestions(result);
    } catch {
      showToast('KI-Vorschläge konnten nicht geladen werden', 'warning');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleAIProcess = async () => {
    setAIProcessing(true);
    try {
      await onAIProcess();
    } catch {
      showToast('KI-Analyse konnte nicht durchgeführt werden', 'warning');
    } finally {
      setAIProcessing(false);
    }
  };

  const handleInlineReply = async () => {
    if (!inlineReplyText.trim()) return;
    setSendingReply(true);
    try {
      await onInlineReply(inlineReplyText);
      setInlineReplyText('');
      setShowInlineReply(false);
    } catch {
      // Send error is shown via parent error state
    } finally {
      setSendingReply(false);
    }
  };

  const handleSuggestionClick = (suggestion: ReplySuggestion) => {
    onReply(email, suggestion.body);
  };

  const handleGetThreadSummary = async () => {
    if (!onGetThreadSummary) return;
    setLoadingThreadSummary(true);
    try {
      const summary = await onGetThreadSummary();
      setThreadSummary(summary);
    } catch {
      showToast('Thread-Zusammenfassung nicht verfügbar', 'warning');
    } finally {
      setLoadingThreadSummary(false);
    }
  };

  const openInlineReply = useCallback(() => {
    setShowInlineReply(true);
    focusTimerRef.current = setTimeout(() => replyTextareaRef.current?.focus(), 100);
  }, []);

  const hasThread = thread.length > 1;
  const otherThreadEmails = thread.filter(t => t.id !== email.id);
  const avatarColor = stringToColor(email.from_address);
  const initials = getInitials(email.from_name, email.from_address);

  // Sanitize HTML to prevent XSS from malicious email content
  const sanitizedHtml = useMemo(() => {
    if (!email.body_html) return null;
    return DOMPurify.sanitize(email.body_html, {
      ALLOWED_TAGS: [
        'a', 'b', 'br', 'blockquote', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td',
        'th', 'thead', 'tr', 'u', 'ul', 'font', 'center', 'small', 'sub', 'sup',
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'class', 'id', 'width', 'height',
        'border', 'cellpadding', 'cellspacing', 'bgcolor', 'color', 'size', 'face',
        'align', 'valign', 'colspan', 'rowspan', 'target',
      ],
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: ['target'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea'],
    });
  }, [email.body_html]);

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
          <button className="ed-act" onClick={onStar} title={email.is_starred ? 'Stern entfernen (s)' : 'Stern setzen (s)'} aria-label={email.is_starred ? 'Stern entfernen' : 'Stern setzen'} aria-pressed={email.is_starred}>
            {email.is_starred ? '★' : '☆'}
          </button>
          <button className="ed-act" onClick={onArchive} title="Archivieren (e)" aria-label="Archivieren">📦</button>
          <button className="ed-act ed-act--danger" onClick={onDelete} title="Loeschen (#)" aria-label="Loeschen">🗑</button>
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
            {email.labels?.length > 0 && email.labels.map(label => (
              <span key={label} className="ed-badge ed-badge--label">🏷 {label}</span>
            ))}
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
          {sanitizedHtml ? (
            <div
              className="ed-html-body"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : (
            <pre className="ed-text">{email.body_text ?? '(Kein Inhalt)'}</pre>
          )}
        </div>

        {/* Attachments */}
        {(email.attachments?.length ?? 0) > 0 && (
          <div className="ed-attachments">
            <div className="ed-section-label">📎 Anhaenge ({email.attachments?.length})</div>
            <div className="ed-attachment-grid" role="list">
              {(email.attachments ?? []).map((att, i) => (
                <div key={i} className="ed-attachment" role="listitem">
                  <span className="ed-attachment-icon" role="img" aria-label={
                    att.content_type?.startsWith('image/') ? 'Bild' :
                    att.content_type?.includes('pdf') ? 'PDF-Dokument' : 'Datei'
                  }>
                    {att.content_type?.startsWith('image/') ? '🖼' :
                     att.content_type?.includes('pdf') ? '📄' : '📁'}
                  </span>
                  <div className="ed-attachment-info">
                    <span className="ed-attachment-name">{att.filename}</span>
                    <span className="ed-attachment-type">{att.content_type}</span>
                  </div>
                  {att.download_url && (
                    <a
                      href={att.download_url}
                      className="ed-attachment-download"
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${att.filename} herunterladen`}
                      aria-label={`${att.filename} herunterladen`}
                    >
                      ⬇
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Thread View */}
        {hasThread && (
          <div className="ed-thread">
            <div className="ed-thread-section-header">
              <button className="ed-thread-toggle neuro-focus-ring" onClick={() => setShowThread(!showThread)}>
                <span className={`ed-thread-arrow ${showThread ? 'ed-thread-arrow--open' : ''}`}>▶</span>
                Konversation ({thread.length} Nachrichten)
              </button>
              {onGetThreadSummary && (
                <button
                  className="ed-thread-summary-btn neuro-focus-ring"
                  onClick={handleGetThreadSummary}
                  disabled={loadingThreadSummary}
                  title="Thread zusammenfassen"
                >
                  {loadingThreadSummary ? '✦ ...' : '✦ Zusammenfassen'}
                </button>
              )}
            </div>
            {threadSummary && (
              <div className="ed-ai-card ed-ai-card--thread">
                <div className="ed-ai-card-header">
                  <span className="ed-ai-icon">✦</span>
                  <span className="ed-ai-label">Thread-Zusammenfassung</span>
                </div>
                <p className="ed-ai-text">{threadSummary}</p>
              </div>
            )}
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
              <button className="ed-ai-trigger ed-ai-trigger--suggestions neuro-focus-ring" onClick={handleGetSuggestions}>
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
                      className="ed-suggestion neuro-focus-ring"
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
              <button className="ed-reply-trigger neuro-focus-ring" onClick={openInlineReply}>
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
                    <button className="ed-reply-cancel neuro-focus-ring" onClick={() => { setShowInlineReply(false); setInlineReplyText(''); }}>
                      Abbrechen
                    </button>
                    <button
                      className="ed-reply-send neuro-focus-ring"
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
