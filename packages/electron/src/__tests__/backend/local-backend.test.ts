import { EventEmitter } from 'events';
import { LocalBackend } from '../../backend/local-backend';

// ─── Mock child_process ───────────────────────────────────────────────────────

/** A minimal mock of a ChildProcess returned by spawn(). */
function createMockProcess() {
  const stdout = new EventEmitter() as NodeJS.EventEmitter & { emit(event: string, data?: unknown): boolean };
  const stderr = new EventEmitter() as NodeJS.EventEmitter & { emit(event: string, data?: unknown): boolean };
  const kill = jest.fn();

  const proc = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: typeof stdout;
    stderr: typeof stderr;
    kill: jest.Mock;
    pid: number;
  };

  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.kill = kill;
  proc.pid = 12345;

  return proc;
}

const mockSpawn = jest.fn();
const mockExecSync = jest.fn();

jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

jest.mock('path', () => ({
  ...jest.requireActual('path'),
  join: (...parts: string[]) => parts.join('/'),
  resolve: (...parts: string[]) => parts.join('/'),
  dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LocalBackend', () => {
  let mockProc: ReturnType<typeof createMockProcess>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockProc = createMockProcess();
    mockSpawn.mockReturnValue(mockProc);
    // Return platform-appropriate binary paths
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('npx')) return '/usr/local/bin/npx';
      return '/usr/local/bin/node';
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // 1. Starts and resolves when "Server running" in stdout
  it('resolves when "Server running" appears in stdout', async () => {
    const backend = new LocalBackend(3000, false);

    const startPromise = backend.start(5000);
    mockProc.stdout.emit('data', Buffer.from('Server running on port 3000\n'));

    await expect(startPromise).resolves.toBeUndefined();
  });

  // 2. Resolves when "listening on" detected
  it('resolves when "listening on" appears in stdout', async () => {
    const backend = new LocalBackend(3000, false);

    const startPromise = backend.start(5000);
    mockProc.stdout.emit('data', Buffer.from('Server listening on port 3000\n'));

    await expect(startPromise).resolves.toBeUndefined();
  });

  // 3. Resolves when "Server:" detected
  it('resolves when "Server:" appears in stdout', async () => {
    const backend = new LocalBackend(3000, false);

    const startPromise = backend.start(5000);
    mockProc.stdout.emit('data', Buffer.from('Server: started\n'));

    await expect(startPromise).resolves.toBeUndefined();
  });

  // 4. Rejects when process emits error
  it('rejects when the spawned process emits an error', async () => {
    const backend = new LocalBackend(3000, false);

    const startPromise = backend.start(5000);
    const spawnError = new Error('spawn ENOENT');
    mockProc.emit('error', spawnError);

    await expect(startPromise).rejects.toThrow('spawn ENOENT');
  });

  // 5. Rejects when process exits with non-zero code
  it('rejects when process exits with non-zero exit code', async () => {
    const backend = new LocalBackend(3000, false);

    const startPromise = backend.start(5000);
    mockProc.emit('exit', 1, null);

    await expect(startPromise).rejects.toThrow(/exited/i);
  });

  // 6. Rejects on timeout
  it('rejects when startup exceeds the timeout', async () => {
    const backend = new LocalBackend(3000, false);

    const startPromise = backend.start(3000);

    // Advance past the timeout — no stdout emitted
    jest.advanceTimersByTime(3001);

    await expect(startPromise).rejects.toThrow(/timeout/i);
  });

  // 7. stop() kills the process (SIGTERM)
  it('stop() sends SIGTERM to the running process', async () => {
    const backend = new LocalBackend(3000, false);

    const startPromise = backend.start(5000);
    mockProc.stdout.emit('data', Buffer.from('Server running\n'));
    await startPromise;

    // After resolving the stop promise via SIGTERM exit
    const stopPromise = backend.stop();
    // Simulate graceful exit after SIGTERM
    mockProc.emit('exit', 0, 'SIGTERM');
    await stopPromise;

    expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  // 8. isRunning() returns false before start
  it('isRunning() returns false before start() is called', () => {
    const backend = new LocalBackend(3000, false);
    expect(backend.isRunning()).toBe(false);
  });

  // 9. Uses npx ts-node-dev in dev mode
  it('spawns npx ts-node-dev in dev mode', async () => {
    const backend = new LocalBackend(3000, true);

    const startPromise = backend.start(5000);
    mockProc.stdout.emit('data', Buffer.from('Server running\n'));
    await startPromise;

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.stringContaining('npx'),
      expect.arrayContaining(['ts-node-dev']),
      expect.any(Object),
    );
  });
});
