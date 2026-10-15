import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const origin = process.env.CORS_ORIGIN;
  if (origin) app.enableCors({ origin: origin.split(',') });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  // Só localhost: quem expõe para fora é o Caddy (ou o Cloudflare Tunnel).
  await app.listen(port, process.env.HOST ?? '127.0.0.1');
  Logger.log(`API ouvindo em http://${process.env.HOST ?? '127.0.0.1'}:${port}/api`, 'Bootstrap');
}
bootstrap();
