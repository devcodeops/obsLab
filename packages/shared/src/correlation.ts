import { randomUUID } from 'node:crypto';
import { CorrelationHeaders } from './types';

export const REQUEST_ID_HEADER = 'x-request-id';
export const RUN_ID_HEADER = 'x-run-id';
export const CALL_ID_HEADER = 'x-call-id';
export const PARENT_CALL_ID_HEADER = 'x-parent-call-id';

/** Istio / OpenTelemetry propagation headers to forward between services */
export const ISTIO_PROPAGATION_HEADERS = [
  'x-request-id',
  'x-b3-traceid',
  'x-b3-spanid',
  'x-b3-parentspanid',
  'x-b3-sampled',
  'x-b3-flags',
  'b3',
  'x-ot-span-context',
  'traceparent',
  'tracestate',
] as const;

type HeaderSource = Record<string, string | string[] | undefined> | Headers;

function getHeader(headers: HeaderSource, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const val = headers[name];
  return Array.isArray(val) ? val[0] : val;
}

/** Extract correlation IDs from incoming request headers, generating requestId if missing */
export function getCorrelationFromHeaders(headers: HeaderSource): CorrelationHeaders {
  return {
    requestId: getHeader(headers, REQUEST_ID_HEADER) ?? randomUUID(),
    runId: getHeader(headers, RUN_ID_HEADER),
    callId: getHeader(headers, CALL_ID_HEADER),
    parentCallId: getHeader(headers, PARENT_CALL_ID_HEADER),
  };
}

/** Convert CorrelationHeaders to an HTTP header record */
export function toHttpHeaders(c: CorrelationHeaders): Record<string, string> {
  const h: Record<string, string> = { [REQUEST_ID_HEADER]: c.requestId };
  if (c.runId) h[RUN_ID_HEADER] = c.runId;
  if (c.callId) h[CALL_ID_HEADER] = c.callId;
  if (c.parentCallId) h[PARENT_CALL_ID_HEADER] = c.parentCallId;
  return h;
}

/** Extract all Istio/OTel propagation headers present in incoming request */
export function extractPropagationHeaders(
  headers: HeaderSource,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of ISTIO_PROPAGATION_HEADERS) {
    const val = getHeader(headers, name);
    if (val) out[name] = val;
  }
  return out;
}
