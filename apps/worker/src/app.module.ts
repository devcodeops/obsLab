import { Module } from '@nestjs/common';
import { WorkController } from './work.controller';
import { ChaosController } from './chaos.controller';
import { HealthController } from './health.controller';
import { ChaosStore } from './chaos.store';
import { WorkService } from './work.service';

@Module({
  controllers: [WorkController, ChaosController, HealthController],
  providers: [ChaosStore, WorkService],
})
export class AppModule {}
