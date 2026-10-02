import { IsNumber, IsPositive, IsString, Length } from 'class-validator';

export class SellGoldDto {
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  gramsToSell!: number;

  @IsString()
  @Length(8, 128)
  idempotencyKey!: string;
}
