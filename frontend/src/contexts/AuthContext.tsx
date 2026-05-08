/**
 * Phase 56: JWT-based Authentication Context
 *
 * Replaces Supabase Auth with our own JWT backend.
 * Provides: user, session (backward compat), loading, signIn, signOut, register, resetPassword.
 *
 * Token storage:
 * - accessToken: localStorage (short-lived, 15min)
 * - refreshToken: localStorage (7 days, rotated on use)
 *
 * Auto-refresh: Silently refreshes accessToken when it expires.
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Organization, Workspace, WorkspaceContext } from '../types/multi-tenancy';

// ===========================================
// Types
// ===========================================

export interface AuthUser {
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
  /** Sprint 1.6: when the welcome-wizard was finished (null = still pending) */
  onboarding_completed_at?: string | null;
  /** Sprint 1.10: when the DSGVO consent banner was acknowledged (null = show once) */
  consent_banner_shown_at?: string | null;
  created_at: string;
  updated_at: string;
}

/** Backward-compatible session object (truthy when logged in) */
export interface AuthSession {
  access_token: string;
  user: AuthUser;
}

interface AuthContextType {
  /** Backward compatibility: truthy when authenticated, null when not */
  session: AuthSession | null;
  /** The authenticated user, or null */
  user: AuthUser | null;
  /** True while initial auth state is being loaded */
  loading: boolean;
  /** Sign in with email/password */
  signIn: (email: string, password: string, mfaCode?: string) => Promise<{ error: Error | null; mfaRequired?: boolean }>;
  /** Sign out and revoke session */
  signOut: () => Promise<void>;
  /** Register a new account */
  register: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
  /** Reset password: without token sends reset email, with token sets new password */
  resetPassword: (email: string, token?: string, newPassword?: string) => Promise<{ error: Error | null }>;
  /** Get the current access token (for API calls) */
  getAccessToken: () => string | null;

  // Multi-tenancy
  /** Current organization (null = personal / legacy mode) */
  currentOrg: Organization | null;
  /** Current workspace (null = legacy mode) */
  currentWorkspace: Workspace | null;
  /** Custom contexts for current workspace (fallback to 4 defaults) */
  workspaceContexts: WorkspaceContext[];
  /** All orgs the user belongs to */
  userOrgs: Organization[];
  /** Switch to a different workspace (issues new workspace-scoped token) */
  switchWorkspace: (workspaceId: string) => Promise<void>;
  /** Reload user's organization list */
  refreshOrgs: () => Promise<void>;
  /** Sprint 1.6: re-fetch /api/auth/me so onboarding_completed_at etc. refresh */
  refreshUser: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ===========================================
// Storage Keys
// ===========================================

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'zenai_access_token',
  REFRESH_TOKEN: 'zenai_refresh_token',
  USER: 'zenai_user',
  WORKSPACE_ID: 'zenai_workspace_id',
} as const;

// ===========================================
// API Helper
// ===========================================

function getApiUrl(): string {
  return import.meta.env.VITE_API_URL || 'http://localhost:3000';
}

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${getApiUrl()}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

async function authFetchWithToken(path: string, token: string, options: RequestInit = {}): Promise<Response> {
  return authFetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
}

