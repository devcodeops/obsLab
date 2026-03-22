import {
  Controller,
  Post,
  Body,
  Headers,
  HttpException,
} from '@nestjs/common';
import { evaluateChaos, wait } from '@obslab/shared';
import { ChaosStore } from './chaos.store';
import { WorkService } from './work.service';
import { WorkDto } from './dto';

@Controller()
export class WorkController {
  private readonly serviceName = process.env.SERVICE_NAME ?? 'worker';
  private readonly isRouter = this.serviceName === 'svc-alpha';

  constructor(
    private readonly chaosStore: ChaosStore,
    private readonly workService: WorkService,
  ) {}

  @Post('work')
  async doWork(
    @Body() dto: WorkDto,
    @Headers() headers: Record<string, string>,
  ) {
    const timeoutMs = dto.clientTimeoutMs ?? 2000;
    const config = this.chaosStore.get();
    const chaos = evaluateChaos(config, timeoutMs);

    if (chaos.simulatedLatencyMs > 0) {
      await wait(chaos.simulatedLatencyMs);
    }

    if (chaos.shouldTimeout) {
      await wait(timeoutMs + 1500);
      return { ok: false, service: this.serviceName, timedOut: true };
    }

    if (chaos.shouldFail) {
      const statusCode = chaos.statusCode ?? 500;
      throw new HttpException(
        {
          ok: false,
          service: this.serviceName,
          statusCode,
          errorMessage: chaos.errorMessage ?? 'Chaos-induced failure',
        },
        statusCode,
      );
    }

    if (!this.isRouter) {
      return {
        ok: true,
        service: this.serviceName,
        echo: dto.data,
        durationSimulatedMs: chaos.simulatedLatencyMs,
      };
    }

    return this.workService.executeWorkflow(dto, headers);
  }
}
