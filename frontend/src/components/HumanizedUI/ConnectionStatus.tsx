import { type CSSProperties } from 'react';

export interface ConnectionStatusProps {
  /** Status */
  status: 'connected' | 'connecting' | 'disconnected' | 'syncing';
  /** Last sync timestamp */
  lastSync?: Date;
  /** Show details */
  showDetails?: boolean;
  /** Click handler */
  onClick?: () => void;
}

export const ConnectionStatus = ({
  status,
  lastSync,
  showDetails = false,
  onClick,
}: ConnectionStatusProps) => {
  const getStatusInfo = () => {
    switch (status) {
      case 'connected':
        return { label: 'Verbunden', icon: '\u25CF', color: 'var(--neuro-success)' };
      case 'connecting':
        return { label: 'Verbinde...', icon: '\u25D0', color: 'var(--neuro-anticipation)' };
      case 'disconnected':
        return { label: 'Offline', icon: '\u25CB', color: 'var(--text-secondary)' };
      case 'syncing':
        return { label: 'Synchronisiere...', icon: '\u21BB', color: 'var(--neuro-reward)' };
      default:
        return { label: 'Unbekannt', icon: '?', color: 'var(--text-secondary)' };
    }
  };

  const info = getStatusInfo();

  const formatLastSync = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Gerade eben';
    if (diffMins < 60) return `Vor ${diffMins} Min.`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Vor ${diffHours} Std.`;

    return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  };

  return (
    <div
      className={`connection-status ${status}`}
      onClick={onClick}
      role="status"
      aria-label={info.label}
      style={{ '--status-color': info.color } as CSSProperties}
    >
      <span className={`status-dot ${status === 'syncing' ? 'spinning' : ''}`}>
        {info.icon}
      </span>

      {showDetails && (
        <div className="status-details">
          <span className="status-label">{info.label}</span>
          {lastSync && status === 'connected' && (
            <span className="status-sync">
              Zuletzt: {formatLastSync(lastSync)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
