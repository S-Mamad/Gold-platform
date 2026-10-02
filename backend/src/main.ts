import { randomUUID } from 'crypto';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { PersianExceptionFilter } from './filters/persian-exception.filter';

const PLACEHOLDER_SECRETS = new Set([
  'change_me_in_production',
  'change_me_admin_key',
  'change_me_to_a_long_random_secret_in_production',
  'CHANGE_ME_LONG_RANDOM_SECRET',
  'CHANGE_ME_ADMIN_KEY',
]);

function assertProductionSecrets(config: AppConfigService) {
  if (!config.isProduction) return;
  const jwt = config.jwtSecret;
  const admin = config.adminApiKey ?? '';
  if (
    jwt.length < 32 ||
    PLACEHOLDER_SECRETS.has(jwt) ||
    admin.length < 16 ||
    PLACEHOLDER_SECRETS.has(admin)
  ) {
    throw new Error(
      'Refusing to boot: JWT_SECRET and ADMIN_API_KEY must be long unique values',
    );
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);
  assertProductionSecrets(config);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && incoming.length > 0 && incoming.length < 80
        ? incoming
        : randomUUID();
    res.setHeader('x-request-id', requestId);
    next();
  });

  app.setGlobalPrefix('api');

  app.use(
    helmet({
      contentSecurityPolicy: config.isProduction ? undefined : false,
    }),
  );

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new PersianExceptionFilter());

  await app.listen(config.port);
  console.log(`Gold trading API listening on http://localhost:${config.port}`);
}
bootstrap();
