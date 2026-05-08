/**
 * WorkspaceSidebar — Flat Navigation Sidebar for Workspace Mode
 *
 * Renders NAV_HUB_ITEM at top, then NAV_ITEMS flat (no sections).
 * Footer: connection status, plan badge, user avatar + logout.
 * 240px expanded, 64px collapsed. Hidden on mobile.
 */

import { memo } from 'react';
import { PanelLeftClose, PanelLeft, LogOut, Wifi, Crown } from 'lucide-react';
import { NAV_HUB_ITEM, NAV_ITEMS, isNavItemActive } from '../../navigation';
import { useLayoutMode } from '../../contexts/LayoutModeContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePrefetch } from '../../hooks/usePrefetch';
import { getIconByName } from '../../utils/navIcons';
import { cn } from '@/lib/utils';
import type { Page } from '../../types';

interface WorkspaceSidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

interface NavButtonProps {
  icon: string;
  label: string;
  active: boolean;
  collapsed: boolean;
  isHub?: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
}

function NavButton({ icon, label, active, collapsed, isHub = false, onClick, onMouseEnter }: NavButtonProps) {
  const IconComponent = getIconByName(icon);

  return (
    <li>
      <button
        className={cn(
          'flex items-center gap-3 w-full py-2 min-h-[36px] border-none bg-transparent cursor-pointer transition-all duration-150 text-left rounded-lg',
          'text-text-secondary text-[13px] font-medium',
          'hover:bg-surface-hover/70 hover:text-text',
          collapsed ? 'justify-center px-0 rounded-none' : 'px-3',
          isHub && !active && 'text-text font-semibold',
          active && 'text-primary bg-primary/8 font-semibold',
        )}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        title={collapsed ? label : undefined}
        aria-current={active ? 'page' : undefined}
      >
        <span className="flex items-center justify-center shrink-0 size-[18px]" aria-hidden="true">
          <IconComponent size={18} />
        </span>
        {!collapsed && (
          <span className="whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>
        )}
      </button>
    </li>
  );
}

interface SidebarFooterProps {
  collapsed: boolean;
  user: { display_name?: string | null; email: string } | null;
  onSignOut: () => void;
}

function SidebarFooter({ collapsed, user, onSignOut }: SidebarFooterProps) {
  const initials = user?.display_name
    ? user.display_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? '?';

  if (collapsed) {
    return (
      <div className="border-t border-border p-2 flex flex-col items-center gap-2">
        <div
          className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[11px] font-semibold text-primary shrink-0"
          title={user?.display_name ?? user?.email}
        >
          {initials}
        </div>
        <button
          className="flex items-center justify-center w-9 h-9 rounded-md bg-transparent text-text-muted cursor-pointer transition-colors hover:bg-surface-hover hover:text-text border-none"
          onClick={onSignOut}
          title="Abmelden"
          aria-label="Abmelden"
        >
          <LogOut size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-border p-3 flex flex-col gap-2">
      {/* Status row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] text-success">
          <Wifi size={11} />
          <span>Verbunden</span>
        </div>
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">
          <Crown size={9} />
          FREE
        </span>
      </div>

      {/* User row */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[11px] font-semibold text-primary shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          {user?.display_name && (
            <div className="text-[12px] font-medium text-text truncate leading-tight">
              {user.display_name}
            </div>
          )}
          <div className="text-[11px] text-text-muted truncate leading-tight">{user?.email}</div>
        </div>
        <button
          className="flex items-center justify-center w-7 h-7 rounded-md bg-transparent text-text-muted cursor-pointer transition-colors hover:bg-surface-hover hover:text-text border-none shrink-0"
          onClick={onSignOut}
          title="Abmelden"
          aria-label="Abmelden"
        >
          <LogOut size={14} />
        </button>
      </div>
    </div>
  );
}

export const WorkspaceSidebar = memo(function WorkspaceSidebar({
  currentPage,
  onNavigate,
}: WorkspaceSidebarProps) {
  const { state, dispatch } = useLayoutMode();
  const { user, signOut } = useAuth();
  const { prefetch } = usePrefetch();
  const collapsed = state.sidebarCollapsed;
  const hubActive = isNavItemActive(NAV_HUB_ITEM, currentPage);

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-bg-secondary border-r border-border overflow-y-auto overflow-x-hidden transition-[width,min-width] duration-200 ease-out shrink-0 max-md:hidden',
        collapsed ? 'w-16 min-w-16' : 'w-60 min-w-60',
      )}
      aria-label="Workspace Navigation"
    >
      <nav className="flex-1 py-3 flex flex-col" aria-label="Hauptnavigation">
        {/* Hub item */}
        <ul className={cn('list-none m-0 p-0', !collapsed && 'px-1')}>
          <NavButton
            icon={NAV_HUB_ITEM.icon}
            label={NAV_HUB_ITEM.label}
            active={hubActive}
            collapsed={collapsed}
            isHub
            onClick={() => onNavigate(NAV_HUB_ITEM.page)}
          />
        </ul>

        {/* Divider */}
        {!collapsed ? (
          <div className="mx-3 my-2 border-t border-border/60" />
        ) : (
          <div className="my-2" />
        )}

        {/* Flat nav items */}
        <ul className={cn('list-none m-0 p-0 flex flex-col gap-0.5', !collapsed && 'px-1')}>
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.page}
              icon={item.icon}
              label={item.label}
              active={isNavItemActive(item, currentPage)}
              collapsed={collapsed}
              onClick={() => onNavigate(item.page)}
              onMouseEnter={() => prefetch(item.preloadFn)}
            />
          ))}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <div
        className={cn(
          'p-2 flex',
          collapsed ? 'justify-center' : 'justify-end',
        )}
      >
        <button
          className="flex items-center justify-center min-w-[44px] min-h-[44px] border-none rounded-md bg-transparent text-text-muted cursor-pointer transition-colors hover:bg-surface-hover hover:text-text"
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
          aria-label={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <SidebarFooter collapsed={collapsed} user={user} onSignOut={signOut} />
    </aside>
  );
});

export default WorkspaceSidebar;
