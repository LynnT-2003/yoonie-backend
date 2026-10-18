import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { UserRole } from "../common/enums/user-role.enum";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { resolveScopedBranchIds } from "../common/helpers/branch-access.helper";
import { RoomService } from "./room.service";
import { CreateRoomDto } from "./dto/requests/create-room.dto";
import { UpdateRoomDto } from "./dto/requests/update-room.dto";
import { RoomResponseDto } from "./dto/responses/room-response.dto";
import { HousekeepingBoardResponseDto } from "./dto/responses/housekeeping-board-response.dto";

@ApiTags("Rooms & Housekeeping")
@ApiBearerAuth("JWT-auth")
@Controller("rooms")
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: "Public catalog: List room types available for a branch",
    description:
      "Public catalog view returning aggregated room types without physical unit numbers or cleaning status.",
  })
  @ApiResponse({
    status: 200,
    description: "List of room types",
  })
  async getRooms(@Query("branchId") branchId: string) {
    if (!branchId) {
      throw new BadRequestException("Query parameter 'branchId' is required");
    }
    return this.roomService.getRoomTypesCatalog(branchId);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Get("housekeeping")
  @ApiOperation({
    summary: "Get current housekeeping board (dirty, inspected, in-progress)",
  })
  @ApiResponse({
    status: 200,
    description: "Housekeeping board",
    type: HousekeepingBoardResponseDto,
  })
  async getHousekeepingBoard(
    @CurrentUser() user: ICurrentUser,
    @Query("branchId") branchId?: string,
  ) {
    const scopedBranchIds = resolveScopedBranchIds(user, branchId);
    return this.roomService.getHousekeepingBoard(scopedBranchIds[0]);
  }

  @Public()
  @Get(":id")
  @ApiOperation({
    summary: "Public catalog: Get room type details by room or room-type ID",
  })
  @ApiResponse({
    status: 200,
    description: "Room type catalog details",
  })
  async getRoomById(@Param("id") id: string) {
    return this.roomService.getRoomTypeCatalogById(id);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create a new physical room",
    description: "Creates a new room within manager/admin assigned branches.",
  })
  @ApiResponse({
    status: 201,
    description: "Room created successfully with image URLs",
    type: RoomResponseDto,
  })
  async create(@CurrentUser() user: ICurrentUser, @Body() dto: CreateRoomDto) {
    return this.roomService.create(user, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Post(":id/images")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor("images", 10))
  @ApiOperation({
    summary: "Upload & attach photos to an existing room in 1 call",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["images"],
      properties: {
        images: {
          type: "array",
          items: { type: "string", format: "binary" },
          description: "One or more image files to upload and attach",
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "Images uploaded and room updated",
    type: RoomResponseDto,
  })
  async uploadImages(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Query("isCover") isCover?: boolean,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException("At least one image file must be provided");
    }
    return this.roomService.uploadImages(user, id, files, isCover);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Delete(":id/images")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove an image from a room" })
  @ApiResponse({
    status: 200,
    description: "Image removed from room",
    type: RoomResponseDto,
  })
  async removeImage(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
    @Query("imageUrl") imageUrl: string,
  ) {
    if (!imageUrl) {
      throw new BadRequestException("Query parameter 'imageUrl' is required");
    }
    return this.roomService.removeImage(user, id, imageUrl);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update room details (rate, type, floor, amenities, images)",
  })
  @ApiResponse({
    status: 200,
    description: "Room updated successfully",
    type: RoomResponseDto,
  })
  async update(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.roomService.update(user, id, dto);
  }
}
