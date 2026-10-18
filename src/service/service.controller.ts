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
import { ServiceService } from "./service.service";
import { QueryServiceDto } from "./dto/requests/query-service.dto";
import { CreateServiceDto } from "./dto/requests/create-service.dto";
import { UpdateServiceDto } from "./dto/requests/update-service.dto";
import { ServiceResponseDto } from "./dto/responses/service-response.dto";

@ApiTags("Services & Experiences")
@ApiBearerAuth("JWT-auth")
@Controller("services")
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary:
      "Public catalog: List services, tours, spas, and airport transfers for a branch",
  })
  @ApiResponse({
    status: 200,
    description: "List of services",
    type: [ServiceResponseDto],
  })
  async findAll(@Query() query: QueryServiceDto) {
    if (!query.branchId) {
      throw new BadRequestException("Query parameter 'branchId' is required");
    }
    return this.serviceService.findAllByBranch(query.branchId, query.category);
  }

  @Public()
  @Get(":id")
  @ApiOperation({ summary: "Public catalog: Get service details" })
  @ApiResponse({
    status: 200,
    description: "Service details",
    type: ServiceResponseDto,
  })
  async findById(@Param("id") id: string) {
    return this.serviceService.findById(id);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create a new service or experience",
    description:
      "Creates a new service, tour, spa, or transfer with details within manager/admin assigned branches.",
  })
  @ApiResponse({
    status: 201,
    description: "Service created successfully",
    type: ServiceResponseDto,
  })
  async create(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateServiceDto,
  ) {
    return this.serviceService.create(user, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Post(":id/images")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor("images", 10))
  @ApiOperation({
    summary: "Upload & attach photos to an existing service in 1 call",
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
    description: "Images uploaded and service updated",
    type: ServiceResponseDto,
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
    return this.serviceService.uploadImages(user, id, files, isCover);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Delete(":id/images")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove an image from a service" })
  @ApiResponse({
    status: 200,
    description: "Image removed from service",
    type: ServiceResponseDto,
  })
  async removeImage(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
    @Query("imageUrl") imageUrl: string,
  ) {
    if (!imageUrl) {
      throw new BadRequestException("Query parameter 'imageUrl' is required");
    }
    return this.serviceService.removeImage(user, id, imageUrl);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update service details" })
  @ApiResponse({
    status: 200,
    description: "Service updated successfully",
    type: ServiceResponseDto,
  })
  async update(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.serviceService.update(user, id, dto);
  }
}
