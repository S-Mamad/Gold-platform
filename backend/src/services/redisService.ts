import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { parseQuote, quoteFromMid, type SideQuote } from '../domain/checks';

const LIVE_GOLD_PRICE_KEY = 'live_gold_price';
const LIVE_GOLD_PRICE_AT_KEY = 'live_gold_price_at';
const LIVE_GOLD_SOURCE_KEY = 'live_gold_source';
const PRICE_HISTORY_KEY = 'gold_price_history';
const LOCKED_PRICE_PREFIX = 'locked_price:';
const SESSION_PREFIX = 'session:';
const PRICE_FREEZE_TTL_SECONDS = Number(
  process.env.GOLD_PRICE_FREEZE_SECONDS ?? 120,
);

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  /**
   * Updates the global live price of 1 gram of gold (Riyal per gram).
   * Usually called by a cron/job that fetches a third-party market feed.
   * Stored as a string to avoid binary float drift in Redis.
   */
  async updateLiveGoldPrice(price: number, source: string): Promise<void> {
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Live gold price must be a positive finite number');
    }
    const stored = price.toFixed(4);
    const at = new Date().toISOString();
    await this.client
      .multi()
      .set(LIVE_GOLD_PRICE_KEY, stored)
      .set(LIVE_GOLD_PRICE_AT_KEY, at)
      .set(LIVE_GOLD_SOURCE_KEY, source)
      .lpush(PRICE_HISTORY_KEY, JSON.stringify({ price: Number(stored), at }))
      .ltrim(PRICE_HISTORY_KEY, 0, 499)
      .exec();
  }

  async getLiveGoldPrice(): Promise<number | null> {
    const value = await this.client.get(LIVE_GOLD_PRICE_KEY);
    if (value === null) return null;
    const price = Number(value);
    return Number.isFinite(price) ? price : null;
  }

  async getPriceMeta(): Promise<{
    price: number | null;
    at: string | null;
    source: string | null;
  }> {
    const [price, at, source] = await this.client.mget(
      LIVE_GOLD_PRICE_KEY,
      LIVE_GOLD_PRICE_AT_KEY,
      LIVE_GOLD_SOURCE_KEY,
    );
    const n = price === null ? null : Number(price);
    return {
      price: n !== null && Number.isFinite(n) ? n : null,
      at,
      source,
    };
  }

  async getPriceHistory(limit = 120): Promise<Array<{ price: number; at: string }>> {
    const rows = await this.client.lrange(
      PRICE_HISTORY_KEY,
      0,
      Math.min(Math.max(limit, 1), 500) - 1,
    );
    const points: Array<{ price: number; at: string }> = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row) as { price: number; at: string };
        if (Number.isFinite(parsed.price)) points.push(parsed);
      } catch {
        continue;
      }
    }
    return points.reverse();
  }

  async freezeQuoteForUser(
    userId: string,
    quote: SideQuote,
  ): Promise<void> {
    await this.client.set(
      `${LOCKED_PRICE_PREFIX}${userId}`,
      JSON.stringify(quote),
      'EX',
      PRICE_FREEZE_TTL_SECONDS,
    );
  }

  /**
   * Takes the quote away in one step. A second concurrent trade sees nothing.
   */
  async claimQuoteForUser(userId: string): Promise<SideQuote | null> {
    const raw = await this.client.getdel(`${LOCKED_PRICE_PREFIX}${userId}`);
    return parseQuote(raw);
  }

  buildQuote(
    mid: number,
    buySpreadBps: number,
    sellSpreadBps: number,
    feeBps: number,
  ): SideQuote {
    try {
      return quoteFromMid(mid, buySpreadBps, sellSpreadBps, feeBps);
    } catch {
      throw new ServiceUnavailableException('Live gold price is invalid');
    }
  }

  async saveSession(jti: string, userId: string, ttlSeconds: number) {
    await this.client.set(`${SESSION_PREFIX}${jti}`, userId, 'EX', ttlSeconds);
  }

  async readSession(jti: string): Promise<string | null> {
    return this.client.get(`${SESSION_PREFIX}${jti}`);
  }

  async deleteSession(jti: string) {
    await this.client.del(`${SESSION_PREFIX}${jti}`);
  }

  async bumpCounter(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) await this.client.expire(key, ttlSeconds);
    return count;
  }

  async counter(key: string): Promise<number> {
    const value = await this.client.get(key);
    return value ? Number(value) : 0;
  }
}
