/**
 * Phase 138: Adaptive Behavior Engine Tests
 */

import {
  inferResponseLength,
  inferDetailLevel,
  inferProactivityLevel,
  inferPreferredTools,
  buildBehaviorPreferences,
  applyPreferences,
  recordBehaviorSignal,
  loadBehaviorPreferences,
  BehaviorSignal,
  BehaviorPreferences,
} from '../../../../services/adaptive/behavior-engine';

// ===========================================
// Mocks
// ===========================================

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn((ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
  ),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockQueryContext = jest.requireMock('../../../../utils/database-context').queryContext;

// ===========================================
// Helpers
// ===========================================

function sig(
  type: BehaviorSignal['type'],
  value: number,
  details?: Record<string, unknown>,
): BehaviorSignal {
  return { type, value, details };
}

// ===========================================
// Tests: inferResponseLength
// ===========================================

describe('inferResponseLength', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns moderate when no signals', () => {
    expect(inferResponseLength([])).toBe('moderate');
  });

  it('returns brief when avg < -0.3', () => {
    const signals = [sig('length_feedback', -0.8), sig('length_feedback', -0.5)];
    expect(inferResponseLength(signals)).toBe('brief');
  });

  it('returns detailed when avg > 0.3', () => {
    const signals = [sig('length_feedback', 0.6), sig('length_feedback', 0.9)];
    expect(inferResponseLength(signals)).toBe('detailed');
  });

  it('returns moderate when avg is in middle range', () => {
    const signals = [sig('length_feedback', 0.1), sig('length_feedback', -0.1)];
    expect(inferResponseLength(signals)).toBe('moderate');
  });

  it('ignores non-length signals', () => {
    const signals = [sig('detail_feedback', 0.9), sig('style_feedback', 0.9)];
    expect(inferResponseLength(signals)).toBe('moderate');
  });

  it('handles boundary at exactly -0.3', () => {
    const signals = [sig('length_feedback', -0.3)];
    expect(inferResponseLength(signals)).toBe('moderate');
  });

  it('handles boundary at exactly 0.3', () => {
    const signals = [sig('length_feedback', 0.3)];
    expect(inferResponseLength(signals)).toBe('moderate');
  });
});

// ===========================================
// Tests: inferDetailLevel
// ===========================================

describe('inferDetailLevel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns intermediate when no signals', () => {
    expect(inferDetailLevel([])).toBe('intermediate');
  });

  it('returns beginner when avg < -0.3', () => {
    const signals = [sig('detail_feedback', -0.5), sig('detail_feedback', -0.7)];
    expect(inferDetailLevel(signals)).toBe('beginner');
  });

  it('returns expert when avg > 0.3', () => {
    const signals = [sig('detail_feedback', 0.8), sig('detail_feedback', 0.4)];
    expect(inferDetailLevel(signals)).toBe('expert');
  });

  it('returns intermediate for mixed signals', () => {
    const signals = [sig('detail_feedback', 0.2), sig('detail_feedback', -0.2)];
    expect(inferDetailLevel(signals)).toBe('intermediate');
  });
});

// ===========================================
// Tests: inferProactivityLevel
// ===========================================

describe('inferProactivityLevel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns medium when no signals', () => {
    expect(inferProactivityLevel([])).toBe('medium');
  });

  it('returns high when acceptance rate > 60%', () => {
    const signals = [
      sig('suggestion_action', 1),
      sig('suggestion_action', 1),
      sig('suggestion_action', 1),
      sig('suggestion_action', -1),
    ];
    expect(inferProactivityLevel(signals)).toBe('high');
  });

  it('returns low when acceptance rate < 30%', () => {
    const signals = [
      sig('suggestion_action', -1),
      sig('suggestion_action', -1),
      sig('suggestion_action', -1),
      sig('suggestion_action', 1),
    ];
    expect(inferProactivityLevel(signals)).toBe('low');
  });

  it('returns medium for moderate acceptance rate', () => {
    const signals = [
      sig('suggestion_action', 1),
      sig('suggestion_action', -1),
    ];
    expect(inferProactivityLevel(signals)).toBe('medium');
  });

  it('returns high when all accepted', () => {
    const signals = [sig('suggestion_action', 1), sig('suggestion_action', 0.5)];
    expect(inferProactivityLevel(signals)).toBe('high');
  });

  it('returns low when all rejected', () => {
    const signals = [sig('suggestion_action', -1), sig('suggestion_action', -0.5)];
    expect(inferProactivityLevel(signals)).toBe('low');
  });
});

