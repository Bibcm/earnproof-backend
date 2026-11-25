import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { Clock, SystemClock } from "../common/time/clock";

export type SessionPolicyConfig = {
  idleTimeoutSeconds: number;
  maxSessionDurationSeconds: number;
  extensionWindowSeconds: number;
  maxExtensionsPerSession: number;
};

export const DEFAULT_SESSION_POLICY: SessionPolicyConfig = {
  idleTimeoutSeconds: 900,
  maxSessionDurationSeconds: 28_800,
  extensionWindowSeconds: 900,
  maxExtensionsPerSession: 3,
};

@Injectable()
export class SessionPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async getPolicy(organizationId: string | null): Promise<SessionPolicyConfig> {
    if (!organizationId) return { ...DEFAULT_SESSION_POLICY };
    const policy = await this.prisma.organizationSessionPolicy.findUnique({
      where: { organizationId },
    });
    if (!policy) return { ...DEFAULT_SESSION_POLICY };
    return {
      idleTimeoutSeconds: policy.idleTimeoutSeconds,
      maxSessionDurationSeconds: policy.maxSessionDurationSec,
      extensionWindowSeconds: policy.extensionWindowSec,
      maxExtensionsPerSession: policy.maxExtensionsPerSession,
    };
  }

  isSessionExpired(
    session: { expiresAt: Date; lastActivityAt: Date; revokedAt: Date | null; createdAt: Date },
    policy: SessionPolicyConfig,
    at: Date = this.clock.now(),
  ): boolean {
    const ts = at.getTime();
    if (session.revokedAt !== null) return true;
    if (ts >= session.expiresAt.getTime()) return true;
    const maxDeadline = new Date(session.createdAt.getTime() + policy.maxSessionDurationSeconds * 1000);
    if (ts >= maxDeadline.getTime()) return true;
    const idleMs = policy.idleTimeoutSeconds * 1000;
    return ts - session.lastActivityAt.getTime() >= idleMs;
  }

  async recordActivity(sessionId: string, userId: string) {
    const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
      throw new NotFoundException("Session not found");
    }
    const policy = await this.getPolicy(session.organizationId ?? null);
    if (this.isSessionExpired(session, policy)) {
      await this.recordAudit(session.id, session.userId, "HEARTBEAT", "DENIED", { reason: "SESSION_EXPIRED" });
      throw new BadRequestException("Session has expired; heartbeat cannot revive it");
    }
    const updated = await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { lastActivityAt: this.clock.now() },
    });
    await this.recordAudit(session.id, session.userId, "HEARTBEAT", "ALLOWED", {});
    return { active: true, expiresAt: updated.expiresAt };
  }

  async extendSession(sessionId: string, userId: string) {
    const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
      throw new NotFoundException("Session not found");
    }
    const policy = await this.getPolicy(session.organizationId ?? null);
    if (this.isSessionExpired(session, policy)) {
      await this.recordAudit(session.id, session.userId, "EXTEND", "DENIED", { reason: "SESSION_EXPIRED" });
      throw new BadRequestException("Expired sessions cannot be extended");
    }
    if (session.extensionCount >= policy.maxExtensionsPerSession) {
      await this.recordAudit(session.id, session.userId, "EXTEND", "DENIED", { reason: "MAX_EXTENSIONS" });
      throw new ConflictException("Maximum extensions reached");
    }
    const now = this.clock.now();
    const currentExpiry = new Date(Math.max(session.expiresAt.getTime(), now.getTime()));
    const extended = new Date(currentExpiry.getTime() + policy.extensionWindowSeconds * 1000);
    const maxDeadline = new Date(session.createdAt.getTime() + policy.maxSessionDurationSeconds * 1000);
    const expiresAt = extended > maxDeadline ? maxDeadline : extended;
    const updated = await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { expiresAt, extensionCount: session.extensionCount + 1, lastActivityAt: now },
    });
    await this.recordAudit(session.id, session.userId, "EXTEND", "ALLOWED", { expiresAt });
    return { active: true, expiresAt: updated.expiresAt, extensionCount: updated.extensionCount };
  }

  async revokeSession(sessionId: string, userId: string, reason: string) {
    const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
      throw new NotFoundException("Session not found");
    }
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: this.clock.now(), revokedReason: reason },
    });
    await this.recordAudit(session.id, session.userId, "REVOKE", "ALLOWED", { reason });
    return { revoked: true };
  }

  async getSession(sessionId: string, userId: string) {
    const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
      throw new NotFoundException("Session not found");
    }
    const policy = await this.getPolicy(session.organizationId ?? null);
    const expired = this.isSessionExpired(session, policy);
    return { session, expired, policy };
  }

  private async recordAudit(
    sessionId: string,
    userId: string,
    action: string,
    outcome: string,
    metadata: Record<string, unknown>,
  ) {
    await this.prisma.sessionAuditEvent.create({
      data: { sessionId, userId, action, outcome, metadata, occurredAt: this.clock.now() },
    });
  }
}
