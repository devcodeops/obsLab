import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  private readonly serviceName = process.env.SERVICE_NAME ?? 'worker';

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: this.serviceName,
      time: new Date().toISOString(),
    };
  }
}
