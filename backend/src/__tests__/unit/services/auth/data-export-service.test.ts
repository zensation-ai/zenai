/**
 * Sprint 1.10 — DSAR Data-Export Manifest Regression
 *
 * The ZIP archive produced by `runDataExport()` must:
 *   - carry a manifest.json with DSGVO Art. 20 metadata and the 4 context schemas;
 *   - include profile.json WITHOUT `password_hash` or `mfa_secret` (the two
 *     sensitive fields that `toUserProfile()` deliberately strips);
 *   - update the data_exports row to status='completed' once the ZIP is written.
 *
 * We mock archiver + fs streams to capture appended entries without touching
 * the filesystem, and stub database + resend so the service runs in isolation.
 */

import { EventEmitter } from 'events';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks (hoisted by jest.mock — must precede the SUT import)
// ─────────────────────────────────────────────────────────────────────────────

const mockQueryPublic = jest.fn();
const mockQueryContext = jest.fn();

jest.mock('../../../../utils/database-context', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// IP-truncate helper: pass-through for test.
jest.mock('../../../../utils/privacy/ip-truncate', () => ({
  truncateIpAddress: (ip: string | null) => ip,
}));

// user-service: findById returns a user WITH sensitive fields, toUserProfile
// is the REAL implementation so we can verify it strips sensitive data.
const mockFindById = jest.fn();
jest.mock('../../../../services/auth/user-service', () => {
  type U = {
    id: string;
    email: string;
    email_verified: boolean;
    display_name: string | null;
    avatar_url: string | null;
    auth_provider: string;
    mfa_enabled: boolean;
    role: string;
    preferences: Record<string, unknown>;
    last_login: string | null;
    login_count: number;
    onboarding_completed_at: string | null;
    consent_banner_shown_at: string | null;
    created_at: string;
    updated_at: string;
    password_hash?: string;
    mfa_secret?: string | null;
    auth_provider_id?: string | null;
  };
  return {
    findById: (...args: unknown[]) => mockFindById(...args),
    toUserProfile: (u: U) => ({
      id: u.id,
      email: u.email,
      email_verified: u.email_verified,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      auth_provider: u.auth_provider,
      mfa_enabled: u.mfa_enabled,
      role: u.role,
      preferences: u.preferences,
      last_login: u.last_login,
      login_count: u.login_count,
      onboarding_completed_at: u.onboarding_completed_at ?? null,
      consent_banner_shown_at: u.consent_banner_shown_at ?? null,
      created_at: u.created_at,
      updated_at: u.updated_at,
    }),
  };
});

// Job queue: no-op — the test calls runDataExport directly, not via enqueue.
jest.mock('../../../../services/queue/job-queue', () => ({
  getQueueService: () => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    enqueue: jest.fn().mockResolvedValue('job-1'),
  }),
}));

// Resend: un-configured, so notifyUserExportReady short-circuits.
jest.mock('../../../../services/resend', () => ({
  isResendConfigured: () => false,
  sendEmail: jest.fn(),
}));

// fs: mkdir is a no-op, stat returns a stable size.
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    createWriteStream: jest.fn(() => {
      const s = new EventEmitter() as EventEmitter & { end?: () => void };
      s.end = () => {
        // archiver calls end() after finalize; emit 'close' asynchronously.
        setImmediate(() => s.emit('close'));
      };
      return s;
    }),
    promises: {
      ...actual.promises,
      mkdir: jest.fn().mockResolvedValue(undefined),
      stat: jest.fn().mockResolvedValue({ size: 4242 }),
    },
  };
});

// archiver: capture every append() call, resolve finalize() by emitting 'close'
// on the underlying stream (which our createWriteStream mock already triggers
// from end()).
type Appended = { name: string; body: string };
const appended: Appended[] = [];

