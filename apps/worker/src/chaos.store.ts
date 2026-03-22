import { Injectable } from '@nestjs/common';
import type { ChaosConfig, ChaosMode } from '@obslab/shared';

@Injectable()
export class ChaosStore {
  private config: ChaosConfig;

  constructor() {
    this.config = this.defaults();
  }

  private defaults(): ChaosConfig {
    return {
      serviceName: process.env.SERVICE_NAME ?? 'worker',
      mode: 'normal' as ChaosMode,
      forceStatusCode: null,
      errorProbability: null,
      fixedLatencyMs: null,
      randomLatencyMinMs: null,
      randomLatencyMaxMs: null,
      timeoutProbability: null,
    };
  }

  get(): ChaosConfig & { updatedAt: string } {
    return {
      ...this.config,
      updatedAt: new Date().toISOString(),
    };
  }

  update(dto: Partial<ChaosConfig>): ChaosConfig & { updatedAt: string } {
    if (dto.mode !== undefined) this.config.mode = dto.mode;
    if (dto.forceStatusCode !== undefined) this.config.forceStatusCode = dto.forceStatusCode;
    if (dto.errorProbability !== undefined) this.config.errorProbability = dto.errorProbability;
    if (dto.fixedLatencyMs !== undefined) this.config.fixedLatencyMs = dto.fixedLatencyMs;
    if (dto.randomLatencyMinMs !== undefined) this.config.randomLatencyMinMs = dto.randomLatencyMinMs;
    if (dto.randomLatencyMaxMs !== undefined) this.config.randomLatencyMaxMs = dto.randomLatencyMaxMs;
    if (dto.timeoutProbability !== undefined) this.config.timeoutProbability = dto.timeoutProbability;
    return this.get();
  }

  reset(): ChaosConfig & { updatedAt: string } {
    this.config = this.defaults();
    return this.get();
  }
}
