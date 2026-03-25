import * as dotenv from 'dotenv';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.WEB_URL || 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  let port = 3001;
  try {
    port = parseInt(new URL(apiUrl).port) || 3001;
  } catch (e) {
    console.warn('Invalid NEXT_PUBLIC_API_URL, using default port 3001');
  }

  await app.listen(port);
  console.log(`API is running on: ${apiUrl}`);
}

bootstrap();
