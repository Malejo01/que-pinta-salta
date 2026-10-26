'use server'

/**
 * Acciones del "Aviso del equipo" de /admin/avisos (Ronda 70, tarea 70-b): un
 * push manual para quien tiene prendido «Avisos de Qué Pinta Salta».
 *
 * Orden de cada acción: 1) forma de la entrada, 2) sesión + rol ADMIN con el
 * cliente de la sesión (como `requireAdminSupabase` de
 * `avisos-patrocinados-actions.ts`), 3) recién ahí, si hace falta, el cliente
 * de service role (`createAdminClient`, nunca antes ni en el tope del módulo).
 *
 * Las reglas (validación, destinatarios, tope de 1 por día de Salta, clave de
 * dedupe) viven en `@qps/core/notificaciones/equipo`. El envío real depende de
 * `modoEnvioReal()` (`PUSH_ENVIO_REAL === '1'`): en simulado no hay ni un
 * `fetch` a Expo ni una escritura. Solo conteos hacia el navegador: nunca
 * tokens, emails ni ids de usuario, ni en respuestas ni en logs.
 */
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { enviarPushATokens, modoEnvioReal, tokensDelUsuario } from '@/lib/notificaciones/envio-admin'
import type { MensajePush } from '@/lib/notificaciones/expo-push'
import { leerPaginado, type RespuestaDePagina } from '@/lib/notificaciones/paginado'
import { formatSaltaDayKey } from '@qps/core/date-format'
import { enLotes, TAMANIO_LOTE_IN, TAMANIO_PAGINA_TOKENS } from '@qps/core/notificaciones/lotes'
import type { CanalRadar, PreferenciasNotificacion } from '@qps/core/notificaciones/preferencias'
import {
  claveDedupeAvisoEquipo,
  datosPushAvisoEquipo,
  destinatariosAvisoEquipo,
  validarAvisoEquipo,
  yaHuboAvisoEquipoHoy,
  type AvisoEquipoValidado,
  type ErrorAvisoEquipo,
  type ResumenAvisoEquipo,
  type UsuarioParaAvisoEquipo,
} from '@qps/core/notificaciones/equipo'

type SupabaseUserClient = Awaited<ReturnType<typeof createClient>>

type AdminAuth = { supabase: SupabaseUserClient; userId: string }
type AdminAuthResult = AdminAuth | { error: string }

/** Sesión + rol ADMIN, con el cliente del usuario (para que RLS evalúe a esa persona). */
async function requireAdminSupabase(): Promise<AdminAuthResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { error: 'No tenés permisos de administrador' }

  return { supabase, userId: user.id }
}

const MENSAJE_ERROR_GENERICO = 'No se pudo completar la acción. Intentá de nuevo.'
const MENSAJE_YA_HUBO_HOY = 'Ya se mandó un aviso del equipo hoy.'
const MENSAJE_SALIO_SIN_REGISTRO = 'El aviso salió, pero no se pudo registrar del todo. No lo vuelvas a mandar hoy.'

function formaValida(entrada: unknown): entrada is Record<string, unknown> {
  return typeof entrada === 'object' && entrada !== null && !Array.isArray(entrada)
}

/** Ventana de lectura de `notification_sends`: sobra para cubrir el día de Salta de hoy (UTC-3). */
const HORAS_VENTANA_ENVIOS = 36

function desdeVentana(ahora: Date): string {
  return new Date(ahora.getTime() - HORAS_VENTANA_ENVIOS * 60 * 60 * 1000).toISOString()
}

/** Mismo adaptador que el cron: un `.range(...)` de supabase-js a la forma de `leerPaginado`. */
function comoPagina<T>(
  consulta: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): PromiseLike<RespuestaDePagina<T>> {
  return consulta as unknown as PromiseLike<RespuestaDePagina<T>>
}

type ErrorConCampos = { ok: false; error: string; errores?: ErrorAvisoEquipo[] }

function errorValidacion(errores: ErrorAvisoEquipo[]): ErrorConCampos {
  return { ok: false, error: errores[0]?.mensaje ?? 'El aviso no es válido.', errores }
}

/** El evento del destino tiene que existir y estar publicado (cliente de la sesión, como `guardarCampania`). */
async function eventoPublicado(supabase: SupabaseUserClient, aviso: AvisoEquipoValidado): Promise<boolean | null> {
  if (aviso.destino.tipo !== 'evento') return true
  const { data, error } = await supabase.from('events').select('status').eq('id', aviso.destino.eventId).maybeSingle()
  if (error) {
    console.error('avisos-equipo: error leyendo el evento', error.code)
    return null
  }
  return data?.status === 'PUBLISHED'
}

