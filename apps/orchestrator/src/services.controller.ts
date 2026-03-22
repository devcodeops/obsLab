import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { callJson } from '@obslab/shared';
import { SERVICE_URLS } from './runs.service';
import { ChaosConfigUpdateDto, TerminateServiceDto } from './dto';

const WORKER_SERVICES = ['alpha', 'beta', 'gamma'] as const;
const KILLABLE_SERVICES = WORKER_SERVICES;

interface ServiceStatus {
  name: string;
  url: string;
  healthy: boolean;
  health?: unknown;
  chaosConfig?: unknown;
  error?: string;
}

@Controller('services')
export class ServicesController {
  @Get()
  async listServices() {
    const services: ServiceStatus[] = await Promise.all(
      WORKER_SERVICES.map(async (name) => {
        const url = SERVICE_URLS[name];
        const status: ServiceStatus = { name, url, healthy: false };

        try {
          const healthResult = await callJson({
            method: 'GET',
            url: `${url}/health`,
            timeoutMs: 1000,
          });
          status.healthy = healthResult.ok;
          status.health = healthResult.data;
        } catch {
          status.healthy = false;
        }

        try {
          const chaosResult = await callJson({
            method: 'GET',
            url: `${url}/config/chaos`,
            timeoutMs: 1000,
          });
          if (chaosResult.ok) {
            status.chaosConfig = chaosResult.data;
          }
        } catch {
          // ignore chaos config fetch failure
        }

        return status;
      }),
    );

    return { services };
  }

  @Get('kill-targets')
  async getKillTargets() {
    const targets = await Promise.all(
      KILLABLE_SERVICES.map(async (name) => {
        const url = SERVICE_URLS[name];
        let healthy = false;

        try {
          const result = await callJson({
            method: 'GET',
            url: `${url}/health`,
            timeoutMs: 1000,
          });
          healthy = result.ok;
        } catch {
          healthy = false;
        }

        return { name, url, healthy };
      }),
    );

    return { targets };
  }

  @Post(':name/chaos')
  async updateChaos(
    @Param('name') name: string,
    @Body() dto: ChaosConfigUpdateDto,
  ) {
    const url = this.resolveServiceUrl(name);

    const result = await callJson({
      method: 'POST',
      url: `${url}/config/chaos`,
      body: dto,
      timeoutMs: 3000,
    });

    if (!result.ok) {
      throw new BadRequestException(
        `Failed to update chaos config for ${name}: ${result.errorMessage}`,
      );
    }

    return result.data;
  }

  @Post(':name/chaos/reset')
  async resetChaos(@Param('name') name: string) {
    const url = this.resolveServiceUrl(name);

    const result = await callJson({
      method: 'POST',
      url: `${url}/config/chaos/reset`,
      timeoutMs: 3000,
    });

    if (!result.ok) {
      throw new BadRequestException(
        `Failed to reset chaos config for ${name}: ${result.errorMessage}`,
      );
    }

    return result.data;
  }

  @Post(':name/terminate')
  async terminateService(
    @Param('name') name: string,
    @Body() dto: TerminateServiceDto,
  ) {
    const url = this.resolveServiceUrl(name);

    const result = await callJson({
      method: 'POST',
      url: `${url}/chaos/terminate`,
      body: dto,
      timeoutMs: 3000,
    });

    if (!result.ok) {
      throw new BadRequestException(
        `Failed to terminate ${name}: ${result.errorMessage}`,
      );
    }

    return result.data;
  }

  private resolveServiceUrl(name: string): string {
    const url = SERVICE_URLS[name];
    if (!url) {
      throw new BadRequestException(
        `Unknown service: ${name}. Valid services: ${Object.keys(SERVICE_URLS).join(', ')}`,
      );
    }
    return url;
  }
}
