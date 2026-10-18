import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionsGuard } from "./permissions.guard";
import { Permission } from "../enums/permission.enum";
import { UserRole } from "../enums/user-role.enum";

describe("PermissionsGuard & RolesGuard", () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  const createMockContext = (user: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as any;

  it("should allow through if no permissions are required", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    const context = createMockContext({
      userId: "u1",
      role: UserRole.STAFF,
      permissions: [],
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it("should throw ForbiddenException (403) when required permission is missing", () => {
    jest
      .spyOn(reflector, "getAllAndOverride")
      .mockReturnValue([Permission.HOUSEKEEPING_INSPECT]);

    const context = createMockContext({
      userId: "u1",
      role: UserRole.STAFF,
      permissions: [Permission.HOUSEKEEPING_STATUS],
      isPlatformAdmin: false,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("should allow through when user has all required permissions", () => {
    jest
      .spyOn(reflector, "getAllAndOverride")
      .mockReturnValue([
        Permission.HOUSEKEEPING_STATUS,
        Permission.HOUSEKEEPING_INSPECT,
      ]);

    const context = createMockContext({
      userId: "u1",
      role: UserRole.BRANCH_MGR,
      permissions: [
        Permission.HOUSEKEEPING_STATUS,
        Permission.HOUSEKEEPING_INSPECT,
      ],
      isPlatformAdmin: false,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it("should allow platform admin through even without explicit permissions", () => {
    jest
      .spyOn(reflector, "getAllAndOverride")
      .mockReturnValue([Permission.HOUSEKEEPING_INSPECT]);

    const context = createMockContext({
      userId: "u1",
      role: UserRole.ADMIN,
      permissions: [],
      isPlatformAdmin: true,
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
