/**
 * HyperAgent Improvement Tracker
 * Tracks meta-metrics about the improvement system's own effectiveness.
 * Answers: "Is our improvement process actually improving things?"
 */

export interface ImprovementRecord {
  id: string;
  level: number;
  type: string;
  description: string;
  appliedAt: Date;
  configBefore: Record<string, unknown>;
  configAfter: Record<string, unknown>;
  qualityBefore: number;
  qualityAfter: number | null;  // null until measured
  reverted: boolean;
  measuredAt: Date | null;
}

export interface MetaMetrics {
  successRate: number;          // % of improvements that helped
  revertRate: number;           // % that were rolled back
  avgQualityDelta: number;      // Average quality change
  totalImprovements: number;
  totalReverts: number;
  levelBreakdown: Record<number, {
    count: number;
    successRate: number;
    avgDelta: number;
  }>;
}

// In-memory store (can be persisted to DB later)
const improvements: ImprovementRecord[] = [];

export function recordImprovement(record: Omit<ImprovementRecord, 'id' | 'qualityAfter' | 'reverted' | 'measuredAt'>): string {
  const id = `hyp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  improvements.push({
    ...record,
    id,
    qualityAfter: null,
    reverted: false,
    measuredAt: null,
  });
  return id;
}

export function measureOutcome(id: string, qualityAfter: number): void {
  const record = improvements.find(r => r.id === id);
  if (record) {
    record.qualityAfter = qualityAfter;
    record.measuredAt = new Date();
  }
}

export function markReverted(id: string): void {
  const record = improvements.find(r => r.id === id);
  if (record) {
    record.reverted = true;
  }
}

export function getMetaMetrics(windowDays: number = 30): MetaMetrics {
  const cutoff = new Date(Date.now() - windowDays * 86400000);
  const recent = improvements.filter(r => r.appliedAt >= cutoff);
  const measured = recent.filter(r => r.qualityAfter !== null);

  const successful = measured.filter(r => !r.reverted && r.qualityAfter! > r.qualityBefore);
  const reverted = recent.filter(r => r.reverted);

  const avgDelta = measured.length > 0
    ? measured.reduce((sum, r) => sum + (r.qualityAfter! - r.qualityBefore), 0) / measured.length
    : 0;

  // Level breakdown
  const levelBreakdown: Record<number, { count: number; successRate: number; avgDelta: number }> = {};
  for (const level of [0, 1, 2]) {
    const levelRecords = measured.filter(r => r.level === level);
    const levelSuccess = levelRecords.filter(r => !r.reverted && r.qualityAfter! > r.qualityBefore);
    levelBreakdown[level] = {
      count: levelRecords.length,
      successRate: levelRecords.length > 0 ? levelSuccess.length / levelRecords.length : 0,
      avgDelta: levelRecords.length > 0
        ? levelRecords.reduce((sum, r) => sum + (r.qualityAfter! - r.qualityBefore), 0) / levelRecords.length
        : 0,
    };
  }

  return {
    successRate: measured.length > 0 ? successful.length / measured.length : 0,
    revertRate: recent.length > 0 ? reverted.length / recent.length : 0,
    avgQualityDelta: avgDelta,
    totalImprovements: recent.length,
    totalReverts: reverted.length,
    levelBreakdown,
  };
}

export function getImprovementHistory(limit: number = 50): ImprovementRecord[] {
  return improvements
    .slice(-limit)
    .reverse();
}

export function getImprovementById(id: string): ImprovementRecord | undefined {
  return improvements.find(r => r.id === id);
}

// For testing
export function _resetForTesting(): void {
  improvements.length = 0;
}
