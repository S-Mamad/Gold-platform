import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfigService } from '../config/app-config.service';
import { RedisService } from './redisService';

export type MarketSnapshot = {
  pricePerGram: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
  feeBps: number;
  source: 'simulated' | 'feed' | 'none';
  stale: boolean;
  quotedAt: string | null;
  paymentMode: 'sandbox' | 'gateway';
};

@Injectable()
export class GoldPriceService implements OnModuleInit {
  private readonly logger = new Logger(GoldPriceService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
  ) {}

  async onModuleInit() {
    if (
      this.config.isProduction &&
      this.config.priceSource === 'simulated' &&
      !this.config.allowSimulatedInProduction
    ) {
      throw new Error(
        'Refusing to boot: simulated gold price is not allowed in production',
      );
    }

    const current = await this.redis.getLiveGoldPrice();
    if (current === null && this.config.priceSource === 'simulated') {
      await this.redis.updateLiveGoldPrice(
        this.config.defaultGoldPrice,
        'simulated',
      );
      this.logger.log(
        `Seeded simulated gold price: ${this.config.defaultGoldPrice} Rial/gram`,
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async refreshLivePrice() {
    if (this.config.priceSource === 'http') {
      await this.pullFeed();
      return;
    }
    if (
      this.config.isProduction &&
      !this.config.allowSimulatedInProduction
    ) {
      return;
    }
    const current =
      (await this.redis.getLiveGoldPrice()) ?? this.config.defaultGoldPrice;
    const delta = current * (Math.random() * 0.003 - 0.0015);
    const next = Math.max(1, Math.round((current + delta) * 10000) / 10000);
    await this.redis.updateLiveGoldPrice(next, 'simulated');
  }

  private async pullFeed() {
    const url = this.config.goldPriceUrl;
    if (!url) {
      this.logger.error('GOLD_PRICE_URL is empty; leaving the last price in place');
      return;
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) {
        this.logger.error(`Gold feed responded ${response.status}`);
        return;
      }
      const body = (await response.json()) as {
        pricePerGram?: number;
        price?: number;
      };
      const next = Number(body.pricePerGram ?? body.price);
      if (!Number.isFinite(next) || next <= 0) {
        this.logger.error('Gold feed payload did not include a positive price');
        return;
      }
      await this.redis.updateLiveGoldPrice(next, 'feed');
    } catch (error) {
      this.logger.error(
        `Gold feed failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  async getMarket(): Promise<MarketSnapshot> {
    const meta = await this.redis.getPriceMeta();
    const ageMs = meta.at ? Date.now() - new Date(meta.at).getTime() : Infinity;
    const stale =
      meta.price === null || ageMs > this.config.priceMaxAgeSeconds * 1000;
    const quote =
      meta.price === null
        ? null
        : this.redis.buildQuote(
            meta.price,
            this.config.buySpreadBps,
            this.config.sellSpreadBps,
            this.config.feeBps,
          );
    const source =
      meta.source === 'feed'
        ? 'feed'
        : meta.source === 'simulated'
          ? 'simulated'
          : 'none';
    return {
      pricePerGram: meta.price,
      buyPrice: quote ? Number(quote.ask) : null,
      sellPrice: quote ? Number(quote.bid) : null,
      feeBps: this.config.feeBps,
      source,
      stale,
      quotedAt: meta.at,
      paymentMode: this.config.paymentMode,
    };
  }

  async lockPriceForUser(userId: string) {
    const market = await this.getMarket();
    if (
      market.pricePerGram === null ||
      market.stale ||
      market.buyPrice === null ||
      market.sellPrice === null
    ) {
      throw new ServiceUnavailableException(
        'Live gold price is not available. Try again shortly.',
      );
    }
    const quote = this.redis.buildQuote(
      market.pricePerGram,
      this.config.buySpreadBps,
      this.config.sellSpreadBps,
      this.config.feeBps,
    );
    await this.redis.freezeQuoteForUser(userId, quote);
    return {
      mid: Number(quote.mid),
      buyPrice: Number(quote.ask),
      sellPrice: Number(quote.bid),
      feeBps: quote.feeBps,
      expiresInSeconds: Number(process.env.GOLD_PRICE_FREEZE_SECONDS ?? 120),
      source: market.source,
    };
  }

  async getHistory(limit = 120) {
    return this.redis.getPriceHistory(limit);
  }
}
