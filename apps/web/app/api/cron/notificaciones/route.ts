import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasBearerSecret } from '@/lib/api-auth'
import { withJobRun, jobTriggerFrom, type JobOutcome } from '@/lib/job-runs'
import {
  armarTanda,
  type EnvioRegistradoParaTanda,
  type FavoritoParaTanda,
  type MensajeDeTanda,
  type UsuarioParaTanda,
} from '@qps/core/notificaciones/tanda'
import type { PreferenciasNotificacion } from '@qps/core/notificaciones/preferencias'
import { isVigente } from '@qps/core/events/vigencia'
import {
  enviarLote,
  esTokenExpoValido,
  leerReceipts,
  tokensInvalidos,
  type MensajePush,
} from '@/lib/notificaciones/expo-push'

// Igual que recurrentes/route.ts: sin esto Vercel puede cortar la función a
// mitad y dejar la corrida en RUNNING (como sus crones hermanos, scrape,
// instagram y radar-newsletter, que comparten el mismo riesgo de timeout).
export const maxDuration = 60

/**
 * GET /api/cron/notificaciones (R39, tarea 39-d)
 *
 * Arma la tanda de push (recordatorios de favoritos + novedades de lo que el
 * usuario sigue, `armarTanda` de `@qps/core/notificaciones/tanda`, 39-b) y,
 * solo si `PUSH_ENVIO_REAL === "1"`, la manda de verdad por la API de Expo
 * (`enviarLote`/`leerReceipts`/`tokensInvalidos`, 39-c). Por defecto (esa
 * variable sin definir, vacía o con cualquier otro valor) es un `dryRun`: ni
 * un `fetch` a Expo, ni una escritura en `notification_sends` ni en
 * `push_tokens`. La dispara `.github/workflows/notificaciones.yml`, apagado
 * a propósito hasta que la app tenga push (encargo de Mauro).
 */