function mensajePush(to: string, aviso: AvisoEquipoValidado): MensajePush {
  const data = datosPushAvisoEquipo(aviso.destino)
  return { to, title: aviso.titulo, body: aviso.cuerpo, ...(data ? { data } : {}) }
}

// ---------------------------------------------------------------------------
// Lectura de destinatarios
// ---------------------------------------------------------------------------

type FilaPref = {
  user_id: string
  radar_channel: string
  favorite_reminders: boolean
  follow_news: boolean
  announcements: boolean
  sponsored: boolean
  quiet_start: string
  quiet_end: string
  daily_cap: number
}

type ResultadoUsuarios = { ok: true; usuarios: UsuarioParaAvisoEquipo[] } | { ok: false }

/** Todos los usuarios con token, con sus preferencias y los envíos de las últimas 36 h. Cliente admin ya creado por quien llama. */
async function cargarUsuarios(admin: SupabaseClient, ahora: Date): Promise<ResultadoUsuarios> {
  const resultadoTokens = await leerPaginado<{ user_id: string; token: string }>(TAMANIO_PAGINA_TOKENS, (desde, hasta) =>
    comoPagina(admin.from('push_tokens').select('user_id, token').order('id').range(desde, hasta)),
  )
  if (!resultadoTokens.ok) {
    console.error('avisos-equipo: error leyendo push_tokens')
    return { ok: false }
  }
  if (resultadoTokens.truncado) {
    // Una lista de destinatarios a medias daría un conteo falso: mejor no seguir.
    console.error('avisos-equipo: push_tokens truncado, no se arma la lista')
    return { ok: false }
  }

  const tokensPorUsuario = new Map<string, string[]>()
  for (const fila of resultadoTokens.filas) {
    const lista = tokensPorUsuario.get(fila.user_id)
    if (lista) lista.push(fila.token)
    else tokensPorUsuario.set(fila.user_id, [fila.token])
  }
  const userIds = [...tokensPorUsuario.keys()]

  const prefsPorUsuario = new Map<string, PreferenciasNotificacion>()
  const enviosPorUsuario = new Map<string, { dedupe_key: string; sent_at: string }[]>()
  const desde = desdeVentana(ahora)

  for (const loteIds of enLotes(userIds, TAMANIO_LOTE_IN)) {
    const { data, error } = await admin
      .from('notification_preferences')
      .select('user_id, radar_channel, favorite_reminders, follow_news, announcements, sponsored, quiet_start, quiet_end, daily_cap')
      .in('user_id', loteIds)
    if (error) {
      console.error('avisos-equipo: error leyendo notification_preferences', error.code)
      return { ok: false }
    }
    for (const fila of (data ?? []) as FilaPref[]) {
      prefsPorUsuario.set(fila.user_id, {
        radar_channel: fila.radar_channel as CanalRadar,
        favorite_reminders: fila.favorite_reminders,
        follow_news: fila.follow_news,
        announcements: fila.announcements,
        sponsored: fila.sponsored,
        quiet_start: fila.quiet_start,
        quiet_end: fila.quiet_end,
        daily_cap: fila.daily_cap,
      })
    }

    const envios = await leerPaginado<{ user_id: string; dedupe_key: string; sent_at: string }>(
      TAMANIO_PAGINA_TOKENS,
      (d, h) =>
        comoPagina(
          admin
            .from('notification_sends')
            .select('user_id, dedupe_key, sent_at')
            .in('user_id', loteIds)
            .gte('sent_at', desde)
            .order('id')
            .range(d, h),
        ),
    )
    if (!envios.ok) {
      console.error('avisos-equipo: error leyendo notification_sends')
      return { ok: false }
    }
    for (const fila of envios.filas) {
      const lista = enviosPorUsuario.get(fila.user_id) ?? []
      lista.push({ dedupe_key: fila.dedupe_key, sent_at: fila.sent_at })
      enviosPorUsuario.set(fila.user_id, lista)
    }
  }

  return {
    ok: true,
    usuarios: userIds.map((userId) => ({
      userId,
      preferencias: prefsPorUsuario.get(userId) ?? null,
      tokens: tokensPorUsuario.get(userId) ?? [],
      enviosRegistrados: enviosPorUsuario.get(userId) ?? [],
    })),
  }
}

