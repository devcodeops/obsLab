import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export class WorkDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  payloadSize?: number;

  @IsOptional()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['chain', 'fanout', 'fanout-fanin', 'random'])
  workflow: string = 'chain';

  @IsOptional()
  @IsInt()
  @Min(100)
  clientTimeoutMs: number = 2000;
}

export class ChaosConfigDto {
  @IsIn(['normal', 'forceStatus', 'probabilisticError', 'latency', 'timeout'])
  mode!: string;

  @IsOptional()
  @IsInt()
  @Min(400)
  @Max(599)
  forceStatusCode?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  errorProbability?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  fixedLatencyMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  randomLatencyMinMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  randomLatencyMaxMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  timeoutProbability?: number;
}

export class TerminateDto {
  @IsOptional()
  @IsIn(['SIGTERM', 'SIGKILL'])
  signal?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30000)
  delayMs?: number;
}
