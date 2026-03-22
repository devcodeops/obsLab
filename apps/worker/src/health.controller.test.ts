import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@nestjs/common', () => ({
  Controller: () => () => {},
  Get: () => () => {},
}));

import { HealthController } from './health.controller';

describe('HealthController', () => {
  const originalEnv = process.env.SERVICE_NAME;

  afterEach(() => {
    process.env.SERVICE_NAME = originalEnv;
  });

  it('returns ok status with service name and timestamp', () => {
    process.env.SERVICE_NAME = 'svc-beta';
    const controller = new HealthController();
    const result = controller.health();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('svc-beta');
    expect(new Date(result.time).getTime()).not.toBeNaN();
  });

  it('defaults service name to "worker" when env not set', () => {
    delete process.env.SERVICE_NAME;
    const controller = new HealthController();
    expect(controller.health().service).toBe('worker');
  });
});
