export interface LooseThought {
  id: string;
  raw_input: string;
  source: 'text' | 'voice' | 'quick_jot';
  created_at: string;
  similarity_to_cluster?: number;
}

export interface ThoughtCluster {
  id: string;
  title?: string;
  summary?: string;
  suggested_type?: string;
  suggested_category?: string;
  thought_count: number;
  maturity_score: number;
  confidence_score: number;
  status: 'growing' | 'ready' | 'presented' | 'consolidated' | 'dismissed';
  thoughts: LooseThought[];
  created_at: string;
  updated_at: string;
}

export interface IncubatorStats {
  total_thoughts: number;
  unprocessed_thoughts: number;
  total_clusters: number;
  ready_clusters: number;
  growing_clusters: number;
  consolidated_clusters: number;
}

export const MILLER_CHUNK_SIZE = 7;

export function getClusterMood(updatedAt: string): 'fresh' | 'aging' | 'dormant' {
  const daysSinceUpdate = Math.floor(
    (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceUpdate <= 1) return 'fresh';
  if (daysSinceUpdate <= 7) return 'aging';
  return 'dormant';
}

export function getMoodClass(mood: 'fresh' | 'aging' | 'dormant'): string {
  switch (mood) {
    case 'fresh': return 'cluster-mood-fresh';
    case 'aging': return 'cluster-mood-aging';
    case 'dormant': return 'cluster-mood-dormant';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'ready': return '#22c55e';
    case 'growing': return '#f59e0b';
    case 'presented': return '#3b82f6';
    default: return '#6b7280';
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'ready': return 'Bereit';
    case 'growing': return 'Wachsend';
    case 'presented': return 'Angesehen';
    default: return status;
  }
}

export function getTypeIcon(type?: string): string {
  switch (type) {
    case 'idea': return '💡';
    case 'task': return '✅';
    case 'insight': return '🔍';
    case 'problem': return '⚠️';
    case 'question': return '❓';
    default: return '💭';
  }
}

export function getDaysSinceUpdate(dateString: string): number {
  return Math.floor(
    (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
