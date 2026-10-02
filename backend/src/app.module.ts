import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/app-config.module';
import { AdminController } from './controllers/adminController';
import { AuthController } from './controllers/authController';
import { GoldController } from './controllers/goldController';
import { HealthController } from './controllers/healthController';
import { WalletController } from './controllers/walletController';
import { AdminGuard } from './middleware/adminGuard';
import { AuthMiddleware, KycGuard } from './middleware/authMiddleware';
import { PrismaModule } from './prisma/prisma.module';
import { AuthService } from './services/authService';
import { GoldPriceService } from './services/goldPriceService';
import { GoldService } from './services/goldService';
import { IdempotencyService } from './services/idempotencyService';
import { OtpService } from './services/otpService';
import { RedisModule } from './services/redis.module';
import { WalletService } from './services/walletService';

@Module({
  imports: [
    AppConfigModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    RedisModule,
  ],
  controllers: [
    AppController,
    AuthController,
    GoldController,
    WalletController,
    HealthController,
    AdminController,
  ],
  providers: [
    AppService,
    GoldService,
    GoldPriceService,
    WalletService,
    OtpService,
    AuthService,
    IdempotencyService,
    AuthMiddleware,
    KycGuard,
    AdminGuard,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
