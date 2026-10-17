/**
 * Armar la tanda de notificaciones push (R39, tarea 39-b): a partir de los
 * datos ya leídos de la base (usuarios, preferencias, tokens, favoritos,
 * novedades y envíos ya registrados), decide a quién le toca un mensaje
 * ahora y arma la lista final, lista para `enviarLote` de
 * `apps/web/lib/notificaciones/expo-push.ts` (39-c).
 *
 * Pura: sin Supabase, sin `fetch`, sin `process.env`, sin React. Todo lo que
 * depende del reloj entra como `ahora: Date` por parámetro (nunca
 * `new Date()` adentro, nunca `getHours()`/`getDate()`: toda hora de pared
 * se decide adentro de las funciones de `./reglas`, que a su vez usan
 * `../date-format`).
 *
 * Las reglas (horario de silencio, tope diario, recordatorio de favoritos,
 * agrupado de novedades, la clave de dedupe) están todas en `./reglas`
 * (39-a): este archivo no reimplementa ninguna, solo las combina con los
 * datos de cada usuario.
 *
 * Dos cosas quedan deliberadamente afuera de esta función:
 *   - `announcements` (los avisos del panel admin): QPS-166, a pedido de
 *     Mauro, para otra ronda. Aunque la preferencia esté en `true`, esta
 *     función no genera ningún mensaje de ese tipo.
 *   - El canal del Radar (`radar_channel`, semanal/email): lo arma otro
 *     proceso (R27, `radar/cadence.ts` y lo que lo rodea), no esta tanda.
 */
import {
  claveDedupe,
  contarEnviosDelDiaSalta,
  debeEnviarRecordatorioFavorito,
  estaEnHorarioDeSilencio,
  hayLugarEnTopeDiario,
  MAX_NOVEDADES_POR_DIA,
  prepararNovedadesParaEnviar,
  type EnvioRegistradoParaTope,
  type EventoParaRecordatorioFavorito,
  type NovedadParaAgrupar,
  type TipoEnvioNotificacion,
} from './reglas'
import { PREFERENCIAS_POR_DEFECTO, type PreferenciasNotificacion } from './preferencias'
import { urlEvento, type MetricOrigin } from '../metricas/links'

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/** Favorito con fecha: lo mínimo para decidir el recordatorio (`./reglas`) y para el texto del mensaje. */
export interface FavoritoParaTanda extends EventoParaRecordatorioFavorito {
  eventId: string
  /** Título del evento, para el cuerpo del mensaje. */
  title: string
}

/**
 * Novedad de algo que el usuario sigue (venue, categoría o cuenta de
 * Instagram), ya resuelta a un evento concreto por quien llama. `id` tiene
 * que ser único entre las novedades de este usuario (lo exige el agrupado
 * de `./reglas`, que agrupa por `id`).
 *
 * Contrato con quien llama (R41, tarea 41-a): `UsuarioParaTanda.novedades`
 * trae SOLO las novedades NUEVAS de esta corrida (las que detectó
 * `novedadesDeUsuario` de `./novedades`, en la ventana desde la última
 * corrida OK hasta ahora), no todas las del día de Salta. Es al revés del
 * contrato de la R39: ahí el array tenía que traer también las ya avisadas,
 * porque `limitarNovedadesPorDia` (`./reglas`) cuenta `MAX_NOVEDADES_POR_DIA`
 * por posición cronológica dentro del array que recibe, no por si ese grupo
 * ya se mandó, y filtrar antes de pasarlas corría el tope de lugar. Ahora es
 * seguro filtrar: el tope de novedades por día se cuenta sobre
 * `enviosRegistrados` (los envíos YA REGISTRADOS en `notification_sends`,
 * con `contarEnviosDelDiaSalta`), no por posición en este array (ver
 * `candidatosDeNovedades`, más abajo).
 */
export interface NovedadParaTanda extends NovedadParaAgrupar {
  eventId: string
  /** Título del evento nuevo, para el cuerpo del mensaje cuando el grupo tiene uno solo. */
  title: string
}