/** `true` si ya hay un aviso del equipo (kind 'anuncio') en el día de Salta de `ahora`; `null` si falló la lectura. */
async function yaHuboHoy(admin: SupabaseClient, ahora: Date): Promise<boolean | null> {
  // El más reciente alcanza: si el último no es de hoy, ninguno lo es.
  const { data, error } = await admin
    .from('notification_sends')
    .select('sent_at')
    .eq('kind', 'anuncio')
    .gte('sent_at', desdeVentana(ahora))
    .order('sent_at', { ascending: false })
    .limit(1)
  if (error) {
    console.error('avisos-equipo: error leyendo los avisos de hoy', error.code)
    return null
  }
  return yaHuboAvisoEquipoHoy((data ?? []) as { sent_at: string }[], ahora)
}

// ---------------------------------------------------------------------------
// enviarmePruebaAvisoEquipo
// ---------------------------------------------------------------------------

export type PruebaAvisoEquipoResult = { ok: true; simulado: boolean; telefonos: number } | ErrorConCampos

/**
 * Manda el aviso SOLO a los teléfonos del admin logueado (`user.id` de la
 * sesión, nunca un id de la entrada). Mismo título, texto y data que el envío
 * real. No escribe en `notification_sends` ni cuenta para el tope.
 */
export async function enviarmePruebaAvisoEquipo(entrada: unknown): Promise<PruebaAvisoEquipoResult> {
  if (!formaValida(entrada)) return { ok: false, error: 'El aviso no tiene un formato válido.' }

  const validacion = validarAvisoEquipo(entrada)
  if (!validacion.ok) return errorValidacion(validacion.errores)

  const auth = await requireAdminSupabase()
  if ('error' in auth) return { ok: false, error: auth.error }
  const { supabase, userId } = auth

  const publicado = await eventoPublicado(supabase, validacion.datos)
  if (publicado === null) return { ok: false, error: MENSAJE_ERROR_GENERICO }
  if (!publicado) return { ok: false, error: 'El evento tiene que estar publicado.', errores: [{ campo: 'eventId', mensaje: 'El evento tiene que estar publicado.' }] }

  const tokens = await tokensDelUsuario(supabase as unknown as SupabaseClient, userId)
  if (tokens === null) return { ok: false, error: MENSAJE_ERROR_GENERICO }
  if (tokens.length === 0) return { ok: false, error: 'No tenés la app con avisos activos en tu teléfono.' }

  const resumen = await enviarPushATokens(tokens.map((to) => mensajePush(to, validacion.datos)))
  if (resumen.simulado) return { ok: true, simulado: true, telefonos: tokens.length }
  if (resumen.enviados === 0) return { ok: false, error: 'No se pudo entregar la prueba a tu teléfono.' }
  return { ok: true, simulado: false, telefonos: resumen.enviados }
}

// ---------------------------------------------------------------------------
// contarDestinatariosAvisoEquipo
// ---------------------------------------------------------------------------

export type ConteoAvisoEquipoResult =
  | { ok: true; personas: number; telefonos: number; excluidos: ResumenAvisoEquipo['excluidos']; yaHuboHoy: boolean }
  | { ok: false; error: string }

/** A cuántos teléfonos llegaría el aviso ahora. Solo números. */
export async function contarDestinatariosAvisoEquipo(): Promise<ConteoAvisoEquipoResult> {
  const auth = await requireAdminSupabase()
  if ('error' in auth) return { ok: false, error: auth.error }

  // ADMIN verificado: recién ahora se crea el cliente de service role.
  const admin = createAdminClient()
  const ahora = new Date()

  const hoy = await yaHuboHoy(admin, ahora)
  if (hoy === null) return { ok: false, error: MENSAJE_ERROR_GENERICO }

  const cargados = await cargarUsuarios(admin, ahora)
  if (!cargados.ok) return { ok: false, error: MENSAJE_ERROR_GENERICO }

  const { resumen } = destinatariosAvisoEquipo(cargados.usuarios, ahora)
  return { ok: true, personas: resumen.personas, telefonos: resumen.telefonos, excluidos: resumen.excluidos, yaHuboHoy: hoy }
}

// ---------------------------------------------------------------------------
// enviarAvisoEquipoATodos
// ---------------------------------------------------------------------------

export type EnvioAvisoEquipoResult =
  | { ok: true; simulado: boolean; personas: number; telefonos: number; fallidos?: number }
  | (ErrorConCampos & { requiereConfirmar?: { personas: number; telefonos: number } })

const TAMANIO_LOTE_ESCRITURA = 50
const TAMANIO_LOTE_INSERT = 500

/**
 * Manda el aviso a todos los que corresponde. Antes de mandar RESERVA una fila
 * por persona en `notification_sends` (`status 'PENDIENTE'`): el `unique` de
 * `dedupe_key` hace de candado contra el doble click y contra otro admin. Solo
 * se manda a quienes se reservaron. Después marca `SUCCESS` a quienes tuvieron
 * algún ticket ok y borra la reserva de los demás.
 */
