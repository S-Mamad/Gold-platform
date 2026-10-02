import { IsNumber, IsPositive, IsString, Length } from 'class-validator';

export class DepositDto {
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  amount!: number;

  @IsString()
  @Length(8, 128)
  idempotencyKey!: string;
}
