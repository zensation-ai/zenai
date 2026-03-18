/**
 * Page-Specific Skeleton Loading Components
 *
 * Provides content-shaped loading placeholders for different page types.
 * Uses the design system Skeleton component for consistent animation.
 */

import { Skeleton } from '../../design-system/components/Skeleton';
import './PageSkeletons.css';

/** Chat page: 3 message bubble outlines */
export function ChatSkeleton() {
  return (
    <div className="skeleton-chat" role="status" aria-busy="true" aria-label="Chat wird geladen">
      {/* User message */}
      <div className="skeleton-chat-message skeleton-chat-message--user">
        <Skeleton variant="circle" width={32} height={32} />
        <div className="skeleton-chat-bubble">
          <Skeleton variant="text" count={1} width="60%" />
        </div>
      </div>
      {/* Assistant message */}
      <div className="skeleton-chat-message skeleton-chat-message--assistant">
        <Skeleton variant="circle" width={32} height={32} />
        <div className="skeleton-chat-bubble">
          <Skeleton variant="text" count={3} />
        </div>
      </div>
      {/* User message */}
      <div className="skeleton-chat-message skeleton-chat-message--user">
        <Skeleton variant="circle" width={32} height={32} />
        <div className="skeleton-chat-bubble">
          <Skeleton variant="text" count={1} width="45%" />
        </div>
      </div>
      <span className="visually-hidden">Chat wird geladen</span>
    </div>
  );
}

/** Dashboard page: 4 stat cards + 2 chart areas */
export function DashboardSkeleton() {
  return (
    <div className="skeleton-dashboard" role="status" aria-busy="true" aria-label="Dashboard wird geladen">
      <div className="skeleton-dashboard-stats">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton-dashboard-stat-card">
            <Skeleton variant="text" count={1} width="50%" />
            <Skeleton variant="rectangle" height={28} />
            <Skeleton variant="text" count={1} width="70%" />
          </div>
        ))}
      </div>
      <div className="skeleton-dashboard-charts">
        <div className="skeleton-dashboard-chart">
          <Skeleton variant="text" count={1} width="30%" />
          <Skeleton variant="rectangle" height={180} />
        </div>
        <div className="skeleton-dashboard-chart">
          <Skeleton variant="text" count={1} width="30%" />
          <Skeleton variant="rectangle" height={180} />
        </div>
      </div>
      <span className="visually-hidden">Dashboard wird geladen</span>
    </div>
  );
}

/** Generic list page: 5 row outlines */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-list" role="status" aria-busy="true" aria-label="Liste wird geladen">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-list-row">
          <Skeleton variant="circle" width={36} height={36} />
          <div className="skeleton-list-row-text">
            <Skeleton variant="text" count={1} width={`${80 - i * 5}%`} />
            <Skeleton variant="text" count={1} width={`${60 - i * 3}%`} />
          </div>
        </div>
      ))}
      <span className="visually-hidden">Liste wird geladen</span>
    </div>
  );
}
