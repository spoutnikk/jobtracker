import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import type { ApplicationEventType } from '../../../generated/prisma/enums';
import { ApplicationEventType as ApplicationEventTypeEnum } from '../../../generated/prisma/enums';

export class CreateApplicationEventDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  applicationId!: number;

  @IsEnum(ApplicationEventTypeEnum)
  type!: ApplicationEventType;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
