import { ApiProperty } from "@nestjs/swagger";
import { UserPublicDto } from "../../auth/dto/response/user-public.dto";

export class InviteStaffResponseDto {
  @ApiProperty({ type: UserPublicDto })
  user!: UserPublicDto;

  @ApiProperty({
    example: "Tmp#7kL9xP2!",
    description:
      "One-time generated temporary password. Returned once, never stored plaintext.",
  })
  tempPassword!: string;
}
