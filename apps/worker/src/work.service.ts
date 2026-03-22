import { Injectable } from '@nestjs/common';
import {
  callJson,
  getCorrelationFromHeaders,
  extractPropagationHeaders,
  type HttpCallResult,
} from '@obslab/shared';
import { WorkDto } from './dto';

export interface DownstreamResult {
  callId: string;
  service: string;
  ok: boolean;
  statusCode?: number;
  durationMs: number;
  errorType?: string;
  errorMessage?: string;
  data?: unknown;
}

@Injectable()
export class WorkService {
  private readonly serviceName = process.env.SERVICE_NAME ?? 'worker';
  private readonly svcBetaUrl = process.env.SVC_BETA_URL ?? 'http://svc-beta:3012';
  private readonly svcGammaUrl = process.env.SVC_GAMMA_URL ?? 'http://svc-gamma:3013';

  async executeWorkflow(
    dto: WorkDto,
    incomingHeaders: Record<string, string>,
  ) {
    const correlation = getCorrelationFromHeaders(incomingHeaders);
    const propagationHeaders = extractPropagationHeaders(incomingHeaders);
    const timeoutMs = dto.clientTimeoutMs ?? 2000;

    switch (dto.workflow) {
      case 'chain':
        return this.chain(dto, correlation, propagationHeaders, timeoutMs);
      case 'fanout':
        return this.fanout(dto, correlation, propagationHeaders, timeoutMs);
      case 'fanout-fanin':
        return this.fanoutFanin(dto, correlation, propagationHeaders, timeoutMs);
      case 'random':
        return this.random(dto, correlation, propagationHeaders, timeoutMs);
      default:
        return this.chain(dto, correlation, propagationHeaders, timeoutMs);
    }
  }

  private async chain(
    dto: WorkDto,
    correlation: { requestId: string; runId?: string; callId?: string; parentCallId?: string },
    propagationHeaders: Record<string, string>,
    timeoutMs: number,
  ) {
    const budget = Math.max(timeoutMs / 2, 150);
    const body = { payloadSize: dto.payloadSize, data: dto.data, clientTimeoutMs: budget };

    const betaResult = await this.callDownstream(
      this.svcBetaUrl,
      body,
      correlation,
      propagationHeaders,
      budget,
    );

    const gammaResult = await this.callDownstream(
      this.svcGammaUrl,
      body,
      correlation,
      propagationHeaders,
      budget,
      betaResult.callId,
    );

    return {
      ok: true,
      service: this.serviceName,
      workflow: 'chain',
      downstream: [betaResult, gammaResult],
    };
  }

  private async fanout(
    dto: WorkDto,
    correlation: { requestId: string; runId?: string; callId?: string; parentCallId?: string },
    propagationHeaders: Record<string, string>,
    timeoutMs: number,
  ) {
    const budget = Math.max(timeoutMs / 2, 150);
    const body = { payloadSize: dto.payloadSize, data: dto.data, clientTimeoutMs: budget };

    const [betaResult, gammaResult] = await Promise.all([
      this.callDownstream(this.svcBetaUrl, body, correlation, propagationHeaders, budget),
      this.callDownstream(this.svcGammaUrl, body, correlation, propagationHeaders, budget),
    ]);

    return {
      ok: true,
      service: this.serviceName,
      workflow: 'fanout',
      downstream: [betaResult, gammaResult],
    };
  }

  private async fanoutFanin(
    dto: WorkDto,
    correlation: { requestId: string; runId?: string; callId?: string; parentCallId?: string },
    propagationHeaders: Record<string, string>,
    timeoutMs: number,
  ) {
    const budget = Math.max(timeoutMs / 3, 150);
    const body = { payloadSize: dto.payloadSize, data: dto.data, clientTimeoutMs: budget };

    const [betaResult, gammaResult] = await Promise.all([
      this.callDownstream(this.svcBetaUrl, body, correlation, propagationHeaders, budget),
      this.callDownstream(this.svcGammaUrl, body, correlation, propagationHeaders, budget),
    ]);

    const joinResult = await this.callDownstream(
      this.svcBetaUrl,
      { data: { join: true }, clientTimeoutMs: budget },
      correlation,
      propagationHeaders,
      budget,
    );

    return {
      ok: true,
      service: this.serviceName,
      workflow: 'fanout-fanin',
      downstream: [betaResult, gammaResult, joinResult],
    };
  }

  private async random(
    dto: WorkDto,
    correlation: { requestId: string; runId?: string; callId?: string; parentCallId?: string },
    propagationHeaders: Record<string, string>,
    timeoutMs: number,
  ) {
    const budget = Math.max(timeoutMs / 3, 150);
    const count = 1 + Math.floor(Math.random() * 3);
    const urls = [this.svcBetaUrl, this.svcGammaUrl];

    const promises = Array.from({ length: count }, () => {
      const url = urls[Math.floor(Math.random() * urls.length)];
      const body = { payloadSize: dto.payloadSize, data: dto.data, clientTimeoutMs: budget };
      return this.callDownstream(url, body, correlation, propagationHeaders, budget);
    });

    const results = await Promise.all(promises);

    return {
      ok: true,
      service: this.serviceName,
      workflow: 'random',
      downstream: results,
    };
  }

  private async callDownstream(
    baseUrl: string,
    body: unknown,
    correlation: { requestId: string; runId?: string; callId?: string; parentCallId?: string },
    propagationHeaders: Record<string, string>,
    timeoutMs: number,
    parentCallId?: string,
  ): Promise<DownstreamResult> {
    const url = `${baseUrl}/work`;
    const serviceName = this.extractServiceName(baseUrl);

    const result: HttpCallResult & { callId: string } = await callJson({
      method: 'POST',
      url,
      body,
      timeoutMs,
      correlation,
      parentCallId,
      propagationHeaders,
    });

    return {
      callId: result.callId,
      service: serviceName,
      ok: result.ok,
      statusCode: result.statusCode,
      durationMs: result.durationMs,
      errorType: result.errorType,
      errorMessage: result.errorMessage,
      data: result.data,
    };
  }

  private extractServiceName(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return url;
    }
  }
}
