import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, QueryFilter, UpdateQuery } from "mongoose";
import { User, UserDocument } from "./entity/user.entity";
import { UserRole } from "../common/enums/user-role.enum";
import {
  IOAuthProvider,
  IRefreshToken,
  IUser,
} from "../common/interfaces/user.interface";
import { UpdateUserDto } from "./dto/update-user.dto";
import { PaymentPlanId } from "../common/enums/payment-plan.enum";

export type ModerationListParams = {
  search?: string;
  suspended?: boolean;
  skip: number;
  limit: number;
};

type UserPersistenceObject = {
  _id: unknown;
  email?: string | null;
  password?: string | null;
  displayName: string;
  avatar?: string | null;
  role: UserRole;
  providers?: IOAuthProvider[];
  refreshTokens?: IRefreshToken[];
  isEmailVerified?: boolean;
  emailVerificationToken?: string | null;
  emailVerificationExpiresAt?: Date | null;
  passwordResetToken?: string | null;
  passwordResetExpiresAt?: Date | null;
  isSuspended?: boolean;
  suspensionReason?: string | null;
  suspendedAt?: Date | null;
  stripeCustomerId?: string | null;
  plan?: PaymentPlanId;
  planExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class UserRepo {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  private toUser(doc: UserDocument | null): IUser | null {
    if (!doc) return null;
    const obj = doc.toObject() as UserPersistenceObject;

    return {
      _id: String(obj._id),
      email: obj.email ?? null,
      password: obj.password ?? null,
      displayName: obj.displayName,
      avatar: obj.avatar ?? null,
      role: obj.role,
      providers: (obj.providers ?? []).map((provider) => ({
        provider: provider.provider,
        providerId: provider.providerId,
        accessToken: provider.accessToken ?? null,
        connectedAt: provider.connectedAt,
      })),
      refreshTokens: (obj.refreshTokens ?? []).map((token) => {
        const tokenWithId = token as IRefreshToken & { _id?: unknown };

        return {
          id:
            token.id ?? (tokenWithId._id ? String(tokenWithId._id) : undefined),
          token: token.token,
          createdAt: token.createdAt,
          expiresAt: token.expiresAt,
        };
      }),
      isEmailVerified: !!obj.isEmailVerified,
      emailVerificationToken: obj.emailVerificationToken ?? null,
      emailVerificationExpiresAt: obj.emailVerificationExpiresAt ?? null,
      passwordResetToken: obj.passwordResetToken ?? null,
      passwordResetExpiresAt: obj.passwordResetExpiresAt ?? null,
      isSuspended: !!obj.isSuspended,
      suspensionReason: obj.suspensionReason ?? null,
      suspendedAt: obj.suspendedAt ?? null,
      stripeCustomerId: obj.stripeCustomerId ?? null,
      plan: obj.plan ?? PaymentPlanId.FREE,
      planExpiresAt: obj.planExpiresAt ?? null,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private toUsers(docs: UserDocument[]): IUser[] {
    return docs
      .map((doc) => this.toUser(doc))
      .filter((user): user is IUser => user !== null);
  }

  private buildModerationFilter(
    params: Pick<ModerationListParams, "search" | "suspended">,
  ): QueryFilter<UserDocument> {
    const filter: QueryFilter<UserDocument> = {};
    const q = params.search?.trim();

    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(escaped, "i");
      filter.$or = [{ email: re }, { displayName: re }];
    }

    if (typeof params.suspended === "boolean") {
      filter.isSuspended = params.suspended;
    }

    return filter;
  }

  // Basic finders

  async findById(id: string): Promise<IUser | null> {
    return this.toUser(await this.userModel.findById(id).exec());
  }

  async findByIdWithPassword(id: string): Promise<IUser | null> {
    return this.toUser(
      await this.userModel.findById(id).select("+password").exec(),
    );
  }

  async findByEmail(
    email: string,
    includePassword = false,
  ): Promise<IUser | null> {
    const query = this.userModel.findOne({ email: email.toLowerCase().trim() });
    if (includePassword) {
      query.select("+password");
    }
    return this.toUser(await query.exec());
  }

  async findByProvider(
    provider: string,
    providerId: string,
  ): Promise<IUser | null> {
    return this.toUser(
      await this.userModel
        .findOne({
          providers: {
            $elemMatch: {
              provider,
              providerId,
            },
          },
        })
        .exec(),
    );
  }

  async findByStripeCustomerId(customerId: string): Promise<IUser | null> {
    return this.toUser(
      await this.userModel.findOne({ stripeCustomerId: customerId }).exec(),
    );
  }

  // Creation and updates

  async create(userData: Partial<IUser>): Promise<IUser> {
    const user = new this.userModel(userData);
    return this.toUser(await user.save())!;
  }

  async updateProfile(
    id: string,
    updateData: UpdateUserDto,
  ): Promise<IUser | null> {
    return this.toUser(
      await this.userModel
        .findByIdAndUpdate(id, { $set: updateData }, { new: true })
        .exec(),
    );
  }

  async deleteById(id: string): Promise<IUser | null> {
    return this.toUser(await this.userModel.findByIdAndDelete(id).exec());
  }

  async addProviderToUser(
    id: string,
    providerData: IOAuthProvider,
    markEmailVerified: boolean,
  ): Promise<IUser | null> {
    const update: UpdateQuery<User> = {
      $push: { providers: providerData },
    };

    if (markEmailVerified) {
      update.$set = { isEmailVerified: true };
    }

    return this.toUser(
      await this.userModel.findByIdAndUpdate(id, update, { new: true }).exec(),
    );
  }

  async updateProviderAccessToken(
    userId: string,
    provider: string,
    providerId: string,
    accessToken: string | null,
  ): Promise<void> {
    await this.userModel
      .updateOne(
        {
          _id: userId,
          "providers.provider": provider,
          "providers.providerId": providerId,
        },
        { $set: { "providers.$.accessToken": accessToken } },
      )
      .exec();
  }

  async updateStripeCustomerId(id: string, customerId: string): Promise<void> {
    await this.userModel
      .updateOne({ _id: id }, { $set: { stripeCustomerId: customerId } })
      .exec();
  }

  async updatePlan(
    id: string,
    plan: PaymentPlanId,
    planExpiresAt: Date | null,
  ): Promise<void> {
    await this.userModel
      .updateOne({ _id: id }, { $set: { plan, planExpiresAt } })
      .exec();
  }

  // Refresh token management

  async findWithRefreshTokens(id: string): Promise<IUser | null> {
    return this.toUser(
      await this.userModel.findById(id).select("+refreshTokens").exec(),
    );
  }

  async removeExpiredRefreshTokens(id: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        { $pull: { refreshTokens: { expiresAt: { $lt: new Date() } } } },
      )
      .exec();
  }

  async pushRefreshToken(
    id: string,
    hashedToken: string,
    expiresAt: Date,
    maxSessions: number,
  ): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        {
          $push: {
            refreshTokens: {
              $each: [
                {
                  token: hashedToken,
                  createdAt: new Date(),
                  expiresAt,
                } satisfies IRefreshToken,
              ],
              $sort: { createdAt: -1 },
              $slice: maxSessions,
            },
          },
        },
      )
      .exec();
  }

  async removeRefreshToken(id: string, hashedToken: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        { $pull: { refreshTokens: { token: hashedToken } } },
      )
      .exec();
  }

  async removeRefreshTokenById(
    id: string,
    refreshTokenId: string,
  ): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        { $pull: { refreshTokens: { _id: refreshTokenId } } },
      )
      .exec();
  }

  async removeAllRefreshTokens(id: string): Promise<void> {
    await this.userModel
      .updateOne({ _id: id }, { $set: { refreshTokens: [] } })
      .exec();
  }

  // Email verification management

  async saveEmailVerificationToken(
    id: string,
    hashedToken: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        {
          $set: {
            emailVerificationToken: hashedToken,
            emailVerificationExpiresAt: expiresAt,
          },
        },
      )
      .exec();
  }

  async findByVerificationToken(hashedToken: string): Promise<IUser | null> {
    return this.toUser(
      await this.userModel
        .findOne({
          emailVerificationToken: hashedToken,
          emailVerificationExpiresAt: { $gt: new Date() },
        })
        .select("+emailVerificationToken")
        .exec(),
    );
  }

  async markEmailVerified(id: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        {
          $set: {
            isEmailVerified: true,
            emailVerificationToken: null,
            emailVerificationExpiresAt: null,
          },
        },
      )
      .exec();
  }

  async savePasswordResetToken(
    id: string,
    hashedToken: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        {
          $set: {
            passwordResetToken: hashedToken,
            passwordResetExpiresAt: expiresAt,
          },
        },
      )
      .exec();
  }

  async findByPasswordResetToken(hashedToken: string): Promise<IUser | null> {
    return this.toUser(
      await this.userModel
        .findOne({
          passwordResetToken: hashedToken,
          passwordResetExpiresAt: { $gt: new Date() },
        })
        .select("+passwordResetToken +password")
        .exec(),
    );
  }

  async updatePasswordAndClearResetToken(
    id: string,
    hashedPassword: string,
  ): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: id },
        {
          $set: {
            password: hashedPassword,
            passwordResetToken: null,
            passwordResetExpiresAt: null,
          },
        },
      )
      .exec();
  }

  // Admin module methods

  async updateUserRoleById(id: string, role: UserRole): Promise<IUser | null> {
    return this.toUser(
      await this.userModel
        .findByIdAndUpdate(id, { $set: { role } }, { new: true })
        .exec(),
    );
  }

  async findManyForModeration(params: ModerationListParams): Promise<IUser[]> {
    return this.toUsers(
      await this.userModel
        .find(this.buildModerationFilter(params))
        .sort({ createdAt: -1 })
        .skip(params.skip)
        .limit(params.limit)
        .exec(),
    );
  }

  async countForModeration(
    params: Pick<ModerationListParams, "search" | "suspended">,
  ): Promise<number> {
    return this.userModel
      .countDocuments(this.buildModerationFilter(params))
      .exec();
  }

  async setSuspension(
    id: string,
    suspended: boolean,
    reason: string | null,
  ): Promise<IUser | null> {
    return this.toUser(
      await this.userModel
        .findByIdAndUpdate(
          id,
          {
            $set: {
              isSuspended: suspended,
              suspensionReason: suspended ? reason : null,
              suspendedAt: suspended ? new Date() : null,
            },
          },
          { new: true },
        )
        .exec(),
    );
  }
}