/**
 * Envío ya registrado de este usuario (cualquier fecha, no solo la de hoy):
 * `dedupe_key` para el dedupe de "ya enviado", `sent_at` (de
 * `EnvioRegistradoParaTope`) para el tope, que solo cuenta los de hoy
 * (`contarEnviosDelDiaSalta` filtra por fecha).
 */
export interface EnvioRegistradoParaTanda extends EnvioRegistradoParaTope {
  dedupe_key: string
}

export interface UsuarioParaTanda {
  userId: string
  /**
   * `undefined`/`null` si el usuario no tiene fila en
   * `notification_preferences`: se usan los defaults de
   * `PREFERENCIAS_POR_DEFECTO`, nunca se asume que vino la fila ni se
   * duplican esos valores acá.
   */
  preferencias?: PreferenciasNotificacion | null
  /**
   * Tokens de Expo de todos los dispositivos del usuario
   * (`push_tokens.token`). Nunca se loguean: viajan únicamente en el `to`
   * del mensaje de salida.
   */
  tokens: string[]
  favoritos: FavoritoParaTanda[]
  /** Ver el contrato en el docstring de `NovedadParaTanda`: solo las nuevas de esta corrida, no todas las del día. */
  novedades: NovedadParaTanda[]
  enviosRegistrados: EnvioRegistradoParaTanda[]
}

export interface DatosParaTanda {
  usuarios: UsuarioParaTanda[]
}

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

/**
 * Mismo contrato que `MensajePush` de
 * `apps/web/lib/notificaciones/expo-push.ts`. No se importa desde ahí:
 * `packages/core` no depende de `apps/web` (va en sentido contrario, por
 * `package.json`). Si esa forma cambia, hay que actualizar las dos.
 */
export interface MensajeTanda {
  to: string
  title?: string
  body?: string
  data?: Record<string, unknown>
}

/**
 * Un mensaje de la tanda, con lo que 39-d necesita además para escribir
 * `notification_sends`. Hay un `MensajeDeTanda` por TOKEN del usuario (dos
 * tokens dan dos mensajes, idénticos salvo `to`), pero los que comparten
 * `dedupeKey` son el MISMO envío lógico: `notification_sends.dedupe_key` es
 * único en TODA la tabla, así que quien la escribe tiene que insertar una
 * sola fila por `dedupeKey`, no una por `MensajeDeTanda` (si no, el segundo
 * INSERT del mismo usuario chocaría contra el unique).
 */
export interface MensajeDeTanda extends MensajeTanda {
  /** `notification_sends.user_id`. */
  userId: string
  /** `notification_sends.kind`: en esta tanda, siempre `'favorito'` o `'novedad'` (nunca `'radar'` ni `'anuncio'`: ver el comentario de arriba del archivo). */
  kind: TipoEnvioNotificacion
  /** `notification_sends.event_id`. `null` cuando el envío no es de un solo evento (p. ej. un grupo de novedades con más de un evento adentro). */
  eventId: string | null
  /** `notification_sends.dedupe_key`. */
  dedupeKey: string
}

// ---------------------------------------------------------------------------
// Textos: voseo rioplatense, cortos (entran en una notificación de celular).
// ---------------------------------------------------------------------------

const TITULO_FAVORITO = 'Se te viene un plan'
const TITULO_NOVEDADES = 'Hay novedades de lo que seguís'

function cuerpoFavorito(titulo: string): string {
  return `${titulo}. Guardate el lugar en la agenda.`
}

function cuerpoNovedades(novedades: NovedadParaTanda[]): string {
  if (novedades.length === 1) return `${novedades[0].title}: enterate antes que nadie.`
  const primeros = novedades
    .slice(0, 2)
    .map((novedad) => novedad.title)
    .join(', ')
  const resto = novedades.length - 2
  return resto > 0
    ? `${primeros} y ${resto} más. Enterate antes que nadie.`
    : `${primeros}. Enterate antes que nadie.`
}

/** De dónde viene el click en el link del mensaje (`?o=`, QPS-027): siempre "app", nunca uno de los orígenes de la web. */
const ORIGEN_PUSH: MetricOrigin = 'app'

