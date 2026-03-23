import { BackendBridge, BackendStatus } from '../../backend/backend-bridge';

// ─── Mock HealthChecker and LocalBackend ─────────────────────────────────────

const mockHealthCheckerStart = jest.fn();
const mockHealthCheckerStop = jest.fn();
const mockHealthCheckerOn = jest.fn();
const mockHealthCheckerCheckNow = jest.fn();

const mockLocalBackendStart = jest.fn();
const mockLocalBackendStop = jest.fn();
const mockLocalBackendIsRunning = jest.fn().mockReturnValue(false);

// Capture event listeners so tests can trigger them
type EventHandler = (...args: unknown[]) => void;
let healthCheckerListeners: Record<string, EventHandler> = {};

jest.mock('../../backend/health-checker', () => ({
  HealthChecker: jest.fn().mockImplementation(() => ({
    start: mockHealthCheckerStart,
    stop: mockHealthCheckerStop,
    checkNow: mockHealthCheckerCheckNow,
    on: (event: string, handler: EventHandler) => {
      healthCheckerListeners[event] = handler;
      mockHealthCheckerOn(event, handler);
    },
  })),
}));

jest.mock('../../backend/local-backend', () => ({
  LocalBackend: jest.fn().mockImplementation(() => ({
    start: mockLocalBackendStart,
    stop: mockLocalBackendStop,
    isRunning: mockLocalBackendIsRunning,
  })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CLOUD_URL = 'https://ki-ab-production.up.railway.app';
const LOCAL_PORT = 3000;
const HEALTH_INTERVAL = 30_000;
const STARTUP_TIMEOUT = 10_000;

function makeBridge(opts: { cloudHealthy?: boolean; localStarts?: boolean } = {}): BackendBridge {
  const { cloudHealthy = true, localStarts = true } = opts;

  if (cloudHealthy) {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
  } else {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
  }

  if (localStarts) {
    mockLocalBackendStart.mockResolvedValue(undefined);
  } else {
    mockLocalBackendStart.mockRejectedValue(new Error('Failed to start'));
  }

  return new BackendBridge(CLOUD_URL, LOCAL_PORT, false, HEALTH_INTERVAL, STARTUP_TIMEOUT);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BackendBridge', () => {
  beforeEach(() => {
    healthCheckerListeners = {};
    jest.clearAllMocks();
    mockLocalBackendIsRunning.mockReturnValue(false);
  });

  // 1. Starts in disconnected state
  it('starts in disconnected state', () => {
    const bridge = makeBridge();
    expect(bridge.getStatus()).toBe<BackendStatus>('disconnected');
  });

  // 2. Connects to cloud when health check passes
  it('connects to cloud when initial health check passes', async () => {
    const bridge = makeBridge({ cloudHealthy: true });

    await bridge.start();

    expect(bridge.getStatus()).toBe<BackendStatus>('cloud_connected');
    expect(bridge.getBaseUrl()).toBe(CLOUD_URL);
  });

  // 3. Falls back to local when cloud unreachable
  it('falls back to local backend when cloud is unreachable', async () => {
    const bridge = makeBridge({ cloudHealthy: false, localStarts: true });

    await bridge.start();

    expect(bridge.getStatus()).toBe<BackendStatus>('local_connected');
    expect(bridge.getBaseUrl()).toBe(`http://localhost:${LOCAL_PORT}`);
  });

  // 4. Enters disconnected when both cloud and local fail
  it('enters disconnected state when both cloud and local fail', async () => {
    const bridge = makeBridge({ cloudHealthy: false, localStarts: false });

    await bridge.start();

    expect(bridge.getStatus()).toBe<BackendStatus>('disconnected');
  });

  // 5. Emits statusChange on transitions
  it('emits statusChange when status transitions', async () => {
    const statusChangeSpy = jest.fn();
    const bridge = makeBridge({ cloudHealthy: true });
    bridge.on('statusChange', statusChangeSpy);

    await bridge.start();

    // Should have emitted at least once (disconnected → cloud_connected)
    expect(statusChangeSpy).toHaveBeenCalled();
    expect(statusChangeSpy).toHaveBeenCalledWith('cloud_connected');
  });

  // 6. stop() cleans up local backend and health checker
  it('stop() stops the health checker and local backend', async () => {
    const bridge = makeBridge({ cloudHealthy: true });
    mockLocalBackendStop.mockResolvedValue(undefined);

    await bridge.start();
    await bridge.stop();

    expect(mockHealthCheckerStop).toHaveBeenCalled();
    expect(mockLocalBackendStop).toHaveBeenCalled();
  });
});
