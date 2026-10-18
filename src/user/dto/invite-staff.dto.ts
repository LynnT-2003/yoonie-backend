import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { UserRole } from "../../common/enums/user-role.enum";
import { Permission } from "../../common/enums/permission.enum";

export class InviteStaffDto {
  @ApiProperty({ example: "somchai@riverside-bkk.example" })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: "Somchai Rattana", maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  displayName!: string;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.STAFF,
    description: "Role to assign to the staff member",
  })
  @IsEnum(UserRole)
  @IsNotEmpty()
  role!: UserRole;

  @ApiPropertyOptional({
    example: "DRIVER",
    description: "Job title (e.g. HOUSEKEEPER, DRIVER)",
  })
  @IsString()
  @IsOptional()
  jobTitle?: string;

  @ApiProperty({
    example: ["665a1b2c3d4e5f6a7b8c9d0e"],
    type: [String],
    description: "Branch IDs the staff member is assigned to",
  })
  @IsArray()
  @IsMongoId({ each: true })
  @IsNotEmpty()
  branchIds!: string[];

  @ApiPropertyOptional({
    enum: Permission,
    isArray: true,
    example: [Permission.PICKUP_EXECUTE],
    description: "Permissions granted to the staff member",
  })
  @IsArray()
  @IsEnum(Permission, { each: true })
  @IsOptional()
  permissions?: Permission[] = [];
}
