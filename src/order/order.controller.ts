import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { UserRole } from "../common/enums/user-role.enum";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { OrderService } from "./order.service";
import { CreateOrderDto } from "./dto/requests/create-order.dto";
import { ConfirmPaymentDto } from "./dto/requests/confirm-payment.dto";
import { CancelOrderLineDto } from "./dto/requests/cancel-order-line.dto";
import { RecordPaymentDto } from "./dto/requests/record-payment.dto";
import { UpdateFlightDto } from "./dto/requests/update-flight.dto";
import { OrderResponseDto } from "./dto/responses/order-response.dto";

@ApiTags("Orders & Bookings")
@ApiBearerAuth("JWT-auth")
@Throttle({ default: { limit: 20, ttl: 60000 } })
@Controller("orders")
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Public guest checkout: Create a composite multi-product order",
    description:
      "Public checkout endpoint. Computes prices server-side from catalog, validates hold belongs to cart, validates branch is active, and returns signed order token.",
  })
  @ApiResponse({
    status: 201,
    description: "Order created successfully with signed guest order token",
    type: OrderResponseDto,
  })
  async createOrder(@Body() orderData: CreateOrderDto) {
    return this.orderService.createFromCheckout(orderData);
  }

  @Public()
  @Get(":id")
  @ApiHeader({
    name: "x-order-token",
    description: "Signed order token for guest access",
    required: false,
  })
  @ApiQuery({
    name: "token",
    description: "Signed order token for guest access",
    required: false,
  })
  @ApiOperation({
    summary:
      "Get order details (Staff branch-scoped or Guest with signed token)",
  })
  @ApiResponse({
    status: 200,
    description: "Order details",
    type: OrderResponseDto,
  })
  async getOrder(
    @Param("id") id: string,
    @CurrentUser() user?: ICurrentUser,
    @Query("token") queryToken?: string,
    @Headers("x-order-token") headerToken?: string,
  ) {
    const token = queryToken || headerToken;
    return this.orderService.findById(id, { user, token });
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Post(":id/confirm")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Manual order confirmation by Branch Manager or Platform Admin",
  })
  @ApiResponse({
    status: 200,
    description: "Order confirmed and inventory booked with audit record",
    type: OrderResponseDto,
  })
  async confirmOrder(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
    @Body() dto: ConfirmPaymentDto,
  ) {
    return this.orderService.confirmOrderPayment(
      id,
      { user },
      dto.paymentRef,
      dto.paidThb,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Post(":id/payments")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Record money collected at the hotel (cash, card, PromptPay, transfer)",
    description:
      "Appends to the order's payment ledger and moves it to DEPOSIT or PAID. Rejects amounts above the balance due.",
  })
  async recordPayment(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.orderService.recordPayment(id, user, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR, UserRole.DISPATCHER)
  @Patch(":id/lines/:lineId/flight")
  @ApiOperation({
    summary: "Set or correct the arrival flight on an airport transfer",
    description:
      "Moves the van slot if the hour changes, then re-plans the pickup and the room turnaround.",
  })
  async updateFlight(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body() dto: UpdateFlightDto,
  ) {
    return this.orderService.updateTransferFlight(id, lineId, user, dto);
  }

  @Public()
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: "x-payment-signature",
    description: "Payment provider webhook signature or secret header",
    required: true,
  })
  @ApiOperation({
    summary: "Verified payment webhook confirmation",
  })
  @ApiResponse({
    status: 200,
    description: "Payment verified and order confirmed",
  })
  async paymentWebhook(
    @Headers("x-payment-signature") signature: string,
    @Headers("x-payment-webhook-secret") webhookSecret: string,
    @Body() body: { orderId: string; paymentRef?: string; paidThb?: number },
  ) {
    const expectedSecret =
      process.env.PAYMENT_WEBHOOK_SECRET ||
      process.env.STRIPE_WEBHOOK_SECRET ||
      "payment-secret";
    const provided = signature || webhookSecret;
    if (
      !provided ||
      (provided !== expectedSecret && !provided.includes(expectedSecret))
    ) {
      throw new UnauthorizedException("Invalid payment webhook signature");
    }

    const order = await this.orderService.confirmOrderPayment(
      body.orderId,
      { isWebhook: true },
      body.paymentRef,
      body.paidThb,
    );
    return {
      success: true,
      orderId: order._id.toString(),
      status: order.status,
    };
  }

  @Public()
  @Post(":id/lines/:lineId/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: "x-order-token",
    description: "Signed order token for guest cancellation",
    required: false,
  })
  @ApiQuery({
    name: "token",
    description: "Signed order token for guest cancellation",
    required: false,
  })
  @ApiOperation({
    summary:
      "Cancel a single item line within an order (Staff or Guest with signed token)",
  })
  @ApiResponse({
    status: 200,
    description: "Line cancelled and inventory refunded",
    type: OrderResponseDto,
  })
  async cancelLine(
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body() dto: CancelOrderLineDto,
    @CurrentUser() user?: ICurrentUser,
    @Query("token") queryToken?: string,
    @Headers("x-order-token") headerToken?: string,
  ) {
    const token = queryToken || headerToken;
    return this.orderService.cancelOrderLine(
      id,
      lineId,
      { user, token },
      dto.reason ?? "Guest requested cancellation",
      dto.refundThb ?? 0,
    );
  }
}
