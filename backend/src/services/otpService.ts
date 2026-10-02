import { Injectable, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { RedisService } from './redisService';

const OTP_PREFIX = 'otp:';
const OTP_TTL_SECONDS = 120;
const FAIL_LIMIT = 5;
const FAIL_WINDOW_SECONDS = 15 * 60;
const SEND_LIMIT = 5;
const SEND_WINDOW_SECONDS = 10 * 60;
const OTP_LENGTH = 5;

@Injectable()
export class OtpService {
  constructor(private readonly redisService: RedisService) {}

  /**
   * Generates a 5-digit OTP, stores a bcrypt hash in Redis with 2-minute TTL.
   * In production: send via SMS provider and never return the plaintext OTP.
   */
  async generateOTP(phoneNumber: string): Promise<string> {
    const normalized = this.normalizePhone(phoneNumber);
    const sends = await this.redisService.bumpCounter(
      `otp:send:${normalized}`,
      SEND_WINDOW_SECONDS,
    );
    if (sends > SEND_LIMIT) {
      throw new BadRequestException('Too many OTP requests. Try again later');
    }

    const otp = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
    const hash = await bcrypt.hash(otp, 10);

    await this.redisService.client.set(
      `${OTP_PREFIX}${normalized}`,
      hash,
      'EX',
      OTP_TTL_SECONDS,
    );

    const smsUrl = process.env.SMS_URL;
    if (smsUrl) {
      const response = await fetch(smsUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: normalized, text: `code: ${otp}` }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        await this.redisService.client.del(`${OTP_PREFIX}${normalized}`);
        throw new BadRequestException('OTP could not be delivered');
      }
    }

    return otp;
  }

  /**
   * Verifies submitted OTP against Redis. On success, deletes the key (one-time use).
   */
  async verifyOTP(phoneNumber: string, submittedOTP: string): Promise<boolean> {
    const normalized = this.normalizePhone(phoneNumber);
    const fails = await this.redisService.counter(`otp:fail:${normalized}`);
    if (fails >= FAIL_LIMIT) {
      throw new BadRequestException('Too many OTP requests. Try again later');
    }

    const key = `${OTP_PREFIX}${normalized}`;
    const storedHash = await this.redisService.client.get(key);

    if (!storedHash) {
      await this.redisService.bumpCounter(
        `otp:fail:${normalized}`,
        FAIL_WINDOW_SECONDS,
      );
      return false;
    }

    const matches = await bcrypt.compare(submittedOTP, storedHash);
    if (!matches) {
      await this.redisService.bumpCounter(
        `otp:fail:${normalized}`,
        FAIL_WINDOW_SECONDS,
      );
      return false;
    }

    await this.redisService.client.del(key);
    await this.redisService.client.del(`otp:fail:${normalized}`);
    return true;
  }

  normalizePhone(phoneNumber: string): string {
    const digits = phoneNumber.replace(/\D/g, '');
    // Accept 09xxxxxxxxx or 989xxxxxxxxx → normalize to 09xxxxxxxxx
    if (/^98(9\d{9})$/.test(digits)) {
      return `0${digits.slice(2)}`;
    }
    if (/^09\d{9}$/.test(digits)) {
      return digits;
    }
    throw new BadRequestException(
      'phoneNumber must be a valid Iranian mobile (e.g. 09123456789)',
    );
  }
}
