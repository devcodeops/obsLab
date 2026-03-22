import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
  Controller: () => () => {},
  Post: () => () => {},
  Body: () => () => {},
  Headers: () => () => {},
  HttpException: class HttpException extends Error {
    status: number;
    constructor(response: unknown, status: number) {
      super(typeof response === 'string' ? response : JSON.stringify(response));
      this.status = status;
    }
  },
}));

vi.mock('@obslab/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@obslab/shared')>();
  return {
    ...actual,
    wait: vi.fn().mockResolvedValue(undefined),
  };
});

import { WorkController } from './work.controller';
import { ChaosStore } from './chaos.store';
import { WorkService } from './work.service';
import { wait } from '@obslab/shared';

const mockWait = vi.mocked(wait);

describe('WorkController', () => {
  let controller: WorkController;
  let chaosStore: ChaosStore;
  let workService: WorkService;
  const originalEnv = process.env.SERVICE_NAME;

  beforeEach(() => {
    process.env.SERVICE_NAME = 'svc-beta'; // not router
    chaosStore = new ChaosStore();
    workService = {
      executeWorkflow: vi.fn().mockResolvedValue({ ok: true, workflow: 'chain', downstream: [] }),
    } as any;
    controller = new WorkController(chaosStore, workService);
    mockWait.mockClear();
  });

  afterEach(() => {
    process.env.SERVICE_NAME = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns echo response for non-router (leaf) service in normal mode', async () => {
    const result = await controller.doWork(
      { workflow: 'chain', clientTimeoutMs: 2000, data: { hello: 'world' } } as any,
      {},
    );

    expect(result).toEqual({
      ok: true,
      service: 'svc-beta',
      echo: { hello: 'world' },
      durationSimulatedMs: 0,
    });
  });

  it('delegates to workService when service is svc-alpha (router)', async () => {
    process.env.SERVICE_NAME = 'svc-alpha';
    const routerController = new WorkController(chaosStore, workService);

    await routerController.doWork(
      { workflow: 'fanout', clientTimeoutMs: 2000 } as any,
      { 'x-request-id': 'req-1' },
    );

    expect(workService.executeWorkflow).toHaveBeenCalledOnce();
  });

  it('applies simulated latency from chaos', async () => {
    chaosStore.update({ mode: 'latency', fixedLatencyMs: 300 });

    await controller.doWork(
      { workflow: 'chain', clientTimeoutMs: 2000 } as any,
      {},
    );

    expect(mockWait).toHaveBeenCalledWith(300);
  });

  it('throws HttpException when chaos forces failure', async () => {
    chaosStore.update({ mode: 'forceStatus', forceStatusCode: 503 });

    await expect(
      controller.doWork({ workflow: 'chain', clientTimeoutMs: 2000 } as any, {}),
    ).rejects.toThrow();
  });

  it('returns timeout response when chaos triggers timeout', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    chaosStore.update({ mode: 'timeout', timeoutProbability: 1 });

    const result = await controller.doWork(
      { workflow: 'chain', clientTimeoutMs: 2000 } as any,
      {},
    );

    expect(result).toEqual({
      ok: false,
      service: 'svc-beta',
      timedOut: true,
    });
  });
});
