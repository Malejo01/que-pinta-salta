/**
 * Punta a punta de la tanda de notificaciones push (R39, tarea 39-q): un solo
 * escenario que ejercita las tres piezas juntas —reglas puras (39-a,
 * `packages/core/src/notificaciones/reglas.ts`), el armado de la tanda (39-b,
 * `packages/core/src/notificaciones/tanda.ts`) y el cliente de Expo (39-c,
 * `apps/web/lib/notificaciones/expo-push.ts`)— con los datos de un solo día
 * de Salta. Fixtures inventados y evidentes (nombres "de prueba", uuids con
 * ceros), sin red ni base: `fetch` es siempre un doble.
 *
 * Lo que ningún test de 39-a/39-b/39-c por separado (los otros archivos de
 * esta carpeta y de `tests/core/`) puede ver, porque cada uno prueba su
 * pieza aislada:
 *
 *   - que la salida de `armarTanda` (`MensajeDeTanda[]`, que en `tanda.ts`
 *     extiende `MensajeTanda`) se le puede pasar TAL CUAL a `enviarLote`
 *     (que en `expo-push.ts` espera `MensajePush[]`). Esas dos interfaces
 *     están duplicadas a mano, a propósito, porque `packages/core` no puede
 *     importar de `apps/web` (mismo problema que `confirmacionValida`
 *     escrita dos veces en la R37). Si algún día se desalinean —alguien le
 *     cambia la forma a una sin tocar la otra—, la línea de abajo que llama
 *     `enviarLote(mensajes, ...)` con el array de `armarTanda` sin tocar
 *     deja de tipar: lo agarra `npm run typecheck`, no una aserción en
 *     runtime. Por eso el valor que se manda es el de `armarTanda` sin
 *     recortar ningún campo a mano.
 *   - que un token que Expo marca `DeviceNotRegistered`, en medio de un
 *     escenario real con favoritos, novedades, silencio y tope mezclados,
 *     termina efectivamente en `tokensInvalidos`.
 *   - que la `dedupeKey` que arma la tanda es la misma que, pasada de vuelta
 *     como `enviosRegistrados` (simulando que `notification_sends` ya tiene
 *     esa fila, como dejaría la ruta real tras una corrida con
 *     `PUSH_ENVIO_REAL=1`), hace que la corrida siguiente ya no vuelva a
 *     generar ese mismo mensaje: el circuito completo del dedupe, de punta a
 *     punta.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  armarTanda,
  type DatosParaTanda,
  type EnvioRegistradoParaTanda,
  type FavoritoParaTanda,
  type NovedadParaTanda,
  type UsuarioParaTanda,
} from '@qps/core/notificaciones/tanda'
import { saltaWallClockToDate, saltaWallClockToUtcISO } from '@qps/core/date-format'
import { PREFERENCIAS_POR_DEFECTO, type PreferenciasNotificacion } from '@qps/core/notificaciones/preferencias'
import { enviarLote, leerReceipts, tokensInvalidos } from '@/lib/notificaciones/expo-push'

// ---------------------------------------------------------------------------
// Fixtures: un solo "ahora", cinco usuarios, cada uno con una sola razón
// distinta para recibir (o no) un mensaje.
// ---------------------------------------------------------------------------

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const USER_FAVORITO = uuid(1)
const USER_NOVEDAD = uuid(2)
const USER_SILENCIO = uuid(3)
const USER_TOPE = uuid(4)
const USER_SIN_TOKENS = uuid(5)

const EVENT_FAVORITO = uuid(101)
const EVENT_NOVEDAD = uuid(102)
const EVENT_SILENCIO = uuid(103)
const EVENT_TOPE = uuid(104)
const EVENT_SIN_TOKENS = uuid(105)

const TOKEN_FAVORITO_1 = 'ExponentPushToken[favorito-celular-1-de-prueba]'
// Este es el token que, en el escenario, Expo marca DeviceNotRegistered.
const TOKEN_FAVORITO_2 = 'ExponentPushToken[favorito-celular-2-de-prueba]'
const TOKEN_NOVEDAD = 'ExponentPushToken[novedad-celular-de-prueba]'
const TOKEN_SILENCIO = 'ExponentPushToken[silencio-celular-de-prueba]'
const TOKEN_TOPE = 'ExponentPushToken[tope-celular-de-prueba]'

// 18:00 de Salta: fuera del horario de silencio por defecto (23:00-09:00), y
// exactamente HORAS_ANTES_RECORDATORIO_FAVORITO (3h) después de "las 21:00"
// de abajo: el recordatorio de favoritos sale 3h antes del inicio, así que a
// esta hora ya está vencido para todo el que tenga ese mismo horario de
// evento.
const AHORA = saltaWallClockToDate('2026-10-20T18:00:00')
const INICIO_EVENTO_21HS = saltaWallClockToUtcISO('2026-10-20T21:00:00')

function prefs(overrides: Partial<PreferenciasNotificacion> = {}): PreferenciasNotificacion {
  return { ...PREFERENCIAS_POR_DEFECTO, ...overrides }
}

function favoritoDe(eventId: string, title: string): FavoritoParaTanda {
  return { eventId, title, start_date: INICIO_EVENTO_21HS }
}

const NOVEDAD_UNICA: NovedadParaTanda = {
  id: 'novedad-1-de-prueba',
  eventId: EVENT_NOVEDAD,
  title: 'Feria de Prueba',
  momento: saltaWallClockToDate('2026-10-20T10:00:00'),
}

/**
 * Los cinco usuarios del escenario. `enviosFavoritoPrevios` es el único hueco
 * que cambia entre la primera y la segunda corrida (ver el describe del
 * dedupe, más abajo): así el resto del escenario no se duplica.
 */
