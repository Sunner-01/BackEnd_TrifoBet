import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApuestasDeportivasController } from './apuestas-deportivas.controller';
import { ApuestasDeportivasService } from './apuestas-deportivas.service';

@Module({
    imports: [ConfigModule],
    controllers: [ApuestasDeportivasController],
    providers: [ApuestasDeportivasService],
    exports: [ApuestasDeportivasService],
})
export class ApuestasDeportivasModule { }
