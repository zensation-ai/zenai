import {
  subscribe,
  emit,
  emitAsync,
  unsubscribeAll,
  getSubscriptionCount,
} from '../../../services/plugins/event-bus';
import { PluginEvent } from '../../../services/plugins/plugin-types';

describe('Event Bus', () => {
  beforeEach(() => {
    unsubscribeAll();
  });

  const createEvent = (type: string): PluginEvent => ({
    type,
    source: 'test',
    data: {},
    timestamp: new Date().toISOString(),
  });

  test('subscribe and emit works', () => {
    const handler = jest.fn();
    subscribe('test.event', handler);
    emit(createEvent('test.event'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('unsubscribe stops receiving events', () => {
    const handler = jest.fn();
    const unsub = subscribe('test.event', handler);
    unsub();
    emit(createEvent('test.event'));
    expect(handler).not.toHaveBeenCalled();
  });

  test('emitAsync awaits all handlers', async () => {
    const order: number[] = [];
    subscribe('async.event', async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(1);
    });
    subscribe('async.event', async () => { order.push(2); });
    await emitAsync(createEvent('async.event'));
    expect(order).toContain(1);
    expect(order).toContain(2);
  });

  test('error in handler does not crash emit', () => {
    subscribe('err.event', () => { throw new Error('boom'); });
    const handler2 = jest.fn();
    subscribe('err.event', handler2);
    expect(() => emit(createEvent('err.event'))).not.toThrow();
    expect(handler2).toHaveBeenCalled();
  });

  test('unsubscribeAll clears all handlers', () => {
    subscribe('a', jest.fn());
    subscribe('b', jest.fn());
    expect(getSubscriptionCount()).toBe(2);
    unsubscribeAll();
    expect(getSubscriptionCount()).toBe(0);
  });

  test('unsubscribeAll with type clears only that type', () => {
    subscribe('a', jest.fn());
    subscribe('b', jest.fn());
    unsubscribeAll('a');
    expect(getSubscriptionCount('a')).toBe(0);
    expect(getSubscriptionCount('b')).toBe(1);
  });

  test('getSubscriptionCount returns correct counts', () => {
    subscribe('x', jest.fn());
    subscribe('x', jest.fn());
    subscribe('y', jest.fn());
    expect(getSubscriptionCount('x')).toBe(2);
    expect(getSubscriptionCount('y')).toBe(1);
    expect(getSubscriptionCount()).toBe(3);
  });

  test('events only go to matching type', () => {
    const h1 = jest.fn();
    const h2 = jest.fn();
    subscribe('type-a', h1);
    subscribe('type-b', h2);
    emit(createEvent('type-a'));
    expect(h1).toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });
});
