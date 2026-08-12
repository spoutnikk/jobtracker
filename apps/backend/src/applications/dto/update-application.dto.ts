import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import type { ApplicationStatus } from '../../../generated/prisma/enums';
import { ApplicationStatus as ApplicationStatusEnum } from '../../../generated/prisma/enums';

export class UpdateApplicationDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  jobOfferId?: number;

  @IsOptional()
  @IsEnum(ApplicationStatusEnum)
  status?: ApplicationStatus;

  @IsOptional()
  @IsISO8601()
  appliedAt?: string | null;

  @IsOptional()
  @IsString()
  source?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  contactName?: string | null;

  @IsOptional()
  @IsEmail()
  contactEmail?: string | null;

  @IsOptional()
  @IsISO8601()
  followUpAt?: string | null;

  @IsOptional()
  @IsISO8601()
  interviewAt?: string | null;
}
