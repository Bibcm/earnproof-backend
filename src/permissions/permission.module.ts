import { Module } from "@nestjs/common";
import { PermissionController } from "./permission.controller";
import { PermissionSimulationService } from "./permission-simulation.service";

@Module({
  controllers: [PermissionController],
  providers: [PermissionSimulationService],
  exports: [PermissionSimulationService],
})
export class PermissionModule {}
