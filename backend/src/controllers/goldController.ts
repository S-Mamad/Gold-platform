import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../decorators/current-user.decorator';
import { BuyGoldDto } from '../dto/buy-gold.dto';
import { SellGoldDto } from '../dto/sell-gold.dto';
import { AuthMiddleware, KycGuard } from '../middleware/authMiddleware';
import { GoldPriceService } from '../services/goldPriceService';
import { GoldService } from '../services/goldService';

@Controller('gold')
export class GoldController {
  constructor(
    private readonly goldService: GoldService,
    private readonly goldPriceService: GoldPriceService,
  ) {}

  @Get('live-price')
  async livePrice() {
    const data = await this.goldPriceService.getMarket();
    return { success: true, data };
  }

  @Get('price-history')
  async priceHistory(@Query('limit') limit?: string) {
    const data = await this.goldPriceService.getHistory(
      limit ? Number(limit) : 120,
    );
    return { success: true, data };
  }

  @Post('lock-price')
  @UseGuards(AuthMiddleware)
  @HttpCode(HttpStatus.OK)
  async lockPrice(@CurrentUserId() userId: string) {
    const data = await this.goldPriceService.lockPriceForUser(userId);
    return { success: true, data };
  }

  @Post('buy')
  @UseGuards(AuthMiddleware, KycGuard)
  @HttpCode(HttpStatus.OK)
  async buyGold(
    @CurrentUserId() userId: string,
    @Body() body: BuyGoldDto,
  ) {
    const result = await this.goldService.buyGold(
      userId,
      body.requestedGrams,
      body.idempotencyKey,
    );
    return { success: true, data: result };
  }

  @Post('sell')
  @UseGuards(AuthMiddleware, KycGuard)
  @HttpCode(HttpStatus.OK)
  async sellGold(
    @CurrentUserId() userId: string,
    @Body() body: SellGoldDto,
  ) {
    const result = await this.goldService.sellGold(
      userId,
      body.gramsToSell,
      body.idempotencyKey,
    );
    return { success: true, data: result };
  }
}
