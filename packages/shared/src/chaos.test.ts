import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { evaluateChaos, wait, ChaosOutcome } from './chaos';
import type { ChaosConfig } from './types';

function makeConfig(overrides: Partial<ChaosConfig> = {}): ChaosConfig {
  return {
    serviceName: 'test-svc',
    mode: 'normal',
    forceStatusCode: null,
    errorProbability: null,
    fixedLatencyMs: null,
    randomLatencyMinMs: null,
    randomLatencyMaxMs: null,
    timeoutProbability: null,
    ...overrides,
  };
}

describe('evaluateChaos', () => {
  describe('normal mode', () => {
    it('returns a clean outcome', () => {
      const result = evaluateChaos(makeConfig(), 2000);
      expect(result.shouldFail).toBe(false);
      expect(result.shouldTimeout).toBe(false);
      expect(result.simulatedLatencyMs).toBe(0);
      expect(result.statusCode).toBeUndefined();
      expect(result.errorMessage).toBeUndefined();
    });
  });

  describe('forceStatus mode', () => {
    it('fails with the configured status code', () => {
      const result = evaluateChaos(
        makeConfig({ mode: 'forceStatus', forceStatusCode: 503 }),
        2000,
      );
      expect(result.shouldFail).toBe(true);
      expect(result.statusCode).toBe(503);
      expect(result.errorMessage).toContain('503');
    });

    it('defaults to 500 when forceStatusCode is null', () => {
      const result = evaluateChaos(
        makeConfig({ mode: 'forceStatus', forceStatusCode: null }),
        2000,
      );
      expect(result.shouldFail).toBe(true);
      expect(result.statusCode).toBe(500);
    });
  });

  describe('probabilisticError mode', () => {
    let mathRandomSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mathRandomSpy = vi.spyOn(Math, 'random');
    });

    afterEach(() => {
      mathRandomSpy.mockRestore();
    });

    it('fails when random < probability', () => {
      mathRandomSpy.mockReturnValue(0.2);
      const result = evaluateChaos(
        makeConfig({ mode: 'probabilisticError', errorProbability: 0.5 }),
        2000,
      );
      expect(result.shouldFail).toBe(true);
      expect(result.statusCode).toBe(500);
    });

    it('succeeds when random >= probability', () => {
      mathRandomSpy.mockReturnValue(0.8);
      const result = evaluateChaos(
        makeConfig({ mode: 'probabilisticError', errorProbability: 0.5 }),
        2000,
      );
      expect(result.shouldFail).toBe(false);
    });

    it('never fails when probability is 0', () => {
      mathRandomSpy.mockReturnValue(0);
      const result = evaluateChaos(
        makeConfig({ mode: 'probabilisticError', errorProbability: 0 }),
        2000,
      );
      expect(result.shouldFail).toBe(false);
    });

    it('always fails when probability is 1', () => {
      mathRandomSpy.mockReturnValue(0.999);
      const result = evaluateChaos(
        makeConfig({ mode: 'probabilisticError', errorProbability: 1 }),
        2000,
      );
      expect(result.shouldFail).toBe(true);
    });
  });

  describe('latency mode', () => {
    let mathRandomSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mathRandomSpy = vi.spyOn(Math, 'random');
    });

    afterEach(() => {
      mathRandomSpy.mockRestore();
    });

    it('applies fixed latency only', () => {
      const result = evaluateChaos(
        makeConfig({ mode: 'latency', fixedLatencyMs: 300 }),
        2000,
      );
      expect(result.simulatedLatencyMs).toBe(300);
      expect(result.shouldFail).toBe(false);
    });

    it('applies random latency range', () => {
      mathRandomSpy.mockReturnValue(0.5);
      const result = evaluateChaos(
        makeConfig({
          mode: 'latency',
          fixedLatencyMs: 0,
          randomLatencyMinMs: 100,
          randomLatencyMaxMs: 200,
        }),
        2000,
      );
      // 0 + 100 + floor(0.5 * 101) = 100 + 50 = 150
      expect(result.simulatedLatencyMs).toBe(150);
    });

    it('combines fixed and random latency', () => {
      mathRandomSpy.mockReturnValue(0); // min of random range
      const result = evaluateChaos(
        makeConfig({
          mode: 'latency',
          fixedLatencyMs: 200,
          randomLatencyMinMs: 100,
          randomLatencyMaxMs: 500,
        }),
        2000,
      );
      // 200 + 100 + floor(0 * 401) = 300
      expect(result.simulatedLatencyMs).toBe(300);
    });

    it('returns 0 latency when all values are null', () => {
      const result = evaluateChaos(makeConfig({ mode: 'latency' }), 2000);
      expect(result.simulatedLatencyMs).toBe(0);
    });
  });

  describe('timeout mode', () => {
    let mathRandomSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mathRandomSpy = vi.spyOn(Math, 'random');
    });

    afterEach(() => {
      mathRandomSpy.mockRestore();
    });

    it('triggers timeout when random < probability', () => {
      mathRandomSpy.mockReturnValue(0.1);
      const result = evaluateChaos(
        makeConfig({ mode: 'timeout', timeoutProbability: 0.5 }),
        2000,
      );
      expect(result.shouldTimeout).toBe(true);
      expect(result.simulatedLatencyMs).toBe(3500); // 2000 + 1500
    });

    it('does not timeout when random >= probability', () => {
      mathRandomSpy.mockReturnValue(0.9);
      const result = evaluateChaos(
        makeConfig({ mode: 'timeout', timeoutProbability: 0.5 }),
        2000,
      );
      expect(result.shouldTimeout).toBe(false);
      expect(result.simulatedLatencyMs).toBe(0);
    });
  });

  describe('unknown mode', () => {
    it('returns base outcome for unrecognized mode', () => {
      const result = evaluateChaos(
        makeConfig({ mode: 'nonexistent' as any }),
        2000,
      );
      expect(result.shouldFail).toBe(false);
      expect(result.shouldTimeout).toBe(false);
    });
  });
});

describe('wait', () => {
  it('resolves after the specified delay', async () => {
    vi.useFakeTimers();
    const promise = wait(100);
    vi.advanceTimersByTime(100);
    await promise;
    vi.useRealTimers();
  });

  it('resolves with undefined', async () => {
    vi.useFakeTimers();
    const promise = wait(0);
    vi.advanceTimersByTime(0);
    const result = await promise;
    expect(result).toBeUndefined();
    vi.useRealTimers();
  });
});
