/**
 * NotificationService unit tests
 *
 * Tests SSE connection management and native notification bridging.
 */

// jest.mock is hoisted to the top by Babel/ts-jest, so we cannot reference
// variables declared in the same scope. Instead we capture instances via a
// module-level array and use jest.fn() inside the factory.

interface MockEventSourceInstance {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  close: jest.Mock;
  readyState: number;
  url: string;
}

const mockInstances: MockEventSourceInstance[] = [];

jest.mock('eventsource', () => {
  const Ctor = jest.fn().mockImplementation((url: string) => {
    const instance: MockEventSourceInstance = {
      onmessage: null,
      onerror: null,
      close: jest.fn(),
      readyState: 0,
      url,
    };
    mockInstances.push(instance);
    return instance;
  });
  return { default: Ctor, __esModule: true };
});

// Import AFTER mock registration so the module picks up the mock.
import { NotificationService } from '../../notifications/notification-service';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('NotificationService', () => {
  let service: NotificationService;
  let showAndNavigate: jest.Mock;

  // Grab a reference to the mocked constructor for call-count assertions.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const EventSourceMock = require('eventsource').default as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInstances.length = 0;
    showAndNavigate = jest.fn();
    service = new NotificationService(showAndNavigate);
  });

  it('creates EventSource connections for both SSE endpoints', () => {
    service.start('http://localhost:3000', 'personal');

    expect(EventSourceMock).toHaveBeenCalledTimes(2);
    const urls = mockInstances.map((i) => i.url);
    expect(urls).toContain('http://localhost:3000/api/personal/smart-suggestions/stream');
    expect(urls).toContain('http://localhost:3000/api/personal/proactive-engine/stream');
  });

  it('uses the active context in SSE URLs', () => {
    service.start('http://localhost:3000', 'work');

    const urls = mockInstances.map((i) => i.url);
    expect(urls).toContain('http://localhost:3000/api/work/smart-suggestions/stream');
    expect(urls).toContain('http://localhost:3000/api/work/proactive-engine/stream');
    urls.forEach((url) => expect(url).not.toContain('/personal/'));
  });

  it('stop() closes all connections', () => {
    service.start('http://localhost:3000', 'personal');
    expect(mockInstances).toHaveLength(2);

    service.stop();

    for (const instance of mockInstances) {
      expect(instance.close).toHaveBeenCalledTimes(1);
    }
  });

  it('reconnect() stops existing connections and starts new ones with new params', () => {
    service.start('http://localhost:3000', 'personal');
    const firstInstances = [...mockInstances];

    service.reconnect('http://localhost:3000', 'creative');

    // Old connections were closed
    for (const instance of firstInstances) {
      expect(instance.close).toHaveBeenCalledTimes(1);
    }

    // New connections use the new context
    const newInstances = mockInstances.filter((i) => !firstInstances.includes(i));
    expect(newInstances).toHaveLength(2);
    const urls = newInstances.map((i) => i.url);
    expect(urls).toContain('http://localhost:3000/api/creative/smart-suggestions/stream');
    expect(urls).toContain('http://localhost:3000/api/creative/proactive-engine/stream');
  });
});
