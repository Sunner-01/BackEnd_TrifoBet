import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';

@Injectable()
export class DeportesService {
  private supabase: SupabaseClient;
  private readonly apiKey: string;
  private readonly apiUrl = 'https://v3.football.api-sports.io';

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_ANON_KEY')!,
    );
    this.apiKey = this.configService.get<string>('FOOTBALL_API_KEY')!;
  }

  async obtenerPartidosFutbol(fecha?: string) {
    // 0. Limpieza: Borrar partidos viejos (más de 3 horas) para no saturar la BD
    await this.limpiarPartidosAntiguos();

    // Definir fechas (Zona Horaria Bolivia -4)
    const now = new Date();
    now.setHours(now.getHours() - 4);
    const todayStr = now.toISOString().split('T')[0];

    // Si el usuario pide una fecha específica, usamos esa. Si no, traemos 5 días.
    const datesToFetch = fecha ? [fecha] : [
      todayStr,
      this.addDays(todayStr, 1),
      this.addDays(todayStr, 2),
      this.addDays(todayStr, 3),
      this.addDays(todayStr, 4)
    ];

    console.log(`📅 Procesando fechas: ${datesToFetch.join(', ')}`);

    console.log(`📅 Procesando fechas: ${datesToFetch.join(', ')}`);

    const resultados: any[] = [];

    for (const date of datesToFetch) {
      const isToday = date === todayStr;

      // Estrategia de Caché:
      // - HOY: Actualizar si la data tiene más de 15 minutos (para ver goles/live).
      // - FUTURO: Si ya existe en BD, NO tocar (ahorrar peticiones). Solo buscar si no hay nada.

      const cacheTime = isToday ? 15 * 60 * 1000 : 24 * 60 * 60 * 1000; // 15 min vs 24 horas

      // 1. Consultar BD
      const { data: cachedData, error } = await this.supabase
        .from('partidos_futbol')
        .select('*')
        .gte('fecha', `${date}T00:00:00`)
        .lte('fecha', `${date}T23:59:59`)
        .order('fecha', { ascending: true });

      const hasData = cachedData && cachedData.length > 0;

      // Verificar si necesita actualización
      let needsUpdate = !hasData;
      if (hasData && isToday) {
        // Si es hoy, verificar antigüedad del cache
        const lastUpdate = new Date(cachedData[0].updated_at).getTime();
        if (Date.now() - lastUpdate > cacheTime) {
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        console.log(`🔄 Actualizando datos para ${date} (Es hoy: ${isToday})...`);
        const newMatches = await this.fetchAndCacheDay(date);
        resultados.push(...newMatches);
      } else {
        console.log(`✅ Usando caché para ${date} (${cachedData?.length || 0} partidos)`);
        if (cachedData) {
          resultados.push(...cachedData);
        }
      }
    }

    return this.filtrarYAgrupar(resultados);
  }

  private addDays(dateStr: string, days: number): string {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  private async fetchAndCacheDay(date: string) {
    try {
      // API-Football: NO usamos timezone porque causa errores. Usamos solo 'date'.
      const response = await axios.get(`${this.apiUrl}/fixtures`, {
        params: {
          date: date
        },
        headers: {
          'x-rapidapi-key': this.apiKey,
          'x-rapidapi-host': 'v3.football.api-sports.io',
        },
      });

      const fixtures = response.data.response;
      if (!fixtures || fixtures.length === 0) return [];

      const partidosProcesados = fixtures.map((fixture: any) => {
        const cuotas = this.generarCuotasProfesionales(fixture);

        return {
          id: fixture.fixture.id,
          fecha: fixture.fixture.date,
          liga: fixture.league.name,
          logo_liga: fixture.league.logo,
          pais: fixture.league.country,
          bandera_pais: fixture.league.flag,
          equipo_local: fixture.teams.home.name,
          equipo_visitante: fixture.teams.away.name,
          escudo_local: fixture.teams.home.logo,
          escudo_visitante: fixture.teams.away.logo,
          estado: fixture.fixture.status.short,
          minuto: fixture.fixture.status.elapsed, // Nuevo campo: minuto del partido
          goles_local: fixture.goals.home,
          goles_visitante: fixture.goals.away,
          cuotas: cuotas,
          updated_at: new Date(),
        };
      });

      // Upsert
      const { error } = await this.supabase
        .from('partidos_futbol')
        .upsert(partidosProcesados);

      if (error) console.error(`Error guardando partidos del ${date}:`, error);

      return partidosProcesados;
    } catch (error) {
      console.error(`Error fetching ${date}:`, error);
      return [];
    }
  }

  private async limpiarPartidosAntiguos() {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const liveStatus = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'];

    // Borrar partidos viejos que NO estén en vivo
    const { error } = await this.supabase
      .from('partidos_futbol')
      .delete()
      .lt('fecha', threeHoursAgo)
      .not('estado', 'in', `(${liveStatus.join(',')})`);

    if (error) console.error('Error limpiando partidos antiguos:', error);
  }

  private filtrarYAgrupar(partidos: any[]) {
    const now = new Date();
    const liveStatus = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'];

    // Filtrar: Solo futuros O en vivo. Descartar pasados terminados.
    const partidosValidos = partidos.filter(p => {
      const fechaPartido = new Date(p.fecha);
      const esLive = liveStatus.includes(p.estado);

      // Si es Live, siempre pasa.
      if (esLive) return true;

      // Si no es Live, tiene que ser futuro (fecha > ahora - margen de error)
      // Damos 2 horas de margen para no borrar partidos que acaban de empezar
      return fechaPartido.getTime() > (now.getTime() - 2 * 60 * 60 * 1000);
    });

    return this.agruparPorDia(this.ordenarPartidos(partidosValidos));
  }

  private ordenarPartidos(partidos: any[]) {
    const liveStatus = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'];

    return partidos.sort((a, b) => {
      const aLive = liveStatus.includes(a.estado);
      const bLive = liveStatus.includes(b.estado);

      if (aLive && !bLive) return -1;
      if (!aLive && bLive) return 1;

      return new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
    });
  }

  private generarCuotasProfesionales(fixture: any) {
    // Probabilidades base
    const probLocal = 0.35 + Math.random() * 0.3;
    const probEmpate = 0.20 + Math.random() * 0.1;
    const probVisitante = 1 - probLocal - probEmpate;
    const margen = 1.06; // Margen competitivo

    const calc = (p: number) => {
      const c = 1 / (p * margen);
      return parseFloat((c < 1.01 ? 1.01 : c).toFixed(2));
    };

    // Helper para generar líneas (Over/Under, Handicap)
    const generarLinea = (baseProb: number, spread: number = 0.15) => {
      const pOver = Math.max(0.05, Math.min(0.95, baseProb + (Math.random() - 0.5) * spread));
      return { "over": calc(pOver), "under": calc(1 - pOver) };
    };

    // --- 1. PRINCIPALES ---
    const main = {
      "1X2": { "1": calc(probLocal), "X": calc(probEmpate), "2": calc(probVisitante) },
      "double_chance": {
        "1X": calc(probLocal + probEmpate),
        "12": calc(probLocal + probVisitante),
        "X2": calc(probEmpate + probVisitante)
      },
      "draw_no_bet": { "1": calc(probLocal / (probLocal + probVisitante)), "2": calc(probVisitante / (probLocal + probVisitante)) },
      "btts": { "yes": calc(0.55), "no": calc(0.45) }
    };

    // --- 2. GOLES ---
    const goals = {
      "total": {
        "0.5": generarLinea(0.92), "1.5": generarLinea(0.75), "2.5": generarLinea(0.50),
        "3.5": generarLinea(0.30), "4.5": generarLinea(0.15)
      },
      "team_total_home": {
        "0.5": generarLinea(0.70), "1.5": generarLinea(0.40), "2.5": generarLinea(0.15)
      },
      "team_total_away": {
        "0.5": generarLinea(0.60), "1.5": generarLinea(0.30), "2.5": generarLinea(0.10)
      },
      "1st_half": { "0.5": generarLinea(0.70), "1.5": generarLinea(0.35) },
      "2nd_half": { "0.5": generarLinea(0.75), "1.5": generarLinea(0.40) },
      "odd_even": { "odd": 1.90, "even": 1.90 }
    };

    // --- 3. HANDICAPS ---
    const asianLines = ["-1.5", "-1.0", "-0.5", "0.0", "+0.5", "+1.0", "+1.5"];
    const asianHandicap = {};
    asianLines.forEach(line => {
      asianHandicap[line] = { "1": calc(0.5), "2": calc(0.5) };
    });

    const handicap = {
      "european": {
        "home_-1": calc(probLocal * 0.4), "draw_-1": calc(probLocal * 0.25), "away_+1": calc(1 - probLocal * 0.65),
        "home_+1": calc(1 - probVisitante * 0.65), "draw_+1": calc(probVisitante * 0.25), "away_-1": calc(probVisitante * 0.4)
      },
      "asian": asianHandicap
    };

    // --- 4. MITADES ---
    const halves = {
      "winner_1st": { "1": calc(probLocal * 0.9), "X": calc(0.4), "2": calc(probVisitante * 0.9) },
      "winner_2nd": { "1": calc(probLocal * 0.95), "X": calc(0.38), "2": calc(probVisitante * 0.95) },
      "both_halves_winner": { "home": calc(probLocal * 0.2), "away": calc(probVisitante * 0.2) },
      "highest_scoring_half": { "1st": calc(0.3), "2nd": calc(0.5), "equal": calc(0.2) }
    };

    // --- 5. CORNERS & TARJETAS ---
    const corners = {
      "total": { "8.5": generarLinea(0.6), "9.5": generarLinea(0.5), "10.5": generarLinea(0.4) },
      "home": { "4.5": generarLinea(0.5) },
      "away": { "3.5": generarLinea(0.5) },
      "handicap": { "home_-1.5": 1.90, "away_+1.5": 1.85 }
    };

    const cards = {
      "total": { "3.5": generarLinea(0.6), "4.5": generarLinea(0.45), "5.5": generarLinea(0.3) },
      "red_card": { "yes": 4.50, "no": 1.18 }
    };

    // --- 6. ESPECIALES ---
    const specials = {
      "to_win_to_nil": { "home": calc(probLocal * 0.4), "away": calc(probVisitante * 0.4) },
      "clean_sheet": { "home": calc(0.35), "away": calc(0.25) },
      "next_10_mins_goal": { "yes": 4.50, "no": 1.15 }
    };

    return { main, goals, handicap, halves, corners, cards, specials };
  }

  private agruparPorDia(partidos: any[]) {
    return partidos.reduce((acc, partido) => {
      const fecha = partido.fecha.split('T')[0];
      if (!acc[fecha]) acc[fecha] = [];
      acc[fecha].push(partido);
      return acc;
    }, {});
  }
}
