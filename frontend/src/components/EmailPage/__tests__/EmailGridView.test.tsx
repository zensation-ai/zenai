import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EmailGridView } from '../EmailGridView';
import type { Email } from '../types';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(() => ({
    getTotalSize: () => 400,
    getVirtualItems: () => [
      { key: '0', index: 0, start: 0, size: 200 },
    ],
  })),
}));

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

const mockEmail2: Email = { ...mockEmail, id: 'e2', subject: 'Second Email' };
const mockEmail3: Email = { ...mockEmail, id: 'e3', subject: 'Third Email' };

describe('EmailGridView', () => {
  it('renders empty state when emails is empty', () => {
    render(
      <EmailGridView
        emails={[]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Keine E-Mails gefunden')).toBeInTheDocument();
  });

  it('renders email cards in grid', () => {
    render(
      <EmailGridView
        emails={[mockEmail, mockEmail2, mockEmail3]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('Test Subject')).toBeInTheDocument();
    expect(screen.getByText('Second Email')).toBeInTheDocument();
    expect(screen.getByText('Third Email')).toBeInTheDocument();
  });

  it('has data-view="grid" attribute on container', () => {
    const { container } = render(
      <EmailGridView
        emails={[mockEmail]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    const gridContainer = container.querySelector('[data-view="grid"]');
    expect(gridContainer).not.toBeNull();
  });

  it('renders with correct aria-label', () => {
    render(
      <EmailGridView
        emails={[mockEmail]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByLabelText('E-Mail Kacheln')).toBeInTheDocument();
  });

  it('passes selected state to EmailCard', () => {
    render(
      <EmailGridView
        emails={[mockEmail]}
        selectedId="e1"
        onSelect={vi.fn()}
      />
    );
    const card = screen.getByRole('button');
    expect(card.classList.contains('email-card--selected')).toBe(true);
  });

  it('calls onSelect when an email card is clicked', () => {
    const onSelect = vi.fn();
    render(
      <EmailGridView
        emails={[mockEmail]}
        selectedId={null}
        onSelect={onSelect}
      />
    );
    screen.getByRole('button').click();
    expect(onSelect).toHaveBeenCalledWith('e1');
  });

  it('renders grid row with email-grid-row class', () => {
    const { container } = render(
      <EmailGridView
        emails={[mockEmail]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    const row = container.querySelector('.email-grid-row');
    expect(row).not.toBeNull();
  });
});
