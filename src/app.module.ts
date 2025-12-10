// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PaisModule } from './pais/pais.module';
import { PerfilModule } from './perfil/perfil.module';
import { CloudinaryProvider } from './config/cloudinary.config';
import { BlackjackModule } from './blackjack/blackjack.module';
import { DeportesModule } from './deportes/deportes.module';
import { TransaccionesModule } from './transacciones/transacciones.module';
import { ChickenRoadModule } from './chicken_road/chicken_road.module';
import { NebulaModule } from './nebula/nebula.module';
import { TragamonedasModule } from './tragamonedas/tragamonedas.module';
import { PlinkoModule } from './plinko/plinko.module';
import { GeolocalizacionModule } from './geolocalizacion/geolocalizacion.module';
import { ApuestasDeportivasModule } from './apuestas-deportivas/apuestas-deportivas.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    PaisModule,
    PerfilModule,
    BlackjackModule,
    DeportesModule,
    TransaccionesModule,
    ChickenRoadModule,
    NebulaModule,
    TragamonedasModule,
    PlinkoModule,
    GeolocalizacionModule,
    ApuestasDeportivasModule,
  ],
  providers: [CloudinaryProvider],
})
export class AppModule { }