/**
 * LOAD_TEST_MODE helpers — verifies env-var parsing and sampling logic.
 *
 * These are env-driven runtime switches, so they must never depend on
 * module-initialization time. Each test resets process.env to the pristine
 * snapshot captured in beforeAll.
 */

import { isLoadTestMode, getEffectiveSampleRate } from '../../../../services/observability/tracing';

describe('LOAD_TEST_MODE — env-driven toggles', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Rehydrate process.env between tests so toggles don't leak.
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {delete process.env[key];}
    }
    for (const [k, v] of Object.entries(originalEnv)) {
      process.env[k] = v;
    }
    delete process.env.LOAD_TEST_MODE;
    delete process.env.OTEL_TRACES_SAMPLER_ARG;
  });

  describe('isLoadTestMode()', () => {
    it('returns false when LOAD_TEST_MODE is unset', () => {
      delete process.env.LOAD_TEST_MODE;
      expect(isLoadTestMode()).toBe(false);
    });

    it('returns true when LOAD_TEST_MODE=1', () => {
      process.env.LOAD_TEST_MODE = '1';
      expect(isLoadTestMode()).toBe(true);
    });

    it('returns true when LOAD_TEST_MODE=true (case-insensitive)', () => {
      process.env.LOAD_TEST_MODE = 'TRUE';
      expect(isLoadTestMode()).toBe(true);
    });

    it('returns false for other truthy-looking strings ("yes", "on")', () => {
      process.env.LOAD_TEST_MODE = 'yes';
      expect(isLoadTestMode()).toBe(false);
      process.env.LOAD_TEST_MODE = 'on';
      expect(isLoadTestMode()).toBe(false);
    });
  });

  describe('getEffectiveSampleRate()', () => {
    it('returns 1.0 when LOAD_TEST_MODE is on (ignores OTEL_TRACES_SAMPLER_ARG)', () => {
      process.env.LOAD_TEST_MODE = '1';
      process.env.OTEL_TRACES_SAMPLER_ARG = '0.01';
      expect(getEffectiveSampleRate()).toBe(1.0);
    });

    it('defaults to 0.1 when no env vars are set', () => {
      expect(getEffectiveSampleRate()).toBeCloseTo(0.1, 5);
    });

    it('honours OTEL_TRACES_SAMPLER_ARG when valid and within [0,1]', () => {
      process.env.OTEL_TRACES_SAMPLER_ARG = '0.5';
      expect(getEffectiveSampleRate()).toBeCloseTo(0.5, 5);
    });

    it('clamps values above 1 to 1 and falls back to 0.1 on garbage input', () => {
      process.env.OTEL_TRACES_SAMPLER_ARG = '2.5';
      expect(getEffectiveSampleRate()).toBe(1);

      process.env.OTEL_TRACES_SAMPLER_ARG = 'not-a-number';
      expect(getEffectiveSampleRate()).toBeCloseTo(0.1, 5);

      process.env.OTEL_TRACES_SAMPLER_ARG = '-0.2';
      expect(getEffectiveSampleRate()).toBeCloseTo(0.1, 5);
    });
  });
});
