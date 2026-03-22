import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { prisma } from '@obslab/db';
import { callJson, logInfo, logError } from '@obslab/shared';
import { StreamService } from './stream.service';
import { CreateRunDto } from './dto';

const SVC_ALPHA_URL = process.env.SVC_ALPHA_URL ?? 'http://svc-alpha:3011';
const SVC_BETA_URL = process.env.SVC_BETA_URL ?? 'http://svc-beta:3012';
const SVC_GAMMA_URL = process.env.SVC_GAMMA_URL ?? 'http://svc-gamma:3013';
const WEB_URL = process.env.WEB_URL ?? 'http://web:3000';
const ORCHESTRATOR_SELF_URL =
  process.env.ORCHESTRATOR_SELF_URL ?? 'http://orchestrator:3001';

/** Available service URLs by name */
export const SERVICE_URLS: Record<string, string> = {
  alpha: SVC_ALPHA_URL,
  beta: SVC_BETA_URL,
  gamma: SVC_GAMMA_URL,
  web: WEB_URL,
  orchestrator: ORCHESTRATOR_SELF_URL,
};

interface DownstreamCall {
  callId: string;
  parentCallId: string | null;
  requestId: string;
  fromService: string;
  toService: string;
  route: string;
  method: string;
  statusCode: number | null;
  durationMs: number;
  errorType: string | null;
  errorMessage: string | null;
}

interface WorkResponse {
  downstream?: DownstreamCall[];
  [key: string]: unknown;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Operation timed out')),
      ms,
    );
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

@Injectable()
export class RunsService {
  constructor(private readonly streamService: StreamService) {}

