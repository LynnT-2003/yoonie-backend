import { ForbiddenException } from "@nestjs/common";
import { Types } from "mongoose";
import { ICurrentUser } from "../interfaces/user.interface";

/**
 * Validates that an authenticated user has permission to access a specific branch.
 * Platform administrators bypass this check.
 */
export function validateBranchAccess(
  user: ICurrentUser,
  branchId: string | Types.ObjectId,
): void {
  if (user.isPlatformAdmin) {
    return;
  }

  if (!user.branchIds || user.branchIds.length === 0) {
    throw new ForbiddenException(
      "Forbidden: No branch access assigned to current account",
    );
  }

  const normalizedBranchId = branchId.toString();
  const hasAccess = user.branchIds.some(
    (id) => id.toString() === normalizedBranchId,
  );

  if (!hasAccess) {
    throw new ForbiddenException(
      `Forbidden: You do not have permission to access branch ${normalizedBranchId}`,
    );
  }
}

/**
 * Resolves the effective list of branch IDs for scoped queries:
 * - If a client specifies `requestedBranchId`: validates it belongs to user's assigned branches (or platform admin) and returns [requestedBranchId].
 * - If `requestedBranchId` is omitted: returns all of user's assigned branches (or empty array if platform admin, meaning all branches).
 */
export function resolveScopedBranchIds(
  user: ICurrentUser,
  requestedBranchId?: string | Types.ObjectId,
): string[] {
  if (user.isPlatformAdmin) {
    return requestedBranchId ? [requestedBranchId.toString()] : [];
  }

  if (!user.branchIds || user.branchIds.length === 0) {
    throw new ForbiddenException(
      "Forbidden: No branch access assigned to current account",
    );
  }

  if (requestedBranchId) {
    validateBranchAccess(user, requestedBranchId);
    return [requestedBranchId.toString()];
  }

  return user.branchIds.map((id) => id.toString());
}
