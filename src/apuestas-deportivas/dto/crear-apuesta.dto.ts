import { IsNotEmpty, IsEnum, IsNumber, IsArray, ValidateNested, Min, ArrayMinSize, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export enum TipoApuesta {
    SIMPLE = 'simple',
    COMBINADA = 'combinada',
}

export class SeleccionDto {
    @IsNotEmpty({ message: 'El ID del evento es obligatorio' })
    @IsNumber({}, { message: 'El ID del evento debe ser un número' })
    eventoId: number;

    @IsNotEmpty({ message: 'El mercado es obligatorio' })
    mercado: string; // Ej: "main.1X2", "goals.total.2.5"

    @IsNotEmpty({ message: 'La selección es obligatoria' })
    seleccion: string; // Ej: "1", "X", "2", "over", "under"

    @IsNotEmpty({ message: 'La cuota es obligatoria' })
    @IsNumber({}, { message: 'La cuota debe ser un número' })
    @Min(1.00, { message: 'La cuota debe ser mayor o igual a 1.00' })
    cuota: number;

    @IsOptional()
    @IsString()
    eventoNombre?: string; // Opcional: nombre del evento

    @IsOptional()
    @IsString()
    seleccionDisplay?: string; // Opcional: descripción legible
}

export class CrearApuestaDto {
    @IsNotEmpty({ message: 'El tipo de apuesta es obligatorio' })
    @IsEnum(TipoApuesta, { message: 'El tipo debe ser "simple" o "combinada"' })
    tipo: TipoApuesta;

    @IsNotEmpty({ message: 'El monto es obligatorio' })
    @IsNumber({}, { message: 'El monto debe ser un número' })
    @Min(1, { message: 'El monto mínimo es 1 BOB' })
    monto: number;

    @IsArray({ message: 'Las selecciones deben ser un arreglo' })
    @ArrayMinSize(1, { message: 'Debe incluir al menos una selección' })
    @ValidateNested({ each: true })
    @Type(() => SeleccionDto)
    selecciones: SeleccionDto[];
}