export async function enviarAvisoEquipoATodos(
  entrada: unknown,
  confirmacion: { telefonosEsperados: number },
): Promise<EnvioAvisoEquipoResult> {
  if (!formaValida(entrada)) return { ok: false, error: 'El aviso no tiene un formato válido.' }
  const esperados = formaValida(confirmacion) ? confirmacion.telefonosEsperados : undefined
  if (typeof esperados !== 'number' || !Number.isInteger(esperados) || esperados < 0) {
    return { ok: false, error: 'Falta confirmar a cuántos teléfonos va a llegar.' }
  }

  const validacion = validarAvisoEquipo(entrada)
  if (!validacion.ok) return errorValidacion(validacion.errores)
  const aviso = validacion.datos

  const auth = await requireAdminSupabase()
  if ('error' in auth) return { ok: false, error: auth.error }

  const publicado = await eventoPublicado(auth.supabase, aviso)
  if (publicado === null) return { ok: false, error: MENSAJE_ERROR_GENERICO }
  if (!publicado) return { ok: false, error: 'El evento tiene que estar publicado.', errores: [{ campo: 'eventId', mensaje: 'El evento tiene que estar publicado.' }] }

  // ADMIN verificado: recién ahora se crea el cliente de service role.
  const admin = createAdminClient()
  const ahora = new Date()

  const hoy = await yaHuboHoy(admin, ahora)
  if (hoy === null) return { ok: false, error: MENSAJE_ERROR_GENERICO }
  if (hoy) return { ok: false, error: MENSAJE_YA_HUBO_HOY }

  const cargados = await cargarUsuarios(admin, ahora)
  if (!cargados.ok) return { ok: false, error: MENSAJE_ERROR_GENERICO }

  const { mensajes, resumen } = destinatariosAvisoEquipo(cargados.usuarios, ahora)
  if (resumen.telefonos === 0) return { ok: false, error: 'No hay nadie a quien mandarle este aviso ahora.' }

  if (resumen.telefonos !== esperados) {
    return {
      ok: false,
      error: `Cambió la cantidad: ahora va a llegar a ${resumen.telefonos} teléfonos (${resumen.personas} personas). Confirmá de nuevo.`,
      requiereConfirmar: { personas: resumen.personas, telefonos: resumen.telefonos },
    }
  }

  // Simulado: ni Expo ni escrituras.
  if (!modoEnvioReal()) {
    return { ok: true, simulado: true, personas: resumen.personas, telefonos: resumen.telefonos }
  }

  // 1. Reservar. `ignoreDuplicates` + `select` devuelve SOLO las filas nuevas.
  const eventId = aviso.destino.tipo === 'evento' ? aviso.destino.eventId : null
  const personasUnicas = [...new Set(mensajes.map((m) => m.userId))]
  const reservadas = new Set<string>()
  for (const lote of enLotes(personasUnicas, TAMANIO_LOTE_INSERT)) {
    const filas = lote.map((userId) => ({
      user_id: userId,
      kind: 'anuncio',
      channel: 'push',
      status: 'PENDIENTE',
      dedupe_key: claveDedupeAvisoEquipo(userId, ahora),
      ...(eventId ? { event_id: eventId } : {}),
    }))
    const { data, error } = await admin
      .from('notification_sends')
      .upsert(filas, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('user_id')
    if (error) {
      console.error('avisos-equipo: error reservando los envíos', error.code)
      // Lo ya reservado en lotes anteriores no se manda: se libera.
      await liberarReservas(admin, [...reservadas], ahora)
      return { ok: false, error: MENSAJE_ERROR_GENERICO }
    }
    for (const fila of (data ?? []) as { user_id: string }[]) reservadas.add(fila.user_id)
  }
  if (reservadas.size === 0) return { ok: false, error: MENSAJE_YA_HUBO_HOY }

  // Desde acá hay reservas `PENDIENTE`: si algo tira, se liberan las que no
  // llegaron a `SUCCESS` para no dejar el día bloqueado sin haber mandado
  // nada. Pero si el envío YA volvió (`conExito` no es null), a quien le llegó
  // se le deja la reserva: liberarla haría que un reintento del admin le
  // mande el mismo aviso dos veces (hallazgo del revisor y de seguridad, R70).
  const marcadas = new Set<string>()
  let conExito: Set<string> | null = null
  try {
    // 2. Mandar solo a los reservados.
    const aMandar = mensajes.filter((m) => reservadas.has(m.userId))
    const usuarioDeToken = new Map(aMandar.map((m) => [m.to, m.userId]))
    const envio = await enviarPushATokens(aMandar.map((m) => mensajePush(m.to, aviso)))

    // 3. Registrar: SUCCESS a quien le llegó, borrar la reserva de los demás.
    const exito = new Set<string>()
    for (const token of envio.tokensConExito) {
      const userId = usuarioDeToken.get(token)
      if (userId) exito.add(userId)
    }
    conExito = exito
    const sinExito = [...reservadas].filter((userId) => !exito.has(userId))

    for (const lote of enLotes([...exito], TAMANIO_LOTE_ESCRITURA)) {
      const { error } = await admin
        .from('notification_sends')
        .update({ status: 'SUCCESS' })
        .in('dedupe_key', lote.map((u) => claveDedupeAvisoEquipo(u, ahora)))
      if (error) console.error('avisos-equipo: error marcando SUCCESS', error.code)
      else for (const u of lote) marcadas.add(u)
    }
    await liberarReservas(admin, sinExito, ahora)

    if (envio.tokensInvalidos.length > 0) {
      for (const lote of enLotes(envio.tokensInvalidos, TAMANIO_LOTE_ESCRITURA)) {
        const { error } = await admin.from('push_tokens').delete().in('token', lote)
        if (error) console.error('avisos-equipo: error borrando tokens inválidos', error.code)
      }
    }

    revalidatePath('/admin/avisos')
    return {
      ok: true,
      simulado: false,
      personas: exito.size,
      telefonos: envio.enviados,
      fallidos: envio.fallidos,
    }
  } catch {
    const recibieron = conExito
    console.error('avisos-equipo: falló el envío, se liberan las reservas de quien no lo recibió')
    try {
      await liberarReservas(
        admin,
        [...reservadas].filter((u) => !marcadas.has(u) && !(recibieron?.has(u) ?? false)),
        ahora,
      )
    } catch {
      console.error('avisos-equipo: no se pudieron liberar las reservas')
    }
    return { ok: false, error: recibieron && recibieron.size > 0 ? MENSAJE_SALIO_SIN_REGISTRO : MENSAJE_ERROR_GENERICO }
  }
}

/** Borra la reserva `PENDIENTE` de estas personas (no llegó nada: pueden volver a ser candidatas). */
async function liberarReservas(admin: SupabaseClient, userIds: string[], ahora: Date): Promise<void> {
  for (const lote of enLotes(userIds.map((u) => claveDedupeAvisoEquipo(u, ahora)), TAMANIO_LOTE_ESCRITURA)) {
    const { error } = await admin.from('notification_sends').delete().in('dedupe_key', lote).eq('status', 'PENDIENTE')
    if (error) console.error('avisos-equipo: error liberando reservas', error.code)
  }
}

// ---------------------------------------------------------------------------
// historialAvisosEquipo
// ---------------------------------------------------------------------------

export interface DiaHistorialAvisoEquipo {
  /** `YYYY-MM-DD` (día de Salta). */
  dia: string
  personas: number
}

const DIAS_HISTORIAL = 30
const MAX_DIAS_MOSTRADOS = 10

/** Los últimos avisos del equipo, por día de Salta (personas con `status 'SUCCESS'`). `null` si no es ADMIN o falla. */
export async function historialAvisosEquipo(): Promise<DiaHistorialAvisoEquipo[] | null> {
  const auth = await requireAdminSupabase()
  if ('error' in auth) return null

  try {
    const admin = createAdminClient()
    const desde = new Date(Date.now() - DIAS_HISTORIAL * 24 * 60 * 60 * 1000).toISOString()

    const resultado = await leerPaginado<{ sent_at: string }>(TAMANIO_PAGINA_TOKENS, (d, h) =>
      comoPagina(
        admin
          .from('notification_sends')
          .select('sent_at')
          .eq('kind', 'anuncio')
          .eq('status', 'SUCCESS')
          .gte('sent_at', desde)
          .order('sent_at', { ascending: false })
          .range(d, h),
      ),
    )
    if (!resultado.ok) {
      console.error('avisos-equipo: error leyendo el historial')
      return null
    }

    const porDia = new Map<string, number>()
    for (const fila of resultado.filas) {
      const dia = formatSaltaDayKey(fila.sent_at)
      porDia.set(dia, (porDia.get(dia) ?? 0) + 1)
    }
    return [...porDia.entries()]
      .map(([dia, personas]) => ({ dia, personas }))
      .sort((a, b) => (a.dia < b.dia ? 1 : -1))
      .slice(0, MAX_DIAS_MOSTRADOS)
  } catch {
    console.error('avisos-equipo: falló la lectura del historial')
    return null
  }
}
