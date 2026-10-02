import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../decorators/current-user.decorator';
import { DeliveryDto } from '../dto/delivery.dto';
import { DepositDto } from '../dto/deposit.dto';
import { PaymentCallbackDto } from '../dto/payment-callback.dto';
import { WithdrawDto } from '../dto/withdraw.dto';
import { AuthMiddleware, KycGuard } from '../middleware/authMiddleware';
import { WalletService } from '../services/walletService';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balances')
  @UseGuards(AuthMiddleware)
  async balances(@CurrentUserId() userId: string) {
    const data = await this.walletService.getBalances(userId);
    return { success: true, data };
  }

  @Get('transactions')
  @UseGuards(AuthMiddleware)
  async transactions(
    @CurrentUserId() userId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const data = await this.walletService.listTransactions(
      userId,
      limit ? Number(limit) : 20,
      cursor,
    );
    return { success: true, data };
  }

  @Get('transactions/:id')
  @UseGuards(AuthMiddleware)
  async receipt(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.walletService.getTransaction(userId, id);
    return { success: true, data };
  }

  @Post('deposit')
  @UseGuards(AuthMiddleware)
  @HttpCode(HttpStatus.OK)
  async deposit(@CurrentUserId() userId: string, @Body() body: DepositDto) {
    const data = await this.walletService.deposit(
      userId,
      body.amount,
      body.idempotencyKey,
    );
    return { success: true, data };
  }

  @Post('payments/callback')
  @HttpCode(HttpStatus.OK)
  async paymentCallback(@Body() body: PaymentCallbackDto) {
    const data = await this.walletService.completeGatewayDeposit(
      body.transactionId,
      body.amount,
      body.signature,
    );
    return { success: true, data };
  }

  @Post('withdraw')
  @UseGuards(AuthMiddleware, KycGuard)
  @HttpCode(HttpStatus.OK)
  async requestWithdrawal(
    @CurrentUserId() userId: string,
    @Body() body: WithdrawDto,
  ) {
    const data = await this.walletService.requestWithdrawal(
      userId,
      body.amount,
      body.iban,
      body.idempotencyKey,
    );
    return { success: true, data };
  }

  @Post('withdrawals/:id/cancel')
  @UseGuards(AuthMiddleware)
  @HttpCode(HttpStatus.OK)
  async cancelWithdrawal(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.walletService.cancelOwnWithdrawal(userId, id);
    return { success: true, data };
  }

  @Post('deliver')
  @UseGuards(AuthMiddleware, KycGuard)
  @HttpCode(HttpStatus.OK)
  async deliver(
    @CurrentUserId() userId: string,
    @Body() body: DeliveryDto,
  ) {
    const data = await this.walletService.requestDelivery(
      userId,
      body.grams,
      body.address,
      body.idempotencyKey,
    );
    return { success: true, data };
  }
}
