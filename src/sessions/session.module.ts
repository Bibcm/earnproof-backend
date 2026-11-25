import { Module } from "@nestjs/common";
import { SessionController } from "./session.controller";
import { SessionPolicyService } from "./session-policy.service";

@Module({
  controllers: [SessionController],
  providers: [SessionPolicyService],
  exports: [SessionPolicyService],
})
export class SessionModule {}
