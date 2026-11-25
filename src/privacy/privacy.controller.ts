import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Query,
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
import { PrivacyService } from "./privacy.service";
import { CreatePrivacyRequestDto } from "./dto/privacy-request.dto";
import { ListPrivacyRequestsQueryDto } from "./dto/privacy-request.dto";
import { PrivacyRequestResponseDto } from "./dto/privacy-request-response.dto";
import { VerifyIdentityDto } from "./dto/privacy-request.dto";
import { CompletePrivacyRequestDto } from "./dto/privacy-request.dto";
import { RejectPrivacyRequestDto } from "./dto/privacy-request.dto";
import { AddEvidenceDto } from "./dto/privacy-request.dto";

@ApiBearerAuth(SESSION_AUTH_SCHEME)
@UseGuards(AuthGuard)
@ApiTags("privacy")
@Controller("privacy")
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Post("requests")
  @ApiOperation({ summary: "Submit a user privacy request" })
  @ApiResponse({ status: 201, description: "Privacy request created", type: PrivacyRequestResponseDto })
  @ApiResponse({ status: 400, description: "Invalid request", type: ApiErrorDto })
  @ApiResponse({ status: 401, description: "Unauthenticated", type: ApiErrorDto })
  @ApiResponse({ status: 409, description: "Request already in progress", type: ApiErrorDto })
  async createRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreatePrivacyRequestDto,
  ) {
    const dueAt = body.dueAt ? new Date(body.dueAt) : undefined;
    const request = await this.privacyService.createRequest(user.id, {
      type: body.type,
      dueAt,
    });
    return PrivacyRequestResponseDto.from(request);
  }

  @Get("requests")
  @ApiOperation({ summary: "List the caller's privacy requests" })
  @ApiResponse({ status: 200, description: "Privacy requests", type: [PrivacyRequestResponseDto] })
  @ApiResponse({ status: 401, description: "Unauthenticated", type: ApiErrorDto })
  async listRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListPrivacyRequestsQueryDto,
  ) {
    return this.privacyService.listRequests(user.id, query);
  }

  @Get("requests/:id")
  @ApiOperation({ summary: "Get a privacy request by id" })
  @ApiResponse({ status: 200, description: "Privacy request", type: PrivacyRequestResponseDto })
  @ApiResponse({ status: 401, description: "Unauthenticated", type: ApiErrorDto })
  @ApiResponse({ status: 404, description: "Not found", type: ApiErrorDto })
  async getRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    const request = await this.privacyService.getRequest(id, user.id);
    if (!request) throw new NotFoundException("Privacy request not found");
    return PrivacyRequestResponseDto.from(request);
  }

  @Post("requests/:id/verify-identity")
  @ApiOperation({ summary: "Verify identity for a privacy request" })
  @ApiResponse({ status: 200, description: "Identity verified", type: PrivacyRequestResponseDto })
  @ApiResponse({ status: 400, description: "Invalid state", type: ApiErrorDto })
  @ApiResponse({ status: 401, description: "Unauthenticated", type: ApiErrorDto })
  @ApiResponse({ status: 404, description: "Not found", type: ApiErrorDto })
  async verifyIdentity(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: VerifyIdentityDto,
  ) {
    const request = await this.privacyService.verifyIdentity(
      id,
      user.id,
      user.id,
      body.verificationTokenHash,
    );
    if (!request) throw new NotFoundException("Privacy request not found");
    return PrivacyRequestResponseDto.from(request);
  }

  @Post("requests/:id/complete")
  @ApiOperation({ summary: "Complete a privacy request" })
  @ApiResponse({ status: 200, description: "Request completed", type: PrivacyRequestResponseDto })
  @ApiResponse({ status: 400, description: "Invalid state", type: ApiErrorDto })
  @ApiResponse({ status: 401, description: "Unauthenticated", type: ApiErrorDto })
  @ApiResponse({ status: 404, description: "Not found", type: ApiErrorDto })
  async completeRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: CompletePrivacyRequestDto,
  ) {
    const request = await this.privacyService.completeRequest(
      id,
      user.id,
      user.id,
      body.resultDeliveryRef,
    );
    if (!request) throw new NotFoundException("Privacy request not found");
    return PrivacyRequestResponseDto.from(request);
  }

  @Post("requests/:id/reject")
  @ApiOperation({ summary: "Reject a privacy request" })
  @ApiResponse({ status: 200, description: "Request rejected", type: PrivacyRequestResponseDto })
  @ApiResponse({ status: 400, description: "Invalid state", type: ApiErrorDto })
  @ApiResponse({ status: 401, description: "Unauthenticated", type: ApiErrorDto })
  @ApiResponse({ status: 404, description: "Not found", type: ApiErrorDto })
  async rejectRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: RejectPrivacyRequestDto,
  ) {
    const request = await this.privacyService.rejectRequest(
      id,
      user.id,
      user.id,
      body.resolutionReason,
    );
    if (!request) throw new NotFoundException("Privacy request not found");
    return PrivacyRequestResponseDto.from(request);
  }

  @Post("requests/:id/cancel")
  @ApiOperation({ summary: "Cancel a privacy request" })
  @ApiResponse({ status: 200, description: "Request cancelled", type: PrivacyRequestResponseDto })
  @ApiResponse({ status: 400, description: "Invalid state", type: ApiErrorDto })
  @ApiResponse({ status: 401, description: "Unauthenticated", type: ApiErrorDto })
  @ApiResponse({ status: 404, description: "Not found", type: ApiErrorDto })
  async cancelRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    const request = await this.privacyService.cancelRequest(id, user.id, user.id);
    if (!request) throw new NotFoundException("Privacy request not found");
    return PrivacyRequestResponseDto.from(request);
  }

  @Post("requests/:id/evidence")
  @ApiOperation({ summary: "Add evidence to a privacy request" })
  @ApiResponse({ status: 200, description: "Evidence added", type: PrivacyRequestResponseDto })
  @ApiResponse({ status: 400, description: "Invalid state", type: ApiErrorDto })
  @ApiResponse({ status: 401, description: "Unauthenticated", type: ApiErrorDto })
  @ApiResponse({ status: 404, description: "Not found", type: ApiErrorDto })
  async addEvidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: AddEvidenceDto,
  ) {
    const request = await this.privacyService.addEvidence(
      id,
      user.id,
      user.id,
      body.evidenceRef,
    );
    if (!request) throw new NotFoundException("Privacy request not found");
    return PrivacyRequestResponseDto.from(request);
  }
}
