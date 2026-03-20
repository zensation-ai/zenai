import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EmailListView } from '../EmailListView';
import type { Email } from '../types';

// Mock TanStack Virtual — jsdom has no real scroll layout engine
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(() => ({
    getTotalSize: () => 400,
    getVirtualItems: () => [
      { key: '0', index: 0, start: 0, size: 80 },
      { key: '1', index: 1, start: 80, size: 80 },
    ],
  })),
}));

const makeEmail = (id: string): Email => ({
  id,
  resend_email_id: null,
  account_id: null,
  direction: 'inbound',
  status: 'received',
  from_address: `sender${id}@example.com`,
  from_name: `Sender ${id}`,
  to_addresses: [{ email: 'me@test.com' }],
  cc_addresses: [],
  bcc_addresses: [],
  subject: `Subject ${id}`,
  body_html: null,
  body_text: `Body text for email ${id}`,
  reply_to_id: null,
  thread_id: null,
  message_id: null,
  in_reply_to: null,
  has_attachments: false,
  attachments: [],
  ai_summary: null,
  ai_category: null,
  ai_priority: null,
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
});

const mockEmails = [makeEmail('e1'), makeEmail('e2')];

describe('EmailListView', () => {
  it('renders empty state when emails array is empty', () => {
    render(
      <EmailListView
        emails={[]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Keine E-Mails gefunden')).toBeInTheDocument();
  });

  it('renders with role="list" when emails are present', () => {
    render(
      <EmailListView
        emails={mockEmails}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('renders EmailCard elements for each virtual item', () => {
    render(
      <EmailListView
        emails={mockEmails}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    // The mock returns 2 virtual items (index 0 and 1)
    expect(screen.getByText('Sender e1')).toBeInTheDocument();
    expect(screen.getByText('Sender e2')).toBeInTheDocument();
  });

  it('passes selected=true to the correct EmailCard', () => {
    render(
      <EmailListView
        emails={mockEmails}
        selectedId="e1"
        onSelect={vi.fn()}
      />
    );
    // The selected card should have aria-selected="true"
    const listItems = screen.getAllByRole('listitem');
    // First listitem wraps the selected EmailCard
    const firstCard = listItems[0].querySelector('[aria-selected]');
    expect(firstCard).toHaveAttribute('aria-selected', 'true');
  });

  it('passes selected=false to non-selected EmailCards', () => {
    render(
      <EmailListView
        emails={mockEmails}
        selectedId="e1"
        onSelect={vi.fn()}
      />
    );
    const listItems = screen.getAllByRole('listitem');
    const secondCard = listItems[1].querySelector('[aria-selected]');
    expect(secondCard).toHaveAttribute('aria-selected', 'false');
  });

  it('renders without crashing when onStar is not provided', () => {
    render(
      <EmailListView
        emails={mockEmails}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('has accessible aria-label on the list container', () => {
    render(
      <EmailListView
        emails={mockEmails}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole('list', { name: 'E-Mail Liste' })).toBeInTheDocument();
  });
});
