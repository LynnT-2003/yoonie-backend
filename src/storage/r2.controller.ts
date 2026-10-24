import {
  Controller,
  Post,
  Delete,
  Body,
  UploadedFile,
  UseInterceptors,
  Query,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiQuery,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { UserRole } from "../common/enums/user-role.enum";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { R2Service } from "./r2.service";
import { GetPresignedUrlDto } from "./dto/requests/get-presigned-url.dto";
import { PresignedUrlResponseDto } from "./dto/responses/presigned-url-response.dto";
import { UploadFileResponseDto } from "./dto/responses/upload-file-response.dto";

export const MAX_STORAGE_FILE_SIZE = 10 * 1024 * 1024; // 10MB unified config
export const ALLOWED_STORAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
];

function validateFolderScope(user: ICurrentUser, folder: string): void {
  if (user.isPlatformAdmin) return;
  if (!user.branchIds || user.branchIds.length === 0) {
    throw new ForbiddenException("No branch access assigned");
  }

  const hasBranchScope = user.branchIds.some((b) =>
    folder.includes(b.toString()),
  );
  if (!hasBranchScope) {
    throw new ForbiddenException(
      `Folder prefix must be scoped to your assigned branch: ${user.branchIds.join(", ")}`,
    );
  }
}

function validateKeyScope(user: ICurrentUser, key: string): void {
  if (user.isPlatformAdmin) return;
  if (!user.branchIds || user.branchIds.length === 0) {
    throw new ForbiddenException("No branch access assigned");
  }

  const hasBranchScope = user.branchIds.some((b) => key.includes(b.toString()));
  if (!hasBranchScope) {
    throw new ForbiddenException(
      `Cannot delete storage keys outside your branch scope: ${user.branchIds.join(", ")}`,
    );
  }
}

@ApiTags("Storage / Cloudflare R2")
@ApiBearerAuth("JWT-auth")
@Controller("storage")
export class R2Controller {
  constructor(private readonly r2Service: R2Service) {}

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Post("presigned-url")
  @ApiOperation({
    summary: "Get Presigned Upload URL (Admin/Manager only)",
    description:
      "Generates a presigned Cloudflare R2 PUT URL scoped to manager/admin branch folder.",
  })
  @ApiResponse({
    status: 201,
    description: "Presigned URL generated successfully",
    type: PresignedUrlResponseDto,
  })
  async getPresignedUrl(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: GetPresignedUrlDto,
  ): Promise<PresignedUrlResponseDto> {
    if (!ALLOWED_STORAGE_MIMES.includes(dto.contentType)) {
      throw new BadRequestException(
        `Invalid content type. Allowed MIME types: ${ALLOWED_STORAGE_MIMES.join(", ")}`,
      );
    }

    const folder = dto.folder || "uploads";
    validateFolderScope(user, folder);

    return this.r2Service.getPresignedUploadUrl(
      dto.filename,
      dto.contentType,
      folder,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_STORAGE_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_STORAGE_MIMES.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              `Only image files (${ALLOWED_STORAGE_MIMES.join(", ")}) are allowed`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @ApiOperation({
    summary: "Upload Image Directly (Multipart, Admin/Manager only)",
  })
  @ApiConsumes("multipart/form-data")
  @ApiQuery({
    name: "folder",
    required: false,
    example: "rooms/665a1b2c3d4e5f6a7b8c9d0e",
    description: "Target folder prefix in R2 bucket scoped to branch",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "Image file to upload (max 10MB)",
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: "File uploaded successfully",
    type: UploadFileResponseDto,
  })
  async uploadFile(
    @CurrentUser() user: ICurrentUser,
    @UploadedFile() file: Express.Multer.File,
    @Query("folder") folder?: string,
  ): Promise<UploadFileResponseDto> {
    if (!file) {
      throw new BadRequestException("No file provided in multipart payload");
    }

    const targetFolder =
      folder || `branches/${user.branchIds?.[0] || "common"}`;
    validateFolderScope(user, targetFolder);

    return this.r2Service.uploadFile(file, targetFolder);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @Delete()
  @ApiOperation({
    summary: "Delete Image (Admin/Manager only)",
  })
  @ApiQuery({
    name: "key",
    required: true,
    example: "rooms/665a1b2c3d4e5f6a7b8c9d0e/1729267200000-a1b2c3d4.jpg",
    description: "R2 object key to delete",
  })
  @ApiResponse({
    status: 200,
    description: "File deleted successfully",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", example: true },
        key: { type: "string" },
      },
    },
  })
  async deleteFile(
    @CurrentUser() user: ICurrentUser,
    @Query("key") key: string,
  ) {
    if (!key) {
      throw new BadRequestException("Query parameter 'key' is required");
    }
    validateKeyScope(user, key);

    await this.r2Service.deleteFile(key);
    return { success: true, key };
  }
}
