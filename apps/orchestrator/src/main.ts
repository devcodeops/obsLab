import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { logInfo } from '@obslab/shared';
import { AppModule } from './app.module';
import { JsonLoggingInterceptor } from './logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: false });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.useGlobalInterceptors(new JsonLoggingInterceptor('orchestrator'));
  app.enableCors();

  if (process.env.ENABLE_SWAGGER !== 'false') {
    const config = new DocumentBuilder()
      .setTitle('obsLab Orchestrator')
      .setDescription('Control plane for obsLab runs and service management')
      .setVersion('0.1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = parseInt(process.env.ORCHESTRATOR_PORT ?? '3001', 10);
  await app.listen(port, '0.0.0.0');

  logInfo({
    service: 'orchestrator',
    msg: `Orchestrator listening on 0.0.0.0:${port}`,
  });
}

bootstrap();
