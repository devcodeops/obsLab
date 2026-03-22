import { Controller, Get, Post, Body } from '@nestjs/common';
import { logInfo } from '@obslab/shared';
import { ChaosStore } from './chaos.store';
import { ChaosConfigDto, TerminateDto } from './dto';

@Controller()
export class ChaosController {
  private readonly serviceName = process.env.SERVICE_NAME ?? 'worker';

  constructor(private readonly chaosStore: ChaosStore) {}

  @Get('config/chaos')
  getConfig() {
    return this.chaosStore.get();
  }

  @Post('config/chaos')
  updateConfig(@Body() dto: ChaosConfigDto) {
    return this.chaosStore.update(dto as any);
  }

  @Post('config/chaos/reset')
  resetConfig() {
    return this.chaosStore.reset();
  }

  @Post('chaos/terminate')
  terminate(@Body() dto: TerminateDto) {
    const signal = (dto.signal ?? 'SIGTERM') as NodeJS.Signals;
    // Minimum 500ms delay so the HTTP response is flushed before the process dies
    const delayMs = Math.max(dto.delayMs ?? 500, 500);

    logInfo({
      service: this.serviceName,
      msg: `Terminate requested — signal=${signal}, delayMs=${delayMs}, pid=${process.pid}`,
    });

    setTimeout(() => {
      logInfo({
        service: this.serviceName,
        msg: `Sending ${signal} to shut down`,
      });
      process.kill(process.pid, signal);
    }, delayMs);

    return {
      accepted: true,
      service: this.serviceName,
      signal,
      delayMs,
      pid: process.pid,
    };
  }
}
