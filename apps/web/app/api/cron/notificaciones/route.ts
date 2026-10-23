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
import type { CanalRadar, PreferenciasNotificacion } from '@qps/core/notificaciones/preferencias'
import { isVigente } from '@qps/core/events/vigencia'
import { enLotes, TAMANIO_LOTE_IN, TAMANIO_PAGINA_TOKENS } from '@qps/core/notificaciones/lotes'
import {
  enviarLote,
  esTokenExpoValido,
  leerReceipts,
  tokensInvalidos,
  type MensajePush,
} from '@/lib/notificaciones/expo-push'
import { cargarNovedades } from '@/lib/notificaciones/novedades'
import { leerPaginado, type RespuestaDePagina } from '@/lib/notificaciones/paginado'
import { cargarCampaniaVigente } from '@/lib/notificaciones/patrocinados'

// Igual que recurrentes/route.ts: sin esto Vercel puede cortar la función a
// mitad y dejar la corrida en RUNNING (como sus crones hermanos, scrape,
// instagram y radar-newsletter, que comparten el mismo riesgo de timeout).
export const maxDuration = 60

/**
 * GET /api/cron/notificaciones (R39, tarea 39-d; D2/Ronda 51, tarea 51-b)
 *
 * Arma la tanda de push (recordatorios de favoritos + novedades de lo que el
 * usuario sigue + el aviso patrocinado vigente, `armarTanda` de
 * `@qps/core/notificaciones/tanda`) y, solo si `PUSH_ENVIO_REAL === "1"`, la
 * manda de verdad por la API de Expo (`enviarLote`/`leerReceipts`/`tokensInvalidos`,
 * 39-c). Por defecto (esa variable sin definir, vacía o con cualquier otro
 * valor) es un `dryRun`: ni un `fetch` a Expo, ni una escritura en
 * `notification_sends`, `push_tokens` ni `sponsored_campaigns`. La dispara
 * `.github/workflows/notificaciones.yml`, apagado a propósito hasta que la
 * app tenga push (encargo de Mauro).
 *
 * QPS-201 (51-b): `push_tokens`, `user_favorites` y `notification_sends` se
 * leen en lotes de `TAMANIO_LOTE_IN` ids (el largo de la URL de un `.in`) y,
 * dentro de cada lote (o, en el caso de `push_tokens`, sobre la tabla
 * entera, sin `.in`), en páginas de `TAMANIO_PAGINA_TOKENS` filas con
 * `leerPaginado` (`max_rows` de PostgREST). `notification_preferences` solo
 * en lotes (una fila por persona: con lotes de 200 nunca llega a 1000, no
 * hace falta paginar).
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

/** Cuántos mensajes de `mensajes` son de cada `kind` ('favorito'/'novedad'/'patrocinado'). */
function contarPorTipo(mensajes: MensajeDeTanda[]): Record<string, number> {
  const porTipo: Record<string, number> = {}
  for (const mensaje of mensajes) porTipo[mensaje.kind] = (porTipo[mensaje.kind] ?? 0) + 1
  return porTipo
}

/**
 * Cuántos ENVÍOS LÓGICOS patrocinados hay en `mensajes` (D2/Ronda 51): un
 * envío lógico es un `dedupeKey`, no un mensaje — un usuario con dos tokens
 * genera dos `MensajeDeTanda` de `kind: 'patrocinado'` con el MISMO
 * `dedupeKey` (igual criterio que `porDedupe` más abajo, para
 * `notification_sends`). `contarPorTipo` (de arriba) cuenta mensajes, no
 * envíos: por eso este conteo es aparte, y es el que viaja en
 * `details.patrocinados`.
 */
