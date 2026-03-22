import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
}));

vi.mock('@obslab/shared', () => ({
  callJson: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@obslab/db', () => ({
  prisma: {
    call: { create: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
    run: { update: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock('./stream.service', () => ({
  StreamService: vi.fn().mockImplementation(() => ({
    emit: vi.fn(),
    emitGlobal: vi.fn(),
    complete: vi.fn(),
  })),
}));

import { RunsService } from './runs.service';
import { StreamService } from './stream.service';
import { callJson, logInfo, logError } from '@obslab/shared';
import { prisma } from '@obslab/db';

const callJsonMock = vi.mocked(callJson);
const prismaMock = vi.mocked(prisma);

describe('RunsService', () => {
  let service: RunsService;
  let streamService: StreamService;

  beforeEach(() => {
    streamService = new StreamService();
    service = new RunsService(streamService);
    callJsonMock.mockReset();
    vi.mocked(prismaMock.call.create).mockReset().mockResolvedValue({} as any);
    vi.mocked(prismaMock.call.createMany).mockReset().mockResolvedValue({} as any);
    vi.mocked(prismaMock.run.update).mockReset().mockResolvedValue({} as any);
    vi.mocked(logInfo).mockReset();
    vi.mocked(logError).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const baseDto = {
    workflow: 'chain',
    iterations: 3,
    concurrency: 2,
    payloadSize: 256,
    clientTimeoutMs: 2000,
  };

  describe('executeRun — success path', () => {
    it('executes all iterations and marks run as completed', async () => {
      callJsonMock.mockResolvedValue({
        ok: true, callId: 'call-1', statusCode: 200, durationMs: 50, data: {},
      } as any);

      await service.executeRun('run-1', baseDto as any);

      expect(callJsonMock).toHaveBeenCalledTimes(3);
      expect(prismaMock.call.create).toHaveBeenCalledTimes(3);

      expect(prismaMock.run.update).toHaveBeenCalledOnce();
      const updateCall = vi.mocked(prismaMock.run.update).mock.calls[0][0] as any;
      expect(updateCall.where.id).toBe('run-1');
      expect(updateCall.data.status).toBe('completed');
      expect(updateCall.data.totalCalls).toBe(3);
      expect(updateCall.data.successCalls).toBe(3);
      expect(updateCall.data.errorCalls).toBe(0);
      expect(updateCall.data.timeoutCalls).toBe(0);
      expect(updateCall.data.p50LatencyMs).toBeDefined();
      expect(updateCall.data.p95LatencyMs).toBeDefined();
    });

    it('emits progress events via stream service', async () => {
      callJsonMock.mockResolvedValue({
        ok: true, callId: 'c1', statusCode: 200, durationMs: 10, data: {},
      } as any);

      await service.executeRun('run-1', { ...baseDto, iterations: 1, concurrency: 1 } as any);

      expect(streamService.emit).toHaveBeenCalled();
      expect(streamService.emitGlobal).toHaveBeenCalled();
      expect(streamService.complete).toHaveBeenCalledWith('run-1');
    });
  });

  describe('executeRun — error handling', () => {
    it('counts error calls correctly', async () => {
      callJsonMock.mockResolvedValue({
        ok: false, callId: 'call-err', statusCode: 503, durationMs: 30,
        errorType: 'http_error', errorMessage: 'HTTP 503', data: {},
      } as any);

      await service.executeRun('run-2', { ...baseDto, iterations: 2, concurrency: 1 } as any);

      const updateData = (vi.mocked(prismaMock.run.update).mock.calls[0][0] as any).data;
      expect(updateData.status).toBe('completed');
      expect(updateData.errorCalls).toBe(2);
      expect(updateData.successCalls).toBe(0);
    });

    it('counts timeout calls correctly', async () => {
      callJsonMock.mockResolvedValue({
        ok: false, callId: 'call-to', durationMs: 2000,
        errorType: 'timeout', errorMessage: 'Request timed out', data: {},
      } as any);

      await service.executeRun('run-3', { ...baseDto, iterations: 1, concurrency: 1 } as any);

      const updateData = (vi.mocked(prismaMock.run.update).mock.calls[0][0] as any).data;
      expect(updateData.timeoutCalls).toBe(1);
    });

    it('counts DB errors as timeout in inner catch and still completes', async () => {
      callJsonMock.mockResolvedValue({
        ok: true, callId: 'c', statusCode: 200, durationMs: 10, data: {},
      } as any);
      vi.mocked(prismaMock.call.create).mockRejectedValueOnce(new Error('DB constraint'));

      await service.executeRun('run-4', { ...baseDto, iterations: 1, concurrency: 1 } as any);

      const updateData = (vi.mocked(prismaMock.run.update).mock.calls[0][0] as any).data;
      expect(updateData.status).toBe('completed');
      expect(updateData.timeoutCalls).toBe(1);
    });
  });

  describe('executeRun — downstream calls', () => {
    it('records downstream calls to the database', async () => {
      callJsonMock.mockResolvedValue({
        ok: true, callId: 'root-call', statusCode: 200, durationMs: 50,
        data: {
          downstream: [
            { callId: 'ds-1', service: 'svc-beta', statusCode: 200, durationMs: 20 },
            { callId: 'ds-2', service: 'svc-gamma', statusCode: 200, durationMs: 25 },
          ],
        },
      } as any);

      await service.executeRun('run-ds', { ...baseDto, iterations: 1, concurrency: 1 } as any);

      expect(prismaMock.call.createMany).toHaveBeenCalledOnce();
      const createManyData = (vi.mocked(prismaMock.call.createMany).mock.calls[0][0] as any).data;
      expect(createManyData).toHaveLength(2);
      expect(createManyData[0].id).toBe('ds-1');
      expect(createManyData[0].runId).toBe('run-ds');
    });
  });

  describe('executeRun — retry logic', () => {
    it('retries on non-timeout errors', async () => {
      callJsonMock
        .mockResolvedValueOnce({
          ok: false, callId: 'c1', statusCode: 500, durationMs: 10,
          errorType: 'http_error', errorMessage: 'HTTP 500', data: {},
        } as any)
        .mockResolvedValueOnce({
          ok: true, callId: 'c2', statusCode: 200, durationMs: 15, data: {},
        } as any);

      await service.executeRun('run-retry', {
        ...baseDto, iterations: 1, concurrency: 1,
        retryPolicy: { retries: 1, backoffMs: 0 },
      } as any);

      expect(callJsonMock).toHaveBeenCalledTimes(2);
      const updateData = (vi.mocked(prismaMock.run.update).mock.calls[0][0] as any).data;
      expect(updateData.successCalls).toBe(1);
    });

    it('does not retry on timeout errors', async () => {
      callJsonMock.mockResolvedValue({
        ok: false, callId: 'c-to', durationMs: 2000,
        errorType: 'timeout', errorMessage: 'Request timed out', data: {},
      } as any);

      await service.executeRun('run-no-retry', {
        ...baseDto, iterations: 1, concurrency: 1,
        retryPolicy: { retries: 3, backoffMs: 0 },
      } as any);

      expect(callJsonMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeRun — concurrency', () => {
    it('respects concurrency limit', async () => {
      let concurrentActive = 0;
      let maxConcurrent = 0;

      callJsonMock.mockImplementation((async () => {
        concurrentActive++;
        maxConcurrent = Math.max(maxConcurrent, concurrentActive);
        await new Promise((r) => setTimeout(r, 10));
        concurrentActive--;
        return { ok: true, callId: 'c', statusCode: 200, durationMs: 10, data: {} };
      }) as any);

      await service.executeRun('run-conc', {
        ...baseDto, iterations: 10, concurrency: 3,
      } as any);

      expect(maxConcurrent).toBeLessThanOrEqual(3);
      expect(callJsonMock).toHaveBeenCalledTimes(10);
    });

    it('limits workers to iteration count when concurrency is higher', async () => {
      callJsonMock.mockResolvedValue({
        ok: true, callId: 'c', statusCode: 200, durationMs: 5, data: {},
      } as any);

      await service.executeRun('run-few', {
        ...baseDto, iterations: 2, concurrency: 10,
      } as any);

      expect(callJsonMock).toHaveBeenCalledTimes(2);
    });
  });
});
