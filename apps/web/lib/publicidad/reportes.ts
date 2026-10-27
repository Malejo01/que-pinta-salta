import type { SupabaseClient } from '@supabase/supabase-js'
import { formatSaltaDayKey } from '@qps/core/date-format'
import { metricasDeCampania, type FilaMetricaDiaria, type TipoCampania } from '@qps/core/publicidad/reporte'
import { TARIFARIO } from '@qps/core/publicidad/precios'

/**
 * Los reportes de las campañas que terminaron en los últimos 7 días (R58):
 * destacados del Hero y pushes patrocinados. Uno por campaña
 * (`event_id, tipo, desde`): correrlo de nuevo no duplica. No se manda ningún
 * mail: el link `/reporte/<token>` lo copia el admin. Solo cantidades.
 */

const DIA_MS = 86_400_000
const TRAMO_POR_DEFECTO = 500

export interface ResultadoReportes {
  creados: number
}

interface PrecioAprobado {
  producto: string
  precio_ars: number
  vigente_desde: string
}

/** El producto de lista que corresponde a un destacado, por su duración en días. */
export function productoDeDestacado(dias: number): 'destacado-3' | 'destacado-7' | 'destacado-14' {
  if (dias <= 3) return 'destacado-3'
  if (dias <= 7) return 'destacado-7'
  return 'destacado-14'
}

/**
 * El precio de LISTA aprobado vigente en `desde` (no lo que se cobró: puede
 * haber sido fundador). Sin precio en la base, el del tarifario de respaldo; si
 * tampoco, `null`.
 */
function precioDeLista(precios: PrecioAprobado[], producto: string, desde: Date): number | null {
  const dia = formatSaltaDayKey(desde)
  let elegido: PrecioAprobado | null = null
  for (const p of precios) {
    if (p.producto !== producto || p.vigente_desde > dia) continue
    if (!elegido || p.vigente_desde > elegido.vigente_desde) elegido = p
  }
  if (elegido) return Number(elegido.precio_ars)
  const respaldo = TARIFARIO.find((t) => t.id === producto)?.precio
  return respaldo && respaldo.tipo === 'pesos' ? respaldo.listaArs : null
}

async function filasDeMetricas(admin: SupabaseClient, eventId: string): Promise<FilaMetricaDiaria[]> {
  const { data, error } = await admin
    .from('event_metrics_daily')
    .select('day, origin, featured, views, clicks')
    .eq('event_id', eventId)
  if (error) throw new Error('reportes: no se pudieron leer las métricas del evento')
  return (data ?? []) as FilaMetricaDiaria[]
}

export async function generarReportes(admin: SupabaseClient, ahora: Date): Promise<ResultadoReportes> {
  const desdeVentana = new Date(ahora.getTime() - 7 * DIA_MS).toISOString()
  const hastaVentana = ahora.toISOString()

  // El tramo del ciclo vigente (para el alcance estimado) y los precios de lista.
  const ciclos = await admin
    .from('ad_price_cycles')
    .select('tramo_vigente')
    .in('estado', ['aprobado', 'automatico'])
    .order('ciclo', { ascending: false })
    .limit(1)
  if (ciclos.error) throw new Error('reportes: no se pudo leer el ciclo vigente')
  const tramoRef = Number((ciclos.data ?? [])[0]?.tramo_vigente) || TRAMO_POR_DEFECTO

  const lista = await admin.from('ad_prices').select('producto, precio_ars, vigente_desde').eq('estado', 'aprobado')
  if (lista.error) throw new Error('reportes: no se pudieron leer los precios')
  const precios = (lista.data ?? []) as PrecioAprobado[]

  const destacados = await admin
    .from('events')
    .select('id, featured_set_at, featured_until')
    .gte('featured_until', desdeVentana)
    .lte('featured_until', hastaVentana)
    .not('featured_set_at', 'is', null)
  if (destacados.error) throw new Error('reportes: no se pudieron leer los destacados')

  const pushes = await admin
    .from('sponsored_campaigns')
    .select('id, event_id, starts_at, ends_at, sent_at, destinatarios, bajas_48h')
    .gte('ends_at', desdeVentana)
    .lte('ends_at', hastaVentana)
    .not('sent_at', 'is', null)
    .not('event_id', 'is', null)
  if (pushes.error) throw new Error('reportes: no se pudieron leer las campañas')

  const filas: Array<Record<string, unknown>> = []

  const armar = async (
    tipo: TipoCampania,
    eventId: string,
    desde: string,
    hasta: string,
    producto: (dias: number) => string,
    extra: Record<string, number>,
    sponsoredCampaignId: string | null,
  ) => {
    const dDesde = new Date(desde)
    const dHasta = new Date(hasta)
    if (!(dHasta.getTime() > dDesde.getTime())) return
    const metricas = metricasDeCampania({
      filas: await filasDeMetricas(admin, eventId),
      tipo,
      desde: dDesde,
      hasta: dHasta,
      tramoRef,
    })
    const duracion = Math.round((dHasta.getTime() - dDesde.getTime()) / DIA_MS)
    filas.push({
      event_id: eventId,
      tipo,
      sponsored_campaign_id: sponsoredCampaignId,
      desde: dDesde.toISOString(),
      hasta: dHasta.toISOString(),
      metricas: { ...metricas, ...extra },
      precio_ars: precioDeLista(precios, producto(duracion), dDesde),
    })
  }

  for (const e of (destacados.data ?? []) as Array<{ id: string; featured_set_at: string | null; featured_until: string }>) {
    if (!e.featured_set_at) continue
    await armar('destacado', e.id, e.featured_set_at, e.featured_until, productoDeDestacado, {}, null)
  }

  for (const c of (pushes.data ?? []) as Array<{
    id: string
    event_id: string | null
    starts_at: string
    ends_at: string
    sent_at: string | null
    destinatarios: number | null
    bajas_48h: number | null
  }>) {
    if (!c.event_id || !c.sent_at) continue
    const extra: Record<string, number> = {}
    if (c.destinatarios !== null) extra.destinatarios = c.destinatarios
    if (c.bajas_48h !== null) extra.bajas48h = c.bajas_48h
    await armar('push', c.event_id, c.starts_at, c.ends_at, () => 'push', extra, c.id)
  }

  if (filas.length === 0) return { creados: 0 }

  const { data, error } = await admin
    .from('ad_campaign_reports')
    .upsert(filas, { onConflict: 'event_id,tipo,desde', ignoreDuplicates: true })
    .select('id')
  if (error) throw new Error('reportes: no se pudieron guardar los reportes')
  return { creados: (data ?? []).length }
}
