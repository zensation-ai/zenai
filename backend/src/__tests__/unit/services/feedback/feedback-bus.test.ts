/**
 * Unified Feedback Bus Tests — Phase 137
 *
 * ~35 tests covering FeedbackBus pub/sub, createFeedbackEvent,
 * clampValue, and recordFeedback.
 */

import {
  FeedbackBus,
  createFeedbackEvent,
  clampValue,
  recordFeedback,
  FeedbackType,
  FeedbackEvent,
  FeedbackHandler,
} from '../../../../services/feedback/feedback-bus';

// ---- Mocks ----------------------------------------------------------------

const mockQueryContext = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: (c: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(c),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// ---- Helpers --------------------------------------------------------------

function makeEvent(overrides: Partial<FeedbackEvent> = {}): FeedbackEvent {
  return {
    id: 'test-id',
    type: 'response_rating' as const,
    source: 'chat',
    target: 'msg-1',
    value: 0.8,
    details: {},
    timestamp: new Date('2026-03-22T10:00:00Z'),
    ...overrides,
  };
}

// ---- Tests ----------------------------------------------------------------

describe('clampValue', () => {
  it('returns value unchanged when within range', () => {
    expect(clampValue(0)).toBe(0);
    expect(clampValue(0.5)).toBe(0.5);
    expect(clampValue(-0.5)).toBe(-0.5);
  });

  it('clamps to +1 when above', () => {
    expect(clampValue(1.5)).toBe(1);
    expect(clampValue(100)).toBe(1);
  });

  it('clamps to -1 when below', () => {
    expect(clampValue(-1.5)).toBe(-1);
    expect(clampValue(-100)).toBe(-1);
  });

  it('returns exact boundary values', () => {
    expect(clampValue(1)).toBe(1);
    expect(clampValue(-1)).toBe(-1);
  });

  it('returns 0 for NaN', () => {
    expect(clampValue(NaN)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(clampValue(Infinity)).toBe(0);
    expect(clampValue(-Infinity)).toBe(0);
  });
});

describe('createFeedbackEvent', () => {
  it('generates a UUID id', () => {
    const event = createFeedbackEvent('response_rating', 'chat', 'msg-1', 0.5);
    expect(event.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('sets a timestamp close to now', () => {
    const before = Date.now();
    const event = createFeedbackEvent('tool_success', 'agent', 'tool-1', 1);
    const after = Date.now();
    expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(event.timestamp.getTime()).toBeLessThanOrEqual(after);
  });

  it('applies clampValue to the value', () => {
    const event = createFeedbackEvent('fact_correction', 'memory', 'fact-1', 5);
    expect(event.value).toBe(1);
  });

  it('defaults details to empty object', () => {
    const event = createFeedbackEvent('response_rating', 'chat', 'msg-1', 0);
    expect(event.details).toEqual({});
  });

  it('passes through provided details', () => {
    const details = { reason: 'helpful' };
    const event = createFeedbackEvent(
      'response_rating',
      'chat',
      'msg-1',
      0.9,
      details,
    );
    expect(event.details).toEqual({ reason: 'helpful' });
  });

  it('preserves type, source, and target', () => {
    const event = createFeedbackEvent(
      'document_quality',
      'rag',
      'doc-42',
      -0.3,
    );
    expect(event.type).toBe('document_quality');
    expect(event.source).toBe('rag');
    expect(event.target).toBe('doc-42');
  });
});

describe('recordFeedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockResolvedValue({ rows: [] });
  });

  it('inserts event into the database', async () => {
    const event = makeEvent();
    await recordFeedback('personal', event);

    expect(mockQueryContext).toHaveBeenCalledTimes(1);
    const [ctx, sql, params] = mockQueryContext.mock.calls[0];
    expect(ctx).toBe('personal');
    expect(sql).toContain('INSERT INTO feedback_events');
    expect(params[0]).toBe(event.id);
    expect(params[1]).toBe(event.type);
    expect(params[4]).toBe(event.value);
  });

  it('serialises details as JSON', async () => {
    const event = makeEvent({ details: { key: 'val' } });
    await recordFeedback('work', event);

    const params = mockQueryContext.mock.calls[0][2];
    expect(params[5]).toBe(JSON.stringify({ key: 'val' }));
  });

  it('does not throw on DB error', async () => {
    mockQueryContext.mockRejectedValue(new Error('DB down'));
    await expect(recordFeedback('personal', makeEvent())).resolves.toBeUndefined();
  });

  it('logs error on DB failure', async () => {
    mockQueryContext.mockRejectedValue(new Error('DB down'));
    await recordFeedback('personal', makeEvent());

    const { logger } = jest.requireMock('../../../../utils/logger');
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to record feedback event',
      expect.any(Error),
      expect.objectContaining({ eventId: 'test-id' }),
    );
  });
});

describe('FeedbackBus', () => {
  let bus: FeedbackBus;

  beforeEach(() => {
    bus = new FeedbackBus();
    jest.clearAllMocks();
  });

  // -- subscribe / unsubscribe --

  it('subscribe registers a handler', () => {
    const handler: FeedbackHandler = jest.fn(async () => {});
    bus.subscribe('response_rating', handler);
    expect(bus.getHandlerCount('response_rating')).toBe(1);
  });

  it('subscribe allows multiple handlers per type', () => {
    bus.subscribe('response_rating', jest.fn(async () => {}));
    bus.subscribe('response_rating', jest.fn(async () => {}));
    expect(bus.getHandlerCount('response_rating')).toBe(2);
  });

  it('subscribe does not duplicate the same handler reference', () => {
    const handler: FeedbackHandler = jest.fn(async () => {});
    bus.subscribe('tool_success', handler);
    bus.subscribe('tool_success', handler);
    expect(bus.getHandlerCount('tool_success')).toBe(1);
  });

  it('unsubscribe removes a handler', () => {
    const handler: FeedbackHandler = jest.fn(async () => {});
    bus.subscribe('fact_correction', handler);
    bus.unsubscribe('fact_correction', handler);
    expect(bus.getHandlerCount('fact_correction')).toBe(0);
  });

  it('unsubscribe is a no-op for unknown handler', () => {
    const handler: FeedbackHandler = jest.fn(async () => {});
    bus.unsubscribe('fact_correction', handler);
    expect(bus.getHandlerCount()).toBe(0);
  });

  it('unsubscribe cleans up empty set', () => {
    const handler: FeedbackHandler = jest.fn(async () => {});
    bus.subscribe('tool_success', handler);
    bus.unsubscribe('tool_success', handler);
    // internal map should have removed the key
    expect(bus.getHandlerCount('tool_success')).toBe(0);
    expect(bus.getHandlerCount()).toBe(0);
  });

  // -- getHandlerCount --

  it('returns 0 when no handlers registered', () => {
    expect(bus.getHandlerCount()).toBe(0);
    expect(bus.getHandlerCount('response_rating')).toBe(0);
  });

  it('returns total across all types', () => {
    bus.subscribe('response_rating', jest.fn(async () => {}));
    bus.subscribe('tool_success', jest.fn(async () => {}));
    bus.subscribe('tool_success', jest.fn(async () => {}));
    expect(bus.getHandlerCount()).toBe(3);
  });

  // -- emit --

  it('calls handler with the event', async () => {
    const handler = jest.fn(async () => {});
    bus.subscribe('response_rating', handler);

    const event = makeEvent();
    await bus.emit(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('calls multiple handlers for same type', async () => {
    const h1 = jest.fn(async () => {});
    const h2 = jest.fn(async () => {});
    bus.subscribe('tool_success', h1);
    bus.subscribe('tool_success', h2);

    const event = makeEvent({ type: 'tool_success' });
    await bus.emit(event);

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('does not call handlers for other types', async () => {
    const handler = jest.fn(async () => {});
    bus.subscribe('fact_correction', handler);

    await bus.emit(makeEvent({ type: 'response_rating' }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('resolves when no handlers registered for type', async () => {
    await expect(bus.emit(makeEvent())).resolves.toBeUndefined();
  });

  it('isolates handler errors — other handlers still run', async () => {
    const failing = jest.fn(async () => {
      throw new Error('boom');
    });
    const succeeding = jest.fn(async () => {});

    bus.subscribe('response_rating', failing);
    bus.subscribe('response_rating', succeeding);

    await bus.emit(makeEvent());

    expect(failing).toHaveBeenCalledTimes(1);
    expect(succeeding).toHaveBeenCalledTimes(1);
  });

  it('logs error when handler throws', async () => {
    const failing = jest.fn(async () => {
      throw new Error('handler-error');
    });
    bus.subscribe('response_rating', failing);

    await bus.emit(makeEvent());

    const { logger } = jest.requireMock('../../../../utils/logger');
    expect(logger.error).toHaveBeenCalledWith(
      'Feedback handler threw an error',
      expect.any(Error),
      expect.objectContaining({ eventId: 'test-id' }),
    );
  });

  it('emit does not throw even if all handlers fail', async () => {
    bus.subscribe(
      'agent_performance',
      jest.fn(async () => {
        throw new Error('a');
      }),
    );
    bus.subscribe(
      'agent_performance',
      jest.fn(async () => {
        throw new Error('b');
      }),
    );

    await expect(
      bus.emit(makeEvent({ type: 'agent_performance' })),
    ).resolves.toBeUndefined();
  });
});
