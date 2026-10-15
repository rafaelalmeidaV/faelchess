import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AccessKeyGuard } from './common/access-key.guard';
import { DatabaseModule } from './database/database.module';
import { GamesModule } from './games/games.module';
import { OnlineModule } from './online/online.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, GamesModule, OnlineModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AccessKeyGuard }],
})
export class AppModule {}
