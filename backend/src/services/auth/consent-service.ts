/**
 * Sprint 1.2 — Consent-Center (DSGVO Art. 6/7)
 *
 * Granulare User-Einwilligungen. Jede Änderung wird als neuer Zeilen-Eintrag
 * gespeichert (nicht UPDATE), damit die Historie erhalten bleibt und
 * Art. 7 Abs. 3 DSGVO (Widerruf so einfach wie Erteilung) nachweisbar ist.
 *
 * "Current State" = der neueste Eintrag pro (user_id, kind).
 */

import { queryPublic } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { truncateIpAddress } from '../../utils/privacy/ip-truncate';

// ===========================================
// Types
// ===========================================

/**
 * Alle unterstützten Consent-Arten. Default-Werte unten definieren das
 * Verhalten, wenn ein User noch nie aktiv eingewilligt/abgelehnt hat.
 */
export const CONSENT_KINDS = [
  'cookies_functional',
  'cookies_analytics',
  'ai_training_opt_out',
  'analytics_tracking',
  'functional_tracking',
] as const;

export type ConsentKind = (typeof CONSENT_KINDS)[number];

/**
 * Default-Werte, wenn der User noch nie eingewilligt hat.
 *
 * Wichtig:
 *   - ai_training_opt_out defaultet auf TRUE (opt-out by default, Privacy-First)
 *   - cookies_functional defaultet auf TRUE (Session/Login funktional notwendig)
 *   - Alle anderen defaulten auf FALSE
 */
export const CONSENT_DEFAULTS: Record<ConsentKind, boolean> = {
  cookies_functional: true,
  cookies_analytics: false,
  ai_training_opt_out: true,
  analytics_tracking: false,
  functional_tracking: false,
};

export type ConsentSource = 'settings' | 'signup' | 'cookie_banner' | 'api';

export interface ConsentEntry {
  id: string;
  user_id: string;
  kind: ConsentKind;
  granted: boolean;
  ip_address: string | null;
  user_agent: string | null;
  granted_at: string;
  revoked_at: string | null;
  source: ConsentSource;
  metadata: Record<string, unknown>;
}

export interface ConsentState {
  [kind: string]: {
    granted: boolean;
    granted_at: string | null;
    is_default: boolean;
  };
}

export interface SetConsentInput {
  userId: string;
  kind: ConsentKind;
  granted: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  source?: ConsentSource;
  metadata?: Record<string, unknown>;
}

// ===========================================
// Helpers
// ===========================================

export function isConsentKind(value: unknown): value is ConsentKind {
  return typeof value === 'string' && (CONSENT_KINDS as readonly string[]).includes(value);
}

// ===========================================
// Read — current state
// ===========================================

/**
 * Liefert den aktuellen Consent-Zustand für einen User.
 * Für kinds ohne Eintrag wird der Default verwendet (is_default: true).
 */
export async function getConsentState(userId: string): Promise<ConsentState> {
  const result = await queryPublic(
    `
    SELECT DISTINCT ON (kind)
      kind, granted, granted_at, revoked_at
    FROM public.user_consent
    WHERE user_id = $1
    ORDER BY kind, granted_at DESC
    `,
    [userId]
  );

  const state: ConsentState = {};
  for (const kind of CONSENT_KINDS) {
    state[kind] = {
      granted: CONSENT_DEFAULTS[kind],
      granted_at: null,
      is_default: true,
    };
  }

  for (const row of result.rows as Array<{
    kind: string;
    granted: boolean;
    granted_at: string;
    revoked_at: string | null;
  }>) {
    if (!isConsentKind(row.kind)) continue;
    const effectiveGranted = row.revoked_at ? false : row.granted;
    state[row.kind] = {
      granted: effectiveGranted,
      granted_at: row.granted_at,
      is_default: false,
    };
  }

  return state;
}

/**
 * Prüft einen einzelnen Consent (für Middleware).
 * Bei fehlendem Eintrag wird der Default zurückgegeben.
 */
export async function hasConsent(userId: string, kind: ConsentKind): Promise<boolean> {
  const result = await queryPublic(
    `
    SELECT granted, revoked_at FROM public.user_consent
    WHERE user_id = $1 AND kind = $2
    ORDER BY granted_at DESC
    LIMIT 1
    `,
    [userId, kind]
  );

  if (result.rows.length === 0) {
    return CONSENT_DEFAULTS[kind];
  }

  const row = result.rows[0] as { granted: boolean; revoked_at: string | null };
  return row.revoked_at ? false : row.granted;
}

// ===========================================
// Write — neuer Eintrag pro Änderung
// ===========================================

/**
 * Setzt einen Consent. Wenn der gewünschte Zustand dem aktuellen Zustand
 * entspricht, wird kein neuer Eintrag angelegt (idempotent).
 *
 * Sonst: neuer Eintrag. Vorherige Einträge bleiben erhalten (Historie).
 */
export async function setConsent(input: SetConsentInput): Promise<ConsentEntry> {
  const currentGranted = await hasConsent(input.userId, input.kind);
  if (currentGranted === input.granted) {
    // Schon im gewünschten Zustand — letzten Eintrag zurückgeben (oder einen Default-Stub).
    const result = await queryPublic(
      `
      SELECT * FROM public.user_consent
      WHERE user_id = $1 AND kind = $2
      ORDER BY granted_at DESC
      LIMIT 1
      `,
      [input.userId, input.kind]
    );
    if (result.rows.length > 0) return result.rows[0] as ConsentEntry;
    // Noch nie gesetzt — aber Default-Zustand == gewünschter Zustand.
    // Wir legen trotzdem einen expliziten Eintrag an, damit "is_default: false" wird.
  }

  const result = await queryPublic(
    `
    INSERT INTO public.user_consent
      (user_id, kind, granted, ip_address, user_agent, source, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
    `,
    [
      input.userId,
      input.kind,
      input.granted,
      truncateIpAddress(input.ipAddress ?? null),
      input.userAgent || null,
      input.source || 'settings',
      JSON.stringify(input.metadata || {}),
    ]
  );

  logger.info('Consent updated', {
    operation: 'consent',
    userId: input.userId,
    kind: input.kind,
    granted: input.granted,
    source: input.source || 'settings',
  });

  return result.rows[0] as ConsentEntry;
}

/**
 * Widerruft einen Consent (Art. 7 Abs. 3 — so einfach wie Erteilung).
 * Markiert den aktuellen Eintrag als revoked und legt zusätzlich einen
 * neuen expliziten "granted=false"-Eintrag an (zur lückenlosen Historie).
 */
export async function revokeConsent(input: {
  userId: string;
  kind: ConsentKind;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<ConsentEntry> {
  await queryPublic(
    `
    UPDATE public.user_consent
    SET revoked_at = NOW()
    WHERE user_id = $1 AND kind = $2 AND revoked_at IS NULL
    `,
    [input.userId, input.kind]
  );

  return setConsent({
    userId: input.userId,
    kind: input.kind,
    granted: false,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    source: 'settings',
    metadata: { action: 'revoke' },
  });
}

// ===========================================
// Historie (für Settings-UI "wann habe ich was erteilt")
// ===========================================

export async function getConsentHistory(userId: string, kind?: ConsentKind): Promise<ConsentEntry[]> {
  const params: unknown[] = [userId];
  let sql = 'SELECT * FROM public.user_consent WHERE user_id = $1';
  if (kind) {
    sql += ' AND kind = $2';
    params.push(kind);
  }
  sql += ' ORDER BY granted_at DESC LIMIT 100';
  const result = await queryPublic(sql, params as never);
  return result.rows as ConsentEntry[];
}
