import { AppEnvironment, EnvironmentConfigs } from "./types/env";

export function loadEnvConfigs(): EnvironmentConfigs {
  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3001"
  )
    .split(",")
    .map((o) => o.trim());

  return {
    appConfig: {
      appEnvironment:
        (process.env.APP_ENVIRONMENT as AppEnvironment) || "Development",
      authTokenSecret: process.env.AUTH_TOKEN_SECRET,
      authRefreshTokenSecret: process.env.AUTH_REFRESH_TOKEN_SECRET,
      googleClientId: process.env.GOOGLE_CLIENT_ID,
    },
    serverConfig: {
      port: Number(process.env.PORT) || 8080,
      allowedOrigins,
      rateLimit: {
        timeframeInSeconds:
          Number(process.env.RATE_LIMIT_TIMEFRAME_SECONDS) || 60,
        maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 10,
      },
      baseUrl: process.env.BASE_URL || "http://localhost:8080",
      frontendOauthCallbackUrl: (
        process.env.FRONTEND_OAUTH_CALLBACK_URL || ""
      ).trim(),
    },
    databaseConfig: {
      uri: process.env.MONGODB_URI,
      url: process.env.DATABASE_URL,
    },
    staffOpsConfig: {
      workerEnabled: process.env.WORKER_ENABLED === "true",
      internalTickSecret: process.env.INTERNAL_TICK_SECRET,
      lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
      lineMessagingChannelSecret: process.env.LINE_MESSAGING_CHANNEL_SECRET,
      expoAccessToken: process.env.EXPO_ACCESS_TOKEN,
    },
    corsConfig: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          allowedOrigins.includes(origin) ||
          /^https?:\/\/([a-zA-Z0-9-]+\.)*localhost(:[0-9]+)?$/.test(origin) ||
          /^https?:\/\/([a-zA-Z0-9-]+\.)*(yoonie\.(app|si)|vercel\.app)(:[0-9]+)?$/.test(origin)
        ) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
      methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Origin",
        "X-Requested-With",
        "Content-Type",
        "Accept",
        "Authorization",
      ],
    },
  };
}
