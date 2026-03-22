import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@nestjs/common', () => ({
  Controller: () => () => {},
  Get: () => () => {},
  Post: () => () => {},
  Body: () => () => {},
  Param: () => () => {},
  BadRequestException: class BadRequestException extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'BadRequestException';
    }
  },
}));

vi.mock('@obslab/shared', () => ({
  callJson: vi.fn(),
}));

vi.mock('./runs.service', () => ({
  SERVICE_URLS: {
    alpha: 'http://svc-alpha:3011',
    beta: 'http://svc-beta:3012',
    gamma: 'http://svc-gamma:3013',
    web: 'http://web:3000',
    orchestrator: 'http://orchestrator:3001',
  },
}));

import { ServicesController } from './services.controller';
import { callJson } from '@obslab/shared';

const callJsonMock = vi.mocked(callJson);

describe('ServicesController', () => {
  let controller: ServicesController;

  beforeEach(() => {
    controller = new ServicesController();
    callJsonMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listServices', () => {
    it('returns health and chaos config for all worker services', async () => {
      callJsonMock.mockResolvedValue({ ok: true, data: { status: 'ok' } } as any);

      const result = await controller.listServices();

      expect(result.services).toHaveLength(3);
      expect(result.services.map((s: any) => s.name)).toEqual(['alpha', 'beta', 'gamma']);
      expect(callJsonMock).toHaveBeenCalledTimes(6);
    });

    it('marks service as unhealthy when health check fails', async () => {
      callJsonMock.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await controller.listServices();
      for (const svc of result.services) {
        expect(svc.healthy).toBe(false);
      }
    });

    it('includes chaosConfig when chaos endpoint responds ok', async () => {
      callJsonMock.mockImplementation(((opts: any) => {
        if (opts.url.includes('/health')) {
          return Promise.resolve({ ok: true, data: { status: 'ok' } });
        }
        if (opts.url.includes('/config/chaos')) {
          return Promise.resolve({ ok: true, data: { mode: 'normal' } });
        }
        return Promise.resolve({ ok: false });
      }) as any);

      const result = await controller.listServices();
      expect(result.services[0].chaosConfig).toEqual({ mode: 'normal' });
    });

    it('omits chaosConfig when chaos endpoint fails', async () => {
      callJsonMock.mockImplementation(((opts: any) => {
        if (opts.url.includes('/health')) {
          return Promise.resolve({ ok: true, data: { status: 'ok' } });
        }
        return Promise.reject(new Error('fail'));
      }) as any);

      const result = await controller.listServices();
      expect(result.services[0].chaosConfig).toBeUndefined();
    });
  });

  describe('getKillTargets', () => {
    it('returns only worker services as kill targets', async () => {
      callJsonMock.mockResolvedValue({ ok: true } as any);

      const result = await controller.getKillTargets();
      expect(result.targets).toHaveLength(3);
      const names = result.targets.map((t: any) => t.name);
      expect(names).toEqual(['alpha', 'beta', 'gamma']);
      expect(names).not.toContain('web');
      expect(names).not.toContain('orchestrator');
    });

    it('marks targets based on health check result', async () => {
      callJsonMock
        .mockResolvedValueOnce({ ok: true } as any)
        .mockResolvedValueOnce({ ok: false } as any)
        .mockRejectedValueOnce(new Error());

      const result = await controller.getKillTargets();
      expect(result.targets[0].healthy).toBe(true);
      expect(result.targets[1].healthy).toBe(false);
      expect(result.targets[2].healthy).toBe(false);
    });
  });

  describe('updateChaos', () => {
    it('proxies chaos config update to the service', async () => {
      callJsonMock.mockResolvedValue({ ok: true, data: { mode: 'latency' } } as any);

      const result = await controller.updateChaos('alpha', { mode: 'latency' } as any);
      expect(callJsonMock).toHaveBeenCalledWith({
        method: 'POST', url: 'http://svc-alpha:3011/config/chaos',
        body: { mode: 'latency' }, timeoutMs: 3000,
      });
      expect(result).toEqual({ mode: 'latency' });
    });

    it('throws BadRequestException when update fails', async () => {
      callJsonMock.mockResolvedValue({ ok: false, errorMessage: 'Invalid mode' } as any);
      await expect(controller.updateChaos('beta', { mode: 'invalid' } as any)).rejects.toThrow('Failed to update chaos config');
    });

    it('throws BadRequestException for unknown service', async () => {
      await expect(controller.updateChaos('nonexistent', {} as any)).rejects.toThrow('Unknown service');
    });
  });

  describe('resetChaos', () => {
    it('proxies chaos reset to the service', async () => {
      callJsonMock.mockResolvedValue({ ok: true, data: { mode: 'normal' } } as any);
      const result = await controller.resetChaos('gamma');
      expect(callJsonMock).toHaveBeenCalledWith({
        method: 'POST', url: 'http://svc-gamma:3013/config/chaos/reset', timeoutMs: 3000,
      });
      expect(result).toEqual({ mode: 'normal' });
    });

    it('throws BadRequestException when reset fails', async () => {
      callJsonMock.mockResolvedValue({ ok: false, errorMessage: 'down' } as any);
      await expect(controller.resetChaos('alpha')).rejects.toThrow('Failed to reset chaos config');
    });
  });

  describe('terminateService', () => {
    it('proxies terminate request to the service', async () => {
      callJsonMock.mockResolvedValue({ ok: true, data: { accepted: true } } as any);
      const result = await controller.terminateService('beta', { signal: 'SIGTERM', delayMs: 500 } as any);
      expect(callJsonMock).toHaveBeenCalledWith({
        method: 'POST', url: 'http://svc-beta:3012/chaos/terminate',
        body: { signal: 'SIGTERM', delayMs: 500 }, timeoutMs: 3000,
      });
      expect(result).toEqual({ accepted: true });
    });

    it('throws BadRequestException when termination fails', async () => {
      callJsonMock.mockResolvedValue({ ok: false, errorMessage: 'refused' } as any);
      await expect(controller.terminateService('alpha', {} as any)).rejects.toThrow('Failed to terminate');
    });
  });
});
