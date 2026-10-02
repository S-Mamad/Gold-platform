import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  get nodeEnv(): string {
    return this.config.get<string>('NODE_ENV', 'development');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get port(): number {
    return Number(this.config.get<string>('PORT', '3001'));
  }

  get jwtSecret(): string {
    return this.config.getOrThrow<string>('JWT_SECRET');
  }

  get jwtExpiresIn(): string {
    return this.config.get<string>('JWT_EXPIRES_IN', '7d');
  }

  get corsOrigins(): string[] {
    const raw = this.config.get<string>(
      'CORS_ORIGIN',
      'http://localhost:3000,http://localhost:3002,http://localhost:3003',
    );
    return raw.split(',').map((o) => o.trim());
  }

  get adminApiKey(): string | undefined {
    return this.config.get<string>('ADMIN_API_KEY');
  }

  get defaultGoldPrice(): number {
    return Number(this.config.get<string>('DEFAULT_GOLD_PRICE', '4250000'));
  }

  get buySpreadBps(): number {
    return Number(this.config.get<string>('BUY_SPREAD_BPS', '50'));
  }

  get sellSpreadBps(): number {
    return Number(this.config.get<string>('SELL_SPREAD_BPS', '50'));
  }

  get feeBps(): number {
    return Number(this.config.get<string>('FEE_BPS', '20'));
  }

  get priceSource(): 'simulated' | 'http' {
    return this.config.get<string>('GOLD_PRICE_SOURCE', 'simulated') === 'http'
      ? 'http'
      : 'simulated';
  }

  get goldPriceUrl(): string | undefined {
    return this.config.get<string>('GOLD_PRICE_URL');
  }

  get priceMaxAgeSeconds(): number {
    return Number(this.config.get<string>('GOLD_PRICE_MAX_AGE_SECONDS', '180'));
  }

  get allowSimulatedInProduction(): boolean {
    return this.config.get<string>('GOLD_ALLOW_SIMULATED', 'false') === 'true';
  }

  get paymentMode(): 'sandbox' | 'gateway' {
    const raw = this.config.get<string>('PAYMENT_MODE');
    if (raw === 'sandbox' || raw === 'gateway') return raw;
    return this.isProduction ? 'gateway' : 'sandbox';
  }

  get paymentWebhookSecret(): string | undefined {
    return this.config.get<string>('PAYMENT_WEBHOOK_SECRET');
  }

  get exposeDevOtp(): boolean {
    return (
      !this.isProduction &&
      this.config.get<string>('EXPOSE_DEV_OTP', 'false') === 'true'
    );
  }

  get cookieSecure(): boolean {
    return this.config.get<string>('COOKIE_SECURE', 'false') === 'true';
  }

  get kycMode(): 'mock' | 'live' {
    const raw = this.config.get<string>('KYC_MODE');
    if (raw === 'mock' || raw === 'live') return raw;
    return this.isProduction ? 'live' : 'mock';
  }
}
