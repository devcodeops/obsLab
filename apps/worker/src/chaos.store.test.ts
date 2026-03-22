import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock NestJS Injectable decorator before importing
vi.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
}));

import { ChaosStore } from './chaos.store';

describe('ChaosStore', () => {
  let store: ChaosStore;
  const originalEnv = process.env.SERVICE_NAME;

  beforeEach(() => {
    process.env.SERVICE_NAME = 'test-worker';
    store = new ChaosStore();
  });

  afterEach(() => {
    process.env.SERVICE_NAME = originalEnv;
  });

  describe('defaults', () => {
    it('starts in normal mode', () => {
      const config = store.get();
      expect(config.mode).toBe('normal');
      expect(config.serviceName).toBe('test-worker');
    });

    it('has all chaos values set to null', () => {
      const config = store.get();
      expect(config.forceStatusCode).toBeNull();
      expect(config.errorProbability).toBeNull();
      expect(config.fixedLatencyMs).toBeNull();
      expect(config.randomLatencyMinMs).toBeNull();
      expect(config.randomLatencyMaxMs).toBeNull();
      expect(config.timeoutProbability).toBeNull();
    });

    it('includes an updatedAt timestamp', () => {
      const config = store.get();
      expect(config.updatedAt).toBeDefined();
      expect(new Date(config.updatedAt).getTime()).not.toBeNaN();
    });
  });

  describe('update', () => {
    it('updates mode', () => {
      store.update({ mode: 'forceStatus' });
      expect(store.get().mode).toBe('forceStatus');
    });

    it('updates forceStatusCode', () => {
      store.update({ forceStatusCode: 503 });
      expect(store.get().forceStatusCode).toBe(503);
    });

    it('updates errorProbability', () => {
      store.update({ errorProbability: 0.7 });
      expect(store.get().errorProbability).toBe(0.7);
    });

    it('updates latency fields', () => {
      store.update({
        fixedLatencyMs: 100,
        randomLatencyMinMs: 50,
        randomLatencyMaxMs: 500,
      });
      const config = store.get();
      expect(config.fixedLatencyMs).toBe(100);
      expect(config.randomLatencyMinMs).toBe(50);
      expect(config.randomLatencyMaxMs).toBe(500);
    });

    it('updates timeoutProbability', () => {
      store.update({ timeoutProbability: 0.3 });
      expect(store.get().timeoutProbability).toBe(0.3);
    });

    it('performs partial updates without affecting other fields', () => {
      store.update({ mode: 'latency', fixedLatencyMs: 200 });
      store.update({ fixedLatencyMs: 500 });

      const config = store.get();
      expect(config.mode).toBe('latency');
      expect(config.fixedLatencyMs).toBe(500);
    });

    it('does not overwrite fields not present in the dto', () => {
      store.update({ mode: 'forceStatus', forceStatusCode: 502 });
      store.update({ mode: 'latency' });

      const config = store.get();
      expect(config.mode).toBe('latency');
      expect(config.forceStatusCode).toBe(502); // preserved from earlier update
    });

    it('returns the updated config with updatedAt', () => {
      const result = store.update({ mode: 'timeout' });
      expect(result.mode).toBe('timeout');
      expect(result.updatedAt).toBeDefined();
    });
  });

  describe('reset', () => {
    it('restores all defaults', () => {
      store.update({
        mode: 'forceStatus',
        forceStatusCode: 503,
        errorProbability: 0.5,
        fixedLatencyMs: 100,
        randomLatencyMinMs: 50,
        randomLatencyMaxMs: 500,
        timeoutProbability: 0.8,
      });

      const config = store.reset();
      expect(config.mode).toBe('normal');
      expect(config.forceStatusCode).toBeNull();
      expect(config.errorProbability).toBeNull();
      expect(config.fixedLatencyMs).toBeNull();
      expect(config.randomLatencyMinMs).toBeNull();
      expect(config.randomLatencyMaxMs).toBeNull();
      expect(config.timeoutProbability).toBeNull();
    });

    it('returns a fresh updatedAt', () => {
      const before = store.get().updatedAt;
      // Small delay to ensure timestamp differs
      const result = store.reset();
      expect(result.updatedAt).toBeDefined();
    });

    it('preserves the service name from env', () => {
      store.update({ mode: 'forceStatus' });
      const config = store.reset();
      expect(config.serviceName).toBe('test-worker');
    });
  });

  describe('env fallback', () => {
    it('uses "worker" when SERVICE_NAME is not set', () => {
      delete process.env.SERVICE_NAME;
      const freshStore = new ChaosStore();
      expect(freshStore.get().serviceName).toBe('worker');
    });
  });
});
