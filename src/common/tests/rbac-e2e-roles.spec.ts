import { Test, TestingModule } from "@nestjs/testing";
import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from "@nestjs/common";
import request from "supertest";
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from "@nestjs/core";
import { JwtGuard } from "../guards/jwt.guard";
import { RolesGuard } from "../guards/roles.guard";
import { PermissionsGuard } from "../guards/permissions.guard";
import { TransformInterceptor } from "../interceptors/transform.interceptor";
import { HttpExceptionFilter } from "../filters/http-exception.filter";
import { AppController } from "../../app.controller";
import { AppService } from "../../app.service";
import { BranchController } from "../../branch/branch.controller";
import { BranchService } from "../../branch/branch.service";
import { RoomController } from "../../room/room.controller";
import { RoomService } from "../../room/room.service";
import { DispatchController } from "../../dispatch/dispatch.controller";
import { DispatchService } from "../../dispatch/dispatch.service";
import { R2Controller } from "../../storage/r2.controller";
import { R2Service } from "../../storage/r2.service";
import { StaffController } from "../../staff/staff.controller";
import { StaffService } from "../../staff/staff.service";
import { UserRole } from "../enums/user-role.enum";
import { Permission } from "../enums/permission.enum";
import { CleaningStatus } from "../enums/cleaning-status.enum";
import { DispatchStatus } from "../enums/dispatch.enum";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { ICurrentUser } from "../interfaces/user.interface";
import { Types } from "mongoose";