function usuarios(enviosFavoritoPrevios: EnvioRegistradoParaTanda[] = []): UsuarioParaTanda[] {
  return [
    {
      userId: USER_FAVORITO,
      preferencias: prefs(),
      tokens: [TOKEN_FAVORITO_1, TOKEN_FAVORITO_2],
      favoritos: [favoritoDe(EVENT_FAVORITO, 'Show de Prueba')],
      novedades: [],
      enviosRegistrados: enviosFavoritoPrevios,
    },
    {
      userId: USER_NOVEDAD,
      preferencias: prefs(),
      tokens: [TOKEN_NOVEDAD],
      favoritos: [],
      novedades: [NOVEDAD_UNICA],
      enviosRegistrados: [],
    },
    {
      // En horario de silencio propio (17:00-19:00 de Salta, distinto del
      // default): a las 18:00 (AHORA) cae adentro. Tiene un favorito vencido
      // igual que USER_FAVORITO, para que lo único que cambie sea la regla
      // de silencio, no la del recordatorio.
      userId: USER_SILENCIO,
      preferencias: prefs({ quiet_start: '17:00', quiet_end: '19:00' }),
      tokens: [TOKEN_SILENCIO],
      favoritos: [favoritoDe(EVENT_SILENCIO, 'Recital de Prueba')],
      novedades: [],
      enviosRegistrados: [],
    },
    {
      // Tope diario en 1, ya gastado hoy por un envío previo: el favorito
      // vencido no entra, aunque la regla de recordatorio por sí sola lo
      // mandaría.
      userId: USER_TOPE,
      preferencias: prefs({ daily_cap: 1 }),
      tokens: [TOKEN_TOPE],
      favoritos: [favoritoDe(EVENT_TOPE, 'Obra de Prueba')],
      novedades: [],
      enviosRegistrados: [
        { dedupe_key: 'ya-mandado-hoy-de-prueba', sent_at: saltaWallClockToUtcISO('2026-10-20T08:00:00') },
      ],
    },
    {
      // Sin tokens: ni siquiera llega a evaluarse el favorito.
      userId: USER_SIN_TOKENS,
      preferencias: prefs(),
      tokens: [],
      favoritos: [favoritoDe(EVENT_SIN_TOKENS, 'Peña de Prueba')],
      novedades: [],
      enviosRegistrados: [],
    },
  ]
}