/**
 * `data` del mensaje, con el link armado por `urlEvento` de
 * `../metricas/links`. `urlEvento` da `null` si `eventId` no es un uuid
 * válido, y acá también puede no haber `eventId` (un grupo de novedades con
 * más de un evento adentro no tiene un único evento al que linkear). En
 * cualquiera de los dos casos, el mensaje se manda SIN `data`: un
 * `data: { url: null }` no le sirve a quien recibe el push, y es preferible
 * una notificación sin link navegable a una con un link roto.
 */
function datosDelMensaje(eventId: string | null): Record<string, unknown> | undefined {
  if (!eventId) return undefined
  const url = urlEvento(eventId, ORIGEN_PUSH)
  return url ? { url } : undefined
}

// ---------------------------------------------------------------------------
// Candidatos (antes de pasar por el tope diario)
// ---------------------------------------------------------------------------

interface Candidato {
  kind: TipoEnvioNotificacion
  eventId: string | null
  dedupeKey: string
  title: string
  body: string
}

/** Un candidato por favorito cuyo momento de recordatorio ya llegó y no se mandó todavía (`debeEnviarRecordatorioFavorito`, 39-a). */
function candidatosDeFavoritos(
  usuario: UsuarioParaTanda,
  ahora: Date,
  dedupeKeysYaEnviados: Set<string>,
): Candidato[] {
  const candidatos: Candidato[] = []

  for (const favorito of usuario.favoritos) {
    const dedupeKey = claveDedupe({ kind: 'favorito', userId: usuario.userId, eventId: favorito.eventId })
    const yaEnviado = dedupeKeysYaEnviados.has(dedupeKey)
    if (!debeEnviarRecordatorioFavorito({ evento: favorito, ahora, yaEnviado })) continue

    candidatos.push({
      kind: 'favorito',
      eventId: favorito.eventId,
      dedupeKey,
      title: TITULO_FAVORITO,
      body: cuerpoFavorito(favorito.title),
    })
  }

  return candidatos
}

/**
 * El `dedupeKey` de un envío de tipo `novedad` siempre empieza con este
 * prefijo. No se escribe el formato `"novedad:<userId>:..."` a mano (sería
 * duplicar el formato de `claveDedupe`, acá y en `./reglas`): se deriva
 * llamando a `claveDedupe` con un `userId` vacío, así que si el formato de
 * `claveDedupe` cambia algún día, este prefijo lo sigue solo, sin que haya
 * que acordarse de tocar dos archivos.
 */
const PREFIJO_DEDUPE_NOVEDAD = claveDedupe({ kind: 'novedad', userId: '' })

/**
 * `true` si `dedupeKey` es de un envío de tipo `novedad`. Se usa sobre
 * `enviosRegistrados` de UN solo usuario (ya viene filtrado por usuario en
 * `UsuarioParaTanda`), así que alcanza con el prefijo: no hace falta
 * reconstruir la clave completa ni filtrar además por `userId`.
 */
function esDedupeKeyDeNovedad(dedupeKey: string): boolean {
  return dedupeKey.startsWith(PREFIJO_DEDUPE_NOVEDAD)
}

