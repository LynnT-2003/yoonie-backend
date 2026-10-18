import { Reflector } from "@nestjs/core";
import { AppController } from "../../app.controller";
import { AuthController } from "../../auth/auth.controller";
import { UserController } from "../../user/user.controller";
import { BranchController } from "../../branch/branch.controller";
import { RoomController } from "../../room/room.controller";
import { RestaurantController } from "../../restaurant/restaurant.controller";
import { ServiceController } from "../../service/service.controller";
import { InventoryController } from "../../inventory/inventory.controller";
import { OrderController } from "../../order/order.controller";
import { DispatchController } from "../../dispatch/dispatch.controller";
import { R2Controller } from "../../storage/r2.controller";
import { StaffController } from "../../staff/staff.controller";
import { DevicesController } from "../../devices/devices.controller";
import { NotificationsController } from "../../notifications/notifications.controller";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";

export const PUBLIC_ALLOWLIST = new Set([
  "GET /", // AppController health check mounted at /api
  "POST /auth/register",
  "POST /auth/login",
  "POST /auth/forgot-password",
  "POST /auth/reset-password",
  "POST /auth/refresh",
  "GET /auth/verify-email",
  "POST /auth/resend-verification",
  "GET /branches",
  "GET /branches/:code",
  "GET /restaurants",
  "GET /restaurants/:id",
  "GET /services",
  "GET /services/:id",
  "GET /rooms",
  "GET /rooms/:id",
  "GET /inventory/availability",
  "POST /inventory/hold",
  "DELETE /inventory/hold/:id",
  "POST /orders",
  "GET /orders/:id",
  "POST /orders/:id/lines/:lineId/cancel",
  "POST /orders/webhook",
  "POST /staff/line/webhook",
  "POST /internal/notifications/tick",
]);

const ALL_CONTROLLERS = [
  AppController,
  AuthController,
  UserController,
  BranchController,
  RoomController,
  RestaurantController,
  ServiceController,
  InventoryController,
  OrderController,
  DispatchController,
  R2Controller,
  StaffController,
  DevicesController,
  NotificationsController,
];

describe("RBAC Decorator Audit (Route Enumeration via Reflector)", () => {
  const reflector = new Reflector();

  ALL_CONTROLLERS.forEach((controller) => {
    describe(controller.name, () => {
      const controllerPath = Reflect.getMetadata("path", controller) || "";
      const prototype = controller.prototype;
      const methods = Object.getOwnPropertyNames(prototype).filter(
        (m) =>
          m !== "constructor" &&
          typeof prototype[m] === "function" &&
          Reflect.getMetadata("path", prototype[m]) !== undefined,
      );

      methods.forEach((methodName) => {
        const handler = prototype[methodName];
        const routePath = Reflect.getMetadata("path", handler);
        const reqMethod = Reflect.getMetadata("method", handler); // 0=GET, 1=POST, 2=PUT, 3=DELETE, 4=PATCH

        const httpMethodName =
          {
            0: "GET",
            1: "POST",
            2: "PUT",
            3: "DELETE",
            4: "PATCH",
            5: "ALL",
            6: "OPTIONS",
            7: "HEAD",
          }[reqMethod as number] || "GET";

        const normalizedRoutePath = routePath
          ? `/${routePath}`.replace(/\/+/g, "/")
          : "";
        const normalizedPrefix = controllerPath
          ? `/${controllerPath}`.replace(/\/+/g, "/")
          : "";
        const fullEndpoint =
          `${httpMethodName} ${normalizedPrefix}${normalizedRoutePath}`.replace(
            /\/$/,
            "",
          ) || `${httpMethodName} /`;

        it(`should satisfy RBAC allowlist or require @Roles/@Permissions on ${fullEndpoint}`, () => {
          const isPublic = reflector.get<boolean>(IS_PUBLIC_KEY, handler);
          const roles = reflector.get<string[]>(ROLES_KEY, handler);
          const permissions = reflector.get<string[]>(PERMISSIONS_KEY, handler);

          if (isPublic) {
            // Must be strictly present in the public allowlist
            const isAllowed =
              PUBLIC_ALLOWLIST.has(fullEndpoint) ||
              PUBLIC_ALLOWLIST.has(`${httpMethodName} ${normalizedRoutePath}`);
            expect(isAllowed).toBe(true);
          } else {
            // If not public, must have @Roles or permissions (or be an authenticated route with explicit security)
            const isProtected =
              (roles && roles.length > 0) ||
              (permissions && permissions.length > 0) ||
              handler.name === "getMe" ||
              handler.name === "updateMe" ||
              handler.name === "deleteMe" ||
              handler.name === "uploadAvatar" ||
              handler.name === "logout" ||
              handler.name === "changePassword";
            expect(isProtected).toBe(true);
          }
        });
      });
    });
  });
});
