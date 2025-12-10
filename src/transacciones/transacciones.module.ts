// src/transacciones/transacciones.module.ts
import { Module } from '@nestjs/common';
import { TransaccionesController } from './transacciones.controller';
import { TransaccionesService } from './transacciones.service';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [ConfigModule],
    controllers: [TransaccionesController],
    providers: [TransaccionesService],
    exports: [TransaccionesService],
})
export class TransaccionesModule { }
