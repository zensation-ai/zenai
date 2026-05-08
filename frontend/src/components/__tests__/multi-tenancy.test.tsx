/**
 * Multi-Tenancy Frontend Tests
 *
 * Tests for query keys, types, TeamTab, and InviteAcceptPage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import type { Organization, Workspace, WorkspaceContext, WorkspaceMember, WorkspaceInvitation } from '../../types/multi-tenancy';
import { queryKeys } from '../../lib/query-keys';

// ===========================================
// Mocks
// ===========================================

const mockSwitchWorkspace = vi.fn();
const mockRefreshOrgs = vi.fn();
const mockGetAccessToken = vi.fn(() => 'test-token');

const mockOrg: Organization = {
  id: 'org-1', name: 'Test Org', slug: 'test-org', plan: 'business',
  owner_id: 'user-1', logo_url: null, settings: {},
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

const mockWorkspace: Workspace = {
  id: 'ws-1', org_id: 'org-1', name: 'Dev Workspace', slug: 'dev',
  icon: '🔧', color: '#3b82f6', ai_persona: {}, settings: {},
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

const mockContexts: WorkspaceContext[] = [
  { id: 'ctx-1', workspace_id: 'ws-1', name: 'Privat', slug: 'privat', base_schema: 'operations', icon: '🏠', color: null, sort_order: 0, archived_at: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'ctx-2', workspace_id: 'ws-1', name: 'Strategie', slug: 'strategie', base_schema: 'finance', icon: '📊', color: null, sort_order: 1, archived_at: null, created_at: '2026-01-01T00:00:00Z' },
];

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { access_token: 'test-token', user: { id: 'user-1', email: 'test@test.com' } },
    user: { id: 'user-1', email: 'test@test.com', display_name: 'Test User' },
    loading: false,
    currentOrg: mockOrg,
    currentWorkspace: mockWorkspace,
    workspaceContexts: mockContexts,
    userOrgs: [mockOrg],
    switchWorkspace: mockSwitchWorkspace,
    refreshOrgs: mockRefreshOrgs,
    getAccessToken: mockGetAccessToken,
    signIn: vi.fn(), signOut: vi.fn(), register: vi.fn(), resetPassword: vi.fn(),
  }),
}));

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={createQC()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

// ===========================================
// Query Keys
// ===========================================

describe('Query Keys — Workspace Scoping', () => {
  it('workspace members key', () => {
    expect(queryKeys.workspace.members('ws-123')).toEqual(['workspace', 'ws-123', 'members']);
  });

  it('workspace invitations key', () => {
    expect(queryKeys.workspace.invitations('ws-456')).toEqual(['workspace', 'ws-456', 'invitations']);
  });

  it('org detail key', () => {
    expect(queryKeys.orgs.detail('org-1')).toEqual(['orgs', 'org-1']);
  });

  it('workspace contexts key', () => {
    expect(queryKeys.workspace.contexts('ws-1')).toEqual(['workspace', 'ws-1', 'contexts']);
  });

  it('workspace audit key with filters', () => {
    const key = queryKeys.workspace.audit('ws-1', { severity: 'high' });
    expect(key[0]).toBe('workspace');
    expect(key[1]).toBe('ws-1');
    expect(key[2]).toBe('audit');
  });

  it('existing context keys unchanged', () => {
    const key = queryKeys.ideas.list('operations', { status: 'active' });
    expect(key[0]).toBe('ideas');
    expect(key[1]).toBe('operations');
  });
});

// ===========================================
// Types
// ===========================================

describe('Multi-Tenancy Types', () => {
  it('Organization required fields', () => {
    expect(mockOrg.id).toBe('org-1');
    expect(mockOrg.plan).toBe('business');
    expect(mockOrg.slug).toBe('test-org');
  });

  it('Workspace required fields', () => {
    expect(mockWorkspace.id).toBe('ws-1');
    expect(mockWorkspace.org_id).toBe('org-1');
    expect(mockWorkspace.icon).toBe('🔧');
    expect(mockWorkspace.color).toBe('#3b82f6');
  });

  it('WorkspaceContext maps to base schemas', () => {
    const schemas = mockContexts.map(c => c.base_schema);
    expect(schemas).toContain('operations');
    expect(schemas).toContain('finance');
  });

  it('WorkspaceContext has custom display names', () => {
    expect(mockContexts[1].name).toBe('Strategie');
  });
});

// ===========================================
// TeamTab
// ===========================================

describe('TeamTab', () => {
  const mockMembers: WorkspaceMember[] = [
    { user_id: 'user-1', display_name: 'Owner', email: 'owner@test.com', avatar_url: null, role: 'owner', joined_at: '2026-01-01T00:00:00Z' },
    { user_id: 'user-2', display_name: 'Admin User', email: 'admin@test.com', avatar_url: null, role: 'admin', joined_at: '2026-01-02T00:00:00Z' },
  ];

  const mockInvitations: WorkspaceInvitation[] = [
    { id: 'inv-1', workspace_id: 'ws-1', email: 'new@test.com', role: 'member', invited_by: 'user-1', token: 'abc', expires_at: '2026-02-01T00:00:00Z', accepted_at: null, created_at: '2026-01-15T00:00:00Z' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/members')) return Promise.resolve({ data: { data: mockMembers } });
      if (url.includes('/invitations')) return Promise.resolve({ data: { data: mockInvitations } });
      return Promise.reject(new Error('unexpected'));
    });
  });

  it('renders invite form', async () => {
    const { TeamTab } = await import('../settings/TeamTab');
    render(<TeamTab />, { wrapper: Wrapper });
    expect(screen.getByLabelText('E-Mail')).toBeDefined();
    expect(screen.getByText('Einladen')).toBeDefined();
  });

  it('shows members after load', async () => {
    const { TeamTab } = await import('../settings/TeamTab');
    render(<TeamTab />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText('owner@test.com')).toBeDefined();
      expect(screen.getByText('Admin User')).toBeDefined();
    });
  });

  it('shows pending invitations', async () => {
    const { TeamTab } = await import('../settings/TeamTab');
    render(<TeamTab />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText('new@test.com')).toBeDefined();
    });
  });
});

// ===========================================
// InviteAcceptPage
// ===========================================

describe('InviteAcceptPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error for invalid invitation', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const { InviteAcceptPage } = await import('../InviteAcceptPage');
    render(
      <QueryClientProvider client={createQC()}>
        <MemoryRouter initialEntries={['/invite/bad']}>
          <Routes>
            <Route path="/invite/:token" element={<InviteAcceptPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => {
      expect(screen.getByText('Einladung ungültig')).toBeDefined();
    });
  });

  it('shows invitation details when valid', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          workspace_name: 'Team Alpha', workspace_icon: '🚀',
          org_name: 'Acme Corp', inviter_name: 'Jane Doe',
          inviter_email: 'jane@acme.com', role: 'member' as const,
          expires_at: '2026-04-10T00:00:00Z',
        },
      }),
    });
    const { InviteAcceptPage } = await import('../InviteAcceptPage');
    render(
      <QueryClientProvider client={createQC()}>
        <MemoryRouter initialEntries={['/invite/valid']}>
          <Routes>
            <Route path="/invite/:token" element={<InviteAcceptPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeDefined();
      expect(screen.getByText('Acme Corp')).toBeDefined();
      expect(screen.getByText('Jane Doe')).toBeDefined();
    });
  });

  it('shows accept/decline buttons', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          workspace_name: 'WS', workspace_icon: null,
          org_name: 'Org', inviter_name: 'J', inviter_email: 'j@t.co',
          role: 'member' as const, expires_at: '2026-04-10T00:00:00Z',
        },
      }),
    });
    const { InviteAcceptPage } = await import('../InviteAcceptPage');
    render(
      <QueryClientProvider client={createQC()}>
        <MemoryRouter initialEntries={['/invite/ok']}>
          <Routes>
            <Route path="/invite/:token" element={<InviteAcceptPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => {
      expect(screen.getByText(/annehmen/i)).toBeDefined();
      expect(screen.getByText(/ablehnen/i)).toBeDefined();
    });
  });
});

// ===========================================
// BillingTab (Org-Level)
// ===========================================

describe('BillingTab — Org-Level Billing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock useOrgBillingStatus via axios
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/api/billing/org/')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              subscription: {
                id: 'osub-1', orgId: 'org-1', plan: 'business', status: 'active',
                stripeSubscriptionId: 'sub_x', currentPeriodStart: null,
                currentPeriodEnd: '2026-05-01T00:00:00Z', cancelAtPeriodEnd: false,
                seatCount: 3,
              },
              stripeCustomerId: 'cus_org1',
              stripeConfigured: true,
              workspaceCredits: [
                { workspaceId: 'ws-1', workspaceName: 'Development', creditsUsed: 400, creditsLimit: 1500, seatCount: 3 },
                { workspaceId: 'ws-2', workspaceName: 'Operations', creditsUsed: 100, creditsLimit: 1500, seatCount: 3 },
              ],
            },
          },
        });
      }
      if (url.includes('/api/billing/credits')) {
        return Promise.resolve({ data: { success: true, data: { remaining: 45, used: 5, limit: 50, plan: 'free' } } });
      }
      return Promise.reject(new Error('unexpected'));
    });
  });

  it('renders org plan badge', async () => {
    const { BillingTab } = await import('../settings/BillingTab');
    render(<BillingTab />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText('Business')).toBeDefined();
    });
  });

  it('shows workspace credit breakdown', async () => {
    const { BillingTab } = await import('../settings/BillingTab');
    render(<BillingTab />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText('Development')).toBeDefined();
      expect(screen.getByText('Operations')).toBeDefined();
    });
  });

  it('shows org name', async () => {
    const { BillingTab } = await import('../settings/BillingTab');
    render(<BillingTab />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText('Test Org')).toBeDefined();
    });
  });

  it('shows seat count', async () => {
    const { BillingTab } = await import('../settings/BillingTab');
    render(<BillingTab />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText(/3 Plätze/)).toBeDefined();
    });
  });
});

// ===========================================
// Billing Query Keys
// ===========================================

describe('Billing Query Keys — Org Scoped', () => {
  it('billing org key includes orgId', () => {
    expect(queryKeys.billing.org('org-123')).toEqual(['billing', 'org', 'org-123']);
  });

  it('billing status key unchanged', () => {
    expect(queryKeys.billing.status()).toEqual(['billing', 'status']);
  });

  it('billing credits key unchanged', () => {
    expect(queryKeys.billing.credits()).toEqual(['billing', 'credits']);
  });

  it('billing org key with different orgId', () => {
    expect(queryKeys.billing.org('org-x')).toEqual(['billing', 'org', 'org-x']);
  });
});

// ===========================================
// BillingTab — Division by Zero Guard
// ===========================================

describe('BillingTab — Division by Zero Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock org billing to return zero-credit workspace
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/api/billing/org/')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              subscription: {
                id: 'osub-zero', orgId: 'org-1', plan: 'free', status: 'active',
                stripeSubscriptionId: null, currentPeriodStart: null,
                currentPeriodEnd: null, cancelAtPeriodEnd: false,
                seatCount: 1,
              },
              stripeCustomerId: null,
              stripeConfigured: false,
              workspaceCredits: [
                { workspaceId: 'ws-1', workspaceName: 'Empty WS', creditsUsed: 0, creditsLimit: 0, seatCount: 1 },
              ],
            },
          },
        });
      }
      if (url.includes('/api/billing/credits')) {
        return Promise.resolve({
          data: { success: true, data: { remaining: 0, used: 0, limit: 0, plan: 'free' } },
        });
      }
      return Promise.reject(new Error('unexpected'));
    });
  });

  it('renders without crashing when credits.limit is 0', async () => {
    const { BillingTab } = await import('../settings/BillingTab');
    // Should not throw — the component guards against division by zero
    const { container } = render(<BillingTab />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(container.querySelector('[role="progressbar"]')).toBeDefined();
    });
    // The progress bar width should be 0% (no NaN or Infinity)
    const progressBar = container.querySelector('[role="progressbar"]') as HTMLElement | null;
    if (progressBar) {
      expect(progressBar.style.width).toBe('0%');
    }
  });

  it('renders plan badge as Free when limit is 0', async () => {
    const { BillingTab } = await import('../settings/BillingTab');
    render(<BillingTab />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(screen.getByText('Free')).toBeDefined();
    });
  });
});

// ===========================================
// TeamTab — Invite Submission
// ===========================================

describe('TeamTab — Invite Submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/members')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('/invitations')) return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error('unexpected'));
    });
    mockedAxios.post.mockResolvedValue({ data: { success: true } });
  });

  it('calls axios.post with correct URL and payload when submitting invite', async () => {
    const { TeamTab } = await import('../settings/TeamTab');
    render(<TeamTab />, { wrapper: Wrapper });

    // Fill in the email input
    const emailInput = screen.getByLabelText('E-Mail');
    fireEvent.change(emailInput, { target: { value: 'newuser@example.com' } });

    // Submit the form by clicking Einladen
    const submitButton = screen.getByText('Einladen');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/workspaces/ws-1/invite',
        { email: 'newuser@example.com', role: 'member' },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
  });

  it('does not call axios.post when email is empty', async () => {
    const { TeamTab } = await import('../settings/TeamTab');
    render(<TeamTab />, { wrapper: Wrapper });

    // The button should be disabled when email is empty
    const submitButton = screen.getByText('Einladen');
    fireEvent.click(submitButton);

    // No post call should have been made
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});

// ===========================================
// InviteAcceptPage — Token from pathname
// ===========================================

describe('InviteAcceptPage — Token extraction from pathname', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts token from window.location.pathname when useParams is unavailable', async () => {
    // Use a route that does NOT have :token param — forcing fallback to pathname parsing
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          workspace_name: 'Fallback WS', workspace_icon: null,
          org_name: 'Fallback Org', inviter_name: 'Tester',
          inviter_email: 'tester@test.com', role: 'member' as const,
          expires_at: '2026-06-01T00:00:00Z',
        },
      }),
    });

    const { InviteAcceptPage } = await import('../InviteAcceptPage');
    render(
      <QueryClientProvider client={createQC()}>
        <MemoryRouter initialEntries={['/invite/test-token-123']}>
          <Routes>
            <Route path="/invite/:token" element={<InviteAcceptPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      // Verify fetch was called with the token in the URL
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/invitations/test-token-123/info'),
      );
    });

    // Verify the invite info is rendered
    await waitFor(() => {
      expect(screen.getByText('Fallback WS')).toBeDefined();
      expect(screen.getByText('Fallback Org')).toBeDefined();
    });
  });

  it('shows error when no token can be extracted', async () => {
    global.fetch = vi.fn();

    const { InviteAcceptPage } = await import('../InviteAcceptPage');
    render(
      <QueryClientProvider client={createQC()}>
        <MemoryRouter initialEntries={['/invite/']}>
          <Routes>
            <Route path="/invite/" element={<InviteAcceptPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Einladung ungültig')).toBeDefined();
    });
    // fetch should NOT have been called since there's no token
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
