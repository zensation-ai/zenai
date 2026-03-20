/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InboxSmartPage } from '../InboxSmartPage';

// Mock all child components to isolate SmartPage logic
vi.mock('../FilterChipBar', () => ({
  FilterChipBar: (props: any) => (
    <div data-testid="filter-chip-bar" data-count={props.activeCount}>FilterChipBar</div>
  ),
}));

vi.mock('../InboxToolbar', () => ({
  InboxToolbar: (props: any) => (
    <div data-testid="inbox-toolbar" data-view={props.viewMode}>InboxToolbar</div>
  ),
}));

vi.mock('../EmailListView', () => ({
  EmailListView: (props: any) => (
    <div data-testid="email-list-view" data-count={props.emails?.length ?? 0}>EmailListView</div>
  ),
}));

vi.mock('../EmailGridView', () => ({
  EmailGridView: (props: any) => (
    <div data-testid="email-grid-view" data-count={props.emails?.length ?? 0}>EmailGridView</div>
  ),
}));

vi.mock('../InboxPanel', () => ({
  InboxPanel: (props: any) => (
    <div data-testid="inbox-panel" data-open={props.open}>InboxPanel</div>
  ),
}));

// Mock useInboxFilters
vi.mock('../useInboxFilters', () => ({
  useInboxFilters: () => ({
    filters: { folders: new Set(), statuses: new Set(), categories: new Set(), search: '', accountId: null },
    sort: { key: 'date', direction: 'desc' },
    setSort: vi.fn(),
    toggleFilter: vi.fn(),
    setSearch: vi.fn(),
    clearAll: vi.fn(),
    activeFilterCount: 0,
    chipDefs: [],
  }),
}));

// Mock React Query hooks
vi.mock('../../../hooks/queries/useEmail', () => ({
  useEmailsQuery: () => ({
    data: [
      { id: '1', subject: 'Test', from_address: 'a@b.com', status: 'received', direction: 'inbound', from_name: null, to_addresses: [], cc_addresses: [], bcc_addresses: [], body_html: null, body_text: null, has_attachments: false, attachments: [], is_starred: false, labels: [], ai_summary: null, ai_category: null, ai_priority: null, ai_sentiment: null, ai_action_items: [], ai_reply_suggestions: [], ai_processed_at: null, resend_email_id: null, account_id: null, reply_to_id: null, thread_id: null, context: 'personal', received_at: '2026-01-01', sent_at: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useEmailStatsQuery: () => ({ data: null }),
  useToggleEmailStarMutation: () => ({ mutate: vi.fn() }),
}));

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('InboxSmartPage', () => {
  it('renders FilterChipBar', () => {
    renderWithProviders(<InboxSmartPage context="personal" />);
    expect(screen.getByTestId('filter-chip-bar')).toBeInTheDocument();
  });

  it('renders InboxToolbar', () => {
    renderWithProviders(<InboxSmartPage context="personal" />);
    expect(screen.getByTestId('inbox-toolbar')).toBeInTheDocument();
  });

  it('renders EmailListView by default (list mode)', () => {
    renderWithProviders(<InboxSmartPage context="personal" />);
    expect(screen.getByTestId('email-list-view')).toBeInTheDocument();
  });

  it('renders InboxPanel (initially closed)', () => {
    renderWithProviders(<InboxSmartPage context="personal" />);
    expect(screen.getByTestId('inbox-panel')).toBeInTheDocument();
    expect(screen.getByTestId('inbox-panel').getAttribute('data-open')).toBe('false');
  });

  it('passes email data to the view', () => {
    renderWithProviders(<InboxSmartPage context="personal" />);
    expect(screen.getByTestId('email-list-view').getAttribute('data-count')).toBe('1');
  });

  it('has main container class', () => {
    const { container } = renderWithProviders(<InboxSmartPage context="personal" />);
    expect(container.querySelector('.inbox-smart-page')).toBeTruthy();
  });
});