/**
 * Un candidato por grupo de novedades que pasó `prepararNovedadesParaEnviar`
 * (agrupado por hora de Salta + tope de novedades por día, 39-a/41-a) y que
 * todavía no se mandó. `prepararNovedadesParaEnviar` devuelve los grupos con
 * el tipo base `NovedadParaAgrupar` (solo `id`/`momento`): `porId` recupera
 * el `eventId`/`title` de cada una a partir del `id`, sin castear.
 *
 * El tope de novedades por día (R41, 41-a) se cuenta sobre los envíos YA
 * REGISTRADOS de tipo `novedad` del día de Salta (`yaHoy`, con
 * `contarEnviosDelDiaSalta` sobre la lista YA FILTRADA por
 * `esDedupeKeyDeNovedad`: si corriera sobre `enviosRegistrados` entero, los
 * recordatorios de favoritos de hoy le comerían lugar a este tope, que es
 * distinto del tope total de `armarTanda`, paso 5, que no se toca). Antes
 * (R39) el tope se contaba por posición cronológica dentro del array de
 * `usuario.novedades` (ver el docstring de `NovedadParaTanda`); ahora que
 * ese array trae solo las nuevas de esta corrida, se le pasa
 * `MAX_NOVEDADES_POR_DIA - yaHoy` explícito a `prepararNovedadesParaEnviar`
 * (nunca el default): si ya no queda lugar (`restante <= 0`), no hay
 * candidatos de novedades, antes de agrupar nada.
 *
 * Antes de agrupar, se descartan las novedades cuyo `momento` todavía no
 * llegó (`momento > ahora`), por simetría con `debeEnviarRecordatorioFavorito`
 * de favoritos. El filtro es `<=` (no un rango exacto), igual criterio que
 * favoritos usa con `>=`: el borde exacto (`momento === ahora`) SÍ genera
 * candidato. El filtro va antes de `prepararNovedadesParaEnviar` a propósito:
 * así una novedad futura no ocupa lugar en el tope del día (si se filtrara
 * después de agrupar/topear, una novedad de mañana podría desplazar a una de
 * hoy fuera del tope).
 *
 * Con `momento = ahora` para todas las novedades de la corrida (41-a,
 * `novedadesDeUsuario`), `agruparNovedadesPorHora` (`./reglas`) devuelve UN
 * SOLO grupo por corrida, con la `claveHora` del bucket de hora de Salta de
 * esa corrida. Si dos corridas caen en la MISMA hora de reloj de Salta (un
 * `workflow_dispatch` a mano además del cron horario, o un reintento dentro
 * de la misma hora), la segunda arma el mismo `dedupeKey` que la primera y
 * el dedupe de abajo (`dedupeKeysYaEnviados`) la descarta entera; y como la
 * ventana de `inicioVentanaNovedades` (`./novedades`) ya avanzó hasta el
 * `ahora` de la primera corrida, esas novedades no se reintentan en ninguna
 * corrida futura. Es angosto (el cron corre una vez por hora, a los :05),
 * pero es real: no se resuelve en esta ronda.
 */
function candidatosDeNovedades(
  usuario: UsuarioParaTanda,
  ahora: Date,
  dedupeKeysYaEnviados: Set<string>,
): Candidato[] {
  const enviosDeNovedadHoy = usuario.enviosRegistrados.filter((envio) => esDedupeKeyDeNovedad(envio.dedupe_key))
  const yaHoy = contarEnviosDelDiaSalta(enviosDeNovedadHoy, ahora)
  const restante = MAX_NOVEDADES_POR_DIA - yaHoy
  if (restante <= 0) return []

  const novedadesYaOcurridas = usuario.novedades.filter(
    (novedad) => new Date(novedad.momento).getTime() <= ahora.getTime(),
  )
  const porId = new Map(novedadesYaOcurridas.map((novedad) => [novedad.id, novedad]))
  const grupos = prepararNovedadesParaEnviar(novedadesYaOcurridas, restante)

  const candidatos: Candidato[] = []

  for (const grupo of grupos) {
    const dedupeKey = claveDedupe({ kind: 'novedad', userId: usuario.userId, extra: grupo.claveHora })
    if (dedupeKeysYaEnviados.has(dedupeKey)) continue

    const novedadesDelGrupo = grupo.novedades
      .map((novedad) => porId.get(novedad.id))
      .filter((novedad): novedad is NovedadParaTanda => novedad !== undefined)
    if (novedadesDelGrupo.length === 0) continue

    // Un solo evento en el grupo: ese es "el" evento del envío (para el
    // link y para notification_sends.event_id). Más de uno: ninguno es "el"
    // evento, queda null.
    const unEventoSolo = novedadesDelGrupo.length === 1 ? novedadesDelGrupo[0].eventId : null

    candidatos.push({
      kind: 'novedad',
      eventId: unEventoSolo,
      dedupeKey,
      title: TITULO_NOVEDADES,
      body: cuerpoNovedades(novedadesDelGrupo),
    })
  }

  return candidatos
}