describe("E2E Role Matrix & Idempotency Replay (Requirements b & f)", () => {
  let app: INestApplication;

  const branchA = new Types.ObjectId().toString();
  const roomIdA = new Types.ObjectId().toString();

  const mockUsers: Record<string, ICurrentUser> = {
    guest: {
      userId: new Types.ObjectId().toString(),
      email: "guest@hotel.com",
      role: UserRole.GUEST,
      isSuspended: false,
      branchIds: [],
      permissions: [],
      isPlatformAdmin: false,
    },
    housekeeper: {
      userId: new Types.ObjectId().toString(),
      email: "cleaner@hotel.com",
      role: UserRole.STAFF,
      isSuspended: false,
      branchIds: [branchA],
      permissions: [Permission.HOUSEKEEPING_STATUS],
      isPlatformAdmin: false,
    },
    driver: {
      userId: new Types.ObjectId().toString(),
      email: "driver@hotel.com",
      role: UserRole.STAFF,
      isSuspended: false,
      branchIds: [branchA],
      permissions: [Permission.PICKUP_EXECUTE],
      isPlatformAdmin: false,
    },
    dispatcher: {
      userId: new Types.ObjectId().toString(),
      email: "dispatcher@hotel.com",
      role: UserRole.DISPATCHER,
      isSuspended: false,
      branchIds: [branchA],
      permissions: [Permission.DISPATCH_MANAGE],
      isPlatformAdmin: false,
    },
    manager: {
      userId: new Types.ObjectId().toString(),
      email: "mgr@hotel.com",
      role: UserRole.BRANCH_MGR,
      isSuspended: false,
      branchIds: [branchA],
      permissions: [],
      isPlatformAdmin: false,
    },
    admin: {
      userId: new Types.ObjectId().toString(),
      email: "admin@platform.com",
      role: UserRole.ADMIN,
      isSuspended: false,
      branchIds: [],
      permissions: [],
      isPlatformAdmin: true,
    },
  };

  // Mock services
  const mockBranchService = {
    findAll: jest.fn().mockResolvedValue([{ code: "BKK", name: "Bangkok" }]),
    create: jest.fn().mockResolvedValue({ code: "CNX", name: "Chiang Mai" }),
  };

  const mockRoomService = {
    getRoomTypesCatalog: jest.fn().mockResolvedValue([{ roomType: "DELUXE" }]),
    getHousekeepingBoard: jest.fn().mockResolvedValue({ dirty: [], clean: [] }),
    create: jest.fn().mockResolvedValue({ roomNumber: "101" }),
  };

  const mockDispatchService = {
    findByServiceDate: jest.fn().mockResolvedValue([]),
    updateStatus: jest.fn().mockResolvedValue({ status: "IN_PROGRESS" }),
  };

  const mockR2Service = {
    getPresignedUploadUrl: jest.fn().mockResolvedValue({
      uploadUrl: "https://r2.dev/upload",
      key: "rooms/key.jpg",
    }),
  };

  // Mock idempotency key in-memory store for test
  const idemStore = new Map<
    string,
    {
      key: string;
      userId?: any;
      bodyHash: string;
      state: string;
      response: any;
    }
  >();

  class TestJwtGuard extends JwtGuard {
    constructor(reflector: any) {
      super(reflector);
    }

    override canActivate(context: any) {
      const isPublic = (this as any).reflector.getAllAndOverride(
        IS_PUBLIC_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (isPublic) return true;

      const req = context.switchToHttp().getRequest();
      if (!req.user) {
        throw new UnauthorizedException("invalid access token");
      }
      return true;
    }
  }

  const mockStaffService = {
    getTasks: jest.fn().mockResolvedValue({ turns: [], pickups: [] }),
    transitionRoom: jest.fn().mockImplementation((_user, id, dto) =>
      Promise.resolve({
        roomId: id,
        roomNumber: "101",
        cleaningStatus: dto.toStatus,
        isNoOp: false,
      }),
    ),
  };

  const mockIdempotencyModel: any = {
    findOne: jest.fn().mockImplementation((query) => {
      const entry = idemStore.get(query.key);
      if (!entry) return Promise.resolve(null);
      return Promise.resolve({
        key: entry.key,
        bodyHash: entry.bodyHash,
        state: entry.state,
        response: entry.response,
      });
    }),
    create: jest.fn().mockImplementation((data) => {
      if (idemStore.has(data.key)) {
        const duplicateError: any = new Error("E11000 duplicate key error");
        duplicateError.code = 11000;
        throw duplicateError;
      }
      const entry = {
        key: data.key,
        userId: data.userId,
        bodyHash: data.bodyHash,
        state: data.state,
        response: null,
      };
      idemStore.set(data.key, entry);
      return entry;
    }),
    updateOne: jest.fn().mockImplementation((query, update) => {
      const entry = idemStore.get(query.key);
      if (entry && update?.$set) {
        Object.assign(entry, update.$set);
      }
      return Promise.resolve({ matchedCount: 1 });
    }),
    deleteOne: jest.fn().mockImplementation((query) => {
      idemStore.delete(query.key);
      return Promise.resolve({ deletedCount: 1 });
    }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [
        AppController,
        BranchController,
        RoomController,
        DispatchController,
        R2Controller,
        StaffController,
      ],
      providers: [
        AppService,
        { provide: BranchService, useValue: mockBranchService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: DispatchService, useValue: mockDispatchService },
        { provide: R2Service, useValue: mockR2Service },
        { provide: StaffService, useValue: mockStaffService },
        { provide: "IdempotencyKeyModel", useValue: mockIdempotencyModel },
        {
          provide: APP_GUARD,
          useClass: TestJwtGuard,
        },
        {
          provide: APP_GUARD,
          useClass: RolesGuard,
        },
        {
          provide: APP_GUARD,
          useClass: PermissionsGuard,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: TransformInterceptor,
        },
        {
          provide: APP_FILTER,
          useClass: HttpExceptionFilter,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );

    // Mock request authentication middleware for test roles
    app.use((req: any, _res: any, next: any) => {
      const roleHeader = req.headers["x-test-role"];
      if (roleHeader && mockUsers[roleHeader]) {
        req.user = mockUsers[roleHeader];
      }
      next();
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Requirement b: Supertest e2e role authorization matrix", () => {
    it("GET /api (Health Check) - public, accessible to all", async () => {
      const res = await request(app.getHttpServer()).get("/api");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("GET /api/branches - public catalog, accessible without auth", async () => {
      const res = await request(app.getHttpServer()).get("/api/branches");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("POST /api/branches - unauthenticated rejected with 401", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/branches")
        .send({ code: "HKT", name: "Phuket" });
      expect(res.status).toBe(401);
    });

    it("POST /api/branches - manager rejected with 403 (Platform Admin only)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/branches")
        .set("x-test-role", "manager")
        .send({ code: "HKT", name: "Phuket" });
      expect(res.status).toBe(403);
    });

    it("POST /api/branches - platform admin accepted with 201", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/branches")
        .set("x-test-role", "admin")
        .send({ code: "HKT", name: "Phuket" });
      expect(res.status).toBe(201);
    });

    it("GET /api/rooms/housekeeping - guest rejected with 403", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/rooms/housekeeping")
        .set("x-test-role", "guest");
      expect(res.status).toBe(403);
    });

    it("GET /api/rooms/housekeeping - housekeeper rejected with 403 (Staff/Housekeeper is not manager/admin)", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/rooms/housekeeping")
        .set("x-test-role", "housekeeper");
      expect(res.status).toBe(403);
    });

    it("GET /api/rooms/housekeeping - manager accepted with 200", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/rooms/housekeeping")
        .set("x-test-role", "manager");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("GET /api/dispatch - driver rejected with 403", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/dispatch?serviceDate=2026-10-20")
        .set("x-test-role", "driver");
      expect(res.status).toBe(403);
    });

    it("GET /api/dispatch - dispatcher accepted with 200", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/dispatch?serviceDate=2026-10-20")
        .set("x-test-role", "dispatcher");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("POST /api/storage/presigned-url - driver rejected with 403", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/storage/presigned-url")
        .set("x-test-role", "driver")
        .send({ filename: "room.jpg", contentType: "image/jpeg" });
      expect(res.status).toBe(403);
    });

    it("POST /api/storage/presigned-url - manager accepted with 201 when folder has branch scope", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/storage/presigned-url")
        .set("x-test-role", "manager")
        .send({
          filename: "room.jpg",
          contentType: "image/jpeg",
          folder: `branches/${branchA}/rooms`,
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  describe("Requirement f: Idempotency replay through real HTTP stack with global envelope", () => {
    const idemKey = `idem_e2e_${Date.now()}`;
    const payload = { toStatus: CleaningStatus.CLEAN };

    it("should process initial request, wrap in envelope and store idempotency response", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/staff/rooms/${roomIdA}/transition`)
        .set("x-test-role", "housekeeper")
        .set("Idempotency-Key", idemKey)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.statusCode).toBe(201);
      expect(res.body.data.cleaningStatus).toBe(CleaningStatus.CLEAN);
      expect(res.body.timestamp).toBeDefined();
    });

    it("should replay the exact same response on duplicate request with same body", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/staff/rooms/${roomIdA}/transition`)
        .set("x-test-role", "housekeeper")
        .set("Idempotency-Key", idemKey)
        .send(payload);

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect([200, 201]).toContain(res.body.statusCode);
      expect(res.body.data.cleaningStatus).toBe(CleaningStatus.CLEAN);
      expect(res.body.timestamp).toBeDefined();
    });

    it("should return 422 Unprocessable Entity when same key is sent with different body", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/staff/rooms/${roomIdA}/transition`)
        .set("x-test-role", "housekeeper")
        .set("Idempotency-Key", idemKey)
        .send({ toStatus: CleaningStatus.DIRTY, reason: "mismatch" });

      expect(res.status).toBe(422);
    });
  });
});
