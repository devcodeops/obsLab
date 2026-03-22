import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callJson, HttpRequestOptions } from './http-client';

// Helper to create a mock Response
function mockResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers as Record<string, string> },
  });
}

describe('callJson', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('makes a successful GET request', async () => {
    fetchSpy.mockResolvedValue(mockResponse({ hello: 'world' }));

    const result = await callJson({ method: 'GET', url: 'http://test/api' });

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.data).toEqual({ hello: 'world' });
    expect(result.callId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('makes a POST request with body', async () => {
    fetchSpy.mockResolvedValue(mockResponse({ created: true }, { status: 201 }));

    const result = await callJson({
      method: 'POST',
      url: 'http://test/api',
      body: { name: 'test' },
    });

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(201);

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://test/api');
    expect(opts?.method).toBe('POST');
    expect(opts?.body).toBe(JSON.stringify({ name: 'test' }));
  });

  it('returns error result for non-2xx responses', async () => {
    fetchSpy.mockResolvedValue(mockResponse({ error: 'not found' }, { status: 404 }));

    const result = await callJson({ method: 'GET', url: 'http://test/api' });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(404);
    expect(result.errorType).toBe('http_error');
    expect(result.errorMessage).toBe('HTTP 404');
  });

  it('classifies abort errors as timeout', async () => {
    fetchSpy.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'));

    const result = await callJson({ method: 'GET', url: 'http://test/api', timeoutMs: 100 });

    expect(result.ok).toBe(false);
    expect(result.errorType).toBe('timeout');
    expect(result.errorMessage).toBe('Request timed out');
  });

  it('classifies connection refused as network error', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed: ECONNREFUSED'));

    const result = await callJson({ method: 'GET', url: 'http://test/api' });

    expect(result.ok).toBe(false);
    expect(result.errorType).toBe('network');
    expect(result.errorMessage).toContain('ECONNREFUSED');
  });

  it('classifies fetch failed as network error', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

    const result = await callJson({ method: 'GET', url: 'http://test/api' });

    expect(result.ok).toBe(false);
    expect(result.errorType).toBe('network');
  });

  it('classifies unknown errors correctly', async () => {
    fetchSpy.mockRejectedValue(new Error('something unexpected'));

    const result = await callJson({ method: 'GET', url: 'http://test/api' });

    expect(result.ok).toBe(false);
    expect(result.errorType).toBe('unknown');
    expect(result.errorMessage).toBe('something unexpected');
  });

  it('sends content-type and call-id headers', async () => {
    fetchSpy.mockResolvedValue(mockResponse({}));

    await callJson({ method: 'GET', url: 'http://test/api' });

    const [, opts] = fetchSpy.mock.calls[0];
    const headers = opts?.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['x-call-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sends correlation headers when provided', async () => {
    fetchSpy.mockResolvedValue(mockResponse({}));

    await callJson({
      method: 'GET',
      url: 'http://test/api',
      correlation: { requestId: 'req-1', runId: 'run-1' },
    });

    const [, opts] = fetchSpy.mock.calls[0];
    const headers = opts?.headers as Record<string, string>;
    expect(headers['x-request-id']).toBe('req-1');
    expect(headers['x-run-id']).toBe('run-1');
  });

  it('sends parent call id when provided', async () => {
    fetchSpy.mockResolvedValue(mockResponse({}));

    await callJson({
      method: 'GET',
      url: 'http://test/api',
      parentCallId: 'parent-abc',
    });

    const [, opts] = fetchSpy.mock.calls[0];
    const headers = opts?.headers as Record<string, string>;
    expect(headers['x-parent-call-id']).toBe('parent-abc');
  });

  it('forwards propagation headers', async () => {
    fetchSpy.mockResolvedValue(mockResponse({}));

    await callJson({
      method: 'GET',
      url: 'http://test/api',
      propagationHeaders: {
        'x-b3-traceid': 'trace-abc',
        'traceparent': '00-parent',
      },
    });

    const [, opts] = fetchSpy.mock.calls[0];
    const headers = opts?.headers as Record<string, string>;
    expect(headers['x-b3-traceid']).toBe('trace-abc');
    expect(headers['traceparent']).toBe('00-parent');
  });

  it('does not send body for GET requests with null body', async () => {
    fetchSpy.mockResolvedValue(mockResponse({}));

    await callJson({ method: 'GET', url: 'http://test/api', body: null });

    const [, opts] = fetchSpy.mock.calls[0];
    expect(opts?.body).toBeUndefined();
  });

  it('handles non-JSON response bodies gracefully', async () => {
    fetchSpy.mockResolvedValue(
      new Response('not json', { status: 200 }),
    );

    const result = await callJson({ method: 'GET', url: 'http://test/api' });

    expect(result.ok).toBe(true);
    expect(result.data).toBeUndefined();
  });

  it('uses default timeoutMs of 5000', async () => {
    fetchSpy.mockResolvedValue(mockResponse({}));

    await callJson({ method: 'GET', url: 'http://test/api' });

    // We can't directly inspect the timeout, but we verify it doesn't throw
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('handles non-Error thrown values', async () => {
    fetchSpy.mockRejectedValue('string error');

    const result = await callJson({ method: 'GET', url: 'http://test/api' });

    expect(result.ok).toBe(false);
    expect(result.errorType).toBe('unknown');
    expect(result.errorMessage).toBe('string error');
  });
});
