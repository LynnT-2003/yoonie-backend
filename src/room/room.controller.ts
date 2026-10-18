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
import {
  FileFieldsInterceptor,
  FilesInterceptor,
} from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { RoomService } from "./room.service";
import { UpdateCleaningStatusDto } from "./dto/requests/update-cleaning-status.dto";
import { CreateRoomDto } from "./dto/requests/create-room.dto";
import { RoomResponseDto } from "./dto/responses/room-response.dto";
import { HousekeepingBoardResponseDto } from "./dto/responses/housekeeping-board-response.dto";

@ApiTags("Rooms & Housekeeping")
@ApiBearerAuth("JWT-auth")
@Controller("rooms")
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "List all physical room keys for a branch" })
  @ApiResponse({
    status: 200,
    description: "List of rooms",
    type: [RoomResponseDto],
  })
  async getRooms(@Query("branchId") branchId: string) {
    return this.roomService.findAllByBranch(branchId);
  }

  @Public()
  @Get("housekeeping")
  @ApiOperation({
    summary: "Get current housekeeping board (dirty, inspected, in-progress)",
  })
  @ApiResponse({
    status: 200,
    description: "Housekeeping board",
    type: HousekeepingBoardResponseDto,
  })
  async getHousekeepingBoard(@Query("branchId") branchId: string) {
    return this.roomService.getHousekeepingBoard(branchId);
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: "coverImage", maxCount: 1 },
      { name: "images", maxCount: 10 },
    ]),
  )
  @ApiOperation({
    summary: "Create a new physical room (with optional images in one shot)",
    description:
      "Creates a new room. Supports both application/json and multipart/form-data with image file uploads (coverImage + images[]).",
  })
  @ApiConsumes("multipart/form-data", "application/json")
  @ApiBody({
    schema: {
      type: "object",
      required: [
        "branchId",
        "roomNumber",
        "roomType",
        "maxOccupancy",
        "baseRateThb",
      ],
      properties: {
        branchId: {
          type: "string",
          example: "665a1b2c3d4e5f6a7b8c9d0e",
          description: "Branch ID of the property",
        },
        roomNumber: {
          type: "string",
          example: "101",
          description: "Unique room number",
        },
        floor: {
          type: "number",
          example: 1,
          description: "Floor level of the room",
        },
        roomType: {
          type: "string",
          example: "STANDARD_KING",
          description: "Room category spec type",
        },
        maxOccupancy: {
          type: "number",
          example: 2,
          description: "Maximum guest occupancy",
        },
        baseRateThb: {
          type: "number",
          example: 2200,
          description: "Base rack rate in THB",
        },
        amenities: {
          type: "array",
          items: { type: "string" },
          example: ["King Bed", "Rain Shower", "Smart TV"],
        },
        coverImage: {
          type: "string",
          format: "binary",
          description: "Room cover photo file",
        },
        images: {
          type: "array",
          items: { type: "string", format: "binary" },
          description: "Gallery photo files",
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: "Room created successfully with image URLs",
    type: RoomResponseDto,
  })
  async create(
    @Body() dto: CreateRoomDto,
    @UploadedFiles()
    files?: {
      coverImage?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
  ) {
    return this.roomService.create(dto, files);
  }

  @Public()
  @Post(":id/images")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor("images", 10))
  @ApiOperation({
    summary: "Upload & attach photos to an existing room in 1 call",
    description:
      "Uploads image files to Cloudflare R2 and immediately appends the resulting URLs to the room's image gallery in MongoDB.",
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
    @Param("id") id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Query("isCover") isCover?: boolean,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException("At least one image file must be provided");
    }
    return this.roomService.uploadImages(id, files, isCover);
  }

  @Public()
  @Delete(":id/images")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove an image from a room" })
  @ApiResponse({
    status: 200,
    description: "Image removed from room",
    type: RoomResponseDto,
  })
  async removeImage(
    @Param("id") id: string,
    @Query("imageUrl") imageUrl: string,
  ) {
    if (!imageUrl) {
      throw new BadRequestException("Query parameter 'imageUrl' is required");
    }
    return this.roomService.removeImage(id, imageUrl);
  }

  @Public()
  @Patch(":id/cleaning")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update room housekeeping cleaning status" })
  @ApiResponse({
    status: 200,
    description: "Cleaning status updated",
    type: RoomResponseDto,
  })
  async updateCleaning(
    @Param("id") id: string,
    @Body() dto: UpdateCleaningStatusDto,
  ) {
    return this.roomService.updateCleaningStatus(id, dto.cleaningStatus);
  }
}
