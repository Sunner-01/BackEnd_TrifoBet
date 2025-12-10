import { Module } from '@nestjs/common';
import { DeportesService } from './deportes.service';
import { DeportesController } from './deportes.controller';

@Module({
  providers: [DeportesService],
  controllers: [DeportesController],
})
export class DeportesModule {}
