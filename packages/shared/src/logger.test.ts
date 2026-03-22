import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logInfo, logWarn, logError, createLogger } from './logger';

describe('logger', () => {
  let stdoutSpy: any;
  let stderrSpy: any;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  function lastLog(spy: any): Record<string, unknown> {
    const raw = spy.mock.calls[0][0] as string;
    return JSON.parse(raw.trimEnd());
  }

  describe('logInfo', () => {
    it('writes ECS-formatted JSON to stdout', () => {
      logInfo({ service: 'test-svc', msg: 'hello world' });

      expect(stdoutSpy).toHaveBeenCalledOnce();
      const log = lastLog(stdoutSpy);

      expect(log['log.level']).toBe('info');
      expect(log['service.name']).toBe('test-svc');
      expect(log['message']).toBe('hello world');
      expect(log['@timestamp']).toBeDefined();
    });

    it('includes correlation fields when provided', () => {
      logInfo({
        service: 'test-svc',
        msg: 'with correlation',
        requestId: 'req-1',
        runId: 'run-1',
        callId: 'call-1',
        parentCallId: 'parent-1',
      });

      const log = lastLog(stdoutSpy);
      expect(log['trace.id']).toBe('req-1');
      expect(log['run.id']).toBe('run-1');
      expect(log['call.id']).toBe('call-1');
      expect(log['call.parent_id']).toBe('parent-1');
    });

    it('includes HTTP fields when provided', () => {
      logInfo({
        service: 'test-svc',
        msg: 'request',
        method: 'POST',
        route: '/api/runs',
        statusCode: 201,
        durationMs: 42,
      });

      const log = lastLog(stdoutSpy);
      expect(log['http.request.method']).toBe('POST');
      expect(log['url.path']).toBe('/api/runs');
      expect(log['http.response.status_code']).toBe(201);
      expect(log['event.duration']).toBe(42);
    });

    it('includes error fields when provided', () => {
      logInfo({
        service: 'test-svc',
        msg: 'error occurred',
        errorType: 'timeout',
        errorMessage: 'Request timed out',
      });

      const log = lastLog(stdoutSpy);
      expect(log['error.type']).toBe('timeout');
      expect(log['error.message']).toBe('Request timed out');
    });

    it('uses provided timestamp instead of generating one', () => {
      const ts = '2026-01-01T00:00:00.000Z';
      logInfo({ service: 'test-svc', msg: 'timestamped', timestamp: ts });

      const log = lastLog(stdoutSpy);
      expect(log['@timestamp']).toBe(ts);
    });
  });

  describe('logWarn', () => {
    it('writes to stdout with warn level', () => {
      logWarn({ service: 'test-svc', msg: 'warning' });

      const log = lastLog(stdoutSpy);
      expect(log['log.level']).toBe('warn');
      expect(log['message']).toBe('warning');
    });
  });

  describe('logError', () => {
    it('writes to stderr with error level', () => {
      logError({ service: 'test-svc', msg: 'failure' });

      expect(stderrSpy).toHaveBeenCalledOnce();
      expect(stdoutSpy).not.toHaveBeenCalled();

      const log = lastLog(stderrSpy);
      expect(log['log.level']).toBe('error');
      expect(log['message']).toBe('failure');
    });
  });

  describe('createLogger', () => {
    it('creates a logger that binds the service name', () => {
      const logger = createLogger('my-service');
      logger.info({ msg: 'test message' });

      const log = lastLog(stdoutSpy);
      expect(log['service.name']).toBe('my-service');
      expect(log['message']).toBe('test message');
    });

    it('falls back to SERVICE_NAME env var', () => {
      const original = process.env.SERVICE_NAME;
      process.env.SERVICE_NAME = 'env-service';

      const logger = createLogger();
      logger.info({ msg: 'from env' });

      const log = lastLog(stdoutSpy);
      expect(log['service.name']).toBe('env-service');

      process.env.SERVICE_NAME = original;
    });

    it('falls back to "unknown" when no name is available', () => {
      const original = process.env.SERVICE_NAME;
      delete process.env.SERVICE_NAME;

      const logger = createLogger();
      logger.info({ msg: 'anonymous' });

      const log = lastLog(stdoutSpy);
      expect(log['service.name']).toBe('unknown');

      process.env.SERVICE_NAME = original;
    });

    it('supports warn and error methods', () => {
      const logger = createLogger('svc');

      logger.warn({ msg: 'warn message' });
      expect(lastLog(stdoutSpy)['log.level']).toBe('warn');

      logger.error({ msg: 'error message' });
      expect(lastLog(stderrSpy)['log.level']).toBe('error');
    });
  });

  describe('ECS format compliance', () => {
    it('omits optional fields when not provided', () => {
      logInfo({ service: 'svc', msg: 'minimal' });

      const log = lastLog(stdoutSpy);
      expect(log).not.toHaveProperty('trace.id');
      expect(log).not.toHaveProperty('run.id');
      expect(log).not.toHaveProperty('call.id');
      expect(log).not.toHaveProperty('http.request.method');
      expect(log).not.toHaveProperty('event.duration');
      expect(log).not.toHaveProperty('error.type');
    });

    it('output ends with a newline', () => {
      logInfo({ service: 'svc', msg: 'test' });
      const raw = stdoutSpy.mock.calls[0][0] as string;
      expect(raw.endsWith('\n')).toBe(true);
    });

    it('output is valid JSON', () => {
      logInfo({ service: 'svc', msg: 'test' });
      const raw = stdoutSpy.mock.calls[0][0] as string;
      expect(() => JSON.parse(raw)).not.toThrow();
    });
  });
});
