import { createHmac, timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Prisma,
  TransactionStatus,
  TransactionType,
  WalletType,
} from '@prisma/client';
import { assertGrams, assertRial, isValidIranIban } from '../domain/checks';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from './idempotencyService';

type LockedWalletRow = {
  id: string;
  userId: string;
  type: string;
  balance: Prisma.Decimal | string | number;
};

export type WalletBalances = {
  riyalBalance: string;
  goldBalance: string;
  pendingWithdrawal: string;
  pendingDeliveryGrams: string;
  ready: true;
};

export type WithdrawalRequestResult = {
  transactionId: string;
  amount: string;
  rialBalance: string;
  status: TransactionStatus;
  metaData: { iban: string };
};

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly config: AppConfigService,
  ) {}

  async getBalances(userId: string): Promise<WalletBalances> {
    const wallets = await this.prisma.wallet.findMany({
      where: { userId },
    });

    const rial = wallets.find((w) => w.type === WalletType.RIYAL);
    const gold = wallets.find((w) => w.type === WalletType.GOLD);

    if (!rial || !gold) {
      throw new NotFoundException('Wallets not found for user');
    }

    const pendingWithdrawals = await this.prisma.transaction.aggregate({
      where: {
        userId,
        type: TransactionType.WITHDRAW,
        status: TransactionStatus.PENDING,
      },
      _sum: { amount: true },
    });
    const pendingDelivery = await this.prisma.transaction.aggregate({
      where: {
        userId,
        type: TransactionType.DELIVER_GOLD,
        status: TransactionStatus.PENDING,
      },
      _sum: { amount: true },
    });

    return {
      riyalBalance: new Prisma.Decimal(rial.balance).toFixed(4),
      goldBalance: new Prisma.Decimal(gold.balance).toFixed(4),
      pendingWithdrawal: new Prisma.Decimal(
        pendingWithdrawals._sum.amount ?? 0,
      ).toFixed(4),
      pendingDeliveryGrams: new Prisma.Decimal(
        pendingDelivery._sum.amount ?? 0,
      ).toFixed(4),
      ready: true,
    };
  }

  async requestWithdrawal(
    userId: string,
    amount: number,
    iban: string,
    idempotencyKey?: string,
  ): Promise<WithdrawalRequestResult> {
    const key = this.idempotency.validateKey(idempotencyKey);
    const cached = await this.idempotency.findCached<WithdrawalRequestResult>(
      userId,
      key,
    );
    if (cached) return cached;

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }

    const normalizedIban = iban.replace(/\s/g, '').toUpperCase();
    if (!isValidIranIban(normalizedIban)) {
      throw new BadRequestException(
        'iban must be a valid Iranian IBAN (IR + 24 digits)',
      );
    }

    let amountDecimal: Prisma.Decimal;
    try {
      amountDecimal = new Prisma.Decimal(assertRial(amount).toFixed(4));
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'amount must be a positive number',
      );
    }

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
      if (rialBalance.lt(amountDecimal)) {
        throw new BadRequestException('Insufficient Riyal balance');
      }

      const newRialBalance = rialBalance.sub(amountDecimal);

      await tx.wallet.update({
        where: { id: rialWallet.id },
        data: { balance: newRialBalance },
      });

      const response: WithdrawalRequestResult = {
        transactionId: '',
        amount: amountDecimal.toFixed(4),
        rialBalance: newRialBalance.toFixed(4),
        status: TransactionStatus.PENDING,
        metaData: { iban: normalizedIban },
      };

      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.WITHDRAW,
          amount: amountDecimal,
          status: TransactionStatus.PENDING,
          idempotencyKey: key,
          metaData: { iban: normalizedIban, response },
        },
      });

      response.transactionId = transaction.id;
      await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          metaData: { iban: normalizedIban, response },
        },
      });

      return response;
    });

    return result;
  }

  /** Simulated bank deposit — replace with payment gateway callback in production. */
  async deposit(
    userId: string,
    amount: number,
    idempotencyKey?: string,
  ): Promise<WalletBalances & { transactionId: string }> {
    const key = this.idempotency.validateKey(idempotencyKey);
    const cached = await this.idempotency.findCached<
      WalletBalances & { transactionId: string }
    >(userId, key);
    if (cached) return cached;

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }
    let bounded: number;
    try {
      bounded = assertRial(amount);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'amount must be a positive number',
      );
    }

    const amountDecimal = new Prisma.Decimal(bounded.toFixed(4));
    const mode = this.config.paymentMode;

    if (mode === 'gateway') {
      if (!this.config.paymentWebhookSecret) {
        throw new ServiceUnavailableException(
          'Payment gateway is not configured',
        );
      }
      return this.prisma.$transaction(async (tx) => {
        const gold = await tx.wallet.findFirst({
          where: { userId, type: WalletType.GOLD },
        });
        const rial = await tx.wallet.findFirst({
          where: { userId, type: WalletType.RIYAL },
        });
        const response = {
          transactionId: '',
          riyalBalance: new Prisma.Decimal(rial?.balance ?? 0).toFixed(4),
          goldBalance: new Prisma.Decimal(gold?.balance ?? 0).toFixed(4),
          pendingWithdrawal: '0.0000',
          pendingDeliveryGrams: '0.0000',
          ready: true as const,
          status: TransactionStatus.PENDING,
          sandbox: false,
        };
        const transaction = await tx.transaction.create({
          data: {
            userId,
            type: TransactionType.DEPOSIT,
            amount: amountDecimal,
            status: TransactionStatus.PENDING,
            idempotencyKey: key,
            metaData: { response, sandbox: false },
          },
        });
        response.transactionId = transaction.id;
        await tx.transaction.update({
          where: { id: transaction.id },
          data: { metaData: { response, sandbox: false } },
        });
        return response;
      });
    }
    return this.prisma.$transaction(async (tx) => {
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
      const newRialBalance = rialBalance.add(amountDecimal);

      await tx.wallet.update({
        where: { id: rialWallet.id },
        data: { balance: newRialBalance },
      });

      const response = {
        transactionId: '',
        riyalBalance: newRialBalance.toFixed(4),
        goldBalance:
          (
            await tx.wallet.findFirst({
              where: { userId, type: WalletType.GOLD },
            })
          )?.balance.toFixed(4) ?? '0.0000',
        pendingWithdrawal: '0.0000',
        pendingDeliveryGrams: '0.0000',
        ready: true as const,
        status: TransactionStatus.COMPLETED,
        sandbox: true,
      };

      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.DEPOSIT,
          amount: amountDecimal,
          status: TransactionStatus.COMPLETED,
          idempotencyKey: key,
          metaData: { response, sandbox: true },
        },
      });

      response.transactionId = transaction.id;
      await tx.transaction.update({
        where: { id: transaction.id },
        data: { metaData: { response, sandbox: true } },
      });

      return response;
    });
  }

  async listTransactions(userId: string, limit = 20, cursor?: string) {
    const take = Math.min(Math.max(limit || 20, 1), 50);
    let cursorDate: Date | undefined;
    let cursorId: string | undefined;
    if (cursor) {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      const splitAt = decoded.lastIndexOf('|');
      if (splitAt > 0) {
        cursorDate = new Date(decoded.slice(0, splitAt));
        cursorId = decoded.slice(splitAt + 1);
      }
    }

    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        ...(cursorDate &&
        cursorId &&
        !Number.isNaN(cursorDate.getTime())
          ? {
              OR: [
                { createdAt: { lt: cursorDate } },
                { createdAt: cursorDate, id: { lt: cursorId } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });

    const page = rows.slice(0, take);
    const last = page.at(-1);
    const nextCursor =
      rows.length > take && last
        ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString(
            'base64url',
          )
        : null;

    return { items: page.map((row) => this.present(row)), nextCursor };
  }

  async getTransaction(userId: string, id: string) {
    const row = await this.prisma.transaction.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Transaction not found');
    return this.present(row);
  }

  async listPendingWithdrawals() {
    return this.prisma.transaction.findMany({
      where: {
        type: TransactionType.WITHDRAW,
        status: TransactionStatus.PENDING,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, phoneNumber: true, nationalCode: true } },
      },
    });
  }

  async approveWithdrawal(transactionId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });
    if (!tx || tx.type !== TransactionType.WITHDRAW) {
      throw new NotFoundException('Withdrawal not found');
    }

    const claimed = await this.prisma.transaction.updateMany({
      where: {
        id: transactionId,
        status: TransactionStatus.PENDING,
      },
      data: {
        status: TransactionStatus.COMPLETED,
        metaData: {
          ...(typeof tx.metaData === 'object' &&
          tx.metaData &&
          !Array.isArray(tx.metaData)
            ? tx.metaData
            : {}),
          approvedAt: new Date().toISOString(),
        },
      },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException('Withdrawal is not pending');
    }

    return this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });
  }

  async rejectWithdrawal(transactionId: string, reason: string) {
    return this.prisma.$transaction(async (db) => {
      const tx = await db.transaction.findUnique({
        where: { id: transactionId },
      });
      if (!tx || tx.type !== TransactionType.WITHDRAW) {
        throw new NotFoundException('Withdrawal not found');
      }

      const claimed = await db.transaction.updateMany({
        where: {
          id: transactionId,
          status: TransactionStatus.PENDING,
        },
        data: {
          status: TransactionStatus.CANCELED,
          metaData: {
            ...(typeof tx.metaData === 'object' &&
            tx.metaData &&
            !Array.isArray(tx.metaData)
              ? tx.metaData
              : {}),
            rejectedAt: new Date().toISOString(),
            rejectionReason: reason,
          },
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Withdrawal is not pending');
      }

      const rialRows = await db.$queryRaw<LockedWalletRow[]>`
        SELECT * FROM "Wallet"
        WHERE "userId" = ${tx.userId}::uuid AND "type" = 'RIYAL'::"WalletType"
        FOR UPDATE
      `;
      const rialWallet = rialRows[0];
      if (!rialWallet) {
        throw new BadRequestException('Riyal wallet not found');
      }

      const refund = new Prisma.Decimal(tx.amount);
      const newBalance = new Prisma.Decimal(rialWallet.balance).add(refund);

      await db.wallet.update({
        where: { id: rialWallet.id },
        data: { balance: newBalance },
      });

      return db.transaction.findUnique({ where: { id: transactionId } });
    });
  }

  async cancelOwnWithdrawal(userId: string, transactionId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });
    if (!tx || tx.userId !== userId || tx.type !== TransactionType.WITHDRAW) {
      throw new NotFoundException('Withdrawal not found');
    }
    return this.rejectWithdrawal(transactionId, 'Canceled by user');
  }

  async requestDelivery(
    userId: string,
    grams: number,
    address: string,
    idempotencyKey?: string,
  ) {
    const key = this.idempotency.validateKey(idempotencyKey);
    const cached = await this.idempotency.findCached<Record<string, string>>(
      userId,
      key,
    );
    if (cached) return cached;

    let bounded: number;
    try {
      bounded = assertGrams(grams);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'gramsToSell must be a positive number',
      );
    }
    const cleanAddress = address.trim();
    if (cleanAddress.length < 8 || cleanAddress.length > 200) {
      throw new BadRequestException('delivery address is invalid');
    }
    const gramsDecimal = new Prisma.Decimal(bounded.toFixed(4));

    return this.prisma.$transaction(async (tx) => {
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
      if (goldBalance.lt(gramsDecimal)) {
        throw new BadRequestException('Insufficient Gold balance');
      }
      const newGold = goldBalance.sub(gramsDecimal);
      await tx.wallet.update({
        where: { id: goldWallet.id },
        data: { balance: newGold },
      });
      const response = {
        transactionId: '',
        grams: gramsDecimal.toFixed(4),
        goldBalance: newGold.toFixed(4),
        status: TransactionStatus.PENDING,
        address: cleanAddress,
      };
      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.DELIVER_GOLD,
          amount: gramsDecimal,
          status: TransactionStatus.PENDING,
          idempotencyKey: key,
          metaData: { address: cleanAddress, response },
        },
      });
      response.transactionId = transaction.id;
      await tx.transaction.update({
        where: { id: transaction.id },
        data: { metaData: { address: cleanAddress, response } },
      });
      return response;
    });
  }

  async listPendingDeliveries() {
    return this.prisma.transaction.findMany({
      where: {
        type: TransactionType.DELIVER_GOLD,
        status: TransactionStatus.PENDING,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, phoneNumber: true } },
      },
    });
  }

  async approveDelivery(transactionId: string) {
    const claimed = await this.prisma.transaction.updateMany({
      where: {
        id: transactionId,
        type: TransactionType.DELIVER_GOLD,
        status: TransactionStatus.PENDING,
      },
      data: { status: TransactionStatus.COMPLETED },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException('Delivery is not pending');
    }
    return this.prisma.transaction.findUnique({ where: { id: transactionId } });
  }

  async rejectDelivery(transactionId: string, reason: string) {
    return this.prisma.$transaction(async (db) => {
      const tx = await db.transaction.findUnique({
        where: { id: transactionId },
      });
      if (!tx || tx.type !== TransactionType.DELIVER_GOLD) {
        throw new NotFoundException('Delivery not found');
      }
      const claimed = await db.transaction.updateMany({
        where: {
          id: transactionId,
          status: TransactionStatus.PENDING,
        },
        data: {
          status: TransactionStatus.CANCELED,
          metaData: {
            ...(typeof tx.metaData === 'object' &&
            tx.metaData &&
            !Array.isArray(tx.metaData)
              ? tx.metaData
              : {}),
            rejectionReason: reason,
          },
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Delivery is not pending');
      }
      const goldRows = await db.$queryRaw<LockedWalletRow[]>`
        SELECT * FROM "Wallet"
        WHERE "userId" = ${tx.userId}::uuid AND "type" = 'GOLD'::"WalletType"
        FOR UPDATE
      `;
      const goldWallet = goldRows[0];
      if (!goldWallet) {
        throw new BadRequestException('Gold wallet not found for user');
      }
      const next = new Prisma.Decimal(goldWallet.balance).add(tx.amount);
      await db.wallet.update({
        where: { id: goldWallet.id },
        data: { balance: next },
      });
      return db.transaction.findUnique({ where: { id: transactionId } });
    });
  }

  async completeGatewayDeposit(
    transactionId: string,
    amount: number,
    signature: string,
  ) {
    const secret = this.config.paymentWebhookSecret;
    if (!secret) {
      throw new ServiceUnavailableException('Payment gateway is not configured');
    }
    let bounded: number;
    try {
      bounded = assertRial(amount);
    } catch {
      throw new BadRequestException('amount must be a positive number');
    }
    const payload = `${transactionId}|${bounded.toFixed(4)}`;
    const expected = createHmac('sha256', secret).update(payload).digest();
    const given = Buffer.from(signature, 'hex');
    if (
      given.length !== expected.length ||
      !timingSafeEqual(given, expected)
    ) {
      throw new BadRequestException('payment signature is invalid');
    }

    return this.prisma.$transaction(async (db) => {
      const tx = await db.transaction.findUnique({
        where: { id: transactionId },
      });
      if (!tx || tx.type !== TransactionType.DEPOSIT) {
        throw new NotFoundException('Deposit not found');
      }
      if (!new Prisma.Decimal(tx.amount).eq(bounded.toFixed(4))) {
        throw new BadRequestException('amount must be a positive number');
      }
      const claimed = await db.transaction.updateMany({
        where: { id: transactionId, status: TransactionStatus.PENDING },
        data: { status: TransactionStatus.COMPLETED },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Deposit is not pending');
      }
      const rialRows = await db.$queryRaw<LockedWalletRow[]>`
        SELECT * FROM "Wallet"
        WHERE "userId" = ${tx.userId}::uuid AND "type" = 'RIYAL'::"WalletType"
        FOR UPDATE
      `;
      const rialWallet = rialRows[0];
      if (!rialWallet) {
        throw new BadRequestException('Riyal wallet not found');
      }
      const next = new Prisma.Decimal(rialWallet.balance).add(tx.amount);
      await db.wallet.update({
        where: { id: rialWallet.id },
        data: { balance: next },
      });
      return { transactionId, status: TransactionStatus.COMPLETED };
    });
  }

  private present(t: {
    id: string;
    type: TransactionType;
    amount: Prisma.Decimal;
    pricePerGram: Prisma.Decimal | null;
    status: TransactionStatus;
    metaData: Prisma.JsonValue;
    createdAt: Date;
  }) {
    const gold =
      t.type === TransactionType.BUY_GOLD ||
      t.type === TransactionType.SELL_GOLD ||
      t.type === TransactionType.DELIVER_GOLD;
    const meta =
      t.metaData && typeof t.metaData === 'object' && !Array.isArray(t.metaData)
        ? (t.metaData as Record<string, unknown>)
        : {};
    const response =
      meta.response && typeof meta.response === 'object'
        ? (meta.response as Record<string, unknown>)
        : {};
    const amount = new Prisma.Decimal(t.amount).toFixed(4);
    const price = t.pricePerGram
      ? new Prisma.Decimal(t.pricePerGram).toFixed(4)
      : null;
    const rialAmount =
      gold && price
        ? new Prisma.Decimal(amount).mul(price).toFixed(4)
        : gold
          ? null
          : amount;
    return {
      id: t.id,
      type: t.type,
      amount,
      unit: gold ? 'GRAM' : 'RIAL',
      pricePerGram: price,
      rialAmount,
      fee: typeof response.fee === 'string' ? response.fee : null,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    };
  }
}
