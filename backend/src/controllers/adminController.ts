import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RejectDto } from '../dto/reject.dto';
import { AdminGuard } from '../middleware/adminGuard';
import { WalletService } from '../services/walletService';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly walletService: WalletService) {}

  @Get('withdrawals/pending')
  async listPending() {
    const rows = await this.walletService.listPendingWithdrawals();
    return rows.map((row) => ({
      id: row.id,
      amount: row.amount.toFixed(4),
      createdAt: row.createdAt,
      user: {
        id: row.user.id,
        phoneNumber: row.user.phoneNumber,
        nationalCode: row.user.nationalCode
          ? `••••${row.user.nationalCode.slice(-2)}`
          : null,
      },
      iban:
        row.metaData &&
        typeof row.metaData === 'object' &&
        'iban' in row.metaData
          ? String((row.metaData as { iban?: string }).iban ?? '')
          : '',
    }));
  }

  @Get('deliveries/pending')
  async listDeliveries() {
    const rows = await this.walletService.listPendingDeliveries();
    return rows.map((row) => ({
      id: row.id,
      grams: row.amount.toFixed(4),
      createdAt: row.createdAt,
      address:
        row.metaData &&
        typeof row.metaData === 'object' &&
        'address' in row.metaData
          ? String((row.metaData as { address?: string }).address ?? '')
          : '',
      user: {
        id: row.user.id,
        phoneNumber: row.user.phoneNumber,
      },
    }));
  }

  @Post('withdrawals/:id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.walletService.approveWithdrawal(id);
  }

  @Post('withdrawals/:id/reject')
  @HttpCode(HttpStatus.OK)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() body: RejectDto) {
    return this.walletService.rejectWithdrawal(id, body.reason);
  }

  @Post('deliveries/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveDelivery(@Param('id', ParseUUIDPipe) id: string) {
    return this.walletService.approveDelivery(id);
  }

  @Post('deliveries/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectDelivery(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectDto,
  ) {
    return this.walletService.rejectDelivery(id, body.reason);
  }
}
