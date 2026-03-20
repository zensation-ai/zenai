import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EmailCard } from '../EmailCard';
import type { Email } from '../types';

const mockEmail: Email = {
  id: 'e1',
  resend_email_id: null,
  account_id: null,
  direction: 'inbound',
  status: 'received',
  from_address: 'test@example.com',
  from_name: 'Test User',
  to_addresses: [{ email: 'me@test.com' }],
  cc_addresses: [],
  bcc_addresses: [],
  subject: 'Test Subject',
  body_html: null,
  body_text: 'This is a test email body',
  reply_to_id: null,
  thread_id: null,
  message_id: null,
  in_reply_to: null,
  has_attachments: false,
  attachments: [],
  ai_summary: null,
  ai_category: 'business',
  ai_priority: 'medium',
  ai_sentiment: null,
  ai_action_items: [],
  ai_reply_suggestions: [],
  ai_processed_at: null,
  labels: [],
  is_starred: false,
  context: 'personal',
  received_at: '2026-03-20T10:00:00Z',
  sent_at: null,
  created_at: '2026-03-20T10:00:00Z',
  updated_at: '2026-03-20T10:00:00Z',
};

describe('EmailCard', () => {
  it('renders sender name', () => {
    render(<EmailCard email={mockEmail} onSelect={vi.fn()} />);
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('renders subject', () => {
    render(<EmailCard email={mockEmail} onSelect={vi.fn()} />);
    expect(screen.getByText('Test Subject')).toBeInTheDocument();
  });

  it('renders date', () => {
    render(<EmailCard email={mockEmail} onSelect={vi.fn()} />);
    // Date is rendered — just check the date element exists (exact format depends on locale/time)
    const article = screen.getByRole('button');
    expect(article).toBeInTheDocument();
    // The date cell should have some non-empty text from formatEmailDate
    const dateEl = article.querySelector('.email-card__date');
    expect(dateEl).not.toBeNull();
    expect(dateEl!.textContent).not.toBe('');
  });

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn();
    render(<EmailCard email={mockEmail} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('e1');
  });

  it('calls onStar when star button clicked without calling onSelect', () => {
    const onSelect = vi.fn();
    const onStar = vi.fn();
    render(<EmailCard email={mockEmail} onSelect={onSelect} onStar={onStar} />);
    const starBtn = screen.getByRole('button', { name: /markieren/i });
    fireEvent.click(starBtn);
    expect(onStar).toHaveBeenCalledWith('e1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('applies unread styling for status=received', () => {
    render(<EmailCard email={mockEmail} onSelect={vi.fn()} />);
    const article = screen.getByRole('button');
    expect(article.classList.contains('email-card--unread')).toBe(true);
  });

  it('does not apply unread styling for status=read', () => {
    const readEmail: Email = { ...mockEmail, status: 'read' };
    render(<EmailCard email={readEmail} onSelect={vi.fn()} />);
    const article = screen.getByRole('button');
    expect(article.classList.contains('email-card--unread')).toBe(false);
  });

  it('shows category badge when ai_category is set', () => {
    render(<EmailCard email={mockEmail} onSelect={vi.fn()} />);
    expect(screen.getByText(/Geschaeftlich/i)).toBeInTheDocument();
  });

  it('does not show category badge when ai_category is null', () => {
    const noCatEmail: Email = { ...mockEmail, ai_category: null };
    render(<EmailCard email={noCatEmail} onSelect={vi.fn()} />);
    expect(screen.queryByText(/Geschaeftlich/i)).not.toBeInTheDocument();
  });

  it('star button has aria-pressed', () => {
    render(<EmailCard email={mockEmail} onSelect={vi.fn()} onStar={vi.fn()} />);
    const starBtn = screen.getByRole('button', { name: /markieren/i });
    expect(starBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('star button aria-pressed is true when starred', () => {
    const starredEmail: Email = { ...mockEmail, is_starred: true };
    render(<EmailCard email={starredEmail} onSelect={vi.fn()} onStar={vi.fn()} />);
    const starBtn = screen.getByRole('button', { name: /entfernen/i });
    expect(starBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows selected styling when selected=true', () => {
    render(<EmailCard email={mockEmail} selected={true} onSelect={vi.fn()} />);
    const article = screen.getByRole('button');
    expect(article.classList.contains('email-card--selected')).toBe(true);
  });

  it('shows no subject fallback when subject is null', () => {
    const noSubjectEmail: Email = { ...mockEmail, subject: null };
    render(<EmailCard email={noSubjectEmail} onSelect={vi.fn()} />);
    expect(screen.getByText('(Kein Betreff)')).toBeInTheDocument();
  });

  it('shows from_address as sender name when from_name is null', () => {
    const noNameEmail: Email = { ...mockEmail, from_name: null };
    render(<EmailCard email={noNameEmail} onSelect={vi.fn()} />);
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('shows attachment indicator when has_attachments is true', () => {
    const withAttachment: Email = { ...mockEmail, has_attachments: true };
    render(<EmailCard email={withAttachment} onSelect={vi.fn()} />);
    expect(screen.getByLabelText('Hat Anhaenge')).toBeInTheDocument();
  });
});
