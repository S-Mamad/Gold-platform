import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { CurrentUserId } from '../decorators/current-user.decorator';
import { SendOtpDto, SubmitKycDto, VerifyOtpDto } from '../dto/auth.dto';
import {
  clearSessionCookie,
  readSessionCookie,
  writeSessionCookie,
} from '../http/session-cookie';
import { AuthMiddleware } from '../middleware/authMiddleware';
import { AuthService } from '../services/authService';
import { OtpService } from '../services/otpService';
import { PrismaService } from '../prisma/prisma.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly otpService: OtpService,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async sendOtp(@Body() body: SendOtpDto) {
    const otp = await this.otpService.generateOTP(body.phoneNumber);

    return {
      success: true,
      message: 'OTP sent',
      expiresInSeconds: 120,
      ...(this.config.exposeDevOtp ? { devOtp: otp } : {}),
    };
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyOtp(
    @Body() body: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginOrRegister(
      body.phoneNumber,
      body.otp,
    );
    writeSessionCookie(
      res,
      result.accessToken,
      result.maxAge,
      this.config.cookieSecure,
    );

    return {
      success: true,
      data: {
        user: {
          id: result.user.id,
          phoneNumber: result.user.phoneNumber,
          isKycVerified: result.user.isKycVerified,
          isNewUser: result.user.isNewUser,
        },
      },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice('Bearer '.length).trim()
        : '') || readSessionCookie(req.headers.cookie);
    if (token) await this.authService.revokeToken(token);
    clearSessionCookie(res);
    return { success: true };
  }

  @Get('me')
  @UseGuards(AuthMiddleware)
  async me(@CurrentUserId() userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phoneNumber: true,
        isKycVerified: true,
        nationalCode: true,
        birthDate: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      data: user
        ? {
            id: user.id,
            phoneNumber: user.phoneNumber,
            isKycVerified: user.isKycVerified,
            nationalCode: user.nationalCode
              ? `••••${user.nationalCode.slice(-2)}`
              : null,
            birthDate: user.birthDate,
            createdAt: user.createdAt,
          }
        : null,
    };
  }

  @Post('kyc')
  @UseGuards(AuthMiddleware)
  @HttpCode(HttpStatus.OK)
  async submitKyc(
    @CurrentUserId() userId: string,
    @Body() body: SubmitKycDto,
  ) {
    const user = await this.authService.submitKYC(
      userId,
      body.nationalCode,
      body.birthDate,
    );

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          phoneNumber: user.phoneNumber,
          isKycVerified: user.isKycVerified,
          nationalCode: user.nationalCode
            ? `••••${user.nationalCode.slice(-2)}`
            : null,
          birthDate: user.birthDate,
        },
      },
    };
  }
}
