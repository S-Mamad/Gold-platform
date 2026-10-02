import { IsNumber, IsPositive, IsString, IsUUID, Length } from 'class-validator';

export class PaymentCallbackDto {
  @IsUUID()
  transactionId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  amount!: number;

  @IsString()
  @Length(64, 64)
  signature!: string;
}
