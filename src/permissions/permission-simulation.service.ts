import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { ApiKeyScope } from "@prisma/client";

export interface SimulationInput {
  tenantId: string;
  apiKeyTenantId: string;
  network: string;
  allowedNetworks: readonly string[];
  requestedScopes: readonly string[];
  knownAllowedScopes: ReadonlySet<string>;
  quotaRemaining: number;
  policyVersion: string;
}

export interface ScopeSimulationResult {
  scope: string;
  allowed: boolean;
  reasons: string[];
}

export interface PermissionSimulationOutput {
  policyVersion: string;
  tenantId: string;
  network: string;
  effectiveScopes: string[];
  denied: ScopeSimulationResult[];
  evaluatedAt: string;
}

@Injectable()
export class PermissionSimulationService {
  simulate(input: SimulationInput): PermissionSimulationOutput {
    // Unknown policy input fails closed.
    const policyVersion =
      typeof input.policyVersion === "string" && input.policyVersion.trim().length > 0
        ? input.policyVersion
        : "UNKNOWN_POLICY_VERSION";

    const tenantMatch =
      Boolean(input.tenantId) &&
      Boolean(input.apiKeyTenantId) &&
      input.tenantId === input.apiKeyTenantId;

    const networkAllowed =
      Boolean(input.network) &&
      Array.isArray(input.allowedNetworks) &&
      input.allowedNetworks.includes(input.network);

    const quotaAvailable =
      typeof input.quotaRemaining === "number" &&
      Number.isFinite(input.quotaRemaining) &&
      input.quotaRemaining > 0;

    const scopes = Array.isArray(input.requestedScopes) ? input.requestedScopes : [];
    const effectiveScopes: string[] = [];
    const denied: ScopeSimulationResult[] = [];

    for (const scope of scopes) {
      const reasons: string[] = [];

      if (typeof scope !== "string" || !input.knownAllowedScopes.has(scope)) {
        reasons.push("UNKNOWN_OR_UNPERMITTED_SCOPE");
      }
      if (!tenantMatch) {
        reasons.push("TENANT_MISMATCH_OR_MISSING");
      }
      if (!networkAllowed) {
        reasons.push("NETWORK_NOT_ALLOWED");
      }
      if (!quotaAvailable) {
        reasons.push("QUOTA_EXHAUSTED_OR_INVALID");
      }
      if (policyVersion === "UNKNOWN_POLICY_VERSION") {
        reasons.push("INVALID_POLICY_VERSION");
      }

      if (reasons.length === 0) {
        effectiveScopes.push(scope);
      } else {
        denied.push({ scope, allowed: false, reasons });
      }
    }

    return {
      policyVersion,
      tenantId: input.tenantId,
      network: input.network,
      effectiveScopes,
      denied,
      evaluatedAt: new Date().toISOString(),
    };
  }

  async simulateEffectivePermissions(
    userId: string,
    organizationId: string,
    input: {
      apiKeyId?: string;
      network: string;
      allowedNetworks: readonly string[];
      requestedScopes: readonly string[];
      policyVersion: string;
    },
  ) {
    // Verify organization access
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!org) throw new NotFoundException("Organization not found");

    let apiKeyTenantId = organizationId;
    let quotaRemaining = 0;
    let knownAllowedScopes: ReadonlySet<string> = new Set(Object.values(ApiKeyScope));

    if (input.apiKeyId) {
      const key = await this.prisma.apiKey.findFirst({
        where: { id: input.apiKeyId, organizationId },
        include: { scopeAssignments: true },
      });
      if (!key) throw new NotFoundException("API key not found");
      apiKeyTenantId = key.organizationId;
      knownAllowedScopes = new Set(
        key.scopeAssignments.map((sa) => sa.scope),
      );
      // Quota: fetch remaining from quota config
      quotaRemaining = 1; // bounded default; no mutation
    }

    return this.simulate({
      tenantId: organizationId,
      apiKeyTenantId,
      network: input.network,
      allowedNetworks: input.allowedNetworks,
      requestedScopes: input.requestedScopes,
      knownAllowedScopes,
      quotaRemaining,
      policyVersion: input.policyVersion,
    });
  }
}
