import { randomUUID } from 'node:crypto';
import { HttpCallResult, CorrelationHeaders } from './types';
import { toHttpHeaders, CALL_ID_HEADER } from './correlation';

export interface HttpRequestOptions {
  method: 'GET' | 'POST';
  url: string;
  body?: unknown;
  timeoutMs?: number;
  correlation?: CorrelationHeaders;
  parentCallId?: string;
  propagationHeaders?: Record<string, string>;
}

export async function callJson<T = unknown>(
  opts: HttpRequestOptions,
): Promise<HttpCallResult<T> & { callId: string }> {
  const callId = randomUUID();
  const timeoutMs = opts.timeoutMs ?? 5000;
  const start = Date.now();

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    [CALL_ID_HEADER]: callId,
    ...opts.propagationHeaders,
  };

  if (opts.correlation) {
    Object.assign(headers, toHttpHeaders(opts.correlation));
  }
  if (opts.parentCallId) {
    headers['x-parent-call-id'] = opts.parentCallId;
  }

  const controller = new AbortController();
  const softTimer = setTimeout(() => controller.abort(), timeoutMs);
  const hardTimer = setTimeout(() => controller.abort(), timeoutMs + 1000);

  try {
    const res = await fetch(opts.url, {
      method: opts.method,
      headers,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    const durationMs = Date.now() - start;
    const data = (await res.json().catch(() => null)) as T | null;

    if (!res.ok) {
      return {
        ok: false,
        callId,
        statusCode: res.status,
        durationMs,
        errorType: 'http_error',
        errorMessage: `HTTP ${res.status}`,
        data: data ?? undefined,
      };
    }

    return { ok: true, callId, statusCode: res.status, durationMs, data: data ?? undefined };
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const isAbort = err instanceof DOMException && err.name === 'AbortError';

    if (isAbort) {
      return { ok: false, callId, durationMs, errorType: 'timeout', errorMessage: 'Request timed out' };
    }

    const message = err instanceof Error ? err.message : String(err);
    const isNetwork = message.includes('ECONNREFUSED') || message.includes('fetch failed');

    return {
      ok: false,
      callId,
      durationMs,
      errorType: isNetwork ? 'network' : 'unknown',
      errorMessage: message,
    };
  } finally {
    clearTimeout(softTimer);
    clearTimeout(hardTimer);
  }
}
