import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns cached response body if this key was already processed successfully. */
  async findCached<T>(userId: string, key?: string): Promise<T | null> {
    if (!key) return null;

    const existing = await this.prisma.transaction.findFirst({
      where: { userId, idempotencyKey: key },
    });

    if (!existing) return null;

    if (existing.metaData && typeof existing.metaData === 'object') {
      const meta = existing.metaData as Record<string, unknown>;
      if (meta.response) {
        return meta.response as T;
      }
    }

    throw new ConflictException('Duplicate request is already being processed');
  }

  validateKey(key?: string): string {
    if (!key) {
      throw new BadRequestException(
        'idempotencyKey must be between 8 and 128 characters',
      );
    }
    const trimmed = key.trim();
    if (trimmed.length < 8 || trimmed.length > 128) {
      throw new BadRequestException(
        'idempotencyKey must be between 8 and 128 characters',
      );
    }
    return trimmed;
  }
}
