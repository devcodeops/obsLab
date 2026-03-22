export type ChaosMode = 'normal' | 'forceStatus' | 'probabilisticError' | 'latency' | 'timeout';

export type WorkflowType = 'chain' | 'fanout' | 'fanout-fanin' | 'random';

export interface CorrelationHeaders {
  requestId: string;
  runId?: string;
  callId?: string;
  parentCallId?: string;
}

export interface ChaosConfig {
  serviceName: string;
  mode: ChaosMode;
  forceStatusCode: number | null;
  errorProbability: number | null;
  fixedLatencyMs: number | null;
  randomLatencyMinMs: number | null;
  randomLatencyMaxMs: number | null;
  timeoutProbability: number | null;
  updatedAt?: string;
}

export type ErrorType = 'http_error' | 'timeout' | 'network' | 'unknown';

export interface HttpCallResult<T = unknown> {
  ok: boolean;
  statusCode?: number;
  durationMs: number;
  data?: T;
  errorType?: ErrorType;
  errorMessage?: string;
}

export interface LogFields {
  timestamp?: string;
  level?: 'info' | 'warn' | 'error';
  service: string;
  requestId?: string;
  runId?: string;
  callId?: string;
  parentCallId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  msg: string;
  errorType?: string;
  errorMessage?: string;
  [key: string]: unknown;
}

export interface CreateRunRequest {
  workflow: WorkflowType;
  iterations: number;
  concurrency: number;
  payloadSize?: number;
  clientTimeoutMs: number;
  retryPolicy?: {
    retries: number;
    backoffMs: number;
  };
}
