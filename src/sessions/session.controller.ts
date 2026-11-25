import {
  Body,
  Controller,
  Get,
  Post,
  Param,
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
import { SessionPolicyService } from "./session-policy.service";

@ApiBearerAuth(SESSION_AUTH_SCHEME)
@UseGuards(AuthGuard)
@ApiTags("sessions")
@Controller("sessions")
export class SessionController {
  constructor(private readonly sessionPolicyService: SessionPolicyService) {}

  @Get("policy")
  @ApiOperation({ summary: "Get the organization session policy" })
  @ApiResponse({ status: 200, description: "Session policy" })
  @ApiResponse({ status: 401, description: "Unauthenticated", type: ApiErrorDto })
  async getPolicy(@CurrentUser() user: AuthenticatedUser) {
    return this.sessionPolicyService.getPolicy(user.organizationId ?? null);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a session and its expiry status" })
  @ApiResponse({ status: 200, description: "Session status" })
  @ApiResponse({ status: 401, description: "Unauthenticated", type: ApiErrorDto })
  @ApiResponse({ status: 404, description: "Not found", type: ApiErrorDto })
  async getSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.sessionPolicyService.getSession(id, user.id);
  }

  @Post(":id/heartbeat")
  @ApiOperation({ summary: "Record activity for a session (does not extend expiry)" })
  @ApiResponse({ status: 200, description: "Activity recorded" })
  @ApiResponse({ status: 400, description: "Session expired", type: ApiErrorDto })
  @ApiResponse({ status: 401, description: "Unauthenticated", type: ApiErrorDto })
  @ApiResponse({ status: 404, description: "Not found", type: ApiErrorDto })
  async heartbeat(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.sessionPolicyService.recordActivity(id, user.id);
  }

  @Post(":id/extend")
  @ApiOperation({ summary: "Extend a session within policy bounds" })
  @ApiResponse({ status: 200, description: "Session extended" })
  @ApiResponse({ status: 400, description: "Session expired", type: ApiErrorDto })
  @ApiResponse({ status: 409, description: "Max extensions reached", type: ApiErrorDto })
  @ApiResponse({ status: 401, description: "Unauthenticated", type: ApiErrorDto })
  @ApiResponse({ status: 404, description: "Not found", type: ApiErrorDto })
  async extend(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.sessionPolicyService.extendSession(id, user.id);
  }

  @Post(":id/revoke")
  @ApiOperation({ summary: "Revoke a session" })
  @ApiResponse({ status: 200, description: "Session revoked" })
  @ApiResponse({ status: 404, description: "Not found", type: ApiErrorDto })
  @ApiResponse({ status: 401, description: "Unauthenticated", type: ApiErrorDto })
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: { reason?: string },
  ) {
    return this.sessionPolicyService.revokeSession(id, user.id, body?.reason ?? "USER_REVOCATION");
  }
}
