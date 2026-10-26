import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import {
  FileFieldsInterceptor,
  FileInterceptor,
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
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { UserRole } from "../common/enums/user-role.enum";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { BranchService } from "./branch.service";
import { CreateBranchDto } from "./dto/requests/create-branch.dto";
import { BranchResponseDto } from "./dto/responses/branch-response.dto";

import { OnboardBranchDto } from "./dto/requests/onboard-branch.dto";

@ApiTags("Branches")
@ApiBearerAuth("JWT-auth")
@Controller("branches")
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Public()
  @Post("onboard")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Public hotel workspace onboarding",
    description:
      "Provisions a new branch property and its founding owner account, returning live session tokens.",
  })
  @ApiResponse({
    status: 201,
    description: "Workspace provisioned successfully with owner session",
  })
  async onboard(@Body() dto: OnboardBranchDto) {
    return this.branchService.onboard(dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: "List all active hotel property branches" })
  @ApiResponse({
    status: 200,
    description: "List of branches",
    type: [BranchResponseDto],
  })
  async findAll() {
    return this.branchService.findAll();
  }

  @Public()
  @Get(":code")
  @ApiOperation({ summary: "Get branch details by branch code or ID" })
  @ApiResponse({
    status: 200,
    description: "Branch details",
    type: BranchResponseDto,
  })
  async findByCode(@Param("code") code: string) {
    return this.branchService.findByCode(code);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create a new branch property (Platform Admin only)",
    description:
      "Creates a new branch property with property details and image URLs. Only platform admin can create branches.",
  })
  @ApiResponse({
    status: 201,
    description: "Branch created",
    type: BranchResponseDto,
  })
  async create(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateBranchDto,
  ) {
    return this.branchService.create(user, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Post(":idOrCode/images")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor("images", 10))
  @ApiOperation({
    summary: "Upload & attach photos to an existing branch in 1 call",
    description:
      "Uploads image files to Cloudflare R2 and immediately appends URLs to the branch's image gallery in MongoDB.",
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
    description: "Images uploaded and branch updated",
    type: BranchResponseDto,
  })
  async uploadImages(
    @CurrentUser() user: ICurrentUser,
    @Param("idOrCode") idOrCode: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Query("isHero") isHero?: boolean,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException("At least one image file must be provided");
    }
    return this.branchService.uploadImages(user, idOrCode, files, isHero);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Post(":idOrCode/logo")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({
    summary: "Upload & update branch brand logo in 1 call",
    description:
      "Uploads a logo image file to Cloudflare R2 and immediately sets logoUrl on the branch in MongoDB.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "Brand logo image file (SVG, PNG, WebP)",
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "Logo uploaded and branch updated",
    type: BranchResponseDto,
  })
  async uploadLogo(
    @CurrentUser() user: ICurrentUser,
    @Param("idOrCode") idOrCode: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException("A logo image file must be provided");
    }
    return this.branchService.uploadLogo(user, idOrCode, file);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Delete(":idOrCode/images")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove an image from a branch gallery" })
  @ApiResponse({
    status: 200,
    description: "Image removed from branch",
    type: BranchResponseDto,
  })
  async removeImage(
    @CurrentUser() user: ICurrentUser,
    @Param("idOrCode") idOrCode: string,
    @Query("imageUrl") imageUrl: string,
  ) {
    if (!imageUrl) {
      throw new BadRequestException("Query parameter 'imageUrl' is required");
    }
    return this.branchService.removeImage(user, idOrCode, imageUrl);
  }
}