function contarPatrocinadosLogicos(mensajes: MensajeDeTanda[]): number {
  return new Set(mensajes.filter((m) => m.kind === 'patrocinado').map((m) => m.dedupeKey)).size
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

/**
 * Adapta el resultado de un `.range(...)` de supabase-js (un
 * `PostgrestFilterBuilder`, thenable con `{ data, error }`) a la forma que
 * pide `leerPaginado`/`RespuestaDePagina<T>`. El tipo que infiere supabase-js
 * para `data` no conoce el `T` genérico de quien llama (y con columnas
 * embebidas, como `events(...)` de `user_favorites`, ni siquiera coincide en
 * forma con el tipo a mano de más abajo): en runtime ya es exactamente esa
 * forma (un objeto `{ data, error }`), así que el `as unknown as` es seguro,
 * solo le dice a TypeScript lo que ya es cierto.
 */
function comoPagina<T>(
  consulta: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): PromiseLike<RespuestaDePagina<T>> {
  return consulta as unknown as PromiseLike<RespuestaDePagina<T>>
}

/**
 * Lee TODAS las filas de `tabla` para `userIds` (QPS-201): en lotes de
 * `TAMANIO_LOTE_IN` ids y, dentro de cada lote, en páginas de
 * `TAMANIO_PAGINA_TOKENS` filas con `leerPaginado` (un lote de 200 personas
 * puede devolver más de 1000 filas si cada una tiene varias). `armarConsulta`
 * recibe el lote de ids y devuelve la consulta YA ARMADA (con `.select`,
 * `.in`, el/los `.order()` que le toquen a esa tabla y SIN `.range`: eso lo
 * agrega `leerPaginado`). Si falla cualquier lote o cualquier página, se
 * corta ahí: no se devuelve una lista a medias.
 */
async function leerEnLotesYPaginas<T>(
  userIds: string[],
  armarConsulta: (loteIds: string[], desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ ok: true; filas: T[] } | { ok: false; error: string }> {
  const filas: T[] = []
  for (const loteIds of enLotes(userIds, TAMANIO_LOTE_IN)) {
    const resultado = await leerPaginado<T>(TAMANIO_PAGINA_TOKENS, (desde, hasta) => armarConsulta(loteIds, desde, hasta))
    if (!resultado.ok) return resultado
    filas.push(...resultado.filas)
  }
  return { ok: true, filas }
}

async function enviarNotificaciones(): Promise<NotificacionesReply> {
  const ahora = new Date()
  // El cliente admin se crea acá adentro, después de validar el secreto en
  // GET, nunca en el tope del módulo.
  const supabase = createAdminClient()

  // 1. Universo de esta tanda: usuarios con al menos un token (push_tokens).
  // Sin token no hay nada que mandar, así que acota todo lo demás. QPS-201:
  // push_tokens no tiene `.in` (es la tabla entera), así que se pagina
  // directo con leerPaginado, con un orden estable (`id`).
  const resultadoTokens = await leerPaginado<{ id: string; user_id: string; token: string }>(
    TAMANIO_PAGINA_TOKENS,
    (desde, hasta) => comoPagina(supabase.from('push_tokens').select('id, user_id, token').order('id').range(desde, hasta)),
  )
  if (!resultadoTokens.ok) {
    console.error('[CronNotificaciones] Error al leer push_tokens:', resultadoTokens.error)
    return reply(500, { error: 'push_tokens query failed' })
  }
  // Si se llegó al tope de páginas sin ver nunca una corta, puede quedar
  // gente sin token en esta tanda: la corrida sigue (no es un error), pero
  // queda PARTIAL y lo dice el log — nunca un token ni un id en `details`.
  const tokensTruncados = resultadoTokens.truncado

  const tokensPorUsuario = new Map<string, string[]>()
  for (const fila of resultadoTokens.filas) {
    const lista = tokensPorUsuario.get(fila.user_id)
    if (lista) lista.push(fila.token)
    else tokensPorUsuario.set(fila.user_id, [fila.token])
  }
  const userIds = [...tokensPorUsuario.keys()]

  if (userIds.length === 0) {
    // Sin tokens, no hay nada que armar, pero la ventana de novedades tiene
    // que avanzar igual (novedadesHasta = ahora): si no, el día que no haya
    // ningún token la ventana queda clavada, y al aparecer el primero se
    // dispara un aviso con toda la antigüedad acumulada de golpe.
    return reply(200, { dryRun: !modoEnvioReal(), mensajes: 0, porTipo: {}, novedadesHasta: ahora.toISOString() })
  }

  // 2. Preferencias de esos usuarios (si no hay fila, armarTanda usa los
  // defaults: no se duplica esa lógica acá). QPS-201: en lotes de ids, SIN
  // paginar — notification_preferences tiene una fila por persona, así que
  // un lote de 200 ids nunca llega a los 1000 de max_rows.
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
  const prefRows: FilaPref[] = []
  for (const loteIds of enLotes(userIds, TAMANIO_LOTE_IN)) {
    const { data, error: prefError } = await supabase
      .from('notification_preferences')
      .select('user_id, radar_channel, favorite_reminders, follow_news, announcements, sponsored, quiet_start, quiet_end, daily_cap')
      .in('user_id', loteIds)
    if (prefError) {
      console.error('[CronNotificaciones] Error al leer notification_preferences:', prefError.message)
      return reply(500, { error: 'notification_preferences query failed' })
    }
    prefRows.push(...((data ?? []) as FilaPref[]))
  }
  // El tipo de retorno de la función va ANOTADO (`): [string, PreferenciasNotificacion] =>`)
  // y el literal NO lleva `as PreferenciasNotificacion`, a propósito: ese
  // `as` era lo que escondía el bug que arregló 51-b. Una aserción sobre el
  // literal deja pasar un campo que falta, así que cuando core sumó
  // `sponsored` nadie se enteró: `prefs.sponsored` quedaba `undefined` para
  // TODO el mundo (y `undefined` es falsy, así que `candidatoPatrocinado` no
  // generaba ni un candidato), con 0 errores de tipos. Con el tipo anotado,
  // el próximo campo que se le sume a `PreferenciasNotificacion` pone ESTE
  // archivo en rojo, que es exactamente donde hay que acordarse de sumarlo al
  // `.select(...)` de arriba. Lo único que se castea es `radar_channel`: la
  // columna es texto libre en la base y acá es la unión `CanalRadar`.
  const preferenciasPorUsuario = new Map<string, PreferenciasNotificacion>(
    prefRows.map((fila): [string, PreferenciasNotificacion] => [
      fila.user_id,
      {
        radar_channel: fila.radar_channel as CanalRadar,
        favorite_reminders: fila.favorite_reminders,
        follow_news: fila.follow_news,
        announcements: fila.announcements,
        sponsored: fila.sponsored,
        quiet_start: fila.quiet_start,
        quiet_end: fila.quiet_end,
        daily_cap: fila.daily_cap,
      },
    ]),
  )

  // 3. Favoritos con evento (user_favorites.event_id no nulo: es la tabla
  // vigente de favoritos, la que usan /favoritos y lib/actions/favorites.ts;
  // la tabla "favorites" quedó de una versión anterior, solo la toca
  // lib/actions.ts). Se filtra en memoria por status PUBLISHED y por
  // vigencia (isVigente, el mismo criterio que /favoritos y el Radar): un
  // evento ya terminado no tiene sentido "recordarlo". QPS-201: en lotes de
  // ids y, dentro de cada lote, paginado (order por `id`: un lote de 200
  // personas con varios favoritos cada una puede superar las 1000 filas).
  type FilaFavorito = {
    user_id: string
    event_id: string
    events: { title: string; start_date: string; end_date: string | null; status: string | null } | null
  }
  const resultadoFav = await leerEnLotesYPaginas<FilaFavorito>(userIds, (loteIds, desde, hasta) =>
    comoPagina(
      supabase
        .from('user_favorites')
        .select('user_id, event_id, events(title, start_date, end_date, status)')
        .in('user_id', loteIds)
        .not('event_id', 'is', null)
        .order('id')
        .range(desde, hasta),
    ),
  )
  if (!resultadoFav.ok) {
    console.error('[CronNotificaciones] Error al leer user_favorites:', resultadoFav.error)
    return reply(500, { error: 'user_favorites query failed' })
  }

  const favoritosPorUsuario = new Map<string, FavoritoParaTanda[]>()
  for (const fila of resultadoFav.filas) {
    const evento = fila.events
    if (!evento || evento.status !== 'PUBLISHED') continue
    if (!isVigente(evento, ahora)) continue
    const lista = favoritosPorUsuario.get(fila.user_id) ?? []
    lista.push({ eventId: fila.event_id, title: evento.title, start_date: evento.start_date })
    favoritosPorUsuario.set(fila.user_id, lista)
  }

  // 4. Envíos ya registrados (cualquier fecha: el tope diario de armarTanda
  // filtra por día de Salta, el dedupe por dedupe_key, ninguno de los dos
  // acá). QPS-201, en lotes + páginas, igual criterio que user_favorites: es
  // la lectura de la que depende la garantía de "como mucho un aviso
  // patrocinado por semana" (ver el docstring de `./paginado`), así que
  // ACÁ es donde más importa no cortarse en los 1000 de max_rows.
  type FilaEnvio = { user_id: string; dedupe_key: string; sent_at: string }
  const resultadoSends = await leerEnLotesYPaginas<FilaEnvio>(userIds, (loteIds, desde, hasta) =>
    comoPagina(
      supabase.from('notification_sends').select('user_id, dedupe_key, sent_at').in('user_id', loteIds).order('id').range(desde, hasta),
    ),
  )
  if (!resultadoSends.ok) {
    console.error('[CronNotificaciones] Error al leer notification_sends:', resultadoSends.error)
    return reply(500, { error: 'notification_sends query failed' })
  }
  const enviosPorUsuario = new Map<string, EnvioRegistradoParaTanda[]>()
  for (const fila of resultadoSends.filas) {
    const lista = enviosPorUsuario.get(fila.user_id) ?? []
    lista.push({ dedupe_key: fila.dedupe_key, sent_at: fila.sent_at })
    enviosPorUsuario.set(fila.user_id, lista)
  }

  // 5. Novedades (follow_news): cargarNovedades (apps/web/lib/notificaciones/novedades.ts,
  // tarea 41-b, con su propio loteo/paginado QPS-201 desde la 51-b) resuelve,
  // por cada usuario, la ventana de tiempo (inicioVentanaNovedades, 41-a, por
  // usuario: saltea las corridas en las que ESE usuario estaba en silencio) y
  // el cruce de los eventos nuevos (events.created_at) con lo que sigue
  // (categorías, locales, cuentas de Instagram). Si falla cualquiera de sus
  // lecturas, 500, igual que las lecturas de arriba: la corrida queda FAILED
  // y la ventana no avanza.
  const resultadoNovedades = await cargarNovedades(supabase, { userIds, preferenciasPorUsuario, ahora })
  if (!resultadoNovedades.ok) {
    // cargarNovedades ya hizo su propio console.error con el nombre de la
    // tabla y el message: no se duplica el log acá.
    return reply(500, { error: `${resultadoNovedades.tabla} query failed` })
  }
  const novedadesPorUsuario = resultadoNovedades.porUsuario

  // 6. La campaña patrocinada vigente de esta corrida (D2/Ronda 51, 51-b):
  // a lo sumo una para toda la tanda (ver el docstring de `cargarCampaniaVigente`
  // y de `campaniaVigente`, core). Si falla la lectura, 500 como las demás.
  const resultadoCampania = await cargarCampaniaVigente(supabase, ahora)
  if (!resultadoCampania.ok) {
    return reply(500, { error: `${resultadoCampania.tabla} query failed` })
  }
  const campania = resultadoCampania.campania
  const patrocinadoDescartado = resultadoCampania.descartada

  const usuarios: UsuarioParaTanda[] = userIds.map((userId) => ({
    userId,
    preferencias: preferenciasPorUsuario.get(userId) ?? null,
    tokens: tokensPorUsuario.get(userId) ?? [],
    favoritos: favoritosPorUsuario.get(userId) ?? [],
    novedades: novedadesPorUsuario.get(userId) ?? [],
    enviosRegistrados: enviosPorUsuario.get(userId) ?? [],
  }))

  const mensajes = armarTanda(
    { usuarios, patrocinado: campania ? { id: campania.id, titulo: campania.titulo, cuerpo: campania.cuerpo, eventId: campania.eventId } : null },
    ahora,
  )
  const porTipo = contarPorTipo(mensajes)
  const patrocinados = contarPatrocinadosLogicos(mensajes)
  const campaniaId = campania?.id ?? null

  if (!modoEnvioReal()) {
    // dryRun: ni un fetch a Expo, ni una escritura (ni notification_sends, ni
    // push_tokens, ni sponsored_campaigns.sent_at). Solo se arma y se cuenta.
    // novedadesHasta viaja igual: la ventana de novedades tiene que avanzar
    // aunque el envío de verdad esté apagado (ver el comentario del cuerpo
    // del PR: "mientras esté en dryRun, cada corrida corre la ventana").
    return reply(200, {
      dryRun: true,
      mensajes: mensajes.length,
      porTipo,
      novedadesHasta: ahora.toISOString(),
      patrocinados,
      campaniaId,
      ...(patrocinadoDescartado ? { patrocinadoDescartado: true } : {}),
      ...(tokensTruncados ? { tokensTruncados: true } : {}),
    })
  }

  // Modo real: se manda de verdad. `mensajesPush` sale limpio (sin userId,
  // kind, eventId, dedupeKey ni campaignId: esos campos son para
  // notification_sends, no para el body que viaja a la API de Expo).
  // `categoryId` (D2/Ronda 51) sí viaja: Expo lo pasa de largo a la
  // notificación nativa (lo usa la app para la baja rápida, 51-c/51-d).
  const mensajesPush: MensajePush[] = mensajes.map((mensaje) => ({
    to: mensaje.to,
    title: mensaje.title,
    body: mensaje.body,
    ...(mensaje.data ? { data: mensaje.data } : {}),
    ...(mensaje.categoryId ? { categoryId: mensaje.categoryId } : {}),
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
    // D2/Ronda 51: solo los de kind 'patrocinado' traen campaignId. Nunca se
    // manda `campaign_id: null` explícito para los demás.
    ...(mensaje.campaignId ? { campaign_id: mensaje.campaignId } : {}),
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

  // D2/Ronda 51: si hubo al menos un envío patrocinado con éxito (su
  // dedupeKey quedó en dedupeKeysConExito) y la campaña todavía no tiene
  // sent_at, se marca. El `.is('sent_at', null)` es la barrera que evita que
  // dos corridas (o una corrida y un reintento) se pisen. Si el UPDATE falla,
  // NO tumba la corrida: se loguea y queda en `details`, nada más.
  let patrocinadoSentAtError = false
  if (campania && campania.sentAt === null) {
    const huboExitoPatrocinado = mensajes.some((m) => m.kind === 'patrocinado' && dedupeKeysConExito.has(m.dedupeKey))
    if (huboExitoPatrocinado) {
      const { error: sentAtError } = await supabase
        .from('sponsored_campaigns')
        .update({ sent_at: ahora.toISOString() })
        .eq('id', campania.id)
        .is('sent_at', null)
      if (sentAtError) {
        patrocinadoSentAtError = true
        console.error('[CronNotificaciones] No se pudo marcar sent_at de la campaña patrocinada:', sentAtError.message)
      }
    }
  }

  return reply(200, {
    dryRun: false,
    mensajes: mensajes.length,
    porTipo,
    descartados,
    tokensInvalidosBorrados: invalidos.length,
    erroresLote: erroresEnvio.length + erroresReceipts.length,
    erroresRegistro,
    enviosNoRegistradosPorFalla,
    novedadesHasta: ahora.toISOString(),
    patrocinados,
    campaniaId,
    ...(patrocinadoDescartado ? { patrocinadoDescartado: true } : {}),
    ...(tokensTruncados ? { tokensTruncados: true } : {}),
    ...(patrocinadoSentAtError ? { patrocinadoSentAtError: true } : {}),
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
    novedadesHasta?: string
    patrocinados?: number
    campaniaId?: string | null
    patrocinadoDescartado?: boolean
    tokensTruncados?: boolean
    patrocinadoSentAtError?: boolean
  }
  // `erroresLote` solo cuenta lotes enteros que fallaron (timeout, red, HTTP);
  // `enviosNoRegistradosPorFalla` suma además los avisos que Expo procesó
  // pero cuyo ticket volvió con error (arreglo 3, R39): sin esto, una
  // corrida donde todos los tickets fallaran individualmente igual se vería
  // "SUCCESS" en job_runs.
  const fallos = (body.erroresLote ?? 0) + (body.erroresRegistro ?? 0) + (body.enviosNoRegistradosPorFalla ?? 0)
  // QPS-201 (51-b): si push_tokens se truncó en el tope de páginas, la
  // corrida no falló, pero quedó incompleta: PARTIAL, igual que un lote con
  // errores, aunque `fallos` sea 0.
  const truncado = body.tokensTruncados === true
  return {
    status: fallos > 0 || truncado ? 'PARTIAL' : 'SUCCESS',
    itemsProcessed: body.mensajes ?? 0,
    itemsFailed: fallos,
    // novedadesHasta (R41, 41-b) solo viaja en las ramas SUCCESS/PARTIAL de
    // acá (nunca en la de httpStatus >= 500, más arriba, que no tiene
    // `details`): con un 500 la ventana de novedades NO avanza, a propósito
    // (la corrida siguiente reintenta desde el mismo punto).
    details: {
      dryRun: body.dryRun ?? true,
      tokensInvalidosBorrados: body.tokensInvalidosBorrados ?? 0,
      novedadesHasta: body.novedadesHasta,
      // D2/Ronda 51: nunca un token, un email ni un id de usuario acá —
      // solo cuántos envíos lógicos patrocinados hubo y de qué campaña.
      patrocinados: body.patrocinados ?? 0,
      campaniaId: body.campaniaId ?? null,
      ...(body.patrocinadoDescartado ? { patrocinadoDescartado: true } : {}),
      ...(truncado ? { tokensTruncados: true } : {}),
      ...(body.patrocinadoSentAtError ? { patrocinadoSentAtError: true } : {}),
    },
  }
}
