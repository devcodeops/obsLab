import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RetryPolicyDto {
  @IsInt()
  @Min(0)
  @Max(5)
  retries!: number;

  @IsInt()
  @Min(0)
  @Max(5000)
  backoffMs!: number;
}

export class CreateRunDto {
  @IsIn(['chain', 'fanout', 'fanout-fanin', 'random'])
  workflow!: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  iterations!: number;

  @IsInt()
  @Min(1)
  @Max(100)
  concurrency!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10240)
  payloadSize?: number;

  @IsInt()
  @Min(100)
  @Max(20000)
  clientTimeoutMs!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => RetryPolicyDto)
  retryPolicy?: RetryPolicyDto;
}

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class ChaosConfigUpdateDto {
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

export class TerminateServiceDto {
  @IsOptional()
  @IsIn(['SIGTERM', 'SIGKILL'])
  signal?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30000)
  delayMs?: number;
}
