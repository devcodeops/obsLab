import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
  Controller: () => () => {},
  Get: () => () => {},
  Post: () => () => {},
  Body: () => () => {},
}));

vi.mock('@obslab/shared', () => ({
  logInfo: vi.fn(),
}));

import { ChaosController } from './chaos.controller';
import { ChaosStore } from './chaos.store';

describe('ChaosController', () => {
  let controller: ChaosController;
  let store: ChaosStore;
  const originalEnv = process.env.SERVICE_NAME;

  beforeEach(() => {
    process.env.SERVICE_NAME = 'svc-test';
    store = new ChaosStore();
    controller = new ChaosController(store);
  });

  afterEach(() => {
    process.env.SERVICE_NAME = originalEnv;
    vi.restoreAllMocks();
  });

  describe('getConfig', () => {
    it('returns the current chaos config from the store', () => {
      const result = controller.getConfig();
      expect(result.mode).toBe('normal');
      expect(result.serviceName).toBe('svc-test');
      expect(result.updatedAt).toBeDefined();
    });
  });

  describe('updateConfig', () => {
    it('updates the store and returns the new config', () => {
      const result = controller.updateConfig({
        mode: 'forceStatus',
        forceStatusCode: 503,
      } as any);

      expect(result.mode).toBe('forceStatus');
      expect(result.forceStatusCode).toBe(503);
    });
  });

  describe('resetConfig', () => {
    it('resets the store to defaults', () => {
      store.update({ mode: 'latency', fixedLatencyMs: 999 });
      const result = controller.resetConfig();

      expect(result.mode).toBe('normal');
      expect(result.fixedLatencyMs).toBeNull();
    });
  });

  describe('terminate', () => {
    it('returns accepted response with signal and delay', () => {
      vi.useFakeTimers();
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      const result = controller.terminate({ signal: 'SIGTERM', delayMs: 1000 });

      expect(result.accepted).toBe(true);
      expect(result.service).toBe('svc-test');
      expect(result.signal).toBe('SIGTERM');
      expect(result.delayMs).toBe(1000);
      expect(result.pid).toBe(process.pid);

      expect(killSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM');

      vi.useRealTimers();
      killSpy.mockRestore();
    });

    it('enforces minimum 500ms delay', () => {
      vi.useFakeTimers();
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      const result = controller.terminate({ delayMs: 0 });
      expect(result.delayMs).toBe(500);
      expect(result.signal).toBe('SIGTERM');

      vi.advanceTimersByTime(499);
      expect(killSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(killSpy).toHaveBeenCalledOnce();

      vi.useRealTimers();
      killSpy.mockRestore();
    });

    it('defaults signal to SIGTERM when not provided', () => {
      vi.useFakeTimers();
      vi.spyOn(process, 'kill').mockImplementation(() => true);

      const result = controller.terminate({});
      expect(result.signal).toBe('SIGTERM');

      vi.useRealTimers();
      vi.restoreAllMocks();
    });
  });
});