function datos(enviosFavoritoPrevios: EnvioRegistradoParaTanda[] = []): DatosParaTanda {
  return { usuarios: usuarios(enviosFavoritoPrevios) }
}

/** Doble de `fetch` para `/send`: todo token distinto de `tokenInvalido` sale `ok`, ese uno sale `DeviceNotRegistered`. */
function fetchDobleConDeviceNotRegistered(tokenInvalido: string): typeof fetch {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const lote = JSON.parse(init.body as string) as Array<{ to: string }>
    const tickets = lote.map((m, i) =>
      m.to === tokenInvalido
        ? { status: 'error', message: 'no registrado', details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok', id: `ticket-${i}` },
    )
    return { ok: true, status: 200, json: async () => ({ data: tickets }) } as Response
  }) as unknown as typeof fetch
}

// ---------------------------------------------------------------------------
// El escenario
// ---------------------------------------------------------------------------

describe('la tanda de un día completo: reglas + tanda + cliente de Expo, con dobles', () => {
  it('de cinco usuarios, solo favorito-vencido y novedad reciben algo; silencio, tope y sin-tokens, nada', () => {
    const mensajes = armarTanda(datos(), AHORA)

    const porUsuario = (userId: string) => mensajes.filter((m) => m.userId === userId)

    expect(mensajes).toHaveLength(3)
    expect(porUsuario(USER_FAVORITO)).toHaveLength(2) // dos tokens, un solo envío lógico
    expect(porUsuario(USER_NOVEDAD)).toHaveLength(1)
    expect(porUsuario(USER_SILENCIO)).toHaveLength(0)
    expect(porUsuario(USER_TOPE)).toHaveLength(0)
    expect(porUsuario(USER_SIN_TOKENS)).toHaveLength(0)

    const [favA, favB] = porUsuario(USER_FAVORITO)
    expect(favA.kind).toBe('favorito')
    expect(favA.eventId).toBe(EVENT_FAVORITO)
    expect(new Set([favA.to, favB.to])).toEqual(new Set([TOKEN_FAVORITO_1, TOKEN_FAVORITO_2]))
    expect(favA.dedupeKey).toBe(favB.dedupeKey) // mismo envío lógico, dos tokens

    const [novedadMsg] = porUsuario(USER_NOVEDAD)
    expect(novedadMsg.kind).toBe('novedad')
    expect(novedadMsg.eventId).toBe(EVENT_NOVEDAD) // un solo evento en el grupo
    expect(novedadMsg.to).toBe(TOKEN_NOVEDAD)
  })

  describe('el contrato duplicado a mano entre `MensajeTanda` (core) y `MensajePush` (web)', () => {
    it('la salida de armarTanda se le pasa TAL CUAL a enviarLote, y Expo la acepta', async () => {
      const mensajes = armarTanda(datos(), AHORA)

      // `mensajes` es `MensajeDeTanda[]` (de tanda.ts); `enviarLote` espera
      // `MensajePush[]` (de expo-push.ts). Se manda sin mapear ningún campo
      // a mano (a diferencia de la ruta real, que sí filtra userId/kind/
      // eventId/dedupeKey antes de mandar: eso es una decisión de la ruta,
      // no algo que `enviarLote` exija). Si las dos interfaces se
      // desalinearan, esta llamada deja de tipar.
      const fetchFalso = fetchDobleConDeviceNotRegistered(TOKEN_FAVORITO_2)
      const resultado = await enviarLote(mensajes, fetchFalso)

      // Los tres mensajes tienen forma de token de Expo válida: ninguno se
      // descarta antes de mandar, y Expo (el doble) procesó el lote entero.
      expect(resultado.descartados).toBe(0)
      expect(resultado.tickets).toHaveLength(3)
      expect(resultado.erroresLote).toEqual([])

      // El token que Expo marcó DeviceNotRegistered (el segundo dispositivo
      // del usuario con favorito) termina en la lista de tokens a borrar;
      // los otros dos (el otro dispositivo del mismo usuario y el de
      // novedad), no.
      const invalidos = tokensInvalidos(resultado.tickets, {})
      expect(invalidos).toEqual([TOKEN_FAVORITO_2])
    })
  })

  describe('el circuito completo del dedupe: la dedupeKey de hoy evita el mensaje de la corrida siguiente', () => {
    it('pasando la dedupeKey del favorito como enviosRegistrados, la segunda armarTanda ya no lo genera', () => {
      const primeraCorrida = armarTanda(datos(), AHORA)
      const mensajeFavorito = primeraCorrida.find((m) => m.userId === USER_FAVORITO && m.kind === 'favorito')
      expect(mensajeFavorito).toBeDefined()

      // Lo que quedaría en notification_sends después de esta corrida (si
      // PUSH_ENVIO_REAL estuviera prendido, ver route.ts): una sola fila con
      // esa dedupeKey. `sent_at` puede ser cualquier hora del mismo día: el
      // dedupe mira `dedupeKeysYaEnviados`, no la fecha.
      const enviosDeLaCorridaAnterior: EnvioRegistradoParaTanda[] = [
        { dedupe_key: mensajeFavorito!.dedupeKey, sent_at: saltaWallClockToUtcISO('2026-10-20T18:00:00') },
      ]

      const segundaCorrida = armarTanda(datos(enviosDeLaCorridaAnterior), AHORA)

      // El recordatorio de favoritos de ese usuario ya no aparece...
      expect(segundaCorrida.some((m) => m.userId === USER_FAVORITO && m.kind === 'favorito')).toBe(false)
      // ...pero el resto del escenario (la novedad de otro usuario) sigue
      // intacto: el dedupe es por usuario+evento, no un freno global de toda
      // la tanda.
      expect(segundaCorrida.some((m) => m.userId === USER_NOVEDAD && m.kind === 'novedad')).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// Lo que 39-c dejó anotado "para 39-q": leerReceipts no lotea.
// ---------------------------------------------------------------------------

describe('leerReceipts: hoy manda todos los ids en UN solo POST, sin lotear (39-c lo dejó anotado para 39-q)', () => {
  it(
    'con más ids que el límite documentado por Expo por request (1000), hoy los manda todos juntos. ' +
      'SI ESTE TEST SE ROMPE porque alguien le agregó loteo a leerReceipts (en bloques de <= 1000, igual que ' +
      'enviarLote con EXPO_PUSH_BATCH_SIZE), ACTUALIZALO para esperar varios POST — no revirtás el loteo nuevo.',
    async () => {
      const LIMITE_DOCUMENTADO_POR_EXPO = 1000
      const ids = Array.from({ length: LIMITE_DOCUMENTADO_POR_EXPO + 1 }, (_, i) => `ticket-${i}-de-prueba`)

      const fetchFalso = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: Object.fromEntries(ids.map((id) => [id, { status: 'ok' }])) }),
      } as Response)

      await leerReceipts(ids, fetchFalso as unknown as typeof fetch)

      // Hoy: una sola llamada, con los 1001 ids adentro del mismo body. El
      // día que se loteé, esto pasa a ser varias llamadas de <= 1000 ids
      // cada una.
      expect(fetchFalso).toHaveBeenCalledTimes(1)
      const [, init] = fetchFalso.mock.calls[0] as [string, RequestInit]
      const idsEnviados = (JSON.parse(init.body as string) as { ids: string[] }).ids
      expect(idsEnviados).toHaveLength(ids.length)
      expect(idsEnviados.length).toBeGreaterThan(LIMITE_DOCUMENTADO_POR_EXPO)
    },
  )
})
