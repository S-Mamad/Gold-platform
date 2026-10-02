import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { readSessionCookie } from '../http/session-cookie';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, JwtPayload } from '../services/authService';

export type AuthenticatedRequest = Request & {
  user: JwtPayload;
  userId: string;
};

@Injectable()
export class AuthMiddleware implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const bearer = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length).trim()
      : '';
    const token = bearer || readSessionCookie(request.headers.cookie);
    if (!token) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const payload = await this.authService.verifyToken(token);
    request.user = payload;
    request.userId = payload.sub;
    return true;
  }
}

/** Validates KYC against live DB, not stale JWT claim. */
@Injectable()
export class KycGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: request.userId },
      select: { isKycVerified: true },
    });

    if (!user?.isKycVerified) {
      throw new ForbiddenException(
        'KYC verification required before trading or withdrawals',
      );
    }

    return true;
  }
}
