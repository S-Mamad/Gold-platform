import { IsString, Matches } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @Matches(/^(\+98|0)?9\d{9}$/, {
    message: 'phoneNumber must be a valid Iranian mobile',
  })
  phoneNumber!: string;
}

export class VerifyOtpDto {
  @IsString()
  @Matches(/^(\+98|0)?9\d{9}$/, {
    message: 'phoneNumber must be a valid Iranian mobile',
  })
  phoneNumber!: string;

  @IsString()
  @Matches(/^\d{5}$/, { message: 'otp must be a 5-digit code' })
  otp!: string;
}

export class SubmitKycDto {
  @IsString()
  @Matches(/^\d{10}$/, { message: 'nationalCode must be 10 digits' })
  nationalCode!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'birthDate must be YYYY-MM-DD',
  })
  birthDate!: string;
}