  async executeRun(runId: string, dto: CreateRunDto): Promise<void> {
    const retries = dto.retryPolicy?.retries ?? 0;
    const backoffMs = dto.retryPolicy?.backoffMs ?? 0;
    const timeoutMs =
      (retries + 1) * dto.clientTimeoutMs + retries * backoffMs + 3000;

    let totalCalls = 0;
    let successCalls = 0;
    let errorCalls = 0;
    let timeoutCalls = 0;
    const latencies: number[] = [];

    // Shared iteration queue
    let nextIteration = 0;
    const totalIterations = dto.iterations;

    const worker = async () => {
      while (true) {
        const iteration = nextIteration++;
        if (iteration >= totalIterations) break;

        try {
          const result = await withTimeout(
            this.executeIteration(runId, dto, iteration, retries, backoffMs),
            timeoutMs,
          );

          totalCalls++;
          if (result.ok) {
            successCalls++;
          } else if (result.errorType === 'timeout') {
            timeoutCalls++;
          } else {
            errorCalls++;
          }
          latencies.push(result.durationMs);

          // Record root call to DB
          await prisma.call.create({
            data: {
              id: result.callId,
              runId,
              parentCallId: null,
              requestId: result.requestId,
              fromService: 'orchestrator',
              toService: 'alpha',
              route: '/work',
              method: 'POST',
              statusCode: result.statusCode ?? null,
              durationMs: result.durationMs,
              errorType: result.errorType ?? null,
              errorMessage: result.errorMessage ?? null,
            },
          });

          // Record downstream calls if present
          if (result.downstream && result.downstream.length > 0) {
            await prisma.call.createMany({
              data: result.downstream.map((d: any) => ({
                id: d.callId,
                runId,
                parentCallId: d.parentCallId ?? result.callId,
                requestId: d.requestId ?? result.requestId,
                fromService: d.fromService ?? 'svc-alpha',
                toService: d.toService ?? d.service ?? 'unknown',
                route: d.route ?? '/work',
                method: d.method ?? 'POST',
                statusCode: d.statusCode ?? null,
                durationMs: d.durationMs ?? 0,
                errorType: d.errorType ?? null,
                errorMessage: d.errorMessage ?? null,
              })),
              skipDuplicates: true,
            });
          }

          this.streamService.emit(runId, {
            type: 'call_completed',
            iteration,
            ok: result.ok,
            durationMs: result.durationMs,
            errorType: result.errorType,
            total: totalCalls,
            success: successCalls,
            error: errorCalls,
            timeout: timeoutCalls,
          });
        } catch (err) {
          totalCalls++;
          timeoutCalls++;
          const durationMs = timeoutMs;
          latencies.push(durationMs);

          this.streamService.emit(runId, {
            type: 'call_completed',
            iteration,
            ok: false,
            durationMs,
            errorType: 'timeout',
            total: totalCalls,
            success: successCalls,
            error: errorCalls,
            timeout: timeoutCalls,
          });
        }
      }
    };

    try {
      // Create worker pool
      const workers = Array.from(
        { length: Math.min(dto.concurrency, totalIterations) },
        () => worker(),
      );
      await Promise.all(workers);

      const p50 = percentile(latencies, 50);
      const p95 = percentile(latencies, 95);

      await prisma.run.update({
        where: { id: runId },
        data: {
          status: 'completed',
          finishedAt: new Date(),
          totalCalls,
          successCalls,
          errorCalls,
          timeoutCalls,
          p50LatencyMs: p50,
          p95LatencyMs: p95,
        },
      });

      this.streamService.emit(runId, {
        type: 'run_completed',
        status: 'completed',
        totalCalls,
        successCalls,
        errorCalls,
        timeoutCalls,
        p50LatencyMs: p50,
        p95LatencyMs: p95,
      });
      this.streamService.emitGlobal({
        type: 'run_completed',
        runId,
        status: 'completed',
        totalCalls,
        successCalls,
        errorCalls,
        timeoutCalls,
      });
      this.streamService.complete(runId);

      logInfo({
        service: 'orchestrator',
        runId,
        msg: `Run completed: ${successCalls}/${totalCalls} succeeded`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      await prisma.run.update({
        where: { id: runId },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          totalCalls,
          successCalls,
          errorCalls,
          timeoutCalls,
        },
      });

      this.streamService.emit(runId, {
        type: 'run_completed',
        status: 'failed',
        error: message,
      });
      this.streamService.emitGlobal({
        type: 'run_failed',
        runId,
        error: message,
      });
      this.streamService.complete(runId);

      logError({
        service: 'orchestrator',
        runId,
        msg: `Run failed: ${message}`,
        errorMessage: message,
      });
    }
  }

  private async executeIteration(
    runId: string,
    dto: CreateRunDto,
    iteration: number,
    retries: number,
    backoffMs: number,
  ): Promise<{
    ok: boolean;
    callId: string;
    requestId: string;
    statusCode?: number;
    durationMs: number;
    errorType?: string;
    errorMessage?: string;
    downstream?: DownstreamCall[];
  }> {
    const requestId = randomUUID();
    let lastResult: Awaited<ReturnType<typeof callJson<WorkResponse>>> | null =
      null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0 && backoffMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }

      const result = await callJson<WorkResponse>({
        method: 'POST',
        url: `${SVC_ALPHA_URL}/work`,
        body: {
          payloadSize: dto.payloadSize,
          data: { iteration },
          workflow: dto.workflow,
          clientTimeoutMs: dto.clientTimeoutMs,
        },
        timeoutMs: dto.clientTimeoutMs,
        correlation: { requestId, runId },
      });

      lastResult = result;

      if (result.ok) {
        return {
          ok: true,
          callId: result.callId,
          requestId,
          statusCode: result.statusCode,
          durationMs: result.durationMs,
          downstream: result.data?.downstream,
        };
      }

      // Don't retry on timeouts
      if (result.errorType === 'timeout') {
        return {
          ok: false,
          callId: result.callId,
          requestId,
          statusCode: result.statusCode,
          durationMs: result.durationMs,
          errorType: result.errorType,
          errorMessage: result.errorMessage,
        };
      }
    }

    // All retries exhausted
    return {
      ok: false,
      callId: lastResult!.callId,
      requestId,
      statusCode: lastResult!.statusCode,
      durationMs: lastResult!.durationMs,
      errorType: lastResult!.errorType,
      errorMessage: lastResult!.errorMessage,
      downstream: lastResult!.data?.downstream,
    };
  }
}