// ===========================================
// Tests: inferPreferredTools
// ===========================================

describe('inferPreferredTools', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns empty array when no signals', () => {
    expect(inferPreferredTools([])).toEqual([]);
  });

  it('returns tools with positive scores sorted desc', () => {
    const signals = [
      sig('tool_preference', 0.8, { toolName: 'web_search' }),
      sig('tool_preference', 0.5, { toolName: 'execute_code' }),
      sig('tool_preference', 0.9, { toolName: 'search_ideas' }),
    ];
    expect(inferPreferredTools(signals)).toEqual([
      'search_ideas',
      'web_search',
      'execute_code',
    ]);
  });

  it('excludes tools with net-negative scores', () => {
    const signals = [
      sig('tool_preference', 0.8, { toolName: 'web_search' }),
      sig('tool_preference', -0.5, { toolName: 'execute_code' }),
    ];
    expect(inferPreferredTools(signals)).toEqual(['web_search']);
  });

  it('aggregates multiple signals for same tool', () => {
    const signals = [
      sig('tool_preference', 0.3, { toolName: 'web_search' }),
      sig('tool_preference', 0.5, { toolName: 'web_search' }),
      sig('tool_preference', -0.1, { toolName: 'web_search' }),
    ];
    // net = 0.7
    expect(inferPreferredTools(signals)).toEqual(['web_search']);
  });

  it('ignores signals without toolName', () => {
    const signals = [
      sig('tool_preference', 0.8, {}),
      sig('tool_preference', 0.5, { toolName: 'web_search' }),
    ];
    expect(inferPreferredTools(signals)).toEqual(['web_search']);
  });

  it('excludes tools with exactly zero score', () => {
    const signals = [
      sig('tool_preference', 0.5, { toolName: 'a' }),
      sig('tool_preference', -0.5, { toolName: 'a' }),
    ];
    expect(inferPreferredTools(signals)).toEqual([]);
  });
});

// ===========================================
// Tests: buildBehaviorPreferences
// ===========================================

describe('buildBehaviorPreferences', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns default-like preferences for empty signals', () => {
    const prefs = buildBehaviorPreferences([]);
    expect(prefs).toEqual({
      responseLength: 'moderate',
      detailLevel: 'intermediate',
      proactivityLevel: 'medium',
      preferredTools: [],
      languageStyle: 'formal',
    });
  });

  it('combines all signal types', () => {
    const signals: BehaviorSignal[] = [
      sig('length_feedback', -0.8),
      sig('detail_feedback', 0.9),
      sig('suggestion_action', 1),
      sig('suggestion_action', 1),
      sig('suggestion_action', 1),
      sig('tool_preference', 0.7, { toolName: 'web_search' }),
      sig('style_feedback', -0.6),
    ];
    const prefs = buildBehaviorPreferences(signals);
    expect(prefs.responseLength).toBe('brief');
    expect(prefs.detailLevel).toBe('expert');
    expect(prefs.proactivityLevel).toBe('high');
    expect(prefs.preferredTools).toEqual(['web_search']);
    expect(prefs.languageStyle).toBe('casual');
  });

  it('defaults to formal when style_feedback is positive', () => {
    const signals = [sig('style_feedback', 0.5)];
    expect(buildBehaviorPreferences(signals).languageStyle).toBe('formal');
  });
});

// ===========================================
// Tests: applyPreferences
// ===========================================

