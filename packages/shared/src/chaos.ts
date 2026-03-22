import { ChaosConfig } from './types';

export interface ChaosOutcome {
  shouldFail: boolean;
  statusCode?: number;
  errorMessage?: string;
  simulatedLatencyMs: number;
  shouldTimeout: boolean;
}

/** Evaluate a chaos configuration and return what should happen to the current request */
export function evaluateChaos(config: ChaosConfig, timeoutMs: number): ChaosOutcome {
  const base: ChaosOutcome = {
    shouldFail: false,
    simulatedLatencyMs: 0,
    shouldTimeout: false,
  };

  switch (config.mode) {
    case 'normal':
      return base;

    case 'forceStatus':
      return {
        ...base,
        shouldFail: true,
        statusCode: config.forceStatusCode ?? 500,
        errorMessage: `Chaos: forced status ${config.forceStatusCode ?? 500}`,
      };

    case 'probabilisticError': {
      const prob = config.errorProbability ?? 0;
      if (Math.random() < prob) {
        return {
          ...base,
          shouldFail: true,
          statusCode: 500,
          errorMessage: `Chaos: probabilistic error (p=${prob})`,
        };
      }
      return base;
    }

    case 'latency': {
      let latency = config.fixedLatencyMs ?? 0;
      if (config.randomLatencyMinMs != null && config.randomLatencyMaxMs != null) {
        const min = config.randomLatencyMinMs;
        const max = config.randomLatencyMaxMs;
        latency += min + Math.floor(Math.random() * (max - min + 1));
      }
      return { ...base, simulatedLatencyMs: latency };
    }

    case 'timeout': {
      const prob = config.timeoutProbability ?? 0;
      if (Math.random() < prob) {
        return { ...base, shouldTimeout: true, simulatedLatencyMs: timeoutMs + 1500 };
      }
      return base;
    }

    default:
      return base;
  }
}

/** Async sleep helper */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
