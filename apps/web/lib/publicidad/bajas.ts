import type { SupabaseClient } from '@supabase/supabase-js'
import { enLotes, TAMANIO_LOTE_IN, TAMANIO_PAGINA_TOKENS } from '@qps/core/notificaciones/lotes'
import { debePausar, motivoPausa } from '@qps/core/publicidad/bajas'

/**
 * La medición de bajas del push patrocinado (R58). De los destinatarios de una
 * campaña, cuántos apagaron los avisos patrocinados (`sponsored = false`) dentro
 * de las 48 h posteriores a su envío.
 *
 * SOLO NÚMEROS: los `user_id` viven en variables locales de este módulo. No se
 * devuelven, no van a `details`, ni a los errores, ni a la consola.
 */

const HORA_MS = 3_600_000
const VENTANA_BAJAS_MS = 48 * HORA_MS
/** Se mide una sola vez, cuando la campaña salió hace entre 48 y 72 h. */
const MEDIR_DESDE_MS = 72 * HORA_MS

export interface ResultadoBajas {
  /** Cuántas campañas se midieron en esta corrida. */
  medidas: number
  /** Si esta corrida pausó el push patrocinado. */
  pausado: boolean
  /** Campañas que fallaron (se reintentan mientras sigan en la ventana de 72 h). */
  fallidas: number
}

interface Campania {
  id: string
  sent_at: string
}

/** Los envíos de la campaña, paginados de a 1.000 (QPS-201). Devuelve `user_id -> primer sent_at`. */
async function leerEnvios(admin: SupabaseClient, campaniaId: string): Promise<Map<string, number>> {
  const porUsuario = new Map<string, number>()
  for (let desde = 0; ; desde += TAMANIO_PAGINA_TOKENS) {
    const { data, error } = await admin
      .from('notification_sends')
      .select('user_id, sent_at')
      .eq('campaign_id', campaniaId)
      .order('id')
      .range(desde, desde + TAMANIO_PAGINA_TOKENS - 1)
    if (error) throw new Error('bajas: no se pudieron leer los envíos')
    const filas = (data ?? []) as Array<{ user_id: string; sent_at: string }>
    for (const f of filas) {
      const t = Date.parse(f.sent_at)
      if (!Number.isFinite(t)) continue
      const previo = porUsuario.get(f.user_id)
      if (previo === undefined || t < previo) porUsuario.set(f.user_id, t)
    }
    if (filas.length < TAMANIO_PAGINA_TOKENS) break
  }
  return porUsuario
}

async function contarBajas(admin: SupabaseClient, envios: Map<string, number>): Promise<number> {
  let bajas = 0
  for (const lote of enLotes([...envios.keys()], TAMANIO_LOTE_IN)) {
    const { data, error } = await admin
      .from('notification_preferences')
      .select('user_id, updated_at')
      .eq('sponsored', false)
      .in('user_id', lote)
    if (error) throw new Error('bajas: no se pudieron leer las preferencias')
    for (const p of (data ?? []) as Array<{ user_id: string; updated_at: string }>) {
      const envio = envios.get(p.user_id)
      const cambio = Date.parse(p.updated_at)
      if (envio === undefined || !Number.isFinite(cambio)) continue
      if (cambio >= envio && cambio <= envio + VENTANA_BAJAS_MS) bajas += 1
    }
  }
  return bajas
}

export async function medirBajas(admin: SupabaseClient, ahora: Date): Promise<ResultadoBajas> {
  const desde = new Date(ahora.getTime() - MEDIR_DESDE_MS).toISOString()
  const hasta = new Date(ahora.getTime() - VENTANA_BAJAS_MS).toISOString()

  const lectura = await admin
    .from('sponsored_campaigns')
    .select('id, sent_at')
    .gte('sent_at', desde)
    .lte('sent_at', hasta)
    .is('bajas_medidas_at', null)
  if (lectura.error) throw new Error('bajas: no se pudieron leer las campañas')
  const campanias = ((lectura.data ?? []) as Array<{ id: string; sent_at: string | null }>).filter(
    (c): c is Campania => c.sent_at !== null,
  )
  if (campanias.length === 0) return { medidas: 0, pausado: false, fallidas: 0 }

  const ajustes = await admin
    .from('ad_settings')
    .select('umbral_bajas_push, push_patrocinado_pausado_at')
    .eq('id', true)
    .limit(1)
  if (ajustes.error) throw new Error('bajas: no se pudo leer ad_settings')
  const fila = (ajustes.data ?? [])[0] as { umbral_bajas_push?: number | string; push_patrocinado_pausado_at?: string | null } | undefined
  const umbral = Number(fila?.umbral_bajas_push ?? 0.02)
  let pausaActiva = Boolean(fila?.push_patrocinado_pausado_at)

  let medidas = 0
  let pausado = false
  let fallidas = 0

  for (const campania of campanias) {
    try {
      const envios = await leerEnvios(admin, campania.id)
      const destinatarios = envios.size
      const bajas = await contarBajas(admin, envios)

      // Primero la pausa y recién al final se marca la campaña como medida: si la
      // pausa falla, la campaña queda sin marcar y se reintenta en la próxima corrida.
      let pausaEstaVuelta = false
      if (!pausaActiva && debePausar({ destinatarios, bajas, umbral })) {
        const pausa = await admin
          .from('ad_settings')
          .update({
            push_patrocinado_pausado_at: ahora.toISOString(),
            push_patrocinado_pausa_motivo: motivoPausa({ bajas, destinatarios, umbral, fecha: campania.sent_at }),
          })
          .eq('id', true)
        if (pausa.error) throw new Error('bajas: no se pudo pausar el push patrocinado')
        pausaActiva = true
        pausaEstaVuelta = true
      }

      const { error } = await admin
        .from('sponsored_campaigns')
        .update({ bajas_48h: bajas, bajas_medidas_at: ahora.toISOString() })
        .eq('id', campania.id)
      if (error) throw new Error('bajas: no se pudo guardar la medición')
      medidas += 1
      if (pausaEstaVuelta) pausado = true
    } catch {
      // Una campaña con error no frena a las otras; se reintenta mientras siga
      // en la ventana de 72 h. El detalle no se loguea (podría traer ids).
      fallidas += 1
    }
  }

  return { medidas, pausado, fallidas }
}
