import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { User, WalletType } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { assertAdultIsoDate } from '../domain/checks';
import { ttlFromExpiry } from '../domain/checks';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otpService';
import { RedisService } from './redisService';

export type JwtPayload = {
  sub: string;
  phoneNumber: string;
  jti: string;
};

export type AuthTokenResult = {
  accessToken: string;
  maxAge: number;
  user: {
    id: string;
    phoneNumber: string;
    isKycVerified: boolean;
    nationalCode: string | null;
    isNewUser: boolean;
  };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly config: AppConfigService,
    private readonly redis: RedisService,
  ) {}

  private get jwtSecret(): string {
    return this.config.jwtSecret;
  }

  private get jwtExpiresIn(): jwt.SignOptions['expiresIn'] {
    return this.config.jwtExpiresIn as jwt.SignOptions['expiresIn'];
  }

  async signToken(user: User): Promise<{ token: string; maxAge: number }> {
    const jti = randomUUID();
    const maxAge = ttlFromExpiry(this.config.jwtExpiresIn);
    await this.redis.saveSession(jti, user.id, maxAge);
    const token = jwt.sign(
      { sub: user.id, phoneNumber: user.phoneNumber, jti },
      this.jwtSecret,
      { expiresIn: this.jwtExpiresIn },
    );
    return { token, maxAge };
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, this.jwtSecret) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (!payload.jti || !payload.sub) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const owner = await this.redis.readSession(payload.jti);
    if (owner !== payload.sub) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return payload;
  }

  async revokeToken(token: string) {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as JwtPayload;
      if (payload.jti) await this.redis.deleteSession(payload.jti);
    } catch {
      return;
    }
  }

  async loginOrRegister(
    phoneNumber: string,
    otp: string,
  ): Promise<AuthTokenResult> {
    const normalized = this.otpService.normalizePhone(phoneNumber);
    const valid = await this.otpService.verifyOTP(normalized, otp);

    if (!valid) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    let isNewUser = false;
    let user = await this.prisma.user.findUnique({
      where: { phoneNumber: normalized },
    });

    if (!user) {
      isNewUser = true;
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { phoneNumber: normalized },
        });

        await tx.wallet.createMany({
          data: [
            { userId: created.id, type: WalletType.RIYAL, balance: 0 },
            { userId: created.id, type: WalletType.GOLD, balance: 0 },
          ],
        });

        return created;
      });
    }

    const access = await this.signToken(user);

    return {
      accessToken: access.token,
      maxAge: access.maxAge,
      user: {
        id: user.id,
        phoneNumber: user.phoneNumber,
        isKycVerified: user.isKycVerified,
        nationalCode: user.nationalCode,
        isNewUser,
      },
    };
  }

  /**
   * Mock Shahkar KYC: in production, verify phone ↔ nationalCode via Shahkar API.
   */
  async submitKYC(
    userId: string,
    nationalCode: string,
    birthDate: string,
  ): Promise<User> {
    const code = nationalCode.replace(/\D/g, '');
    if (!/^\d{10}$/.test(code) || !this.isValidNationalCode(code)) {
      throw new BadRequestException('Invalid national code');
    }

    try {
      assertAdultIsoDate(birthDate);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'birthDate must be YYYY-MM-DD',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { nationalCode: code },
    });
    if (existing && existing.id !== userId) {
      throw new BadRequestException('National code already registered');
    }

    if (this.config.kycMode !== 'mock') {
      throw new ServiceUnavailableException('Shahkar provider is not configured');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        nationalCode: code,
        birthDate,
        isKycVerified: true,
      },
    });
  }

  /** Iranian national ID checksum validation */
  private isValidNationalCode(code: string): boolean {
    if (!/^\d{10}$/.test(code)) return false;
    if (/^(\d)\1{9}$/.test(code)) return false;

    const check = Number(code[9]);
    const sum = code
      .slice(0, 9)
      .split('')
      .reduce((acc, digit, index) => acc + Number(digit) * (10 - index), 0);
    const remainder = sum % 11;
    return remainder < 2 ? check === remainder : check === 11 - remainder;
  }
}