describe('applyPreferences', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps brief to low maxTokens', () => {
    const config = applyPreferences({ ...defaultPrefs(), responseLength: 'brief' });
    expect(config.maxTokens).toBe(512);
  });

  it('maps detailed to high maxTokens', () => {
    const config = applyPreferences({ ...defaultPrefs(), responseLength: 'detailed' });
    expect(config.maxTokens).toBe(4096);
  });

  it('maps moderate to medium maxTokens', () => {
    const config = applyPreferences({ ...defaultPrefs(), responseLength: 'moderate' });
    expect(config.maxTokens).toBe(2048);
  });

  it('maps beginner to higher temperature', () => {
    const config = applyPreferences({ ...defaultPrefs(), detailLevel: 'beginner' });
    expect(config.temperature).toBe(0.7);
    expect(config.systemHint).toContain('simply');
  });

  it('maps expert to lower temperature', () => {
    const config = applyPreferences({ ...defaultPrefs(), detailLevel: 'expert' });
    expect(config.temperature).toBe(0.5);
    expect(config.systemHint).toContain('technical');
  });

  it('disables proactive for low proactivity', () => {
    const config = applyPreferences({ ...defaultPrefs(), proactivityLevel: 'low' });
    expect(config.proactiveEnabled).toBe(false);
  });

  it('enables proactive for high proactivity with low threshold', () => {
    const config = applyPreferences({ ...defaultPrefs(), proactivityLevel: 'high' });
    expect(config.proactiveEnabled).toBe(true);
    expect(config.proactiveThreshold).toBe(0.3);
  });

  it('includes preferred tools when present', () => {
    const config = applyPreferences({
      ...defaultPrefs(),
      preferredTools: ['web_search', 'execute_code'],
    });
    expect(config.preferredTools).toEqual(['web_search', 'execute_code']);
  });

  it('omits preferred tools key when empty', () => {
    const config = applyPreferences({ ...defaultPrefs(), preferredTools: [] });
    expect(config).not.toHaveProperty('preferredTools');
  });

  it('sets formalStyle based on languageStyle', () => {
    expect(applyPreferences({ ...defaultPrefs(), languageStyle: 'formal' }).formalStyle).toBe(true);
    expect(applyPreferences({ ...defaultPrefs(), languageStyle: 'casual' }).formalStyle).toBe(false);
  });
});

// ===========================================
// Tests: recordBehaviorSignal
// ===========================================

describe('recordBehaviorSignal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('inserts signal into DB', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] });
    await recordBehaviorSignal('personal', sig('length_feedback', 0.5, { source: 'chat' }));
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('INSERT INTO behavior_signals'),
      expect.arrayContaining(['length_feedback', 0.5]),
    );
  });

  it('does not throw on DB error', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB down'));
    await expect(
      recordBehaviorSignal('work', sig('style_feedback', -0.3)),
    ).resolves.toBeUndefined();
  });
});

// ===========================================
// Tests: loadBehaviorPreferences
// ===========================================

describe('loadBehaviorPreferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('returns default preferences when no rows', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] });
    const prefs = await loadBehaviorPreferences('personal');
    expect(prefs.responseLength).toBe('moderate');
    expect(prefs.detailLevel).toBe('intermediate');
  });

  it('builds preferences from DB rows', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { type: 'length_feedback', value: -0.8, details: '{}' },
        { type: 'length_feedback', value: -0.5, details: '{}' },
        { type: 'detail_feedback', value: 0.9, details: '{}' },
      ],
    });
    const prefs = await loadBehaviorPreferences('personal');
    expect(prefs.responseLength).toBe('brief');
    expect(prefs.detailLevel).toBe('expert');
  });

  it('passes userId when provided', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] });
    await loadBehaviorPreferences('work', 'user-123');
    expect(mockQueryContext).toHaveBeenCalledWith(
      'work',
      expect.stringContaining('user_id = $1'),
      ['user-123'],
    );
  });

  it('returns defaults on DB error', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('timeout'));
    const prefs = await loadBehaviorPreferences('personal');
    expect(prefs.responseLength).toBe('moderate');
  });

  it('handles details as object (not string)', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { type: 'tool_preference', value: 0.8, details: { toolName: 'web_search' } },
      ],
    });
    const prefs = await loadBehaviorPreferences('personal');
    expect(prefs.preferredTools).toEqual(['web_search']);
  });
});

// ===========================================
// Test helper
// ===========================================

function defaultPrefs(): BehaviorPreferences {
  return {
    responseLength: 'moderate',
    detailLevel: 'intermediate',
    proactivityLevel: 'medium',
    preferredTools: [],
    languageStyle: 'formal',
  };
}
