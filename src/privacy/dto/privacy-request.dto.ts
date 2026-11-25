export class PrivacyRequestResponseDto {
  id: string;
  userId: string;
  type: string;
  status: string;
  reasonCommitment: string;
  deadlineAt: Date;
  identityVerified: boolean;
  identityVerifiedAt: Date | null;
  deliveryHash: string | null;
  deliveredAt: Date | null;
  retainUntil: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  static from(request: Record<string, unknown>): PrivacyRequestResponseDto {
    const dto = new PrivacyRequestResponseDto();
    dto.id = request.id as string;
    dto.userId = request.userId as string;
    dto.type = request.type as string;
    dto.status = request.status as string;
    dto.reasonCommitment = request.reasonCommitment as string;
    dto.deadlineAt = request.deadlineAt as Date;
    dto.identityVerified = Boolean(request.identityVerified);
    dto.identityVerifiedAt = (request.identityVerifiedAt as Date) ?? null;
    dto.deliveryHash = (request.deliveryHash as string) ?? null;
    dto.deliveredAt = (request.deliveredAt as Date) ?? null;
    dto.retainUntil = request.retainUntil as Date;
    dto.revokedAt = (request.revokedAt as Date) ?? null;
    dto.createdAt = request.createdAt as Date;
    dto.updatedAt = request.updatedAt as Date;
    return dto;
  }
}
