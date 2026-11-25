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
import { ListPrivacyRequestsQueryDto } from "./dto/privacy-request.query.dto";
import { PrivacyRequestResponseDto } from "./dto/privacy-request.dto";

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
    const deadline = body.deadlineAt ? new Date(body.deadlineAt) : undefined;
    const request = await this.privacyService.createRequest(user.id, {
      type: body.type,
      reasonCommitment: body.reasonCommitment,
      deadlineAt: deadline,
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
}
