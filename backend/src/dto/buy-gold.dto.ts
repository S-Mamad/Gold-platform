import { IsNumber, IsPositive, IsString, Length } from 'class-validator';

export class BuyGoldDto {
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  requestedGrams!: number;

  @IsString()
  @Length(8, 128)
  idempotencyKey!: string;
}
