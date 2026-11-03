import type { SupabaseClient } from '@supabase/supabase-js'
import { enLotes, TAMANIO_LOTE_IN, TAMANIO_PAGINA_TOKENS } from '@qps/core/notificaciones/lotes'
import { debePausar, motivoPausa } from '@qps/core/publicidad/bajas'

/**
 * La medición de bajas del push patrocinado (R58). De los destinatarios de una
 * campaña, cuántos apagaron los avisos patrocinados (`sponsored = false`) dentro
 * de las 48 h posteriores a su envío.
 *
 * Q5-16 (decisión nº2 de Mauro sobre la Q4): también cuentan los teléfonos SIN
 * cuenta. Sus envíos llevan `push_token_id` en vez de `user_id`; su baja es
 * `push_tokens.avisos_patrocinados = false` con `avisos_patrocinados_baja_at`
 * (que marca `set_push_preferences` solo cuando la persona lo apaga; cerrar
 * sesión lo vuelve a false sin marcar, así que no cuenta como baja).
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

interface Envios {
  /** `user_id -> primer sent_at` (con cuenta). */
  porUsuario: Map<string, number>
  /** `push_token_id -> primer sent_at` (sin cuenta, Q5-16). */
  porToken: Map<string, number>
}

function anotar(mapa: Map<string, number>, clave: string, t: number) {
  const previo = mapa.get(clave)
  if (previo === undefined || t < previo) mapa.set(clave, t)
}

/** Los envíos de la campaña, paginados de a 1.000 (QPS-201), separados con y sin cuenta. */
async function leerEnvios(admin: SupabaseClient, campaniaId: string): Promise<Envios> {
  const porUsuario = new Map<string, number>()
  const porToken = new Map<string, number>()
  for (let desde = 0; ; desde += TAMANIO_PAGINA_TOKENS) {
    const { data, error } = await admin
      .from('notification_sends')
      .select('user_id, push_token_id, sent_at')
      .eq('campaign_id', campaniaId)
      .order('id')
      .range(desde, desde + TAMANIO_PAGINA_TOKENS - 1)
    if (error) throw new Error('bajas: no se pudieron leer los envíos')
    const filas = (data ?? []) as Array<{ user_id: string | null; push_token_id?: string | null; sent_at: string }>
    for (const f of filas) {
      const t = Date.parse(f.sent_at)
      if (!Number.isFinite(t)) continue
      if (f.user_id) anotar(porUsuario, f.user_id, t)
      else if (f.push_token_id) anotar(porToken, f.push_token_id, t)
    }
    if (filas.length < TAMANIO_PAGINA_TOKENS) break
  }
  return { porUsuario, porToken }
}

function dentroDeLaVentana(envio: number | undefined, cambioIso: string | null | undefined): boolean {
  if (envio === undefined || !cambioIso) return false
  const cambio = Date.parse(cambioIso)
  return Number.isFinite(cambio) && cambio >= envio && cambio <= envio + VENTANA_BAJAS_MS
}

/** Q5-16: bajas de los teléfonos sin cuenta (por la fila de push_tokens). */
async function contarBajasSinCuenta(admin: SupabaseClient, envios: Map<string, number>): Promise<number> {
  let bajas = 0
  for (const lote of enLotes([...envios.keys()], TAMANIO_LOTE_IN)) {
    const { data, error } = await admin
      .from('push_tokens')
      .select('id, avisos_patrocinados_baja_at')
      .eq('avisos_patrocinados', false)
      .in('id', lote)
    if (error) throw new Error('bajas: no se pudieron leer los teléfonos sin cuenta')
    for (const t of (data ?? []) as Array<{ id: string; avisos_patrocinados_baja_at: string | null }>) {
      if (dentroDeLaVentana(envios.get(t.id), t.avisos_patrocinados_baja_at)) bajas += 1
    }
  }
  return bajas
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
      if (dentroDeLaVentana(envios.get(p.user_id), p.updated_at)) bajas += 1
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
      const destinatarios = envios.porUsuario.size + envios.porToken.size
      const bajas = (await contarBajas(admin, envios.porUsuario)) + (await contarBajasSinCuenta(admin, envios.porToken))

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
