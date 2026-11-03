/**
 * Q5-13 · Las cuentas del panel /admin/uso (puras: reciben filas y devuelven
 * series). Ninguna mide a una persona: cuentan hashes anónimos, filas o
 * sumas, igual que `event_metrics_daily` (docs/METRICAS.md).
 */
import { semanaIso } from './apertura'

export type FilaApertura = { day: string; hash_semana: string; con_cuenta: boolean; plataforma: string }
export type FilaVistas = { day: string; origin: string; views: number }

export interface PuntoSerie {
  /** `YYYY-MM-DD` o `YYYY-Www`. */
  clave: string
  valor: number
}

/** Los días de `desde` a `hasta` (inclusive), como `YYYY-MM-DD`. */
export function diasEntre(desde: string, hasta: string): string[] {
  const dias: string[] = []
  const d = new Date(`${desde}T00:00:00Z`)
  const fin = new Date(`${hasta}T00:00:00Z`)
  while (d <= fin && dias.length < 400) {
    dias.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return dias
}

/** Personas activas por día: filas por día (cada fila es un hash del día). */
export function activosPorDia(filas: readonly FilaApertura[], dias: readonly string[]): PuntoSerie[] {
  const conteo = new Map<string, number>()
  for (const f of filas) conteo.set(f.day, (conteo.get(f.day) ?? 0) + 1)
  return dias.map((d) => ({ clave: d, valor: conteo.get(d) ?? 0 }))
}

/** Personas activas por semana ISO: hashes semanales distintos. */
export function activosPorSemana(filas: readonly FilaApertura[]): PuntoSerie[] {
  const porSemana = new Map<string, Set<string>>()
  for (const f of filas) {
    const s = semanaIso(f.day)
    if (!porSemana.has(s)) porSemana.set(s, new Set())
    porSemana.get(s)!.add(f.hash_semana)
  }
  return [...porSemana.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([clave, set]) => ({ clave, valor: set.size }))
}

/** De las aperturas de un día, cuántas tenían sesión. */
export function conCuentaPorDia(filas: readonly FilaApertura[], dias: readonly string[]): PuntoSerie[] {
  const conteo = new Map<string, number>()
  for (const f of filas) if (f.con_cuenta) conteo.set(f.day, (conteo.get(f.day) ?? 0) + 1)
  return dias.map((d) => ({ clave: d, valor: conteo.get(d) ?? 0 }))
}

/** Vistas de eventos por día, separadas en web y app (`origin = 'app'`). */
export function vistasPorDia(filas: readonly FilaVistas[], dias: readonly string[]): { web: PuntoSerie[]; app: PuntoSerie[] } {
  const web = new Map<string, number>()
  const app = new Map<string, number>()
  for (const f of filas) {
    const destino = f.origin === 'app' ? app : web
    destino.set(f.day, (destino.get(f.day) ?? 0) + (Number(f.views) || 0))
  }
  return {
    web: dias.map((d) => ({ clave: d, valor: web.get(d) ?? 0 })),
    app: dias.map((d) => ({ clave: d, valor: app.get(d) ?? 0 })),
  }
}

// ---------------------------------------------------------------------------
// «¿Llegamos al pedido de producción?» (docs/play/produccion.md)
// ---------------------------------------------------------------------------

export const INICIO_PRUEBA_CERRADA = '2026-10-26'
export const FECHA_OBJETIVO_PRODUCCION = '2026-11-09'
export const TESTERS_MINIMOS = 12
export const DIAS_SEGUIDOS = 14

export interface EstadoProduccion {
  diasCorridos: number
  diasQueFaltan: number
  /** Semanas desde el inicio de la prueba con su cantidad de personas activas en la app. */
  semanas: PuntoSerie[]
  /** `true` si todas las semanas de la prueba tienen al menos 12 personas activas en la app. */
  semanasConMinimo: boolean
  /** Qué se puede medir acá y qué solo se ve en Play Console. */
  criterios: { texto: string; estado: 'cumple' | 'no-cumple' | 'en-curso' | 'manual' }[]
}

/**
 * El estado del pedido de acceso a producción. Ojo: Play cuenta testers que
 * aceptaron la invitación (en Play Console), no aperturas. Las personas
 * activas de la app son un indicio, no el número oficial.
 */
export function estadoProduccion(filas: readonly FilaApertura[], hoy: string): EstadoProduccion {
  const dias = diasEntre(INICIO_PRUEBA_CERRADA, hoy)
  const diasCorridos = Math.min(dias.length, 400)
  const diasQueFaltan = Math.max(0, diasEntre(hoy, FECHA_OBJETIVO_PRODUCCION).length - 1)
  const semanas = activosPorSemana(filas.filter((f) => f.day >= INICIO_PRUEBA_CERRADA && f.day <= hoy))
  const semanasConMinimo = semanas.length > 0 && semanas.every((s) => s.valor >= TESTERS_MINIMOS)
  const criterios: EstadoProduccion['criterios'] = [
    {
      texto: `14 días seguidos de prueba cerrada desde el 26/10 (${Math.min(diasCorridos, DIAS_SEGUIDOS)} de ${DIAS_SEGUIDOS})`,
      estado: diasCorridos >= DIAS_SEGUIDOS ? 'cumple' : 'en-curso',
    },
    {
      texto: `Al menos ${TESTERS_MINIMOS} personas activas en la app cada semana desde el 26/10 (indicio; Play cuenta testers en Play Console)`,
      estado: semanas.length === 0 ? 'en-curso' : semanasConMinimo ? 'cumple' : 'no-cumple',
    },
    { texto: '12 o más testers que aceptaron la invitación, sin bajas que reinicien el conteo (Play Console)', estado: 'manual' },
    { texto: 'Build 7 subido a la prueba cerrada y actualizado por los testers', estado: 'manual' },
    { texto: 'Ficha de la tienda, Seguridad de los datos y declaración de ubicación al día', estado: 'manual' },
    { texto: 'Sin errores abiertos en Android vitals ni en el informe previo al lanzamiento', estado: 'manual' },
  ]
  return { diasCorridos, diasQueFaltan, semanas, semanasConMinimo, criterios }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function celda(v: string | number): string {
  const s = String(v)
  // Sin fórmulas al abrirlo en una planilla («=», «+», «-», «@» al principio).
  const seguro = /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[",\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}

export function csvDiario(dias: readonly string[], series: Record<string, readonly PuntoSerie[]>): string {
  const columnas = Object.keys(series)
  const lineas = [['dia', ...columnas].map(celda).join(',')]
  for (let i = 0; i < dias.length; i++) {
    lineas.push([dias[i]!, ...columnas.map((c) => series[c]![i]?.valor ?? 0)].map(celda).join(','))
  }
  return lineas.join('\n') + '\n'
}
