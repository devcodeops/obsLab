import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { getCorrelationFromHeaders, logInfo } from '@obslab/shared';

@Injectable()
export class JsonLoggingInterceptor implements NestInterceptor {
  constructor(private readonly serviceName: string) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();
    const start = Date.now();
    const correlation = getCorrelationFromHeaders(req.headers ?? {});

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - start;
        logInfo({
          service: this.serviceName,
          requestId: correlation.requestId,
          runId: correlation.runId,
          callId: correlation.callId,
          route: req.originalUrl,
          method: req.method,
          statusCode: res.statusCode,
          durationMs,
          msg: `${req.method} ${req.originalUrl} ${res.statusCode}`,
        });
      }),
      catchError((err) => {
        const durationMs = Date.now() - start;
        logInfo({
          service: this.serviceName,
          requestId: correlation.requestId,
          runId: correlation.runId,
          callId: correlation.callId,
          route: req.originalUrl,
          method: req.method,
          durationMs,
          errorType: err.name ?? 'Error',
          errorMessage: err.message ?? String(err),
          msg: `${req.method} ${req.originalUrl} ERROR`,
        });
        return throwError(() => err);
      }),
    );
  }
}
