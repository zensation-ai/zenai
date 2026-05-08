/**
 * InboxPanel - Slide-out panel for email detail/compose/reply
 *
 * Fixed position, 440px width, slides in from right.
 * Follows the same pattern as IdeaPanel from Phase 107.
 * Chunk 4: swipe-down-to-dismiss on mobile via useSwipeDismiss.
 */
import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { X, Star, Paperclip, AlertCircle, Loader2 } from 'lucide-react';
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss';
import { useEmailDetailQuery } from '../../hooks/queries/useEmail';
import { formatEmailDateTime, getInitials, stringToColor, PRIORITY_LABELS, CATEGORY_LABELS } from './types';
import type { Email, EmailPriority, EmailCategory } from './types';
import type { AIContext } from '../ContextSwitcher';
import AiOutputBadge from '../shared/AiOutputBadge';

interface InboxPanelProps {
  open: boolean;
  emailId: string | null;
  mode: 'detail' | 'compose' | 'reply';
  onClose: () => void;
  context: string;
}

export function InboxPanel({ open, emailId, mode, onClose, context }: InboxPanelProps) {
  const { dragProps, resetDrag } = useSwipeDismiss({ onDismiss: onClose });

  const { data: email, isLoading, error } = useEmailDetailQuery(
    context as AIContext,
    open && mode === 'detail' ? emailId : null,
  );

  useEffect(() => {
    if (!open) return;
    resetDrag();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, resetDrag]);

  const renderContent = () => {
    if (mode === 'compose') {
      return (
        <div className="inbox-panel__compose-placeholder flex flex-col items-center justify-center h-full gap-3 text-text-muted">
          <span className="text-4xl">✍️</span>
          <span className="text-sm">Compose-Ansicht folgt</span>
        </div>
      );
    }

    if (!emailId) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted">
          <span className="text-sm">Keine E-Mail ausgewählt</span>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-40 text-text-muted gap-2">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Lade E-Mail…</span>
        </div>
      );
    }

    if (error || !email) {
      return (
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-text-muted">
          <AlertCircle size={20} className="text-red-400" />
          <span className="text-sm">E-Mail konnte nicht geladen werden</span>
        </div>
      );
    }

    const senderInitials = getInitials(email.from_name, email.from_address);
    const avatarColor = stringToColor(email.from_address);
    const dateStr = formatEmailDateTime(email.received_at || email.sent_at || email.created_at);
    const typedEmail = email as Email;
    const priority = typedEmail.ai_priority ? PRIORITY_LABELS[typedEmail.ai_priority as EmailPriority] : null;
    const category = typedEmail.ai_category ? CATEGORY_LABELS[typedEmail.ai_category as EmailCategory] : null;

    return (
      <div className="inbox-panel__detail flex flex-col gap-4">
        {/* Header: avatar + from + date */}
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0 bg-[var(--bg)]"
            style={{ '--bg': avatarColor } as CSSProperties}
            aria-hidden="true"
          >
            {senderInitials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-text truncate">
                {typedEmail.from_name || typedEmail.from_address}
              </span>
              {typedEmail.is_starred && <Star size={14} className="text-yellow-400 shrink-0" fill="currentColor" />}
            </div>
            <span className="text-xs text-text-muted">{typedEmail.from_address}</span>
          </div>
        </div>

        {/* Subject */}
        <h2 className="text-base font-semibold text-text leading-snug">
          {typedEmail.subject || '(Kein Betreff)'}
        </h2>

        {/* Meta badges */}
        <div className="flex flex-wrap gap-1.5">
          {dateStr && (
            <span className="text-xs text-text-muted">{dateStr}</span>
          )}
          {priority && (
            <span className="text-xs px-1.5 py-0.5 rounded text-[var(--c)] bg-[var(--bg)]" style={{ '--c': priority.color, '--bg': `${priority.color}22` } as CSSProperties}>
              {priority.icon} {priority.label}
            </span>
          )}
          {category && (
            <span className="text-xs px-1.5 py-0.5 rounded text-[var(--c)] bg-[var(--bg)]" style={{ '--c': category.color, '--bg': `${category.color}22` } as CSSProperties}>
              {category.icon} {category.label}
            </span>
          )}
          {typedEmail.has_attachments && (
            <span className="flex items-center gap-0.5 text-xs text-text-muted">
              <Paperclip size={11} />
              {typedEmail.attachments?.length ?? ''}
            </span>
          )}
        </div>

        {/* AI summary — Sprint 1.1: visible AI label per EU AI Act Art. 50. */}
        {typedEmail.ai_summary && (
          <div className="glass rounded-lg px-3 py-2 text-xs text-text-secondary border border-glass-border">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-text-muted uppercase tracking-wide text-[10px]">KI-Zusammenfassung</span>
              <AiOutputBadge size="sm" variant="subtle" />
            </div>
            {typedEmail.ai_summary}
          </div>
        )}

        {/* Body */}
        <div className="inbox-panel__body text-sm text-text leading-relaxed">
          {typedEmail.body_html ? (
            <div
              className="prose prose-sm max-w-none prose-invert"
              dangerouslySetInnerHTML={{ __html: typedEmail.body_html }}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans">{typedEmail.body_text || '(Kein Inhalt)'}</pre>
          )}
        </div>

        {/* AI action items */}
        {typedEmail.ai_action_items?.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Aufgaben</span>
            {typedEmail.ai_action_items.map((item: { text: string; done?: boolean }, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs text-text">
                <span className="mt-0.5 text-text-muted">{item.done ? '✓' : '○'}</span>
                <span className={item.done ? 'line-through text-text-muted' : ''}>{item.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {open && (
        <div
          className="inbox-panel__backdrop"
          onClick={onClose}
          data-testid="inbox-panel-backdrop"
          aria-hidden="true"
        />
      )}
      <motion.aside
        {...dragProps}
        className={`inbox-panel ${open ? 'inbox-panel--open' : ''} touch-pan-x`}
        role="complementary"
        aria-label="E-Mail-Details"
        aria-hidden={!open}
        {...(!open ? { inert: '' as unknown as boolean } : {})}
      >
        {/* Swipe handle — visible on mobile only */}
        <div className="hidden max-sm:flex justify-center pt-2 pb-1 shrink-0 cursor-grab active:cursor-grabbing touch-none" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-glass-border" />
        </div>
        <div className="inbox-panel__header">
          <button
            className="inbox-panel__close min-w-[44px] min-h-[44px]"
            onClick={onClose}
            aria-label="Schließen"
          >
            <X size={20} />
          </button>
        </div>
        <div className="inbox-panel__content">
          {open && renderContent()}
        </div>
      </motion.aside>
    </>
  );
}
