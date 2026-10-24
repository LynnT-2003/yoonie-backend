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
import { RestaurantService } from "./restaurant.service";
import { QueryRestaurantDto } from "./dto/requests/query-restaurant.dto";
import { CreateRestaurantDto } from "./dto/requests/create-restaurant.dto";
import { UpdateRestaurantDto } from "./dto/requests/update-restaurant.dto";
import { RestaurantResponseDto } from "./dto/responses/restaurant-response.dto";

@ApiTags("Restaurants & Dining")
@ApiBearerAuth("JWT-auth")
@Controller("restaurants")
export class RestaurantController {
  constructor(private readonly restaurantService: RestaurantService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary:
      "Public catalog: List all active restaurants and dining venues for a branch",
  })
  @ApiResponse({
    status: 200,
    description: "List of restaurants",
    type: [RestaurantResponseDto],
  })
  async findAll(@Query() query: QueryRestaurantDto) {
    if (!query.branchId) {
      throw new BadRequestException("Query parameter 'branchId' is required");
    }
    return this.restaurantService.findAllByBranch(query.branchId);
  }

  @Public()
  @Get(":id")
  @ApiOperation({
    summary: "Public catalog: Get restaurant details",
  })
  @ApiResponse({
    status: 200,
    description: "Restaurant details",
    type: RestaurantResponseDto,
  })
  async findById(@Param("id") id: string) {
    return this.restaurantService.findById(id);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create a restaurant venue",
    description:
      "Creates a new restaurant with outlet details and image URLs within manager/admin branch.",
  })
  @ApiResponse({
    status: 201,
    description: "Restaurant created successfully",
    type: RestaurantResponseDto,
  })
  async create(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateRestaurantDto,
  ) {
    return this.restaurantService.create(user, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Post(":id/images")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor("images", 10))
  @ApiOperation({
    summary: "Upload & attach photos to an existing restaurant in 1 call",
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
    description: "Images uploaded and restaurant updated",
    type: RestaurantResponseDto,
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
    return this.restaurantService.uploadImages(user, id, files, isCover);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Delete(":id/images")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove an image from a restaurant" })
  @ApiResponse({
    status: 200,
    description: "Image removed from restaurant",
    type: RestaurantResponseDto,
  })
  async removeImage(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
    @Query("imageUrl") imageUrl: string,
  ) {
    if (!imageUrl) {
      throw new BadRequestException("Query parameter 'imageUrl' is required");
    }
    return this.restaurantService.removeImage(user, id, imageUrl);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update restaurant details" })
  @ApiResponse({
    status: 200,
    description: "Restaurant updated successfully",
    type: RestaurantResponseDto,
  })
  async update(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
    @Body() dto: UpdateRestaurantDto,
  ) {
    return this.restaurantService.update(user, id, dto);
  }
}
