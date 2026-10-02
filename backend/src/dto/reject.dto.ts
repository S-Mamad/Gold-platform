import { IsString, Length } from 'class-validator';

export class RejectDto {
  @IsString()
  @Length(2, 200)
  reason!: string;
}