// ===========================================
// Auth Provider
// ===========================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Multi-tenancy state
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [workspaceContexts, setWorkspaceContexts] = useState<WorkspaceContext[]>([]);
  const [userOrgs, setUserOrgs] = useState<Organization[]>([]);

  // Load stored auth state on mount (or handle OAuth callback)
  useEffect(() => {
    // Check for OAuth callback tokens in URL hash (e.g. /auth/callback#accessToken=...&refreshToken=...&expiresIn=...)
    if (window.location.hash && window.location.pathname.includes('/auth/callback')) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const oauthAccessToken = hashParams.get('accessToken');
      const oauthRefreshToken = hashParams.get('refreshToken');
      const oauthExpiresIn = hashParams.get('expiresIn');

      if (oauthAccessToken && oauthRefreshToken) {
        // Clear hash from URL for security (prevents token leakage in history)
        window.history.replaceState(null, '', '/');
        // Fetch user profile with the new token, then store auth state
        authFetchWithToken('/api/auth/me', oauthAccessToken)
          .then(async (response) => {
            if (response.ok) {
              const data = await response.json();
              const userData = data.data as AuthUser;
              storeAuthState(oauthAccessToken, oauthRefreshToken, userData, Number(oauthExpiresIn) || 900);
            } else {
              clearAuthState();
            }
          })
          .catch(() => clearAuthState())
          .finally(() => setLoading(false));
        return;
      }
    }

    const storedToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const storedUser = localStorage.getItem(STORAGE_KEYS.USER);
    const storedRefresh = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);

    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser) as AuthUser;
        setUser(parsedUser);
        setAccessToken(storedToken);
        // Verify token is still valid by fetching /auth/me
        verifyAndRefresh(storedToken, storedRefresh);
      } catch {
        clearAuthState();
      }
    } else if (storedRefresh) {
      // No access token but have refresh — try to refresh
      refreshTokens(storedRefresh);
    } else {
      setLoading(false);
    }

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  // Intentionally run only on mount — reads localStorage and triggers initial auth check
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearAuthState = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.WORKSPACE_ID);
    setUser(null);
    setAccessToken(null);
    setCurrentOrg(null);
    setCurrentWorkspace(null);
    setWorkspaceContexts([]);
    setUserOrgs([]);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  const storeAuthState = useCallback((token: string, refreshToken: string, userData: AuthUser, expiresIn: number) => {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));
    setUser(userData);
    setAccessToken(token);

    // Schedule token refresh 1 minute before expiry
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const refreshDelay = Math.max((expiresIn - 60) * 1000, 10000);
    refreshTimerRef.current = setTimeout(() => {
      const rt = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (rt) refreshTokens(rt);
    }, refreshDelay);
  }, []);

  const verifyAndRefresh = useCallback(async (token: string, refreshToken: string | null) => {
    try {
      const response = await authFetchWithToken('/api/auth/me', token);
      if (response.ok) {
        const data = await response.json();
        const userData = data.data as AuthUser;
        setUser(userData);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));

        // Load multi-tenancy state on initial verify
        loadCurrentWorkspace(token).catch(() => {});
        refreshOrgs().catch(() => {});

        // Schedule refresh
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => {
          const rt = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
          if (rt) refreshTokens(rt);
        }, 12 * 60 * 1000); // 12 minutes
      } else if (response.status === 401 && refreshToken) {
        // Token expired, try refresh
        await refreshTokens(refreshToken);
      } else {
        clearAuthState();
      }
    } catch {
      // Network error — keep cached state, try refresh later
      if (refreshToken) {
        refreshTimerRef.current = setTimeout(() => {
          refreshTokens(refreshToken);
        }, 30000);
      }
    } finally {
      setLoading(false);
    }
  // Intentionally omit clearAuthState/refreshTokens — defined later, stable via useCallback([])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshTokens = useCallback(async (refreshToken: string) => {
    try {
      const response = await authFetch('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        const { accessToken: newAccess, refreshToken: newRefresh, expiresIn } = data.data;

        // Fetch updated user profile
        const meResponse = await authFetchWithToken('/api/auth/me', newAccess);
        if (meResponse.ok) {
          const meData = await meResponse.json();
          storeAuthState(newAccess, newRefresh, meData.data, expiresIn);
        } else {
          // Use cached user data
          const cachedUser = localStorage.getItem(STORAGE_KEYS.USER);
          if (cachedUser) {
            storeAuthState(newAccess, newRefresh, JSON.parse(cachedUser), expiresIn);
          }
        }
      } else {
        clearAuthState();
      }
    } catch {
      // Network error — keep cached state
    } finally {
      setLoading(false);
    }
  // Intentionally omit storeAuthState/clearAuthState — stable via useCallback([])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===========================================
  // Multi-tenancy: Org & Workspace
  // ===========================================

  const refreshOrgs = useCallback(async () => {
    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!token) return;
    try {
      const res = await authFetchWithToken('/api/organizations', token);
      if (res.ok) {
        const data = await res.json();
        setUserOrgs(Array.isArray(data) ? data : data.data ?? []);
      }
    } catch {
      // Non-critical — orgs list just won't update
    }
  }, []);

  const loadCurrentWorkspace = useCallback(async (token: string) => {
    try {
      const res = await authFetchWithToken('/api/auth/current-workspace', token);
      if (res.ok) {
        const data = await res.json();
        if (data.workspace) {
          setCurrentWorkspace(data.workspace);
          setWorkspaceContexts(data.contexts ?? []);
          localStorage.setItem(STORAGE_KEYS.WORKSPACE_ID, data.workspace.id);
          // Fetch parent org
          const orgRes = await authFetchWithToken(`/api/organizations/${data.workspace.org_id}`, token);
          if (orgRes.ok) {
            const orgData = await orgRes.json();
            setCurrentOrg(orgData.data ?? orgData);
          }
        }
      }
    } catch {
      // Non-critical — falls back to legacy single-user mode
    }
  }, []);

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!token) return;
    try {
      const res = await authFetchWithToken('/api/auth/switch-workspace', token, {
        method: 'POST',
        body: JSON.stringify({ workspaceId }),
      });
      if (res.ok) {
        const data = await res.json();
        // Store new workspace-scoped token
        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.accessToken);
        localStorage.setItem(STORAGE_KEYS.WORKSPACE_ID, workspaceId);
        setAccessToken(data.accessToken);
        setCurrentWorkspace(data.workspace);
        setWorkspaceContexts(data.contexts ?? []);
        // Fetch parent org
        if (data.workspace?.org_id) {
          const orgRes = await authFetchWithToken(`/api/organizations/${data.workspace.org_id}`, data.accessToken);
          if (orgRes.ok) {
            const orgData = await orgRes.json();
            setCurrentOrg(orgData.data ?? orgData);
          }
        }
      }
    } catch (err) {
      console.error('Workspace switch failed:', err);
      throw err; // Propagate so callers can handle
    }
  }, []);

  // ===========================================
  // Public API
  // ===========================================

  const signIn = useCallback(async (email: string, password: string, mfaCode?: string): Promise<{ error: Error | null; mfaRequired?: boolean }> => {
    try {
      const response = await authFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, mfa_code: mfaCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { error: new Error(data.error || 'Login failed') };
      }

      if (data.data.mfa_required) {
        return { error: null, mfaRequired: true };
      }

      const { user: userData, accessToken: token, refreshToken: refresh, expiresIn } = data.data;
      storeAuthState(token, refresh, userData, expiresIn);
      setLoading(false);

      // Load multi-tenancy state after login
      loadCurrentWorkspace(token).catch(() => {});
      refreshOrgs().catch(() => {});

      return { error: null };
    } catch (err) {
      return { error: new Error('Network error. Please check your connection.') };
    }
  }, [storeAuthState, loadCurrentWorkspace, refreshOrgs]);

  const signOut = useCallback(async () => {
    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);

    if (token) {
      try {
        await authFetchWithToken('/api/auth/logout', token, {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Best effort
      }
    }

    clearAuthState();
  }, [clearAuthState]);

  const register = useCallback(async (email: string, password: string, displayName?: string): Promise<{ error: Error | null }> => {
    try {
      const response = await authFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, display_name: displayName }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { error: new Error(data.error || 'Registration failed') };
      }

      const { user: userData, accessToken: token, refreshToken: refresh, expiresIn } = data.data;
      storeAuthState(token, refresh, userData, expiresIn);
      setLoading(false);

      // Load multi-tenancy state after registration
      loadCurrentWorkspace(token).catch(() => {});
      refreshOrgs().catch(() => {});

      return { error: null };
    } catch {
      return { error: new Error('Network error. Please check your connection.') };
    }
  }, [storeAuthState, loadCurrentWorkspace, refreshOrgs]);

  const resetPassword = useCallback(async (email: string, token?: string, newPassword?: string): Promise<{ error: Error | null }> => {
    try {
      if (token && newPassword) {
        // Step 2: Set new password with token
        const response = await authFetch('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token, newPassword }),
        });
        const data = await response.json();
        if (!response.ok) {
          return { error: new Error(data.error || 'Reset fehlgeschlagen') };
        }
        return { error: null };
      } else {
        // Step 1: Request reset email
        const response = await authFetch('/api/auth/request-password-reset', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        const data = await response.json();
        if (!response.ok) {
          return { error: new Error(data.error || 'Anfrage fehlgeschlagen') };
        }
        return { error: null };
      }
    } catch {
      return { error: new Error('Verbindungsfehler. Prüfe deine Internetverbindung.') };
    }
  }, []);

  const getAccessToken = useCallback((): string | null => {
    return accessToken || localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  }, [accessToken]);

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    const token = accessToken || localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!token) return null;
    try {
      const response = await authFetchWithToken('/api/auth/me', token);
      if (!response.ok) return null;
      const data = await response.json();
      const userData = data.data as AuthUser;
      setUser(userData);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));
      return userData;
    } catch {
      return null;
    }
  }, [accessToken]);

  // Build backward-compatible session object
  const session: AuthSession | null = user && accessToken
    ? { access_token: accessToken, user }
    : null;

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        signIn,
        signOut,
        register,
        resetPassword,
        getAccessToken,
        currentOrg,
        currentWorkspace,
        workspaceContexts,
        userOrgs,
        switchWorkspace,
        refreshOrgs,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
