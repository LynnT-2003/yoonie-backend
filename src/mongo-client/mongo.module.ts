import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { MongoConnectionLogger } from "./mongo.connection.logger";

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      // lazyConnection: app boots immediately even if MongoDB is unreachable.
      // Mongoose retries connection in background; MongoConnectionLogger emits events.
      // Mirrors PrismaService's try/catch boot-tolerance for symmetric variant behavior.
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<{ uri?: string }>("databaseConfig")!.uri,
        lazyConnection: true,
      }),
    }),
  ],
  providers: [MongoConnectionLogger],
  exports: [MongooseModule],
})
export class MongoModule {}