jest.mock('archiver', () => {
  return jest.fn(() => {
    const ee = new EventEmitter() as EventEmitter & {
      pipe: (out: EventEmitter & { end?: () => void }) => void;
      append: (body: string, opts: { name: string }) => void;
      finalize: () => void;
    };
    let pipedOut: (EventEmitter & { end?: () => void }) | null = null;
    ee.pipe = (out) => {
      pipedOut = out;
    };
    ee.append = (body, opts) => {
      appended.push({ name: opts.name, body });
    };
    ee.finalize = () => {
      if (pipedOut?.end) pipedOut.end();
    };
    return ee;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUT
// ─────────────────────────────────────────────────────────────────────────────

import { runDataExport } from '../../../../services/auth/data-export-service';

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

const userWithSensitiveFields = {
  id: 'usr_export_123',
  email: 'user@example.com',
  email_verified: true,
  display_name: 'Export Test',
  avatar_url: null,
  auth_provider: 'local',
  mfa_enabled: false,
  role: 'user',
  preferences: {},
  last_login: '2026-04-18T00:00:00Z',
  login_count: 5,
  onboarding_completed_at: '2026-04-17T00:00:00Z',
  consent_banner_shown_at: '2026-04-18T00:00:00Z',
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-18T00:00:00Z',
  // Sensitive — MUST NOT appear in profile.json
  password_hash: '$2b$12$SHOULD_NEVER_BE_EXPORTED',
  mfa_secret: 'SECRET_SHOULD_NEVER_BE_EXPORTED',
  auth_provider_id: 'provider_internal_id',
};

describe('data-export-service / runDataExport', () => {
  beforeEach(() => {
    appended.length = 0;
    mockQueryPublic.mockReset();
    mockQueryContext.mockReset();
    mockFindById.mockReset();

    // Default DB script:
    //  1) UPDATE … SET status = 'processing'
    //  2) SELECT data_exports row
    //  3) UPDATE … SET status = 'completed' … RETURNING *
    mockQueryPublic
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // processing update
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'export_1',
            user_id: userWithSensitiveFields.id,
            status: 'processing',
            file_path: null,
            file_size: null,
            download_token: 'tok_1',
            error_message: null,
            requested_at: '2026-04-19T00:00:00Z',
            completed_at: null,
            expires_at: '2026-04-26T00:00:00Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'export_1',
            user_id: userWithSensitiveFields.id,
            status: 'completed',
            file_path: '/tmp/zenai-data-exports/export_1.zip',
            file_size: 4242,
            download_token: 'tok_1',
            error_message: null,
            requested_at: '2026-04-19T00:00:00Z',
            completed_at: '2026-04-19T00:00:01Z',
            expires_at: '2026-04-26T00:00:00Z',
          },
        ],
      });

    // Information-schema lookups return no tables → keeps sections minimal.
    mockQueryContext.mockResolvedValue({ rows: [] });

    mockFindById.mockResolvedValue(userWithSensitiveFields);
  });

  it('writes manifest.json with DSGVO Art. 20 metadata and all 4 contexts', async () => {
    const row = await runDataExport('export_1');
    expect(row.status).toBe('completed');

    const manifestEntry = appended.find((e) => e.name === 'manifest.json');
    expect(manifestEntry).toBeDefined();

    const manifest = JSON.parse(manifestEntry!.body);
    expect(manifest.user_id).toBe(userWithSensitiveFields.id);
    expect(manifest.dsgvo_article).toMatch(/Art\.\s*20/);
    expect(manifest.contexts).toEqual(['operations', 'finance', 'people', 'strategy']);
    expect(typeof manifest.generated_at).toBe('string');
  });

  it('emits profile.json WITHOUT password_hash, mfa_secret, or auth_provider_id', async () => {
    await runDataExport('export_1');

    const profileEntry = appended.find((e) => e.name === 'profile.json');
    expect(profileEntry).toBeDefined();

    // Serialize the body as a string and also parse — both paths must be clean.
    expect(profileEntry!.body).not.toMatch(/password_hash/);
    expect(profileEntry!.body).not.toMatch(/mfa_secret/);
    expect(profileEntry!.body).not.toMatch(/auth_provider_id/);
    expect(profileEntry!.body).not.toMatch(/SHOULD_NEVER_BE_EXPORTED/);

    const profile = JSON.parse(profileEntry!.body);
    expect(profile).not.toHaveProperty('password_hash');
    expect(profile).not.toHaveProperty('mfa_secret');
    expect(profile).not.toHaveProperty('auth_provider_id');

    // Sanity: non-sensitive fields still exported.
    expect(profile.id).toBe(userWithSensitiveFields.id);
    expect(profile.email).toBe(userWithSensitiveFields.email);
    expect(profile.role).toBe('user');
    expect(profile.consent_banner_shown_at).toBe('2026-04-18T00:00:00Z');
  });

  it('marks the data_exports row as completed with file metadata', async () => {
    await runDataExport('export_1');

    const calls = mockQueryPublic.mock.calls;
    // The third call is the RETURNING UPDATE to status='completed'.
    const completionUpdate = calls[2];
    expect(completionUpdate[0]).toMatch(/status\s*=\s*'completed'/i);
    // Params: [file_path, file_size, exportId]
    expect(completionUpdate[1][1]).toBe(4242);
    expect(completionUpdate[1][2]).toBe('export_1');
  });
});
