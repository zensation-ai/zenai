import { Flame } from 'lucide-react';
import { useStreak } from '../../hooks/useStreak';
import { cn } from '@/lib/utils';

interface StreakWidgetProps { context: string; }

export function StreakWidget({ context }: StreakWidgetProps) {
  const { data, isLoading } = useStreak(context);
  if (isLoading || !data?.streakEnabled || data.currentStreak === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface/50 px-3 py-2">
      <Flame className={cn('h-5 w-5 transition-colors', data.currentStreak >= 7 ? 'text-orange-400' : 'text-orange-300/70')} />
      <div>
        <p className="text-sm font-semibold text-text">{data.currentStreak} {data.currentStreak === 1 ? 'Tag' : 'Tage'}</p>
        <p className="text-xs text-text-muted">Längste: {data.longestStreak}</p>
      </div>
    </div>
  );
}
