import { LogFields } from './types';

/** ECS-compatible JSON log structure */
interface EcsLog {
  '@timestamp': string;
  'log.level': string;
  'service.name': string;
  'trace.id'?: string;
  message: string;
  'event.duration'?: number;
  'http.request.method'?: string;
  'url.path'?: string;
  'http.response.status_code'?: number;
  'error.message'?: string;
  'error.type'?: string;
  [key: string]: unknown;
}

function toEcs(fields: LogFields): EcsLog {
  const log: EcsLog = {
    '@timestamp': fields.timestamp ?? new Date().toISOString(),
    'log.level': fields.level ?? 'info',
    'service.name': fields.service,
    message: fields.msg,
  };

  if (fields.requestId) log['trace.id'] = fields.requestId;
  if (fields.runId) log['run.id'] = fields.runId;
  if (fields.callId) log['call.id'] = fields.callId;
  if (fields.parentCallId) log['call.parent_id'] = fields.parentCallId;
  if (fields.method) log['http.request.method'] = fields.method;
  if (fields.route) log['url.path'] = fields.route;
  if (fields.statusCode) log['http.response.status_code'] = fields.statusCode;
  if (fields.durationMs != null) log['event.duration'] = fields.durationMs;
  if (fields.errorMessage) log['error.message'] = fields.errorMessage;
  if (fields.errorType) log['error.type'] = fields.errorType;

  return log;
}

export function logInfo(fields: LogFields): void {
  process.stdout.write(JSON.stringify(toEcs({ ...fields, level: 'info' })) + '\n');
}

export function logWarn(fields: LogFields): void {
  process.stdout.write(JSON.stringify(toEcs({ ...fields, level: 'warn' })) + '\n');
}

export function logError(fields: LogFields): void {
  process.stderr.write(JSON.stringify(toEcs({ ...fields, level: 'error' })) + '\n');
}

export interface Logger {
  info(fields: Omit<LogFields, 'service'>): void;
  warn(fields: Omit<LogFields, 'service'>): void;
  error(fields: Omit<LogFields, 'service'>): void;
}

export function createLogger(serviceName?: string): Logger {
  const service = serviceName ?? process.env.SERVICE_NAME ?? 'unknown';
  return {
    info: (f) => logInfo({ ...f, service } as LogFields),
    warn: (f) => logWarn({ ...f, service } as LogFields),
    error: (f) => logError({ ...f, service } as LogFields),
  };
}
