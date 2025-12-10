import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CrearApuestaDto } from './dto/crear-apuesta.dto';
import {
    ApuestaResponse,
    ItemApuestaResponse,
    HistorialApuestasResponse,
    EstadisticasApuestasResponse,
} from './dto/apuesta-response.dto';

@Injectable()
export class ApuestasDeportivasService {
    private supabase: SupabaseClient;
    private readonly logger = new Logger(ApuestasDeportivasService.name);

    constructor(private configService: ConfigService) {
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL')!;
        const supabaseKey = this.configService.get<string>('SUPABASE_ANON_KEY')!;
        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    // ==================== CREAR APUESTA ====================
    async crearApuesta(usuarioId: number, dto: CrearApuestaDto): Promise<ApuestaResponse> {
        this.logger.log(`📝 Usuario ${usuarioId} creando apuesta ${dto.tipo}`);

        // 1. Validar que el tipo coincida con el número de selecciones
        if (dto.tipo === 'simple' && dto.selecciones.length > 1) {
            throw new BadRequestException('Una apuesta simple solo puede tener una selección');
        }

        // 2. Validar eventos existen en la base de datos
        await this.validarEventos(dto.selecciones.map((s) => s.eventoId));

        // 3. Calcular cuota total (producto de todas las cuotas individuales)
        const cuotaTotal = dto.selecciones.reduce((acc, sel) => acc * sel.cuota, 1);
        const gananciaPotencial = dto.monto * cuotaTotal;

        // 4. Verificar saldo del usuario
        const { data: usuario, error: usuarioError } = await this.supabase
            .from('usuario')
            .select('saldo')
            .eq('id', usuarioId)
            .single();

        if (usuarioError || !usuario) {
            throw new NotFoundException('Usuario no encontrado');
        }

        if (parseFloat(usuario.saldo) < dto.monto) {
            throw new BadRequestException(
                `Saldo insuficiente. Saldo disponible: ${parseFloat(usuario.saldo).toFixed(2)} BOB`,
            );
        }

        // 5. Descontar el monto del saldo del usuario
        const nuevoSaldo = parseFloat(usuario.saldo) - dto.monto;
        const { error: updateSaldoError } = await this.supabase
            .from('usuario')
            .update({ saldo: nuevoSaldo })
            .eq('id', usuarioId);

        if (updateSaldoError) {
            this.logger.error(`Error al actualizar saldo: ${updateSaldoError.message}`);
            throw new BadRequestException('Error al procesar el pago de la apuesta');
        }

        // 6. Crear la apuesta en la base de datos
        const { data: apuesta, error: apuestaError } = await this.supabase
            .from('apuesta')
            .insert({
                usuario_id: usuarioId,
                tipo: dto.tipo,
                monto: dto.monto,
                monto_total: dto.monto, // Compatibilidad con esquema legacy
                cuota_total: parseFloat(cuotaTotal.toFixed(2)),
                ganancia_potencial: parseFloat(gananciaPotencial.toFixed(2)),
                estado: 'pendiente',
                fecha_creacion: new Date().toISOString(),
            })
            .select()
            .single();

        if (apuestaError || !apuesta) {
            // Revertir el descuento del saldo si falla
            await this.supabase
                .from('usuario')
                .update({ saldo: usuario.saldo })
                .eq('id', usuarioId);

            this.logger.error(`Error al crear apuesta: ${apuestaError?.message}`);
            throw new BadRequestException('Error al crear la apuesta');
        }

        // 7. Crear las selecciones individuales
        const seleccionesData = dto.selecciones.map((sel) => ({
            apuesta_id: apuesta.id,
            evento_deportivo_id: sel.eventoId,
            mercado: sel.mercado,
            seleccion: sel.seleccion,
            cuota: sel.cuota,
            evento_nombre: sel.eventoNombre || `Evento #${sel.eventoId}`,
            seleccion_display: sel.seleccionDisplay || `${sel.seleccion} (${sel.cuota})`,
            resultado_bool: null,
        }));

        const { error: seleccionesError } = await this.supabase
            .from('item_apuesta')
            .insert(seleccionesData);

        if (seleccionesError) {
            this.logger.error(`Error al crear selecciones: ${seleccionesError.message}`);
            // No revertimos la apuesta, pero registramos el error
        }

        this.logger.log(`✅ Apuesta #${apuesta.id} creada exitosamente (Monto: ${dto.monto} BOB)`);

        // 8. Programar la simulación (30 segundos)
        this.programarSimulacion(apuesta.id);

        // 9. Retornar la apuesta creada
        return this.obtenerApuestaPorId(apuesta.id, usuarioId);
    }

    // ==================== PROGRAMAR SIMULACIÓN ====================
    private programarSimulacion(apuestaId: number): void {
        setTimeout(async () => {
            try {
                await this.simularApuesta(apuestaId);
            } catch (error) {
                this.logger.error(`Error en simulación de apuesta #${apuestaId}: ${error.message}`);
            }
        }, 30000); // 30 segundos

        this.logger.log(`⏱️ Simulación programada para apuesta #${apuestaId} (30 segundos)`);
    }

    // ==================== SIMULAR APUESTA ====================
    private async simularApuesta(apuestaId: number): Promise<void> {
        this.logger.log(`🎲 Simulando resultado de apuesta #${apuestaId}...`);

        // 1. Obtener la apuesta
        const { data: apuesta, error: apuestaError } = await this.supabase
            .from('apuesta')
            .select('*')
            .eq('id', apuestaId)
            .single();

        if (apuestaError || !apuesta) {
            this.logger.error(`Apuesta #${apuestaId} no encontrada`);
            return;
        }

        // Verificar que esté pendiente
        if (apuesta.estado !== 'pendiente') {
            this.logger.warn(`Apuesta #${apuestaId} ya fue procesada (estado: ${apuesta.estado})`);
            return;
        }

        // 2. Obtener las selecciones
        const { data: selecciones, error: seleccionesError } = await this.supabase
            .from('item_apuesta')
            .select('*')
            .eq('apuesta_id', apuestaId);

        if (seleccionesError || !selecciones || selecciones.length === 0) {
            this.logger.error(`No se encontraron selecciones para apuesta #${apuestaId}`);
            return;
        }

        // 3. Simular resultado de cada selección
        // Para apuestas simples: 60% de probabilidad de ganar
        // Para apuestas combinadas: cada selección tiene 70% de probabilidad de ganar
        const probabilidadGanar = apuesta.tipo === 'simple' ? 0.60 : 0.70;

        let todasGanaron = true;

        for (const seleccion of selecciones) {
            const gano = Math.random() < probabilidadGanar;

            // Actualizar resultado de la selección
            await this.supabase
                .from('item_apuesta')
                .update({ resultado_bool: gano })
                .eq('id', seleccion.id);

            if (!gano) {
                todasGanaron = false;
            }
        }

        // 4. Determinar el resultado de la apuesta
        const apuestaGanada = todasGanaron;
        const nuevoEstado = apuestaGanada ? 'ganada' : 'perdida';

        // 5. Actualizar el estado de la apuesta
        const { error: updateApuestaError } = await this.supabase
            .from('apuesta')
            .update({
                estado: nuevoEstado,
                resultado_simulado: apuestaGanada,
                fecha_procesado: new Date().toISOString(),
            })
            .eq('id', apuestaId);

        if (updateApuestaError) {
            this.logger.error(`Error al actualizar apuesta #${apuestaId}: ${updateApuestaError.message}`);
            return;
        }

        // 6. Si ganó, acreditar las ganancias
        if (apuestaGanada) {
            await this.acreditarGanancias(apuesta.usuario_id, apuesta.ganancia_potencial);
            this.logger.log(
                `🎉 Apuesta #${apuestaId} GANADA! Usuario ${apuesta.usuario_id} ganó ${apuesta.ganancia_potencial} BOB`,
            );
        } else {
            this.logger.log(`😢 Apuesta #${apuestaId} PERDIDA`);
        }
    }

    // ==================== ACREDITAR GANANCIAS ====================
    private async acreditarGanancias(usuarioId: number, monto: number): Promise<void> {
        const { data: usuario, error: fetchError } = await this.supabase
            .from('usuario')
            .select('saldo')
            .eq('id', usuarioId)
            .single();

        if (fetchError || !usuario) {
            this.logger.error(`Error al obtener saldo del usuario ${usuarioId}`);
            return;
        }

        const nuevoSaldo = parseFloat(usuario.saldo) + monto;

        const { error: updateError } = await this.supabase
            .from('usuario')
            .update({ saldo: nuevoSaldo })
            .eq('id', usuarioId);

        if (updateError) {
            this.logger.error(`Error al acreditar ganancias a usuario ${usuarioId}: ${updateError.message}`);
            return;
        }

        this.logger.log(`💰 Acreditado ${monto} BOB a usuario ${usuarioId}`);
    }

    // ==================== VALIDAR EVENTOS ====================
    private async validarEventos(eventosIds: number[]): Promise<void> {
        const { data: eventos, error } = await this.supabase
            .from('partidos_futbol')
            .select('id')
            .in('id', eventosIds);

        if (error) {
            this.logger.error(`Error al validar eventos: ${error.message}`);
            throw new BadRequestException('Error al validar eventos');
        }

        if (!eventos || eventos.length !== eventosIds.length) {
            throw new BadRequestException('Uno o más eventos no existen o no están disponibles');
        }
    }

    // ==================== OBTENER APUESTA POR ID ====================
    async obtenerApuestaPorId(apuestaId: number, usuarioId: number): Promise<ApuestaResponse> {
        const { data: apuesta, error: apuestaError } = await this.supabase
            .from('apuesta')
            .select('*')
            .eq('id', apuestaId)
            .eq('usuario_id', usuarioId)
            .single();

        if (apuestaError || !apuesta) {
            throw new NotFoundException('Apuesta no encontrada');
        }

        const { data: selecciones, error: seleccionesError } = await this.supabase
            .from('item_apuesta')
            .select('*')
            .eq('apuesta_id', apuestaId);

        if (seleccionesError) {
            this.logger.error(`Error al obtener selecciones: ${seleccionesError.message}`);
        }

        return this.formatearApuesta(apuesta, selecciones || []);
    }

    // ==================== OBTENER HISTORIAL ====================
    async obtenerHistorial(
        usuarioId: number,
        estado?: string,
        limit = 20,
        offset = 0,
    ): Promise<HistorialApuestasResponse> {
        let query = this.supabase
            .from('apuesta')
            .select('*', { count: 'exact' })
            .eq('usuario_id', usuarioId)
            .order('fecha_creacion', { ascending: false })
            .range(offset, offset + limit - 1);

        if (estado) {
            query = query.eq('estado', estado);
        }

        const { data: apuestas, error, count } = await query;

        if (error) {
            this.logger.error(`Error al obtener historial: ${error.message}`);
            throw new BadRequestException('Error al obtener historial de apuestas');
        }

        // Obtener selecciones para cada apuesta
        const apuestasConSelecciones = await Promise.all(
            (apuestas || []).map(async (apuesta) => {
                const { data: selecciones } = await this.supabase
                    .from('item_apuesta')
                    .select('*')
                    .eq('apuesta_id', apuesta.id);

                return this.formatearApuesta(apuesta, selecciones || []);
            }),
        );

        return {
            apuestas: apuestasConSelecciones,
            total: count || 0,
            pagina: Math.floor(offset / limit) + 1,
            porPagina: limit,
        };
    }

    // ==================== OBTENER ESTADÍSTICAS ====================
    async obtenerEstadisticas(usuarioId: number): Promise<EstadisticasApuestasResponse> {
        const { data: apuestas, error } = await this.supabase
            .from('apuesta')
            .select('estado, monto, ganancia_potencial')
            .eq('usuario_id', usuarioId);

        if (error) {
            this.logger.error(`Error al obtener estadísticas: ${error.message}`);
            throw new BadRequestException('Error al obtener estadísticas');
        }

        const apuestasArray = apuestas || [];

        const totalApuestas = apuestasArray.length;
        const apuestasGanadas = apuestasArray.filter((a) => a.estado === 'ganada').length;
        const apuestasPerdidas = apuestasArray.filter((a) => a.estado === 'perdida').length;
        const apuestasPendientes = apuestasArray.filter((a) => a.estado === 'pendiente').length;

        const totalApostado = apuestasArray.reduce((sum, a) => sum + parseFloat(a.monto), 0);
        const totalGanado = apuestasArray
            .filter((a) => a.estado === 'ganada')
            .reduce((sum, a) => sum + parseFloat(a.ganancia_potencial), 0);

        const tasaExito =
            totalApuestas > 0 ? parseFloat(((apuestasGanadas / totalApuestas) * 100).toFixed(2)) : 0;

        const beneficioNeto = parseFloat((totalGanado - totalApostado).toFixed(2));

        return {
            totalApuestas,
            apuestasGanadas,
            apuestasPerdidas,
            apuestasPendientes,
            totalApostado: parseFloat(totalApostado.toFixed(2)),
            totalGanado: parseFloat(totalGanado.toFixed(2)),
            tasaExito,
            beneficioNeto,
        };
    }

    // ==================== FORMATEAR APUESTA ====================
    private formatearApuesta(apuesta: any, selecciones: any[]): ApuestaResponse {
        return {
            id: apuesta.id,
            usuarioId: apuesta.usuario_id,
            tipo: apuesta.tipo,
            monto: parseFloat(apuesta.monto),
            cuotaTotal: parseFloat(apuesta.cuota_total),
            gananciaPotencial: parseFloat(apuesta.ganancia_potencial),
            estado: apuesta.estado,
            fechaCreacion: apuesta.fecha_creacion,
            fechaProcesado: apuesta.fecha_procesado,
            selecciones: selecciones.map((sel) => ({
                id: sel.id,
                eventoId: sel.evento_deportivo_id,
                eventoNombre: sel.evento_nombre,
                mercado: sel.mercado,
                seleccion: sel.seleccion,
                seleccionDisplay: sel.seleccion_display,
                cuota: parseFloat(sel.cuota),
                resultado: sel.resultado_bool,
            })),
        };
    }
}
