import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { logInfo } from '@obslab/shared';
import { AppModule } from './app.module';
import { JsonLoggingInterceptor } from './logging.interceptor';

async function bootstrap() {
  const serviceName = process.env.SERVICE_NAME ?? 'worker';
  const port = parseInt(process.env.WORKER_PORT ?? '3011', 10);

  const app = await NestFactory.create(AppModule, { logger: false });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.useGlobalInterceptors(new JsonLoggingInterceptor(serviceName));
  app.enableCors();

  if (process.env.ENABLE_SWAGGER !== 'false') {
    const config = new DocumentBuilder()
      .setTitle(`obsLab Worker (${serviceName})`)
      .setDescription('Unified worker service for obsLab')
      .setVersion('0.1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(port, '0.0.0.0');

  logInfo({
    service: serviceName,
    msg: `${serviceName} listening on 0.0.0.0:${port}`,
  });

  const shutdown = async (signal: string) => {
    logInfo({ service: serviceName, msg: `Received ${signal}, shutting down gracefully` });
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
