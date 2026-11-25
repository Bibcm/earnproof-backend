import { IsEnum, IsDateString, IsOptional, IsString, IsUUID } from "class-validator";
import { PrivacyRequestType } from "@prisma/client";

export class CreatePrivacyRequestDto {
  @IsEnum(PrivacyRequestType)
  type: PrivacyRequestType;

  @IsString()
  reasonCommitment: string;

  @IsOptional()
  @IsDateString()
  deadlineAt?: string;
}

export class ListPrivacyRequestsQueryDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
