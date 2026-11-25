import { Test, TestingModule } from "@nestjs/testing";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";

describe("PrivacyController", () => {
  let controller: PrivacyController;
  let service: PrivacyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrivacyController],
      providers: [
        {
          provide: PrivacyService,
          useValue: {
            createRequest: jest.fn(),
            listRequests: jest.fn(),
            getRequest: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PrivacyController>(PrivacyController);
    service = module.get<PrivacyService>(PrivacyService);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("createRequest delegates to service", async () => {
    const user = { id: "user_1", walletAddress: "0xabc", walletHash: "hash", role: "WORKER" };
    const body = { type: "ACCESS", reasonCommitment: "commit" };
    const expected = { id: "req_1", userId: "user_1", type: "ACCESS", status: "PENDING" };
    jest.spyOn(service, "createRequest").mockResolvedValue(expected as any);
    const result = await controller.createRequest(user as any, body as any);
    expect(service.createRequest).toHaveBeenCalledWith("user_1", {
      type: "ACCESS",
      reasonCommitment: "commit",
      deadlineAt: undefined,
    });
    expect(result).toEqual(expected);
  });

  it("getRequest returns 404 when missing", async () => {
    jest.spyOn(service, "getRequest").mockResolvedValue(null);
    await expect(controller.getRequest({ id: "user_1" } as any, "req_missing")).rejects.toThrow();
  });
});
