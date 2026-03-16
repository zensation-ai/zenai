import { loadConfig } from '../../../core/config';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should load config with defaults', () => {
    process.env.DATABASE_URL = 'postgresql://test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const config = loadConfig();
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('test');
    expect(config.database.url).toBe('postgresql://test');
  });

  it('should throw on missing required vars', () => {
    delete process.env.DATABASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => loadConfig()).toThrow();
  });

  it('should parse numeric port', () => {
    process.env.DATABASE_URL = 'postgresql://test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.PORT = '8080';
    const config = loadConfig();
    expect(config.port).toBe(8080);
  });
});
