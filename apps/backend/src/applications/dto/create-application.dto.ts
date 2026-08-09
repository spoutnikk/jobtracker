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

export class CreateApplicationDto {
  @IsInt()
  @IsPositive()
  userId!: number;

  @IsInt()
  @IsPositive()
  jobOfferId!: number;

  @IsOptional()
  @IsEnum(ApplicationStatusEnum)
  status?: ApplicationStatus;

  @IsOptional()
  @IsISO8601()
  appliedAt?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsISO8601()
  followUpAt?: string;

  @IsOptional()
  @IsISO8601()
  interviewAt?: string;
}
