import { createConfig } from '../config';
import { DEFAULT_API_PORT, DEFAULT_FRONTEND_PORT } from '@zenai/shared';

describe('createConfig', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns default values', () => {
    const config = createConfig();

    expect(config.get('cloudBackendUrl')).toBe('https://ki-ab-production.up.railway.app');
    expect(config.get('localBackendPort')).toBe(DEFAULT_API_PORT);
    expect(config.get('dockMode')).toBe('spotlight');
    expect(config.get('activeContext')).toBe('personal');
    expect(config.get('healthCheckInterval')).toBe(30000);
    expect(config.get('localBackendStartupTimeout')).toBe(30000);
    expect(config.get('frontendDevPort')).toBe(DEFAULT_FRONTEND_PORT);
  });

  it('persists values via set/get', () => {
    const config = createConfig();

    config.set('dockMode', 'menubar');
    expect(config.get('dockMode')).toBe('menubar');

    config.set('healthCheckInterval', 60000);
    expect(config.get('healthCheckInterval')).toBe(60000);

    config.set('activeContext', 'work');
    expect(config.get('activeContext')).toBe('work');
  });

  it('overrides values from environment variables', () => {
    process.env['ZENAI_CLOUD_BACKEND_URL'] = 'https://custom.backend.example.com';

    const config = createConfig();

    expect(config.get('cloudBackendUrl')).toBe('https://custom.backend.example.com');
  });

  it('returns all config as an object via getAll()', () => {
    const config = createConfig();
    config.set('dockMode', 'menubar');

    const all = config.getAll();

    expect(all).toMatchObject({
      cloudBackendUrl: expect.any(String),
      localBackendPort: expect.any(Number),
      spotlightShortcut: expect.any(String),
      searchShortcut: expect.any(String),
      dockMode: 'menubar',
      healthCheckInterval: expect.any(Number),
      frontendDevPort: expect.any(Number),
      activeContext: expect.any(String),
      localBackendStartupTimeout: expect.any(Number),
    });
  });

  it('validates activeContext values', () => {
    const config = createConfig();
    const validContexts = ['personal', 'work', 'learning', 'creative'] as const;

    for (const ctx of validContexts) {
      config.set('activeContext', ctx);
      expect(config.get('activeContext')).toBe(ctx);
    }

    // Default is 'personal' (a valid context)
    const freshConfig = createConfig();
    const ctx = freshConfig.get('activeContext');
    expect(validContexts).toContain(ctx);
  });
});
