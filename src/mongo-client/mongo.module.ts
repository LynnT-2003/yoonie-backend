import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { MongoConnectionLogger } from "./mongo.connection.logger";

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      // Locally the app boots even when MongoDB is unreachable (lazy) and the
      // connection logger retries. On Vercel the function is frozen between
      // requests, so a background first connect can time out while frozen and
      // never recover: there, boot waits for the connection instead.
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<{ uri?: string }>("databaseConfig")!.uri,
        lazyConnection: !process.env.VERCEL,
      }),
    }),
  ],
  providers: [MongoConnectionLogger],
  exports: [MongooseModule],
})
export class MongoModule {}
