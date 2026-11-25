export class PrivacyRequestResponseDto {
  id: string;
  userId: string;
  type: string;
  status: string;
  verificationTokenHash: string | null;
  verifiedAt: Date | null;
  requestedAt: Date;
  dueAt: Date;
  retentionUntil: Date;
  evidenceRef: string | null;
  resultDeliveryRef: string | null;
  ledgerLimitationNote: string;
  resolutionReason: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  static from(request: Record<string, unknown>): PrivacyRequestResponseDto {
    const dto = new PrivacyRequestResponseDto();
    dto.id = request.id as string;
    dto.userId = request.userId as string;
    dto.type = request.type as string;
    dto.status = request.status as string;
    dto.verificationTokenHash = (request.verificationTokenHash as string) ?? null;
    dto.verifiedAt = (request.verifiedAt as Date) ?? null;
    dto.requestedAt = request.requestedAt as Date;
    dto.dueAt = request.dueAt as Date;
    dto.retentionUntil = request.retentionUntil as Date;
    dto.evidenceRef = (request.evidenceRef as string) ?? null;
    dto.resultDeliveryRef = (request.resultDeliveryRef as string) ?? null;
    dto.ledgerLimitationNote = request.ledgerLimitationNote as string;
    dto.resolutionReason = (request.resolutionReason as string) ?? null;
    dto.completedAt = (request.completedAt as Date) ?? null;
    dto.createdAt = request.createdAt as Date;
    dto.updatedAt = request.updatedAt as Date;
    return dto;
  }
}
