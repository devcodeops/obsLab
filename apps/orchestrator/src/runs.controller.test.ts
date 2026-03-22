import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@nestjs/common', () => ({
  Controller: () => () => {},
  Get: () => () => {},
  Post: () => () => {},
  Body: () => () => {},
  Param: () => () => {},
  Query: () => () => {},
  Sse: () => () => {},
  NotFoundException: class NotFoundException extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'NotFoundException';
    }
  },
}));

vi.mock('@obslab/db', () => ({
  prisma: {
    run: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('./runs.service', () => ({
  RunsService: vi.fn().mockImplementation(() => ({
    executeRun: vi.fn(),
  })),
}));

vi.mock('./stream.service', () => ({
  StreamService: vi.fn().mockImplementation(() => ({
    emitGlobal: vi.fn(),
    getGlobalStream: vi.fn(),
    getRunStream: vi.fn(),
  })),
}));

import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { StreamService } from './stream.service';
import { prisma } from '@obslab/db';

const prismaMock = vi.mocked(prisma);

describe('RunsController', () => {
  let controller: RunsController;
  let runsService: RunsService;
  let streamService: StreamService;

  beforeEach(() => {
    runsService = new RunsService(null as any);
    streamService = new StreamService();
    controller = new RunsController(runsService, streamService);
    vi.mocked(prismaMock.run.create).mockReset();
    vi.mocked(prismaMock.run.findMany).mockReset();
    vi.mocked(prismaMock.run.findUnique).mockReset();
    vi.mocked(prismaMock.run.count).mockReset();
    vi.mocked(prismaMock.$transaction).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createRun', () => {
    it('creates a run and fires executeRun', async () => {
      vi.mocked(prismaMock.run.create).mockResolvedValue({
        id: 'run-abc', workflowName: 'chain', iterations: 10,
      } as any);

      const result = await controller.createRun({
        workflow: 'chain', iterations: 10, concurrency: 5, clientTimeoutMs: 2000,
      } as any);

      expect(result).toEqual({ runId: 'run-abc' });
      expect(prismaMock.run.create).toHaveBeenCalledOnce();
      expect(runsService.executeRun).toHaveBeenCalledWith('run-abc', expect.any(Object));
      expect(streamService.emitGlobal).toHaveBeenCalled();
    });
  });

  describe('listRuns', () => {
    it('returns paginated runs', async () => {
      vi.mocked(prismaMock.run.findMany).mockResolvedValue([{ id: 'r1' }, { id: 'r2' }] as any);
      vi.mocked(prismaMock.run.count).mockResolvedValue(10);

      const result = await controller.listRuns({ page: 2, pageSize: 5 } as any);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(10);
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(5);
    });
  });

  describe('clearRuns', () => {
    it('deletes all runs and calls and emits global event', async () => {
      vi.mocked(prismaMock.$transaction).mockResolvedValue({
        deletedRuns: 5, deletedCalls: 20,
      } as any);

      const result = await controller.clearRuns();

      expect(result.ok).toBe(true);
      expect(result.deletedRuns).toBe(5);
      expect(result.deletedCalls).toBe(20);
      expect(streamService.emitGlobal).toHaveBeenCalled();
    });
  });

  describe('getRun', () => {
    it('returns a run with call graph', async () => {
      vi.mocked(prismaMock.run.findUnique).mockResolvedValue({
        id: 'run-1', status: 'completed',
        calls: [
          {
            id: 'c1', parentCallId: null, fromService: 'orch', toService: 'alpha',
            route: '/work', method: 'POST', statusCode: 200, durationMs: 50,
            errorType: null, errorMessage: null,
          },
          {
            id: 'c2', parentCallId: 'c1', fromService: 'alpha', toService: 'beta',
            route: '/work', method: 'POST', statusCode: 200, durationMs: 30,
            errorType: null, errorMessage: null,
          },
        ],
      } as any);

      const result = await controller.getRun('run-1');

      expect(result.id).toBe('run-1');
      expect(result.callGraph).toHaveLength(1);
      expect(result.callGraph[0].children).toHaveLength(1);
    });

    it('throws NotFoundException for unknown run', async () => {
      vi.mocked(prismaMock.run.findUnique).mockResolvedValue(null);
      await expect(controller.getRun('nonexistent')).rejects.toThrow('not found');
    });

    it('builds correct tree with multiple roots', async () => {
      vi.mocked(prismaMock.run.findUnique).mockResolvedValue({
        id: 'run-2', status: 'completed',
        calls: [
          {
            id: 'c1', parentCallId: null, fromService: 'orch', toService: 'alpha',
            route: '/work', method: 'POST', statusCode: 200, durationMs: 50,
            errorType: null, errorMessage: null,
          },
          {
            id: 'c2', parentCallId: null, fromService: 'orch', toService: 'alpha',
            route: '/work', method: 'POST', statusCode: 200, durationMs: 60,
            errorType: null, errorMessage: null,
          },
        ],
      } as any);

      const result = await controller.getRun('run-2');
      expect(result.callGraph).toHaveLength(2);
    });
  });

  describe('health', () => {
    it('returns ok status', () => {
      const result = controller.health();
      expect(result.status).toBe('ok');
      expect(result.service).toBe('orchestrator');
    });
  });

  describe('metrics', () => {
    it('returns stub metrics', () => {
      const result = controller.metrics();
      expect(result.status).toBe('ok');
    });
  });
});
