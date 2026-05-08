/**
 * Page-Specific Skeleton Loading Components
 *
 * Provides content-shaped loading placeholders for different page types.
 * Uses the shadcn Skeleton component for consistent animation.
 */

import { type CSSProperties } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/** Chat page: 3 message bubble outlines */
export function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6" role="status" aria-busy="true" aria-label="Chat wird geladen">
      {/* User message */}
      <div className="flex items-start gap-3 justify-end">
        <div className="space-y-2 max-w-[60%]">
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      </div>
      {/* Assistant message */}
      <div className="flex items-start gap-3">
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
        <div className="space-y-2 max-w-[80%]">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[90%]" />
          <Skeleton className="h-4 w-[70%]" />
        </div>
      </div>
      {/* User message */}
      <div className="flex items-start gap-3 justify-end">
        <div className="space-y-2 max-w-[45%]">
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      </div>
      <span className="sr-only">Chat wird geladen</span>
    </div>
  );
}

/** Dashboard page: 4 stat cards + 2 chart areas */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-6" role="status" aria-busy="true" aria-label="Dashboard wird geladen">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="bg-surface rounded-lg p-4 space-y-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-3 w-[70%]" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface rounded-lg p-4 space-y-3">
          <Skeleton className="h-4 w-[30%]" />
          <Skeleton className="h-[180px] w-full" />
        </div>
        <div className="bg-surface rounded-lg p-4 space-y-3">
          <Skeleton className="h-4 w-[30%]" />
          <Skeleton className="h-[180px] w-full" />
        </div>
      </div>
      <span className="sr-only">Dashboard wird geladen</span>
    </div>
  );
}

/** Smart Page skeleton: toolbar + filter chips + card grid */
export function SmartPageSkeleton() {
  return (
    <div className="space-y-4 p-6" role="status" aria-busy="true" aria-label="Seite wird geladen">
      {/* Filter chip bar */}
      <div className="flex gap-2">
        <Skeleton className="h-8 w-[72px] rounded-full" />
        <Skeleton className="h-8 w-[88px] rounded-full" />
        <Skeleton className="h-8 w-[64px] rounded-full" />
        <Skeleton className="h-8 w-[96px] rounded-full" />
        <Skeleton className="h-8 w-[56px] rounded-full" />
      </div>

      {/* Toolbar */}
      <Skeleton className="h-11 w-full rounded-md" />

      {/* Card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="bg-surface rounded-lg p-4 space-y-3">
            <Skeleton className="h-4 w-[70%]" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[85%]" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Seite wird geladen</span>
    </div>
  );
}

/** Generic list page: 5 row outlines */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-6" role="status" aria-busy="true" aria-label="Liste wird geladen">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 bg-surface rounded-lg">
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-[var(--bar)]" style={{ '--bar': `${80 - i * 5}%` } as CSSProperties} />
            <Skeleton className="h-3 w-[var(--bar)]" style={{ '--bar': `${60 - i * 3}%` } as CSSProperties} />
          </div>
        </div>
      ))}
      <span className="sr-only">Liste wird geladen</span>
    </div>
  );
}
