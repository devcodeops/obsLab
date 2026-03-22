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

describe('JsonLoggingInterceptor (orchestrator)', () => {
  let interceptor: JsonLoggingInterceptor;

  beforeEach(() => {
    interceptor = new JsonLoggingInterceptor('orchestrator');
    vi.mocked(logInfo).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs successful requests', async () => {
    const ctx = createMockContext(
      { method: 'GET', originalUrl: '/runs', headers: { 'x-request-id': 'req-1' } },
      { statusCode: 200 },
    );
    const handler = { handle: () => of([]) };

    await lastValueFrom(interceptor.intercept(ctx, handler as any));

    expect(logInfo).toHaveBeenCalledOnce();
    const logCall = vi.mocked(logInfo).mock.calls[0][0];
    expect(logCall.service).toBe('orchestrator');
    expect(logCall.msg).toContain('GET /runs 200');
  });

  it('logs errors and re-throws them', async () => {
    const ctx = createMockContext(
      { method: 'POST', originalUrl: '/runs', headers: {} },
      { statusCode: 500 },
    );
    const handler = { handle: () => throwError(() => new Error('DB error')) };

    await expect(
      lastValueFrom(interceptor.intercept(ctx, handler as any)),
    ).rejects.toThrow('DB error');

    const logCall = vi.mocked(logInfo).mock.calls[0][0];
    expect(logCall.errorMessage).toBe('DB error');
    expect(logCall.msg).toContain('ERROR');
  });
});
