/**
 * AppLayout - Konsistentes Layout für alle Seiten
 * Enthält den Header und die QuickNav-Leiste
 */
import { ReactNode } from 'react';
import { QuickNav } from './QuickNav';
import type { Page } from '../types';

interface AppLayoutProps {
  children: ReactNode;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  archivedCount?: number;
  /** Optionaler Header-Content (für Sub-Seiten mit eigenem Header) */
  showQuickNav?: boolean;
}

export function AppLayout({
  children,
  currentPage,
  onNavigate,
  archivedCount = 0,
  showQuickNav = true,
}: AppLayoutProps) {
  return (
    <>
      {showQuickNav && (
        <QuickNav
          currentPage={currentPage}
          onNavigate={onNavigate}
          archivedCount={archivedCount}
        />
      )}
      {children}
    </>
  );
}
