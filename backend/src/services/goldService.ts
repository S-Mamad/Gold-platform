import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Prisma,
  TransactionStatus,
  TransactionType,
  WalletType,
} from '@prisma/client';
import { assertGrams } from '../domain/checks';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from './idempotencyService';
import { RedisService } from './redisService';

type LockedWalletRow = {
  id: string;
  userId: string;
  type: WalletType;
  balance: Prisma.Decimal | string | number;
};

export type BuyGoldResult = {
  transactionId: string;
  requestedGrams: string;
  pricePerGram: string;
  fee: string;
  totalCost: string;
  rialBalance: string;
  goldBalance: string;
};

export type SellGoldResult = {
  transactionId: string;
  gramsSold: string;
  pricePerGram: string;
  fee: string;
  totalCredit: string;
  rialBalance: string;
  goldBalance: string;
};

@Injectable()
export class GoldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async buyGold(
    userId: string,
    requestedGrams: number,
    idempotencyKey?: string,
  ): Promise<BuyGoldResult> {
    const key = this.idempotency.validateKey(idempotencyKey);
    const cached = await this.idempotency.findCached<BuyGoldResult>(
      userId,
      key,
    );
    if (cached) return cached;

    if (!Number.isFinite(requestedGrams) || requestedGrams <= 0) {
      throw new BadRequestException('requestedGrams must be a positive number');
    }
    let grams: number;
    try {
      grams = assertGrams(requestedGrams);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'requestedGrams must be a positive number',
      );
    }

    const quote = await this.redisService.claimQuoteForUser(userId);
    if (quote === null) {
      throw new BadRequestException(
        'Price lock expired. Please request a new price.',
      );
    }

    const lockedPriceDecimal = new Prisma.Decimal(quote.ask);
    const requestedGramsDecimal = new Prisma.Decimal(grams.toFixed(4));
    const notional = requestedGramsDecimal.mul(lockedPriceDecimal);
    const fee = notional.mul(quote.feeBps).div(10_000).toDecimalPlaces(4);
    const totalCost = notional.add(fee);

    const result = await this.prisma.$transaction(async (tx) => {
      const rialRows = await tx.$queryRaw<LockedWalletRow[]>`
        SELECT * FROM "Wallet"
        WHERE "userId" = ${userId}::uuid AND "type" = 'RIYAL'::"WalletType"
        FOR UPDATE
      `;

      const rialWallet = rialRows[0];
      if (!rialWallet) {
        throw new BadRequestException('Riyal wallet not found for user');
      }

      const rialBalance = new Prisma.Decimal(rialWallet.balance);
      if (rialBalance.lt(totalCost)) {
        throw new BadRequestException('Insufficient Riyal balance');
      }

      const goldRows = await tx.$queryRaw<LockedWalletRow[]>`
        SELECT * FROM "Wallet"
        WHERE "userId" = ${userId}::uuid AND "type" = 'GOLD'::"WalletType"
        FOR UPDATE
      `;

      const goldWallet = goldRows[0];
      if (!goldWallet) {
        throw new BadRequestException('Gold wallet not found for user');
      }

      const goldBalance = new Prisma.Decimal(goldWallet.balance);
      const newRialBalance = rialBalance.sub(totalCost);
      const newGoldBalance = goldBalance.add(requestedGramsDecimal);

      await tx.wallet.update({
        where: { id: rialWallet.id },
        data: { balance: newRialBalance },
      });

      await tx.wallet.update({
        where: { id: goldWallet.id },
        data: { balance: newGoldBalance },
      });

      const response: BuyGoldResult = {
        transactionId: '',
        requestedGrams: requestedGramsDecimal.toFixed(4),
        pricePerGram: lockedPriceDecimal.toFixed(4),
        fee: fee.toFixed(4),
        totalCost: totalCost.toFixed(4),
        rialBalance: newRialBalance.toFixed(4),
        goldBalance: newGoldBalance.toFixed(4),
      };

      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.BUY_GOLD,
          amount: requestedGramsDecimal,
          pricePerGram: lockedPriceDecimal,
          status: TransactionStatus.COMPLETED,
          idempotencyKey: key,
          metaData: { response },
        },
      });

      response.transactionId = transaction.id;
      await tx.transaction.update({
        where: { id: transaction.id },
        data: { metaData: { response } },
      });

      return response;
    });

    return result;
  }

  async sellGold(
    userId: string,
    gramsToSell: number,
    idempotencyKey?: string,
  ): Promise<SellGoldResult> {
    const key = this.idempotency.validateKey(idempotencyKey);
    const cached = await this.idempotency.findCached<SellGoldResult>(
      userId,
      key,
    );
    if (cached) return cached;

    if (!Number.isFinite(gramsToSell) || gramsToSell <= 0) {
      throw new BadRequestException('gramsToSell must be a positive number');
    }
    let grams: number;
    try {
      grams = assertGrams(gramsToSell);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'gramsToSell must be a positive number',
      );
    }

    const quote = await this.redisService.claimQuoteForUser(userId);
    if (quote === null) {
      throw new BadRequestException(
        'Price lock expired. Please request a new price.',
      );
    }

    const lockedPriceDecimal = new Prisma.Decimal(quote.bid);
    const gramsToSellDecimal = new Prisma.Decimal(grams.toFixed(4));
    const notional = gramsToSellDecimal.mul(lockedPriceDecimal);
    const fee = notional.mul(quote.feeBps).div(10_000).toDecimalPlaces(4);
    const totalCredit = notional.sub(fee);
    if (totalCredit.lte(0)) {
      throw new BadRequestException('amount must be a positive number');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const goldRows = await tx.$queryRaw<LockedWalletRow[]>`
        SELECT * FROM "Wallet"
        WHERE "userId" = ${userId}::uuid AND "type" = 'GOLD'::"WalletType"
        FOR UPDATE
      `;

      const goldWallet = goldRows[0];
      if (!goldWallet) {
        throw new BadRequestException('Gold wallet not found for user');
      }

      const goldBalance = new Prisma.Decimal(goldWallet.balance);
      if (goldBalance.lt(gramsToSellDecimal)) {
        throw new BadRequestException('Insufficient Gold balance');
      }

      const rialRows = await tx.$queryRaw<LockedWalletRow[]>`
        SELECT * FROM "Wallet"
        WHERE "userId" = ${userId}::uuid AND "type" = 'RIYAL'::"WalletType"
        FOR UPDATE
      `;

      const rialWallet = rialRows[0];
      if (!rialWallet) {
        throw new BadRequestException('Riyal wallet not found for user');
      }

      const rialBalance = new Prisma.Decimal(rialWallet.balance);
      const newGoldBalance = goldBalance.sub(gramsToSellDecimal);
      const newRialBalance = rialBalance.add(totalCredit);

      await tx.wallet.update({
        where: { id: goldWallet.id },
        data: { balance: newGoldBalance },
      });

      await tx.wallet.update({
        where: { id: rialWallet.id },
        data: { balance: newRialBalance },
      });

      const response: SellGoldResult = {
        transactionId: '',
        gramsSold: gramsToSellDecimal.toFixed(4),
        pricePerGram: lockedPriceDecimal.toFixed(4),
        fee: fee.toFixed(4),
        totalCredit: totalCredit.toFixed(4),
        rialBalance: newRialBalance.toFixed(4),
        goldBalance: newGoldBalance.toFixed(4),
      };

      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.SELL_GOLD,
          amount: gramsToSellDecimal,
          pricePerGram: lockedPriceDecimal,
          status: TransactionStatus.COMPLETED,
          idempotencyKey: key,
          metaData: { response },
        },
      });

      response.transactionId = transaction.id;
      await tx.transaction.update({
        where: { id: transaction.id },
        data: { metaData: { response } },
      });

      return response;
    });

    return result;
  }
}
