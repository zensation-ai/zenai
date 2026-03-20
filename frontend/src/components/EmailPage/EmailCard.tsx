import React from 'react';
import type { Email } from './types';
import { stringToColor, getInitials, formatEmailDate, truncateText, CATEGORY_LABELS } from './types';
import './EmailCard.css';

interface EmailCardProps {
  email: Email;
  selected?: boolean;
  onSelect: (id: string) => void;
  onStar?: (id: string) => void;
}

export const EmailCard: React.FC<EmailCardProps> = ({ email, selected, onSelect, onStar }) => {
  const isUnread = email.status === 'received';
  const senderName = email.from_name || email.from_address;
  const initials = getInitials(email.from_name, email.from_address);
  const avatarColor = stringToColor(email.from_address);
  const snippet = truncateText(email.body_text || email.ai_summary, 120);
  const categoryInfo = email.ai_category ? CATEGORY_LABELS[email.ai_category] : null;

  return (
    <article
      className={`email-card${selected ? ' email-card--selected' : ''}${isUnread ? ' email-card--unread' : ''}`}
      onClick={() => onSelect(email.id)}
      role="button"
      tabIndex={0}
      aria-selected={selected}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(email.id);
        }
      }}
    >
      <div className="email-card__avatar" style={{ backgroundColor: avatarColor }}>
        {initials}
      </div>
      <div className="email-card__content">
        <div className="email-card__header">
          <span className="email-card__sender">{senderName}</span>
          <span className="email-card__date">{formatEmailDate(email.received_at || email.created_at)}</span>
        </div>
        <div className="email-card__subject">{email.subject || '(Kein Betreff)'}</div>
        {snippet && <div className="email-card__snippet">{snippet}</div>}
        <div className="email-card__meta">
          {categoryInfo && (
            <span className="email-card__category" style={{ color: categoryInfo.color }}>
              {categoryInfo.icon} {categoryInfo.label}
            </span>
          )}
          {email.has_attachments && (
            <span className="email-card__attachment" aria-label="Hat Anhaenge">📎</span>
          )}
          {email.thread_count && email.thread_count > 1 && (
            <span className="email-card__thread-count">{email.thread_count}</span>
          )}
        </div>
      </div>
      {onStar && (
        <button
          className={`email-card__star${email.is_starred ? ' email-card__star--active' : ''}`}
          onClick={e => {
            e.stopPropagation();
            onStar(email.id);
          }}
          aria-pressed={email.is_starred}
          aria-label={email.is_starred ? 'Stern entfernen' : 'Mit Stern markieren'}
          type="button"
        >
          {email.is_starred ? '★' : '☆'}
        </button>
      )}
    </article>
  );
};
