/**
 * Q4-7: la corrida de traducción de eventos al inglés. La llama
 * `GET /api/cron/traducir-eventos` (con CRON_SECRET), que dispara
 * `.github/workflows/traducir-eventos.yml` una vez por día.
 *
 * - Elige eventos PUBLICADOS, de hoy en adelante, todavía sin intento
 *   (`traducido_en_at` nulo), de los más próximos a los más lejanos.
 * - Respeta el tope diario (`TRADUCCION_TOPE_DIARIO`, por defecto 100; con 0
 *   no traduce nada): cuenta los intentos del día de Salta en la base, así que
 *   vale aunque la corrida se llame varias veces.
 * - Cada intento marca `traducido_en_at` (con o sin traducción válida): un
 *   evento no se reintenta y cuenta para el tope. Nunca toca `title` ni
 *   `description`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatSaltaDayKey, saltaWallClockToUtcISO } from '@qps/core/date-format'
import { cupoDeLaCorrida, topeDiario, type EventoParaTraducir } from '@qps/core/events/traduccion'
import { traducirEvento, type Traductor } from '@/lib/ai/traducir-evento'

export const LOTE_POR_CORRIDA = 10

export interface ResultadoTraduccion {
  tope: number
  traducidosHoyAntes: number
  intentados: number
  traducidos: number
  descartados: number
  errores: number
  /** Hay más eventos esperando (para que el workflow vuelva a llamar). */
  quedan: boolean
}

type FilaEvento = {
  id: string
  title: string
  description: string | null
  short_description: string | null
  ai_metadata: unknown
  venue: { name: string | null } | null
}

function artistasDe(aiMetadata: unknown): string[] {
  if (!aiMetadata || typeof aiMetadata !== 'object') return []
  const artistas = (aiMetadata as Record<string, unknown>).artists
  return Array.isArray(artistas) ? artistas.filter((a): a is string => typeof a === 'string' && a.trim().length > 0) : []
}

export async function traducirPendientes(
  admin: SupabaseClient,
  { ahora, topeTexto, traductor }: { ahora: Date; topeTexto: string | undefined; traductor?: Traductor },
): Promise<ResultadoTraduccion> {
  const tope = topeDiario(topeTexto)
  const inicioDelDia = saltaWallClockToUtcISO(`${formatSaltaDayKey(ahora)}T00:00:00`)
  const vacio = { tope, traducidosHoyAntes: 0, intentados: 0, traducidos: 0, descartados: 0, errores: 0, quedan: false }
  if (tope === 0) return vacio

  const hoy = await admin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .gte('traducido_en_at', inicioDelDia)
  if (hoy.error) throw new Error('traduccion: no se pudo contar los intentos de hoy')
  const traducidosHoyAntes = hoy.count ?? 0

  const cupo = cupoDeLaCorrida({ tope, traducidosHoy: traducidosHoyAntes, lote: LOTE_POR_CORRIDA })
  if (cupo === 0) return { ...vacio, traducidosHoyAntes }

  const pendientes = await admin
    .from('events')
    .select('id, title, description, short_description, ai_metadata, venue:venues(name)')
    .eq('status', 'PUBLISHED')
    .is('traducido_en_at', null)
    .gte('start_date', inicioDelDia)
    .order('start_date', { ascending: true })
    .limit(cupo + 1)
  if (pendientes.error) throw new Error('traduccion: no se pudieron leer los eventos pendientes')
  const filas = (pendientes.data ?? []) as unknown as FilaEvento[]
  const aTraducir = filas.slice(0, cupo)

  let traducidos = 0
  let descartados = 0
  let errores = 0
  for (const fila of aTraducir) {
    const evento: EventoParaTraducir = {
      id: fila.id,
      title: fila.title,
      description: fila.description ?? fila.short_description,
      venueName: fila.venue?.name ?? null,
      artists: artistasDe(fila.ai_metadata),
    }
    const traduccion = await traducirEvento(evento, traductor)
    const { error } = await admin
      .from('events')
      .update({
        traducido_en_at: new Date().toISOString(),
        ...(traduccion ? { title_en: traduccion.title_en, description_en: traduccion.description_en } : {}),
      })
      .eq('id', fila.id)
      .is('traducido_en_at', null)
    if (error) errores += 1
    else if (traduccion) traducidos += 1
    else descartados += 1
  }

  return {
    tope,
    traducidosHoyAntes,
    intentados: aTraducir.length,
    traducidos,
    descartados,
    errores,
    quedan: filas.length > cupo && traducidosHoyAntes + aTraducir.length < tope,
  }
}
