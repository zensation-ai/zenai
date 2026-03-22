import { CheckSquare, Mail, User, type LucideIcon } from 'lucide-react';
import './ChatEnhancements.css';

type WidgetType = 'task' | 'email' | 'contact' | 'event';

interface InlineWidgetProps {
  type: WidgetType;
  title: string;
  subtitle?: string;
  status?: string;
  onClick?: () => void;
}

const WIDGET_ICONS: Record<WidgetType, LucideIcon> = {
  task: CheckSquare,
  email: Mail,
  contact: User,
  event: CheckSquare,
};

const STATUS_COLORS: Record<string, string> = {
  done: '#22c55e',
  pending: '#f59e0b',
  urgent: '#ef4444',
  new: '#3b82f6',
};

export function InlineWidget({ type, title, subtitle, status, onClick }: InlineWidgetProps) {
  const Icon = WIDGET_ICONS[type];
  return (
    <div
      className={`inline-widget ${onClick ? 'inline-widget--clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <div className="inline-widget__icon">
        <Icon size={14} />
      </div>
      <div className="inline-widget__content">
        <span className="inline-widget__title">{title}</span>
        {subtitle && <span className="inline-widget__subtitle">{subtitle}</span>}
      </div>
      {status && (
        <span
          className="inline-widget__status"
          style={{ color: STATUS_COLORS[status] || 'inherit' }}
        >
          {status}
        </span>
      )}
    </div>
  );
}
