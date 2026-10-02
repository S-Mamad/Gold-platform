import {
  IsNumber,
  IsPositive,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class WithdrawDto {
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  amount!: number;

  @IsString()
  @Matches(/^IR[0-9]{24}$/i, {
    message: 'iban must be a valid Iranian IBAN (IR + 24 digits)',
  })
  iban!: string;

  @IsString()
  @Length(8, 128)
  idempotencyKey!: string;
}
