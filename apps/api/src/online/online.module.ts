import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module';
import { OnlineController } from './online.controller';
import { OnlineGateway } from './online.gateway';
import { OnlineService } from './online.service';

@Module({
  imports: [GamesModule],
  controllers: [OnlineController],
  providers: [OnlineService, OnlineGateway],
})
export class OnlineModule {}
