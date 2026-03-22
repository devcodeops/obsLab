import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
}));

vi.mock('@obslab/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@obslab/shared')>();
  return {
    ...actual,
    callJson: vi.fn(),
  };
});

import { WorkService } from './work.service';
import { callJson } from '@obslab/shared';

const callJsonMock = vi.mocked(callJson);

function makeCallResult(service: string, overrides = {}) {
  return {
    ok: true,
    callId: `call-${service}`,
    statusCode: 200,
    durationMs: 10,
    data: { ok: true, service },
    ...overrides,
  };
}

describe('WorkService', () => {
  let service: WorkService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SERVICE_NAME = 'svc-alpha';
    process.env.SVC_BETA_URL = 'http://svc-beta:3012';
    process.env.SVC_GAMMA_URL = 'http://svc-gamma:3013';
    service = new WorkService();
    callJsonMock.mockReset();
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
  });

  const baseDto = {
    workflow: 'chain',
    clientTimeoutMs: 2000,
    payloadSize: 256,
    data: { test: true },
  };

  const headers = { 'x-request-id': 'req-1', 'x-run-id': 'run-1' };

  describe('executeWorkflow routing', () => {
    beforeEach(() => {
      callJsonMock.mockResolvedValue(makeCallResult('svc-beta') as any);
    });

    it('routes to chain workflow', async () => {
      const result = await service.executeWorkflow({ ...baseDto, workflow: 'chain' } as any, headers);
      expect(result.workflow).toBe('chain');
    });

    it('routes to fanout workflow', async () => {
      const result = await service.executeWorkflow({ ...baseDto, workflow: 'fanout' } as any, headers);
      expect(result.workflow).toBe('fanout');
    });

    it('routes to fanout-fanin workflow', async () => {
      const result = await service.executeWorkflow({ ...baseDto, workflow: 'fanout-fanin' } as any, headers);
      expect(result.workflow).toBe('fanout-fanin');
    });

    it('routes to random workflow', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const result = await service.executeWorkflow({ ...baseDto, workflow: 'random' } as any, headers);
      expect(result.workflow).toBe('random');
    });

    it('defaults to chain for unknown workflow', async () => {
      const result = await service.executeWorkflow({ ...baseDto, workflow: 'unknown' } as any, headers);
      expect(result.workflow).toBe('chain');
    });
  });

  describe('chain workflow', () => {
    it('calls beta then gamma sequentially', async () => {
      callJsonMock
        .mockResolvedValueOnce(makeCallResult('svc-beta') as any)
        .mockResolvedValueOnce(makeCallResult('svc-gamma') as any);

      const result = await service.executeWorkflow({ ...baseDto, workflow: 'chain' } as any, headers);

      expect(callJsonMock).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(true);
      expect(result.downstream).toHaveLength(2);
      expect(callJsonMock.mock.calls[0][0].url).toBe('http://svc-beta:3012/work');
      expect(callJsonMock.mock.calls[1][0].url).toBe('http://svc-gamma:3013/work');
      expect(callJsonMock.mock.calls[1][0].parentCallId).toBe('call-svc-beta');
    });

    it('uses half the timeout as budget per call', async () => {
      callJsonMock.mockResolvedValue(makeCallResult('svc') as any);
      await service.executeWorkflow(
        { ...baseDto, workflow: 'chain', clientTimeoutMs: 4000 } as any,
        headers,
      );
      expect(callJsonMock.mock.calls[0][0].timeoutMs).toBe(2000);
    });

    it('enforces minimum 150ms budget', async () => {
      callJsonMock.mockResolvedValue(makeCallResult('svc') as any);
      await service.executeWorkflow(
        { ...baseDto, workflow: 'chain', clientTimeoutMs: 100 } as any,
        headers,
      );
      expect(callJsonMock.mock.calls[0][0].timeoutMs).toBe(150);
    });
  });

  describe('fanout workflow', () => {
    it('calls beta and gamma in parallel', async () => {
      callJsonMock.mockResolvedValue(makeCallResult('svc') as any);
      const result = await service.executeWorkflow({ ...baseDto, workflow: 'fanout' } as any, headers);
      expect(callJsonMock).toHaveBeenCalledTimes(2);
      expect(result.downstream).toHaveLength(2);
    });
  });

  describe('fanout-fanin workflow', () => {
    it('calls beta and gamma, then beta again (join)', async () => {
      callJsonMock.mockResolvedValue(makeCallResult('svc') as any);
      const result = await service.executeWorkflow({ ...baseDto, workflow: 'fanout-fanin' } as any, headers);
      expect(callJsonMock).toHaveBeenCalledTimes(3);
      expect(result.downstream).toHaveLength(3);
      expect(callJsonMock.mock.calls[2][0].url).toBe('http://svc-beta:3012/work');
    });

    it('uses third of timeout as budget', async () => {
      callJsonMock.mockResolvedValue(makeCallResult('svc') as any);
      await service.executeWorkflow(
        { ...baseDto, workflow: 'fanout-fanin', clientTimeoutMs: 3000 } as any,
        headers,
      );
      expect(callJsonMock.mock.calls[0][0].timeoutMs).toBe(1000);
    });
  });

  describe('random workflow', () => {
    it('makes 1-3 random calls', async () => {
      callJsonMock.mockResolvedValue(makeCallResult('svc') as any);
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.6) // count = 1 + floor(0.6 * 3) = 2
        .mockReturnValueOnce(0.3) // first call url
        .mockReturnValueOnce(0.8); // second call url
      const result = await service.executeWorkflow({ ...baseDto, workflow: 'random' } as any, headers);
      expect(callJsonMock).toHaveBeenCalledTimes(2);
      expect(result.downstream).toHaveLength(2);
    });
  });

  describe('callDownstream mapping', () => {
    it('extracts service name from URL hostname', async () => {
      callJsonMock.mockResolvedValue(makeCallResult('svc-beta') as any);
      const result = await service.executeWorkflow({ ...baseDto, workflow: 'chain' } as any, headers);
      expect(result.downstream[0].service).toBe('svc-beta');
    });

    it('maps error results correctly', async () => {
      callJsonMock.mockResolvedValue({
        ok: false, callId: 'call-err', statusCode: 503, durationMs: 50,
        errorType: 'http_error', errorMessage: 'HTTP 503',
      } as any);
      const result = await service.executeWorkflow({ ...baseDto, workflow: 'chain' } as any, headers);
      expect(result.downstream[0].ok).toBe(false);
      expect(result.downstream[0].errorType).toBe('http_error');
    });
  });

  describe('correlation propagation', () => {
    it('passes correlation headers to downstream calls', async () => {
      callJsonMock.mockResolvedValue(makeCallResult('svc') as any);
      await service.executeWorkflow({ ...baseDto, workflow: 'chain' } as any, {
        'x-request-id': 'req-abc',
        'x-run-id': 'run-xyz',
        'x-b3-traceid': 'trace-123',
      });
      const firstCallOpts = callJsonMock.mock.calls[0][0];
      expect(firstCallOpts.correlation!.requestId).toBe('req-abc');
      expect(firstCallOpts.correlation!.runId).toBe('run-xyz');
      expect(firstCallOpts.propagationHeaders!['x-b3-traceid']).toBe('trace-123');
    });
  });
});
