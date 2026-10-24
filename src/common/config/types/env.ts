export type DatabaseConfig = {
  uri?: string;
  url?: string;
};

import { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

export type AppEnvironment = "Development" | "Staging" | "Production";

export type AppConfig = {
  appEnvironment: AppEnvironment;
  authTokenSecret?: string;
  authRefreshTokenSecret?: string;
  googleClientId?: string;
};

export type ServerConfig = {
  port: number;
  allowedOrigins: string[];
  rateLimit: {
    timeframeInSeconds: number;
    maxRequests: number;
  };
  baseUrl: string;
  /**
   * When set (e.g. https://app.vercel.app/auth/callback), OAuth *success* callbacks
   * redirect here with accessToken, refreshToken, userId in the URL **hash** instead
   * of returning JSON on the API host.
   */
  frontendOauthCallbackUrl: string;
};

export type StaffOpsConfig = {
  workerEnabled: boolean;
  internalTickSecret?: string;
  lineChannelAccessToken?: string;
  lineMessagingChannelSecret?: string;
  expoAccessToken?: string;
};

export type EnvironmentConfigs = {
  appConfig: AppConfig;
  serverConfig: ServerConfig;
  databaseConfig: DatabaseConfig;
  staffOpsConfig: StaffOpsConfig;
  corsConfig: CorsOptions;
};
