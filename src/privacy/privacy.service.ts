import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import {
  PrivacyRequestType,
  PrivacyRequestStatus,
} from "@prisma/client";
import { Clock, SystemClock } from "../common/time/clock";
import { sha256 } from "../common/crypto/hash";
import { CreatePrivacyRequestDto } from "./dto/privacy-request.dto";
import { ListPrivacyRequestsQueryDto } from "./dto/privacy-request.dto";

const DEFAULT_TTL_DAYS = 30;
const RETAIN_DAYS = 90;

const NON_TERMINAL_STATUSES = [
  PrivacyRequestStatus.PENDING_VERIFICATION,
  PrivacyRequestStatus.VERIFIED,
  PrivacyRequestStatus.IN_PROGRESS,
];

export const IMMUTABLE_LEDGER_LIMITATION =
  "Immutable ledger records cannot be altered or deleted in place; off-chain records and fulfillment metadata are governed according to policy.";

interface CreateInput {
  type: PrivacyRequestType;
  dueAt?: Date;
}

@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async createRequest(userId: string, input: CreateInput) {
    const now = this.clock.now();
    const dueAt = input.dueAt ?? new Date(now.getTime() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);
    if (dueAt <= now) {
      throw new BadRequestException("dueAt must be in the future");
    }

    // Bounded: at most one non-terminal request per user per type so states
    // remain deterministic and a user cannot flood.
    const existing = await this.prisma.privacyRequest.findFirst({
      where: {
        userId,
        type: input.type,
        status: { in: NON_TERMINAL_STATUSES },
      },
    });
    if (existing) {
      throw new ConflictException("A privacy request of this type is already in progress");
    }

    return this.prisma.privacyRequest.create({
      data: {
        userId,
        type: input.type,
        status: PrivacyRequestStatus.PENDING_VERIFICATION,
        dueAt,
        retentionUntil: new Date(now.getTime() + RETAIN_DAYS * 24 * 60 * 60 * 1000),
        ledgerLimitationNote: IMMUTABLE_LEDGER_LIMITATION,
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
        orderBy: { requestedAt: "desc" },
        take,
        skip: query.cursor ? 1 : 0,
        cursor: query.cursor ? { id: query.cursor } : undefined,
      }),
      this.prisma.privacyRequest.count({ where }),
    ]);

    return {
      data,
      pageInfo: { total, hasMore: data.length === take },
    };
  }

  /** Tenant-isolated lookup: one user can never retrieve another user's request. */
  async getRequest(requestId: string, userId: string) {
    return this.prisma.privacyRequest.findFirst({ where: { id: requestId, userId } });
  }

  async verifyIdentity(requestId: string, userId: string, actorId: string, verificationTokenHash: string) {
    const request = await this.getRequest(requestId, userId);
    if (!request) throw new NotFoundException("Privacy request not found");
    if (request.status !== PrivacyRequestStatus.PENDING_VERIFICATION) {
      throw new BadRequestException("Only pending-verification requests can be identity-verified");
    }
    if (request.verifiedAt !== null) {
      throw new ConflictException("Identity already verified");
    }
    return this.prisma.privacyRequest.update({
      where: { id: requestId },
      data: {
        status: PrivacyRequestStatus.VERIFIED,
        verificationTokenHash: sha256(verificationTokenHash),
        verifiedAt: this.clock.now(),
      },
    });
  }

  async completeRequest(requestId: string, userId: string, actorId: string, resultDeliveryRef: string) {
    const request = await this.getRequest(requestId, userId);
    if (!request) throw new NotFoundException("Privacy request not found");
    if (request.status === PrivacyRequestStatus.COMPLETED) {
      throw new ConflictException("Request already completed");
    }
    if (![PrivacyRequestStatus.VERIFIED, PrivacyRequestStatus.IN_PROGRESS].includes(request.status)) {
      throw new BadRequestException("Request must be verified before completion");
    }
    return this.prisma.privacyRequest.update({
      where: { id: requestId },
      data: {
        status: PrivacyRequestStatus.COMPLETED,
        resultDeliveryRef,
        completedAt: this.clock.now(),
      },
    });
  }

  async rejectRequest(requestId: string, userId: string, actorId: string, resolutionReason: string) {
    const request = await this.getRequest(requestId, userId);
    if (!request) throw new NotFoundException("Privacy request not found");
    if (request.status === PrivacyRequestStatus.DENIED) {
      throw new ConflictException("Request already denied");
    }
    return this.prisma.privacyRequest.update({
      where: { id: requestId },
      data: {
        status: PrivacyRequestStatus.DENIED,
        resolutionReason,
      },
    });
  }

  async cancelRequest(requestId: string, userId: string, actorId: string) {
    const request = await this.getRequest(requestId, userId);
    if (!request) throw new NotFoundException("Privacy request not found");
    if (request.status === PrivacyRequestStatus.CANCELLED) {
      throw new ConflictException("Request already cancelled");
    }
    if (!NON_TERMINAL_STATUSES.includes(request.status)) {
      throw new BadRequestException("Only non-terminal requests can be cancelled");
    }
    return this.prisma.privacyRequest.update({
      where: { id: requestId },
      data: { status: PrivacyRequestStatus.CANCELLED },
    });
  }

  async addEvidence(requestId: string, userId: string, actorId: string, evidenceRef: string) {
    const request = await this.getRequest(requestId, userId);
    if (!request) throw new NotFoundException("Privacy request not found");
    if (!NON_TERMINAL_STATUSES.includes(request.status)) {
      throw new BadRequestException("Evidence cannot be added to a terminal request");
    }
    return this.prisma.privacyRequest.update({
      where: { id: requestId },
      data: {
        evidenceRef,
        status: PrivacyRequestStatus.IN_PROGRESS,
      },
    });
  }

  async expireOverdue() {
    const now = this.clock.now();
    return this.prisma.privacyRequest.updateMany({
      where: {
        status: { in: NON_TERMINAL_STATUSES },
        dueAt: { lt: now },
      },
      data: { status: PrivacyRequestStatus.EXPIRED },
    });
  }
}
