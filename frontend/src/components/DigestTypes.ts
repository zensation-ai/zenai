export interface DigestEntry {
  id: string;
  type: 'daily' | 'weekly';
  period_start: string;
  period_end: string;
  summary: string;
  highlights: string[];
  stats: {
    ideas_created: number;
    tasks_completed: number;
    meetings_held: number;
    top_categories: [string, number][];
    productivity_score: number;
  };
  recommendations: string[];
  created_at: string;
}

export interface ProductivityGoals {
  daily_ideas_target: number;
  weekly_ideas_target: number;
  daily_tasks_target: number;
  weekly_tasks_target: number;
  focus_categories: string[];
  reminder_time: string | null;
}

export const categoryLabels: Record<string, string> = {
  business: 'Business',
  technical: 'Technik',
  personal: 'Persönlich',
  learning: 'Lernen',
};

// Adapt backend camelCase response to frontend snake_case interface
export function adaptDigest(d: Record<string, unknown>): DigestEntry | null {
  if (!d) return null;
  const stats = (d.statistics || {}) as Record<string, unknown>;
  const byCategory = (stats.byCategory || {}) as Record<string, number>;
  const topCats: [string, number][] = ((d.topCategories || []) as string[]).map((cat: string) =>
    [cat, byCategory[cat] ?? 0] as [string, number]
  );
  return {
    id: d.id as string,
    type: d.type as 'daily' | 'weekly',
    period_start: (d.periodStart ?? d.period_start ?? '') as string,
    period_end: (d.periodEnd ?? d.period_end ?? '') as string,
    summary: (d.summary || '') as string,
    highlights: (d.highlights || []) as string[],
    stats: {
      ideas_created: (d.ideasCount ?? (stats as Record<string, unknown>).totalIdeas ?? 0) as number,
      tasks_completed: 0,
      meetings_held: 0,
      top_categories: topCats,
      productivity_score: (d.productivityScore ?? 0) as number,
    },
    recommendations: (d.recommendations || []) as string[],
    created_at: (d.createdAt ?? d.created_at ?? '') as string,
  };
}

export function adaptGoals(d: Record<string, unknown>): ProductivityGoals | null {
  if (!d) return null;
  return {
    daily_ideas_target: (d.dailyIdeasTarget ?? d.daily_ideas_target ?? 3) as number,
    weekly_ideas_target: (d.weeklyIdeasTarget ?? d.weekly_ideas_target ?? 15) as number,
    daily_tasks_target: (d.dailyTasksTarget ?? d.daily_tasks_target ?? 5) as number,
    weekly_tasks_target: (d.weeklyTasksTarget ?? d.weekly_tasks_target ?? 20) as number,
    focus_categories: (d.focusCategories ?? d.focus_categories ?? []) as string[],
    reminder_time: (d.reminderTime ?? d.reminder_time ?? null) as string | null,
  };
}

export function formatDigestDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} - ${endDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function getProductivityColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}
