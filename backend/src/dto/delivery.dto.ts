import { IsNumber, IsPositive, IsString, Length } from 'class-validator';

export class DeliveryDto {
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  grams!: number;

  @IsString()
  @Length(8, 200)
  address!: string;

  @IsString()
  @Length(8, 128)
  idempotencyKey!: string;
}
