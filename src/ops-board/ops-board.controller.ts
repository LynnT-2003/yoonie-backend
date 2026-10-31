import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { UserRole } from "../common/enums/user-role.enum";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { resolveScopedBranchIds } from "../common/helpers/branch-access.helper";
import { OpsBoardService } from "./ops-board.service";

const scopedBranch = (user: ICurrentUser, branchId?: string) => {
  const [id] = resolveScopedBranchIds(user, branchId);
  if (!id) throw new BadRequestException("branchId is required");
  return id;
};

@ApiTags("Operations boards")
@ApiBearerAuth("JWT-auth")
@Controller("ops-board")
export class OpsBoardController {
  constructor(private readonly opsBoard: OpsBoardService) {}

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR, UserRole.DISPATCHER)
  @Get("services")
  @ApiOperation({
    summary:
      "Service capacity vs demand: slots for the date with bookings, revenue against fixed cost, and a 7-day availability strip",
  })
  @ApiQuery({ name: "branchId", required: false })
  @ApiQuery({ name: "date", required: false, example: "2026-10-25" })
  services(
    @CurrentUser() user: ICurrentUser,
    @Query("branchId") branchId?: string,
    @Query("date") date?: string,
  ) {
    return this.opsBoard.servicesBoard(scopedBranch(user, branchId), date);
  }

  @Roles(
    UserRole.ADMIN,
    UserRole.BRANCH_MGR,
    UserRole.DISPATCHER,
    UserRole.STAFF,
  )
  @Get("guests")
  @ApiOperation({
    summary:
      "Guests in house, arriving, departing and due in the next 7 days, with their services and folios",
  })
  @ApiQuery({ name: "branchId", required: false })
  @ApiQuery({ name: "date", required: false, example: "2026-10-25" })
  guests(
    @CurrentUser() user: ICurrentUser,
    @Query("branchId") branchId?: string,
    @Query("date") date?: string,
  ) {
    return this.opsBoard.guestsBoard(scopedBranch(user, branchId), date);
  }

  @Roles(
    UserRole.ADMIN,
    UserRole.BRANCH_MGR,
    UserRole.DISPATCHER,
    UserRole.STAFF,
  )
  @Get("insights")
  @ApiOperation({
    summary:
      "Owner financial and operational insights: OTA commission savings, revenue attribution, transfer spike patterns, turnaround KPIs",
  })
  @ApiQuery({ name: "branchId", required: false })
  @ApiQuery({ name: "from", required: false, example: "2026-10-01" })
  @ApiQuery({ name: "to", required: false, example: "2026-10-31" })
  insights(
    @CurrentUser() user: ICurrentUser,
    @Query("branchId") branchId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.opsBoard.ownerInsights(scopedBranch(user, branchId), from, to);
  }
}
