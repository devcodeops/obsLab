import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { lastValueFrom } from 'rxjs';

vi.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
}));

vi.mock('@obslab/shared', async () => {
  const actual = await vi.importActual<typeof import('@obslab/shared')>('@obslab/shared');
  return {
    ...actual,
    logInfo: vi.fn(),
  };
});

import { JsonLoggingInterceptor } from './logging.interceptor';
import { logInfo } from '@obslab/shared';

function createMockContext(req: Record<string, unknown>, res: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as any;
}

describe('JsonLoggingInterceptor', () => {
  let interceptor: JsonLoggingInterceptor;

  beforeEach(() => {
    interceptor = new JsonLoggingInterceptor('test-svc');
    vi.mocked(logInfo).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs successful requests with method, route, and status', async () => {
    const ctx = createMockContext(
      { method: 'GET', originalUrl: '/health', headers: { 'x-request-id': 'req-1' } },
      { statusCode: 200 },
    );
    const handler = { handle: () => of({ ok: true }) };

    await lastValueFrom(interceptor.intercept(ctx, handler as any));

    expect(logInfo).toHaveBeenCalledOnce();
    const logCall = vi.mocked(logInfo).mock.calls[0][0];
    expect(logCall.service).toBe('test-svc');
    expect(logCall.method).toBe('GET');
    expect(logCall.route).toBe('/health');
    expect(logCall.statusCode).toBe(200);
    expect(logCall.requestId).toBe('req-1');
    expect(logCall.msg).toContain('GET /health 200');
    expect(logCall.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('logs errors and re-throws them', async () => {
    const ctx = createMockContext(
      { method: 'POST', originalUrl: '/runs', headers: {} },
      { statusCode: 500 },
    );
    const error = new Error('Something failed');
    error.name = 'InternalServerError';
    const handler = { handle: () => throwError(() => error) };

    await expect(
      lastValueFrom(interceptor.intercept(ctx, handler as any)),
    ).rejects.toThrow('Something failed');

    expect(logInfo).toHaveBeenCalledOnce();
    const logCall = vi.mocked(logInfo).mock.calls[0][0];
    expect(logCall.msg).toContain('ERROR');
    expect(logCall.errorType).toBe('InternalServerError');
    expect(logCall.errorMessage).toBe('Something failed');
  });

  it('handles missing headers gracefully', async () => {
    const ctx = createMockContext(
      { method: 'GET', originalUrl: '/health', headers: undefined },
      { statusCode: 200 },
    );
    const handler = { handle: () => of({}) };

    await lastValueFrom(interceptor.intercept(ctx, handler as any));

    expect(logInfo).toHaveBeenCalledOnce();
    // Should have auto-generated requestId
    const logCall = vi.mocked(logInfo).mock.calls[0][0];
    expect(logCall.requestId).toBeDefined();
  });

  it('propagates correlation fields from headers', async () => {
    const ctx = createMockContext(
      {
        method: 'POST',
        originalUrl: '/work',
        headers: { 'x-request-id': 'req-abc', 'x-run-id': 'run-xyz', 'x-call-id': 'call-123' },
      },
      { statusCode: 201 },
    );
    const handler = { handle: () => of({}) };

    await lastValueFrom(interceptor.intercept(ctx, handler as any));

    const logCall = vi.mocked(logInfo).mock.calls[0][0];
    expect(logCall.requestId).toBe('req-abc');
    expect(logCall.runId).toBe('run-xyz');
    expect(logCall.callId).toBe('call-123');
  });
});
