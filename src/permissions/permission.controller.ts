import {
  Body,
  Controller,
  Post,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AuthGuard } from "../common/guards/auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { ApiErrorDto } from "../common/dto/api-error.dto";
import { SESSION_AUTH_SCHEME } from "../common/swagger/security-schemes";
import { PermissionSimulationService } from "./permission-simulation.service";

export class SimulateEffectivePermissionsDto {
  network: string;
  allowedNetworks: string[];
  requestedScopes: string[];
  policyVersion: string;
  apiKeyId?: string;
}

@ApiBearerAuth(SESSION_AUTH_SCHEME)
@UseGuards(AuthGuard)
@ApiTags("permissions")
@Controller("permissions")
export class PermissionController {
  constructor(private readonly permissionSimulationService: PermissionSimulationService) {}

  @Post("simulate")
  @ApiOperation({ summary: "Simulate effective permissions for an API key (non-mutating)" })
  @ApiResponse({ status: 200, description: "Simulation result" })
  @ApiResponse({ status: 400, description: "Invalid input", type: ApiErrorDto })
  @ApiResponse({ status: 401, description: "Unauthenticated", type: ApiErrorDto })
  @ApiResponse({ status: 404, description: "Organization or key not found", type: ApiErrorDto })
  async simulate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SimulateEffectivePermissionsDto,
  ) {
    const organizationId = user.organizationId;
    if (!organizationId) {
      throw new ForbiddenException("User has no organization context");
    }

    return this.permissionSimulationService.simulateEffectivePermissions(
      user.id,
      organizationId,
      {
        apiKeyId: body.apiKeyId,
        network: body.network,
        allowedNetworks: body.allowedNetworks,
        requestedScopes: body.requestedScopes,
        policyVersion: body.policyVersion,
      },
    );
  }
}
