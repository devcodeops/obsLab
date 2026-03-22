import { describe, it, expect, vi } from 'vitest';
import {
  getCorrelationFromHeaders,
  toHttpHeaders,
  extractPropagationHeaders,
  REQUEST_ID_HEADER,
  RUN_ID_HEADER,
  CALL_ID_HEADER,
  PARENT_CALL_ID_HEADER,
  ISTIO_PROPAGATION_HEADERS,
} from './correlation';

describe('getCorrelationFromHeaders', () => {
  it('extracts all correlation headers from a plain object', () => {
    const headers = {
      'x-request-id': 'req-123',
      'x-run-id': 'run-456',
      'x-call-id': 'call-789',
      'x-parent-call-id': 'parent-000',
    };
    const result = getCorrelationFromHeaders(headers);
    expect(result).toEqual({
      requestId: 'req-123',
      runId: 'run-456',
      callId: 'call-789',
      parentCallId: 'parent-000',
    });
  });

  it('generates a UUID for requestId when missing', () => {
    const result = getCorrelationFromHeaders({});
    expect(result.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.runId).toBeUndefined();
    expect(result.callId).toBeUndefined();
    expect(result.parentCallId).toBeUndefined();
  });

  it('handles array-valued headers (takes first element)', () => {
    const headers = {
      'x-request-id': ['first', 'second'],
      'x-run-id': ['only'],
    };
    const result = getCorrelationFromHeaders(headers);
    expect(result.requestId).toBe('first');
    expect(result.runId).toBe('only');
  });

  it('works with a Headers object (fetch API)', () => {
    const headers = new Headers();
    headers.set('x-request-id', 'from-headers');
    headers.set('x-run-id', 'run-abc');
    const result = getCorrelationFromHeaders(headers);
    expect(result.requestId).toBe('from-headers');
    expect(result.runId).toBe('run-abc');
  });

  it('ignores undefined header values', () => {
    const headers = { 'x-request-id': undefined };
    const result = getCorrelationFromHeaders(headers);
    // requestId should be auto-generated since the value is undefined
    expect(result.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('toHttpHeaders', () => {
  it('converts full correlation to HTTP headers', () => {
    const result = toHttpHeaders({
      requestId: 'req-1',
      runId: 'run-1',
      callId: 'call-1',
      parentCallId: 'parent-1',
    });
    expect(result).toEqual({
      'x-request-id': 'req-1',
      'x-run-id': 'run-1',
      'x-call-id': 'call-1',
      'x-parent-call-id': 'parent-1',
    });
  });

  it('omits undefined optional fields', () => {
    const result = toHttpHeaders({ requestId: 'req-only' });
    expect(result).toEqual({ 'x-request-id': 'req-only' });
    expect(Object.keys(result)).toHaveLength(1);
  });

  it('always includes requestId', () => {
    const result = toHttpHeaders({ requestId: 'abc' });
    expect(result[REQUEST_ID_HEADER]).toBe('abc');
  });
});

describe('extractPropagationHeaders', () => {
  it('extracts present Istio/OTel headers', () => {
    const headers = {
      'x-request-id': 'req-1',
      'x-b3-traceid': 'trace-abc',
      'traceparent': '00-trace-01',
      'unrelated-header': 'ignored',
    };
    const result = extractPropagationHeaders(headers);
    expect(result).toEqual({
      'x-request-id': 'req-1',
      'x-b3-traceid': 'trace-abc',
      'traceparent': '00-trace-01',
    });
    expect(result['unrelated-header']).toBeUndefined();
  });

  it('returns empty object when no propagation headers present', () => {
    const result = extractPropagationHeaders({ 'content-type': 'application/json' });
    expect(result).toEqual({});
  });

  it('works with Headers object', () => {
    const headers = new Headers();
    headers.set('x-b3-spanid', 'span-123');
    headers.set('tracestate', 'foo=bar');
    const result = extractPropagationHeaders(headers);
    expect(result['x-b3-spanid']).toBe('span-123');
    expect(result['tracestate']).toBe('foo=bar');
  });

  it('skips headers with undefined values', () => {
    const headers = { 'x-b3-traceid': undefined, 'traceparent': '00-abc' };
    const result = extractPropagationHeaders(headers);
    expect(result).toEqual({ 'traceparent': '00-abc' });
  });
});

describe('header constants', () => {
  it('defines the expected header names', () => {
    expect(REQUEST_ID_HEADER).toBe('x-request-id');
    expect(RUN_ID_HEADER).toBe('x-run-id');
    expect(CALL_ID_HEADER).toBe('x-call-id');
    expect(PARENT_CALL_ID_HEADER).toBe('x-parent-call-id');
  });

  it('includes all expected Istio propagation headers', () => {
    expect(ISTIO_PROPAGATION_HEADERS).toContain('x-b3-traceid');
    expect(ISTIO_PROPAGATION_HEADERS).toContain('traceparent');
    expect(ISTIO_PROPAGATION_HEADERS).toContain('tracestate');
    expect(ISTIO_PROPAGATION_HEADERS).toContain('b3');
    expect(ISTIO_PROPAGATION_HEADERS.length).toBe(10);
  });
});
