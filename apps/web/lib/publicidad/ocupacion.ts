import type { SupabaseClient } from '@supabase/supabase-js'
import { formatSaltaDayKey } from '@qps/core/date-format'

/**
 * La ocupación diaria del Hero y del push patrocinado (R58), para los factores
 * de demanda de la fórmula. La escribe el cron con la service key; nada acá es
 * dato personal: solo cantidades.
 */

/**
 * Es el `limit` de `selectCarouselEvents` en `packages/core/src/home/carousel.ts`:
 * el Hero muestra como mucho 6 destacados. La R50 no tiene una constante de
 * cupos en `/admin/destacados`: si algún día se exporta, se usa esa.
 */
export const CUPOS_HERO = 6

/** Un aviso patrocinado por vez: las campañas de la R51 no se cruzan. */
export const PUSH_CUPOS_POR_DIA = 1

export interface FilaOcupacion {
  day: string
  hero_ocupados: number
  hero_cupos: number
  push_cupos_usados: number
  push_cupos: number
}

/**
 * Guarda la foto del día (día de Salta de `ahora`). `upsert` por día: correrlo
 * dos veces el mismo día deja una sola fila. `hero_cupos` se guarda por día, así
 * un cambio de cupos no reescribe la historia.
 */
export async function registrarOcupacionDelDia(admin: SupabaseClient, ahora: Date): Promise<FilaOcupacion> {
  const iso = ahora.toISOString()

  const destacados = await admin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'PUBLISHED')
    .gt('featured_until', iso)
  if (destacados.error) throw new Error('ocupacion: no se pudieron contar los destacados')

  const campanias = await admin
    .from('sponsored_campaigns')
    .select('id', { count: 'exact', head: true })
    .lte('starts_at', iso)
    .gt('ends_at', iso)
  if (campanias.error) throw new Error('ocupacion: no se pudieron contar las campañas')

  const fila: FilaOcupacion = {
    day: formatSaltaDayKey(ahora),
    hero_ocupados: Math.min(destacados.count ?? 0, CUPOS_HERO),
    hero_cupos: CUPOS_HERO,
    push_cupos_usados: (campanias.count ?? 0) > 0 ? 1 : 0,
    push_cupos: PUSH_CUPOS_POR_DIA,
  }

  const { error } = await admin.from('ad_occupancy_daily').upsert(fila, { onConflict: 'day' })
  if (error) throw new Error('ocupacion: no se pudo guardar la ocupación del día')
  return fila
}

/** `Σ ocupados / Σ cupos`, o `null` sin filas (o sin cupos). */
export function ocupacionDelMes(filas: ReadonlyArray<{ ocupados: number; cupos: number }>): number | null {
  if (filas.length === 0) return null
  let ocupados = 0
  let cupos = 0
  for (const f of filas) {
    ocupados += f.ocupados
    cupos += f.cupos
  }
  return cupos > 0 ? ocupados / cupos : null
}

/** Resta `n` meses a `'AAAA-MM-01'` sobre el texto. */
export function restarMeses(ciclo: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(ciclo)
  if (!m) throw new Error(`Ciclo inválido: ${ciclo}`)
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) - n
  const anio = Math.floor(total / 12)
  const mes = (total % 12) + 1
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-01`
}

export interface Ocupacion2Meses {
  /** `[m-2, m-1]`. */
  hero: [number | null, number | null]
  push: [number | null, number | null]
}

/** La ocupación de los dos meses anteriores al ciclo, desde `ad_occupancy_daily`. */
export async function cargarOcupacion2Meses(admin: SupabaseClient, ciclo: string): Promise<Ocupacion2Meses> {
  const inicioM2 = restarMeses(ciclo, 2)
  const inicioM1 = restarMeses(ciclo, 1)
  const { data, error } = await admin
    .from('ad_occupancy_daily')
    .select('day, hero_ocupados, hero_cupos, push_cupos_usados, push_cupos')
    .gte('day', inicioM2)
    .lt('day', ciclo)
  if (error) throw new Error('ocupacion: no se pudo leer ad_occupancy_daily')

  const filas = (data ?? []) as FilaOcupacion[]
  const delMes = (desde: string, hasta: string) => filas.filter((f) => f.day >= desde && f.day < hasta)
  const m2 = delMes(inicioM2, inicioM1)
  const m1 = delMes(inicioM1, ciclo)
  const hero = (fs: FilaOcupacion[]) => ocupacionDelMes(fs.map((f) => ({ ocupados: f.hero_ocupados, cupos: f.hero_cupos })))
  const push = (fs: FilaOcupacion[]) => ocupacionDelMes(fs.map((f) => ({ ocupados: f.push_cupos_usados, cupos: f.push_cupos })))
  return { hero: [hero(m2), hero(m1)], push: [push(m2), push(m1)] }
}
