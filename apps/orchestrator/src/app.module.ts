import { Module } from '@nestjs/common';
import { RunsController } from './runs.controller';
import { ServicesController } from './services.controller';
import { RunsService } from './runs.service';
import { StreamService } from './stream.service';

@Module({
  controllers: [RunsController, ServicesController],
  providers: [RunsService, StreamService],
})
export class AppModule {}
