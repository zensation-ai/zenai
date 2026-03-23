import { HealthChecker } from '../../backend/health-checker';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_URL = 'http://localhost:3000/api/health';
const INTERVAL_MS = 1000;

function makeFetchOk(): jest.Mock {
  return jest.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
}

function makeFetchFail(error: Error = new Error('ECONNREFUSED')): jest.Mock {
  return jest.fn().mockRejectedValue(error);
}

function makeFetchNotOk(status = 500): jest.Mock {
  return jest.fn().mockResolvedValue({ ok: false, status } as Response);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HealthChecker', () => {
  let checker: HealthChecker;

  beforeEach(() => {
    jest.useFakeTimers();
    checker = new HealthChecker(TEST_URL, INTERVAL_MS);
  });

  afterEach(() => {
    checker.stop();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // 1. Emits `healthy` when `/api/health` responds OK
  it('emits healthy when fetch responds OK', async () => {
    global.fetch = makeFetchOk();
    const healthySpy = jest.fn();
    checker.on('healthy', healthySpy);

    await checker.checkNow();

    expect(healthySpy).toHaveBeenCalledTimes(1);
  });

  // 2. Emits `unhealthy` when fetch fails (ECONNREFUSED)
  it('emits unhealthy when fetch throws (ECONNREFUSED)', async () => {
    global.fetch = makeFetchFail();
    const unhealthySpy = jest.fn();
    checker.on('unhealthy', unhealthySpy);

    await checker.checkNow();

    expect(unhealthySpy).toHaveBeenCalledTimes(1);
  });

  // 3. Emits `unhealthy` when response is not OK (500)
  it('emits unhealthy when response status is not OK', async () => {
    global.fetch = makeFetchNotOk(500);
    const unhealthySpy = jest.fn();
    checker.on('unhealthy', unhealthySpy);

    await checker.checkNow();

    expect(unhealthySpy).toHaveBeenCalledTimes(1);
  });

  // 4. Emits `statusChange` on transition healthy→unhealthy
  it('emits statusChange on healthy→unhealthy transition', async () => {
    const statusChangeSpy = jest.fn();
    checker.on('statusChange', statusChangeSpy);

    global.fetch = makeFetchOk();
    await checker.checkNow(); // healthy

    global.fetch = makeFetchFail();
    await checker.checkNow(); // unhealthy

    expect(statusChangeSpy).toHaveBeenCalledTimes(2);
    // First call: undefined → healthy
    expect(statusChangeSpy).toHaveBeenNthCalledWith(1, true);
    // Second call: healthy → unhealthy
    expect(statusChangeSpy).toHaveBeenNthCalledWith(2, false);
  });

  // 5. Does NOT emit `statusChange` when status stays same
  it('does NOT emit statusChange when status stays the same', async () => {
    const statusChangeSpy = jest.fn();
    checker.on('statusChange', statusChangeSpy);

    global.fetch = makeFetchOk();
    await checker.checkNow(); // healthy (statusChange fires: null → healthy)
    await checker.checkNow(); // still healthy (no statusChange)

    expect(statusChangeSpy).toHaveBeenCalledTimes(1);
  });

  // 6. Polls at configured interval when started
  it('polls at the configured interval when started', async () => {
    global.fetch = makeFetchOk();

    // Don't await start() — it sets up an interval but should resolve immediately
    checker.start();

    // Advance time by 3 intervals
    jest.advanceTimersByTime(INTERVAL_MS * 3);

    // Flush all pending promises
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Should have been called at least 3 times (once per interval)
    expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(3);
  });

  // 7. Stops polling when stopped
  it('stops polling when stop() is called', async () => {
    global.fetch = makeFetchOk();

    checker.start();

    // Advance one interval, then stop
    jest.advanceTimersByTime(INTERVAL_MS);
    await Promise.resolve();

    checker.stop();

    const callCountAfterStop = (global.fetch as jest.Mock).mock.calls.length;

    // Advance several more intervals — should not trigger more calls
    jest.advanceTimersByTime(INTERVAL_MS * 5);
    await Promise.resolve();

    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callCountAfterStop);
  });

  // 8. Uses 5s fetch timeout via AbortController
  it('uses AbortController with 5s timeout', async () => {
    const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

    // Make fetch hang indefinitely (never resolves)
    global.fetch = jest.fn().mockImplementation((_url: string, options: RequestInit) => {
      // Listen for abort signal
      return new Promise((_resolve, reject) => {
        (options.signal as AbortSignal).addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const unhealthySpy = jest.fn();
    checker.on('unhealthy', unhealthySpy);

    const checkPromise = checker.checkNow();

    // Advance time past the 5-second timeout
    jest.advanceTimersByTime(5001);

    await checkPromise;

    expect(abortSpy).toHaveBeenCalled();
    expect(unhealthySpy).toHaveBeenCalledTimes(1);
  });
});
