import { IsString, Length } from 'class-validator';

export class IdempotencyDto {
  @IsString()
  @Length(8, 128)
  idempotencyKey!: string;
}
