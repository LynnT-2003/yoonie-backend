import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class ResetPasswordDto {
  @ApiProperty({
    example: "b1bb7d2e3f0c4c67a4c7f731c24c9ef0...",
    description: "Raw reset token from the password reset email link",
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: "NewP@ssw0rd123", minLength: 8, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(64)
  newPassword: string;
}
