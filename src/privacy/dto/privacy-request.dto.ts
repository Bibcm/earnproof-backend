import { IsEnum, IsDateString, IsOptional, IsString } from "class-validator";
import { PrivacyRequestType } from "@prisma/client";

export class CreatePrivacyRequestDto {
  @IsEnum(PrivacyRequestType)
  type: PrivacyRequestType;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class VerifyIdentityDto {
  @IsString()
  verificationTokenHash: string;
}

export class CompletePrivacyRequestDto {
  @IsString()
  resultDeliveryRef: string;
}

export class RejectPrivacyRequestDto {
  @IsString()
  resolutionReason: string;
}

export class AddEvidenceDto {
  @IsString()
  evidenceRef: string;
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
