import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { PrivacyRequestType, PrivacyRequestStatus } from "@prisma/client";
import { Clock, SystemClock } from "../common/time/clock";
import { sha256 } from "../common/crypto/hash";
import { CreatePrivacyRequestDto } from "./dto/privacy-request.dto";
import { ListPrivacyRequestsQueryDto } from "./dto/privacy-request.query.dto";

const DEFAULT_TTL_DAYS = 30;
const RETAIN_DAYS = 90;

interface CreateInput {
  type: PrivacyRequestType;
  reasonCommitment: string;
  deadlineAt?: Date;
}

@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async createRequest(userId: string, input: CreateInput) {
    const deadline = input.deadlineAt ?? new Date(this.clock.nowMs() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);
    if (deadline <= this.clock.now()) {
      throw new BadRequestException("deadlineAt must be in the future");
    }

    // Bounded: at most one non-terminal request per user per type so a user
    // cannot flood and so states remain deterministic.
    const existing = await this.prisma.privacyRequest.findFirst({
      where: {
        userId,
        type: input.type,
        status: {
          in: [
            PrivacyRequestStatus.PENDING,
            PrivacyRequestStatus.IDENTITY_VERIFICATION,
            PrivacyRequestStatus.IN_PROGRESS,
          ],
        },
      },
    });
    if (existing) {
      throw new ConflictException("A privacy request of this type is already in progress");
    }

    const reasonHash = sha256(input.reasonCommitment);
    return this.prisma.privacyRequest.create({
      data: {
        userId,
        type: input.type,
        status: PrivacyRequestStatus.PENDING,
        reasonCommitment: reasonHash,
        deadlineAt: deadline,
        retainUntil: new Date(this.clock.nowMs() + RETAIN_DAYS * 24 * 60 * 60 * 1000),
      },
    });
  }

  async listRequests(userId: string, query: ListPrivacyRequestsQueryDto) {
    const where: Record<string, unknown> = { userId };
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;

    const take = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.privacyRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip: query.cursor ? 1 : 0,
        cursor: query.cursor ? { id: query.cursor } : undefined,
      }),
      this.prisma.privacyRequest.count({ where }),
    ]);

    return {
      data,
      pageInfo: { total, hasMore: query.cursor ? total > 0 : data.length === take },
    };
  }

  async getRequest(requestId: string, userId: string) {
    // Tenant isolation: requests are always scoped to the authenticated user.
    // One user can never retrieve another user's request.
    return this.prisma.privacyRequest.findFirst({ where: { id: requestId, userId } });
  }

  async verifyIdentity(requestId: string, userId: string, actorId: string) {
    const request = await this.prisma.privacyRequest.findFirst({ where: { id: requestId, userId } });
    if (!request) throw new NotFoundException("Privacy request not found");
    if (request.status !== PrivacyRequestStatus.PENDING) {
      throw new BadRequestException("Only pending requests can enter identity verification");
    }
    if (request.identityVerified) {
      throw new ConflictException("Identity already verified");
    }
    return this.prisma.privacyRequest.update({
      where: { id: requestId },
      data: {
        status: PrivacyRequestStatus.IDENTITY_VERIFICATION,
        identityVerified: true,
        identityVerifiedAt: this.clock.now(),
        identityVerifiedById: actorId,
      },
    });
  }

  async completeRequest(requestId: string, userId: string, actorId: string, resultHash: string) {
    const request = await this.prisma.privacyRequest.findFirst({ where: { id: requestId, userId } });
    if (!request) throw new NotFoundException("Privacy request not found");
    if (!request.identityVerified) {
      throw new ForbiddenException("Identity must be verified before completion");
    }
    if (request.status === PrivacyRequestStatus.COMPLETED) {
      throw new ConflictException("Request already completed");
    }
    return this.prisma.privacyRequest.update({
      where: { id: requestId },
      data: {
        status: PrivacyRequestStatus.COMPLETED,
        deliveryHash: sha256(resultHash),
        deliveredAt: this.clock.now(),
      },
    });
  }

  async rejectRequest(requestId: string, userId: string, actorId: string, reason: string) {
    const request = await this.prisma.privacyRequest.findFirst({ where: { id: requestId, userId } });
    if (!request) throw new NotFoundException("Privacy request not found");
    if (request.status === PrivacyRequestStatus.REJECTED) {
      throw new ConflictException("Request already rejected");
    }
    return this.prisma.privacyRequest.update({
      where: { id: requestId },
      data: {
        status: PrivacyRequestStatus.REJECTED,
        reasonCommitment: sha256(reason),
      },
    });
  }

  async expireOverdue() {
    const now = this.clock.now();
    return this.prisma.privacyRequest.updateMany({
      where: {
        status: {
          in: [
            PrivacyRequestStatus.PENDING,
            PrivacyRequestStatus.IDENTITY_VERIFICATION,
            PrivacyRequestStatus.IN_PROGRESS,
          ],
        },
        deadlineAt: { lt: now },
      },
      data: { status: PrivacyRequestStatus.EXPIRED },
    });
  }

  async addEvidence(requestId: string, userId: string, actorId: string, evidenceType: string, contentHash: string) {
    const request = await this.prisma.privacyRequest.findFirst({ where: { id: requestId, userId } });
    if (!request) throw new NotFoundException("Privacy request not found");
    return this.prisma.privacyRequestEvidence.create({
      data: {
        requestId,
        contentHash: sha256(contentHash),
        evidenceType,
        submittedById: actorId,
      },
    });
  }
}