// ---------------------------------------------------------------------------
// armarTanda
// ---------------------------------------------------------------------------

/**
 * Arma la tanda completa, usuario por usuario. Por usuario, en orden:
 *
 *   1. Sin tokens, no hay nada que mandar: se descarta entero (no consume
 *      tope ni queda marcado como enviado en ningún lado).
 *   2. Preferencias: la fila de `notification_preferences` si existe, si no
 *      `PREFERENCIAS_POR_DEFECTO`.
 *   3. Horario de silencio (`estaEnHorarioDeSilencio`, evaluado en `ahora`):
 *      si cae adentro, nada para este usuario en esta corrida. Se descarta,
 *      no se reprograma (así lo documenta `./reglas`): como ningún
 *      candidato se marca como enviado, una corrida futura que ya no esté
 *      en silencio vuelve a evaluar los mismos datos.
 *   4. Candidatos: recordatorios de favoritos (si `favorite_reminders`) y
 *      grupos de novedades (si `follow_news`), cada uno ya filtrado por su
 *      propia regla de 39-a y por el dedupe de "ya enviado"
 *      (`dedupeKeysYaEnviados`, construido una sola vez a partir de
 *      `enviosRegistrados`). Los de favoritos van primero, en el orden de
 *      entrada; los de novedades después, en orden cronológico (ya los da
 *      así `prepararNovedadesParaEnviar`).
 *   5. Tope diario (`hayLugarEnTopeDiario`), sobre el TOTAL del usuario: el
 *      contador arranca en lo que `contarEnviosDelDiaSalta` cuenta de
 *      `enviosRegistrados` (lo ya mandado hoy) y sube de a uno por cada
 *      candidato que entra, así que lo de hoy le resta lugar a lo que esta
 *      misma tanda le manda (la cuenta mixta que pide la ronda: con 3
 *      envíos hoy y `daily_cap` 4, de 3 candidatos nuevos entra 1 solo). Un
 *      candidato que no entra por el tope se descarta (tampoco se
 *      reprograma): al no quedar marcado como enviado, una corrida futura
 *      con lugar en el tope lo vuelve a intentar.
 *   6. Por cada candidato que entró, un `MensajeDeTanda` por token del
 *      usuario: mismo `title`/`body`/`data`/`userId`/`kind`/`eventId`/`dedupeKey`,
 *      distinto `to`. El tope ya contó esto como UN envío (paso 5), no uno
 *      por token.
 */
export function armarTanda(datos: DatosParaTanda, ahora: Date): MensajeDeTanda[] {
  const mensajes: MensajeDeTanda[] = []

  for (const usuario of datos.usuarios) {
    if (usuario.tokens.length === 0) continue

    const prefs = usuario.preferencias ?? PREFERENCIAS_POR_DEFECTO
    if (estaEnHorarioDeSilencio(ahora, prefs)) continue

    const dedupeKeysYaEnviados = new Set(usuario.enviosRegistrados.map((envio) => envio.dedupe_key))

    const candidatos: Candidato[] = [
      ...(prefs.favorite_reminders ? candidatosDeFavoritos(usuario, ahora, dedupeKeysYaEnviados) : []),
      ...(prefs.follow_news ? candidatosDeNovedades(usuario, ahora, dedupeKeysYaEnviados) : []),
    ]

    let cantidadEnviosHoy = contarEnviosDelDiaSalta(usuario.enviosRegistrados, ahora)

    for (const candidato of candidatos) {
      if (!hayLugarEnTopeDiario(cantidadEnviosHoy, prefs.daily_cap)) continue
      cantidadEnviosHoy += 1

      const data = datosDelMensaje(candidato.eventId)

      for (const token of usuario.tokens) {
        mensajes.push({
          to: token,
          title: candidato.title,
          body: candidato.body,
          ...(data ? { data } : {}),
          userId: usuario.userId,
          kind: candidato.kind,
          eventId: candidato.eventId,
          dedupeKey: candidato.dedupeKey,
        })
      }
    }
  }

  return mensajes
}