export async function GET(request: Request) {
  // Verificar autorización: si falla, no se lee absolutamente nada (ni
  // job_runs, ni un cliente admin).
  if (!hasBearerSecret(request, 'CRON_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { httpStatus, body } = await withJobRun('notificaciones', jobTriggerFrom(request), enviarNotificaciones, toOutcome)
  return NextResponse.json(body, { status: httpStatus })
}

type NotificacionesReply = { httpStatus: number; body: Record<string, unknown> }

const reply = (httpStatus: number, body: Record<string, unknown>): NotificacionesReply => ({ httpStatus, body })

/** Cuántos mensajes de `mensajes` son de cada `kind` ('favorito'/'novedad'). */
function contarPorTipo(mensajes: MensajeDeTanda[]): Record<string, number> {
  const porTipo: Record<string, number> = {}
  for (const mensaje of mensajes) porTipo[mensaje.kind] = (porTipo[mensaje.kind] ?? 0) + 1
  return porTipo
}

/**
 * La variable que prende el envío real. Comparación exacta contra el string
 * "1": que no esté definida, esté vacía, o valga "0"/"true"/"false"/cualquier
 * otra cosa da `dryRun`. Es lo que evita mandar push a gente real antes de
 * que Mauro la prenda a propósito.
 */
function modoEnvioReal(): boolean {
  return process.env.PUSH_ENVIO_REAL === '1'
}

async function enviarNotificaciones(): Promise<NotificacionesReply> {
  const ahora = new Date()
  // El cliente admin se crea acá adentro, después de validar el secreto en
  // GET, nunca en el tope del módulo.
  const supabase = createAdminClient()

  // 1. Universo de esta tanda: usuarios con al menos un token (push_tokens).
  // Sin token no hay nada que mandar, así que acota todo lo demás.
  const { data: tokenRows, error: tokenError } = await supabase.from('push_tokens').select('user_id, token')
  if (tokenError) {
    console.error('[CronNotificaciones] Error al leer push_tokens:', tokenError.message)
    return reply(500, { error: 'push_tokens query failed' })
  }

  const tokensPorUsuario = new Map<string, string[]>()
  for (const fila of tokenRows ?? []) {
    const lista = tokensPorUsuario.get(fila.user_id)
    if (lista) lista.push(fila.token)
    else tokensPorUsuario.set(fila.user_id, [fila.token])
  }
  const userIds = [...tokensPorUsuario.keys()]

  if (userIds.length === 0) {
    return reply(200, { dryRun: !modoEnvioReal(), mensajes: 0, porTipo: {} })
  }

  // 2. Preferencias de esos usuarios (si no hay fila, armarTanda usa los
  // defaults: no se duplica esa lógica acá).
  const { data: prefRows, error: prefError } = await supabase
    .from('notification_preferences')
    .select('user_id, radar_channel, favorite_reminders, follow_news, announcements, quiet_start, quiet_end, daily_cap')
    .in('user_id', userIds)
  if (prefError) {
    console.error('[CronNotificaciones] Error al leer notification_preferences:', prefError.message)
    return reply(500, { error: 'notification_preferences query failed' })
  }
  const preferenciasPorUsuario = new Map<string, PreferenciasNotificacion>(
    (prefRows ?? []).map((fila) => [
      fila.user_id,
      {
        radar_channel: fila.radar_channel,
        favorite_reminders: fila.favorite_reminders,
        follow_news: fila.follow_news,
        announcements: fila.announcements,
        quiet_start: fila.quiet_start,
        quiet_end: fila.quiet_end,
        daily_cap: fila.daily_cap,
      } as PreferenciasNotificacion,
    ]),
  )

  // 3. Favoritos con evento (user_favorites.event_id no nulo: es la tabla
  // vigente de favoritos, la que usan /favoritos y lib/actions/favorites.ts;
  // la tabla "favorites" quedó de una versión anterior, solo la toca
  // lib/actions.ts). Se filtra en memoria por status PUBLISHED y por
  // vigencia (isVigente, el mismo criterio que /favoritos y el Radar): un
  // evento ya terminado no tiene sentido "recordarlo".
  const { data: favRows, error: favError } = await supabase
    .from('user_favorites')
    .select('user_id, event_id, events(title, start_date, end_date, status)')
    .in('user_id', userIds)
    .not('event_id', 'is', null)
  if (favError) {
    console.error('[CronNotificaciones] Error al leer user_favorites:', favError.message)
    return reply(500, { error: 'user_favorites query failed' })
  }

  type FilaFavorito = {
    user_id: string
    event_id: string
    events: { title: string; start_date: string; end_date: string | null; status: string | null } | null
  }
  const favoritosPorUsuario = new Map<string, FavoritoParaTanda[]>()
  for (const fila of (favRows ?? []) as unknown as FilaFavorito[]) {
    const evento = fila.events
    if (!evento || evento.status !== 'PUBLISHED') continue
    if (!isVigente(evento, ahora)) continue
    const lista = favoritosPorUsuario.get(fila.user_id) ?? []
    lista.push({ eventId: fila.event_id, title: evento.title, start_date: evento.start_date })
    favoritosPorUsuario.set(fila.user_id, lista)
  }

  // 4. Envíos ya registrados (cualquier fecha: el tope diario de armarTanda
  // filtra por día de Salta, el dedupe por dedupe_key, ninguno de los dos
  // acá).
  const { data: sendRows, error: sendError } = await supabase
    .from('notification_sends')
    .select('user_id, dedupe_key, sent_at')
    .in('user_id', userIds)
  if (sendError) {
    console.error('[CronNotificaciones] Error al leer notification_sends:', sendError.message)
    return reply(500, { error: 'notification_sends query failed' })
  }
  const enviosPorUsuario = new Map<string, EnvioRegistradoParaTanda[]>()
  for (const fila of sendRows ?? []) {
    const lista = enviosPorUsuario.get(fila.user_id) ?? []
    lista.push({ dedupe_key: fila.dedupe_key, sent_at: fila.sent_at })
    enviosPorUsuario.set(fila.user_id, lista)
  }

  // 5. Novedades (follow_news): QUEDA SIN ARMAR A PROPÓSITO.
  // Arrancar esto bien pide resolver, por cada usuario, las novedades de sus
  // categorías/locales/cuentas de Instagram seguidas (user_followed_*, igual
  // que lib/radar/events.ts) y ADEMÁS distinguir "evento nuevo desde la
  // última corrida" de "evento que ya existía": no hay una columna de
  // "primera vez que se vio este evento" ni una tabla de eventos de
  // novedades todavía (iría en una migración, que esta tarea no puede
  // escribir). Mauro decide si eso sale de created_at de events (impreciso:
  // created_at no distingue "nuevo para el usuario" de "nuevo a secas") o de
  // algo nuevo. Hasta entonces, la lista va vacía: ningún usuario recibe
  // push de novedades, pero los recordatorios de favoritos sí funcionan
  // completos.
  const usuarios: UsuarioParaTanda[] = userIds.map((userId) => ({
    userId,
    preferencias: preferenciasPorUsuario.get(userId) ?? null,
    tokens: tokensPorUsuario.get(userId) ?? [],
    favoritos: favoritosPorUsuario.get(userId) ?? [],
    novedades: [],
    enviosRegistrados: enviosPorUsuario.get(userId) ?? [],
  }))

  const mensajes = armarTanda({ usuarios }, ahora)
  const porTipo = contarPorTipo(mensajes)

  if (!modoEnvioReal()) {
    // dryRun: ni un fetch a Expo, ni una escritura. Solo se arma y se cuenta.
    return reply(200, { dryRun: true, mensajes: mensajes.length, porTipo })
  }

  // Modo real: se manda de verdad. `mensajesPush` sale limpio (sin userId,
  // kind, eventId ni dedupeKey: esos campos son para notification_sends, no
  // para el body que viaja a la API de Expo).
  const mensajesPush: MensajePush[] = mensajes.map((mensaje) => ({
    to: mensaje.to,
    title: mensaje.title,
    body: mensaje.body,
    ...(mensaje.data ? { data: mensaje.data } : {}),
  }))

  const { tickets, descartados, erroresLote: erroresEnvio } = await enviarLote(mensajesPush)

  const idsTickets = tickets
    .map((t) => t.ticket)
    .filter((t): t is { status: 'ok'; id: string } => t?.status === 'ok')
    .map((t) => t.id)
  const { receipts, erroresLote: erroresReceipts } = await leerReceipts(idsTickets)

  const invalidos = tokensInvalidos(tickets, receipts)
  if (invalidos.length > 0) {
    // El borrado va por token (push_tokens_token_key es único en toda la
    // base), no por (user_id, token): push_tokens no tiene columna de
    // "activo".
    const { error: delError } = await supabase.from('push_tokens').delete().in('token', invalidos)
    if (delError) {
      console.error('[CronNotificaciones] No se pudieron borrar tokens inválidos de push_tokens:', delError.message)
    }
  }

  // Qué `dedupeKey` tuvieron al menos un ticket `status: 'ok'` (arreglo 3,
  // R39): `enviarLote` filtra los mensajes con token de forma inválida ANTES
  // de armar los lotes (`esTokenExpoValido`), así que `tickets` tiene un
  // elemento por cada mensaje de `mensajes` que pasó ese filtro, EN EL MISMO
  // ORDEN (es el invariante que documenta expo-push.ts): filtrar `mensajes`
  // con el mismo predicado y emparejar por posición reconstruye, para cada
  // ticket, de qué `MensajeDeTanda` (y por lo tanto de qué `dedupeKey`) vino.
  // Un mensaje descartado por forma de token inválida no genera ticket, así
  // que tampoco puede contar como éxito para su dedupeKey.
  const mensajesConTokenValido = mensajes.filter((m) => esTokenExpoValido(m.to))
  const dedupeKeysConExito = new Set<string>()
  mensajesConTokenValido.forEach((mensaje, i) => {
    if (tickets[i]?.ticket?.status === 'ok') dedupeKeysConExito.add(mensaje.dedupeKey)
  })

  // notification_sends: una fila por dedupeKey, no por mensaje. Los mensajes
  // de los dos dispositivos del mismo usuario comparten dedupeKey, y esa
  // columna es unique en toda la tabla: un segundo INSERT con la misma clave
  // choca.
  //
  // Solo se escribe la fila si el envío salió de verdad: al menos un ticket
  // de ese dedupeKey volvió con `status: 'ok'`. Si ninguno salió (timeout,
  // error de red, HTTP de error, token inválido, o un ticket de Expo con
  // `status: 'error'`), NO se escribe fila: al no quedar en
  // `notification_sends`, el aviso vuelve a ser candidato en la corrida
  // siguiente (`dedupeKeysYaEnviados` de `armarTanda` no lo va a tener). Es
  // la semántica que queda: un aviso se puede llegar a mandar dos veces si
  // la escritura en `notification_sends` falla DESPUÉS de haber mandado de
  // verdad (eso ya pasaba antes de este arreglo, no es nuevo), pero nunca se
  // pierde en silencio por un error de envío.
  const mensajesExitosos = [...mensajes].filter((mensaje) => dedupeKeysConExito.has(mensaje.dedupeKey))
  const porDedupe = new Map<string, MensajeDeTanda>()
  for (const mensaje of mensajesExitosos) {
    if (!porDedupe.has(mensaje.dedupeKey)) porDedupe.set(mensaje.dedupeKey, mensaje)
  }

  let erroresRegistro = 0
  const filas = [...porDedupe.values()].map((mensaje) => ({
    user_id: mensaje.userId,
    kind: mensaje.kind,
    channel: 'push',
    status: 'SUCCESS',
    dedupe_key: mensaje.dedupeKey,
    ...(mensaje.eventId ? { event_id: mensaje.eventId } : {}),
  }))
  if (filas.length > 0) {
    const { error: insertError } = await supabase.from('notification_sends').insert(filas)
    if (insertError) {
      erroresRegistro = filas.length
      console.error('[CronNotificaciones] No se pudo registrar el envío en notification_sends:', insertError.message)
    }
  }

  // Cuántos dedupeKey distintos de esta tanda NO se registraron porque
  // ningún ticket de ese aviso volvió `ok` (no incluye los que sí tuvieron
  // éxito pero el INSERT de notification_sends falló: esos ya están en
  // `erroresRegistro`).
  const dedupeKeysTotales = new Set(mensajes.map((m) => m.dedupeKey)).size
  const enviosNoRegistradosPorFalla = dedupeKeysTotales - porDedupe.size

  return reply(200, {
    dryRun: false,
    mensajes: mensajes.length,
    porTipo,
    descartados,
    tokensInvalidosBorrados: invalidos.length,
    erroresLote: erroresEnvio.length + erroresReceipts.length,
    erroresRegistro,
    enviosNoRegistradosPorFalla,
  })
}

/** Traduce la respuesta de la ruta a la fila de job_runs. */
function toOutcome(r: NotificacionesReply): JobOutcome {
  if (r.httpStatus >= 500) return { status: 'FAILED', errors: [String(r.body.error ?? 'error')] }
  const body = r.body as {
    dryRun?: boolean
    mensajes?: number
    erroresLote?: number
    erroresRegistro?: number
    enviosNoRegistradosPorFalla?: number
    tokensInvalidosBorrados?: number
  }
  // `erroresLote` solo cuenta lotes enteros que fallaron (timeout, red, HTTP);
  // `enviosNoRegistradosPorFalla` suma además los avisos que Expo procesó
  // pero cuyo ticket volvió con error (arreglo 3, R39): sin esto, una
  // corrida donde todos los tickets fallaran individualmente igual se vería
  // "SUCCESS" en job_runs.
  const fallos = (body.erroresLote ?? 0) + (body.erroresRegistro ?? 0) + (body.enviosNoRegistradosPorFalla ?? 0)
  return {
    status: fallos > 0 ? 'PARTIAL' : 'SUCCESS',
    itemsProcessed: body.mensajes ?? 0,
    itemsFailed: fallos,
    details: { dryRun: body.dryRun ?? true, tokensInvalidosBorrados: body.tokensInvalidosBorrados ?? 0 },
  }
}
