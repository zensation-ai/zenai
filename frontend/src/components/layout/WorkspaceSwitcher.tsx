/**
 * WorkspaceSwitcher — Dropdown to switch between workspaces
 *
 * Shows current workspace with color dot + name.
 * Dropdown lists all workspaces across all user orgs.
 * "Create workspace" option at bottom.
 */

import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Plus, Building2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { queryClient } from '../../lib/query-client';
import { cn } from '@/lib/utils';
import type { Workspace } from '../../types/multi-tenancy';

interface WorkspaceOption {
  workspace: Workspace;
  orgName: string;
}

export function WorkspaceSwitcher() {
  const navigate = useNavigate();
  const { currentWorkspace, currentOrg, userOrgs, switchWorkspace, getAccessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchWorkspaces = useCallback(async () => {
    const token = getAccessToken();
    if (!token || userOrgs.length === 0) return;

    setLoading(true);
    try {
      const results = await Promise.all(
        userOrgs.map(async (org) => {
          const res = await fetch(
            `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/organizations/${org.id}/workspaces`,
            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
          );
          if (!res.ok) return [];
          const data = await res.json();
          const wsList = Array.isArray(data) ? data : data.data ?? [];
          return wsList.map((ws: Workspace) => ({ workspace: ws, orgName: org.name }));
        }),
      );
      setWorkspaces(results.flat());
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, userOrgs]);

  // Load workspaces when dropdown opens
  useEffect(() => {
    if (open) fetchWorkspaces();
  }, [open, fetchWorkspaces]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleSwitch = async (wsId: string) => {
    setOpen(false);
    try {
      await switchWorkspace(wsId);
      queryClient.invalidateQueries();
    } catch {
      // Switch failed — reopen so user sees something went wrong
      setOpen(true);
    }
  };

  // Don't render if no multi-tenancy (legacy single-user mode)
  if (!currentWorkspace && userOrgs.length === 0) return null;

  const displayName = currentWorkspace?.name ?? currentOrg?.name ?? 'Workspace';
  const displayColor = currentWorkspace?.color ?? '#144A56';
  const displayIcon = currentWorkspace?.icon;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1.5 min-h-8 px-3 py-1 rounded-lg border border-border bg-surface text-text cursor-pointer text-[0.8125rem] font-medium transition-[background,border-color] duration-150',
          'hover:bg-surface-hover hover:border-text-muted',
          open && 'bg-surface-hover border-text-muted',
        )}
        onClick={() => setOpen(prev => !prev)}
        aria-label={`Workspace: ${displayName}. Klicken um zu wechseln.`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {displayIcon ? (
          <span className="text-sm">{displayIcon}</span>
        ) : (
          <span
            className="size-2.5 rounded-full shrink-0 bg-[var(--bg)]"
            style={{ '--bg': displayColor } as CSSProperties}
          />
        )}
        <span className="max-w-24 truncate">{displayName}</span>
        <ChevronDown size={14} className={cn('transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className="absolute top-[calc(100%+4px)] left-0 w-64 bg-[rgba(16,32,42,0.95)] backdrop-blur-[24px] border border-border rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.3)] z-dropdown overflow-hidden animate-ctx-popover-in"
          role="listbox"
          aria-label="Workspace auswählen"
        >
          {loading ? (
            <div className="px-4 py-3 text-xs text-text-muted">Laden...</div>
          ) : (
            <>
              {workspaces.length === 0 ? (
                <div className="px-4 py-3 text-xs text-text-muted">Keine Workspaces gefunden</div>
              ) : (
                <div className="max-h-64 overflow-y-auto py-1">
                  {workspaces.map(({ workspace: ws, orgName }) => {
                    const isActive = ws.id === currentWorkspace?.id;
                    return (
                      <button
                        key={ws.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        className={cn(
                          'flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm transition-colors duration-100 border-none bg-transparent cursor-pointer',
                          isActive
                            ? 'bg-[rgba(139,92,246,0.12)] text-text'
                            : 'text-text-secondary hover:bg-surface-hover hover:text-text',
                        )}
                        onClick={() => !isActive && handleSwitch(ws.id)}
                      >
                        {ws.icon ? (
                          <span className="text-base shrink-0">{ws.icon}</span>
                        ) : (
                          <span
                            className="size-3 rounded-full shrink-0 bg-[var(--bg)]"
                            style={{ '--bg': ws.color ?? '#144A56' } as CSSProperties}
                          />
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="truncate font-medium">{ws.name}</span>
                          <span className="text-[0.65rem] text-text-muted truncate">{orgName}</span>
                        </div>
                        {isActive && (
                          <span className="ml-auto text-[0.65rem] text-primary font-medium shrink-0">Aktiv</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="border-t border-border">
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-3 py-2.5 text-left text-xs text-text-muted border-none bg-transparent cursor-pointer hover:bg-surface-hover hover:text-text transition-colors duration-100"
                  onClick={() => {
                    setOpen(false);
                    // Navigate to settings to create workspace
                    navigate('/system/admin');
                  }}
                >
                  <Plus size={14} />
                  <span>Workspace erstellen</span>
                </button>
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-3 py-2.5 text-left text-xs text-text-muted border-none bg-transparent cursor-pointer hover:bg-surface-hover hover:text-text transition-colors duration-100"
                  onClick={() => {
                    setOpen(false);
                    navigate('/system/admin');
                  }}
                >
                  <Building2 size={14} />
                  <span>Organisation verwalten</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default WorkspaceSwitcher;
