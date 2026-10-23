/**
 * Avisos push patrocinados (D2/Ronda 51, tarea 51-q, parte 1): una SEMANA
 * completa de punta a punta — dos campañas seguidas, tres usuarios con
 * `sponsored` y horarios de silencio distintos, corridas horarias de lunes a
 * domingo "en modo real" — con el doble de la escritura en
 * `notification_sends` (incluida su clave única `dedupe_key`), no solo el
 * cálculo en memoria de `armarTanda`.
 *
 * Doble de la ruta: la ruta real (`apps/web/app/api/cron/notificaciones/route.ts`)
 * no se ejercita tal cual. Doblar `createAdminClient`, `hasBearerSecret`,
 * `withJobRun`/`job_runs`, `cargarNovedades` y `cargarCampaniaVigente` para
 * UN escenario de 168 corridas horarias (+ semana 2) agregaría una capa
 * entera de plomería de Supabase que no aporta nada a lo que hay que probar
 * acá (el circuito semanal del aviso patrocinado); además duplicaría, mal,
 * los tests de contrato que ya existen pieza por pieza (`patrocinados-carga.test.ts`
 * para `cargarCampaniaVigente`, `notificaciones-paginado.test.ts`/`notificaciones.test.ts`
 * para la ruta completa en un solo tick). Se usa en cambio `armarTanda` (core)
 * tal cual lo llama la ruta, más dos dobles a mano, chicos y con un contrato
 * claro:
 *
 *   - la LECTURA de `notification_sends` (`leerEnviosDeUsuario`): un array en
 *     memoria, filtrado por usuario, igual forma que `EnvioRegistradoParaTanda`;
 *   - la ESCRITURA (`insertar`): simula el `unique` real de la columna
 *     `notification_sends.dedupe_key` (`notification_sends_dedupe_key_key`,
 *     ver `supabase/migrations/`): un INSERT con una fila cuya `dedupe_key` ya
 *     existe (en la base o DENTRO del mismo lote) falla ENTERO —ninguna fila
 *     se aplica—, igual que un INSERT de varias filas en Postgres sin
 *     `ON CONFLICT`. Nunca pasa en silencio.
 *
 * El envío a Expo (`enviarLote`/`leerReceipts`) no se dobla acá: ya está
 * cubierto, con favoritos/novedades/silencio/tope mezclados, en
 * `tests/notificaciones/punta-a-punta.test.ts` (R39) y, con `categoryId`
 * patrocinado viajando hasta el body del POST, en el describe "D2/Ronda 51"
 * de ese mismo archivo. Acá el envío siempre "sale bien" (todo ticket `ok`):
 * lo que se prueba es el circuito semana a semana del dedupe, no la
 * respuesta de Expo.
 *
 * El reloj: inventado y bajo control total. Un solo punto de partida
 * (`saltaWallClockToDate`, lunes 00:00 de Salta) y de ahí en más, aritmética
 * de milisegundos (`+ i * HORA_MS`) — nunca `new Date()` sin argumentos. Como
 * Argentina no tiene horario de verano desde 2009 (el offset de Salta es fijo,
 * ver `packages/core/src/date-format.ts`), sumar una hora real de reloj
 * siempre mueve la hora de pared de Salta en exactamente una hora, sin
 * sorpresas de DST.
 */
import { describe, expect, it } from 'vitest'
import {
  armarTanda,
  type CampaniaParaTanda,
  type EnvioRegistradoParaTanda,
  type MensajeDeTanda,
  type UsuarioParaTanda,
} from '@qps/core/notificaciones/tanda'
import {
  ETIQUETA_PATROCINADO,
  campaniaVigente,
  tituloAvisoPatrocinado,
  validarCampania,
  type VentanaCampania,
} from '@qps/core/notificaciones/patrocinados'
import { semanaSalta } from '@qps/core/notificaciones/reglas'
import { saltaWallClockToDate, formatSaltaClock } from '@qps/core/date-format'
import { PREFERENCIAS_POR_DEFECTO, type PreferenciasNotificacion } from '@qps/core/notificaciones/preferencias'

// ---------------------------------------------------------------------------
// Fixtures: ids inventados y evidentes (uuid con un prefijo propio de este
// archivo, para no pisar los de otros tests de la carpeta), tres usuarios,
// tres campañas (dos "de la semana 1" + una "de la semana 2", ver más abajo).
// ---------------------------------------------------------------------------

const uuid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const USER_SIN_SPONSOR = uuid(1)
const USER_SILENCIO = uuid(2)
const USER_NORMAL = uuid(3)

const EVENT_CAMPANIA_1 = uuid(101)
const EVENT_CAMPANIA_2 = uuid(102)
const EVENT_CAMPANIA_3 = uuid(103)

// Los ids de campaña los asigna la base al guardar (la fila de
// `sponsored_campaigns`, ver `CampaniaValidada` vs `VentanaCampania`/
// `CampaniaParaTanda`, que sí llevan `id`): acá se inventan a mano, como
// haría el panel admin después del INSERT.
const CAMPANIA_1_ID = uuid(201) // lunes a miércoles, semana 1
const CAMPANIA_2_ID = uuid(202) // jueves a domingo, semana 1
const CAMPANIA_3_ID = uuid(203) // lunes a miércoles, semana 2 (para el caso "semana siguiente")

const TOKEN_SIN_SPONSOR = 'ExponentPushToken[sin-sponsor-de-prueba]'
const TOKEN_SILENCIO = 'ExponentPushToken[silencio-de-prueba]'
const TOKEN_NORMAL = 'ExponentPushToken[normal-de-prueba]'

function prefs(overrides: Partial<PreferenciasNotificacion> = {}): PreferenciasNotificacion {
  return { ...PREFERENCIAS_POR_DEFECTO, ...overrides }
}

/** Los tres usuarios del escenario: nunca cambian de preferencias ni de tokens durante toda la semana. */
const USUARIOS_FIXTURE: Array<{ userId: string; tokens: string[]; preferencias: PreferenciasNotificacion }> = [
  { userId: USER_SIN_SPONSOR, tokens: [TOKEN_SIN_SPONSOR], preferencias: prefs({ sponsored: false }) },
  // Silencio 20:00 a 12:00 de Salta (distinto del default 23:00-09:00):
  // cruza la medianoche, igual que el default, pero con otro horario.
  { userId: USER_SILENCIO, tokens: [TOKEN_SILENCIO], preferencias: prefs({ quiet_start: '20:00', quiet_end: '12:00' }) },
  { userId: USER_NORMAL, tokens: [TOKEN_NORMAL], preferencias: prefs() },
]

// ---------------------------------------------------------------------------
// Las campañas: validadas con `validarCampania` (títulos inventados que
// PASAN la validación, incluida la de "no imitar una notificación del
// sistema"), para que el escenario entero cuelgue de datos que la ronda
// realmente aceptaría guardar, no de un literal armado a mano sin pasar por
// el filtro.
// ---------------------------------------------------------------------------

// Momento en el que un admin (hipotético) cargó las tres campañas en el
// panel: antes de que arranque ninguna de las dos ventanas de la semana 1.
const AHORA_DE_CARGA = saltaWallClockToDate('2026-11-01T10:00:00')

const LUNES_SEMANA_1 = saltaWallClockToDate('2026-11-02T00:00:00')
const JUEVES_SEMANA_1 = saltaWallClockToDate('2026-11-05T00:00:00')
const LUNES_SEMANA_2 = saltaWallClockToDate('2026-11-09T00:00:00') // = domingo 23:00 + 1h de la semana 1
const MIERCOLES_SEMANA_2_FIN = saltaWallClockToDate('2026-11-12T00:00:00')

const resultadoCampania1 = validarCampania(
  {
    titulo: 'Dos por uno de prueba',
    cuerpo: 'Válido de lunes a miércoles en el local de prueba.',
    eventId: EVENT_CAMPANIA_1,
    startsAt: LUNES_SEMANA_1,
    endsAt: JUEVES_SEMANA_1,
  },
  AHORA_DE_CARGA,
  [],
)

const resultadoCampania2 = validarCampania(
  {
    titulo: 'Fin de semana de prueba',
    cuerpo: 'Entrada libre de jueves a domingo en el local de prueba.',
    eventId: EVENT_CAMPANIA_2,
    startsAt: JUEVES_SEMANA_1,
    endsAt: LUNES_SEMANA_2,
  },
  AHORA_DE_CARGA,
  [{ id: CAMPANIA_1_ID, startsAt: LUNES_SEMANA_1, endsAt: JUEVES_SEMANA_1 }],
)

const resultadoCampania3 = validarCampania(
  {
    titulo: 'Promo de la semana que viene, de prueba',
    cuerpo: 'Válido de lunes a miércoles la semana próxima, en el local de prueba.',
    eventId: EVENT_CAMPANIA_3,
    startsAt: LUNES_SEMANA_2,
    endsAt: MIERCOLES_SEMANA_2_FIN,
  },
  AHORA_DE_CARGA,
  [
    { id: CAMPANIA_1_ID, startsAt: LUNES_SEMANA_1, endsAt: JUEVES_SEMANA_1 },
    { id: CAMPANIA_2_ID, startsAt: JUEVES_SEMANA_1, endsAt: LUNES_SEMANA_2 },
  ],
)

if (!resultadoCampania1.ok || !resultadoCampania2.ok || !resultadoCampania3.ok) {
  // No debería pasar nunca (son fixtures de este archivo, pensadas para
  // pasar `validarCampania`): si alguna de las tres se rompe, que el
  // archivo entero falle fuerte y temprano, en vez de silenciar el error
  // adentro de un `describe`/`it` donde sería más difícil de ver.
  throw new Error('Fixture inválida: alguna de las tres campañas de prueba no pasó validarCampania.')
}

const ventanas: VentanaCampania[] = [
  { id: CAMPANIA_1_ID, startsAt: resultadoCampania1.datos.startsAt, endsAt: resultadoCampania1.datos.endsAt },
  { id: CAMPANIA_2_ID, startsAt: resultadoCampania2.datos.startsAt, endsAt: resultadoCampania2.datos.endsAt },
  { id: CAMPANIA_3_ID, startsAt: resultadoCampania3.datos.startsAt, endsAt: resultadoCampania3.datos.endsAt },
]

const datosPorCampaniaId = new Map<string, { titulo: string; cuerpo: string; eventId: string }>([
  [CAMPANIA_1_ID, { titulo: resultadoCampania1.datos.titulo, cuerpo: resultadoCampania1.datos.cuerpo, eventId: resultadoCampania1.datos.eventId }],
  [CAMPANIA_2_ID, { titulo: resultadoCampania2.datos.titulo, cuerpo: resultadoCampania2.datos.cuerpo, eventId: resultadoCampania2.datos.eventId }],
  [CAMPANIA_3_ID, { titulo: resultadoCampania3.datos.titulo, cuerpo: resultadoCampania3.datos.cuerpo, eventId: resultadoCampania3.datos.eventId }],
])

/** La campaña vigente en `ahora`, resuelta con `campaniaVigente` de core (igual que `lib/notificaciones/patrocinados.ts`, 51-b). */
function campaniaVigenteEn(ahora: Date): CampaniaParaTanda | null {
  const vigente = campaniaVigente(ventanas, ahora)
  if (!vigente) return null
  const datos = datosPorCampaniaId.get(vigente.id)
  if (!datos) throw new Error(`Fixture incompleta: falta el contenido de la campaña ${vigente.id}.`)
  return { id: vigente.id, ...datos }
}

// ---------------------------------------------------------------------------
// El doble de `notification_sends`: lectura + escritura, con la clave única
// de `dedupe_key` (ver el docstring de arriba del archivo).
// ---------------------------------------------------------------------------

interface FilaEnvioFalsa {
  user_id: string
  dedupe_key: string
  sent_at: string
  kind: string
  event_id: string | null
  campaign_id: string | null
}

type ResultadoInsert = { ok: true } | { ok: false; error: string }

function creaBaseFalsa() {
  const filas: FilaEnvioFalsa[] = []

  return {
    /** Snapshot de lo que hay en la "tabla" en este momento (para las aserciones). */
    get filas(): readonly FilaEnvioFalsa[] {
      return filas
    },
    leerEnviosDeUsuario(userId: string): EnvioRegistradoParaTanda[] {
      return filas.filter((f) => f.user_id === userId).map((f) => ({ dedupe_key: f.dedupe_key, sent_at: f.sent_at }))
    },
    /**
     * Un solo INSERT con varias filas, como hace la ruta real
     * (`supabase.from('notification_sends').insert(filas)`). Si cualquier
     * fila choca contra `dedupe_key` —ya sea contra una fila YA GUARDADA, o
     * contra OTRA fila del mismo lote— el INSERT entero falla, sin aplicar
     * NINGUNA fila: es el comportamiento real de un INSERT multi-fila en
     * Postgres sin `ON CONFLICT` (atómico), y es la base de la aserción más
     * importante de este archivo: el tope "1 por semana" no puede depender
     * solo de lo que `armarTanda` calculó en memoria.
     */
    insertar(nuevas: FilaEnvioFalsa[]): ResultadoInsert {
      const existentes = new Set(filas.map((f) => f.dedupe_key))
      const vistosEnEsteLote = new Set<string>()
      for (const fila of nuevas) {
        if (existentes.has(fila.dedupe_key) || vistosEnEsteLote.has(fila.dedupe_key)) {
          return {
            ok: false,
            error: 'duplicate key value violates unique constraint "notification_sends_dedupe_key_key"',
          }
        }
        vistosEnEsteLote.add(fila.dedupe_key)
      }
      filas.push(...nuevas)
      return { ok: true }
    },
  }
}

type BaseFalsa = ReturnType<typeof creaBaseFalsa>

// ---------------------------------------------------------------------------
// Una corrida del cron "en modo real": arma la tanda con `armarTanda`,
// simula que TODOS los envíos salieron bien (el cliente de Expo ya está
// probado en otro lado, ver el docstring de arriba), e inserta en la base
// falsa — un solo INSERT por corrida, una fila por `dedupeKey`, igual que la
// ruta real (`route.ts`, "notification_sends: una fila por dedupeKey, no por
// mensaje").
// ---------------------------------------------------------------------------

/**
 * `overridesLectura` simula una lectura de `notification_sends` que NO ve lo
 * que ya hay en la base real (p. ej. una réplica de lectura atrasada): solo
 * se usa en el caso "el conteo en memoria no ve el envío previo", más abajo.
 * Por default, cada usuario lee su propio estado real de `baseFalsa`.
 */
function correrCron(
  baseFalsa: BaseFalsa,
  ahora: Date,
  overridesLectura: Partial<Record<string, EnvioRegistradoParaTanda[]>> = {},
): { mensajes: MensajeDeTanda[]; resultadoInsert: ResultadoInsert | null } {
  const usuarios: UsuarioParaTanda[] = USUARIOS_FIXTURE.map((u) => ({
    userId: u.userId,
    preferencias: u.preferencias,
    tokens: u.tokens,
    favoritos: [],
    novedades: [],
    enviosRegistrados: overridesLectura[u.userId] ?? baseFalsa.leerEnviosDeUsuario(u.userId),
  }))

  const mensajes = armarTanda({ usuarios, patrocinado: campaniaVigenteEn(ahora) }, ahora)

  // Un envío lógico por dedupeKey (dos tokens del mismo usuario comparten
  // dedupeKey): no hace falta en este escenario (cada usuario tiene un solo
  // token), pero se arma igual, por las dudas, con el mismo criterio que
  // route.ts.
  const porDedupe = new Map<string, MensajeDeTanda>()
  for (const mensaje of mensajes) if (!porDedupe.has(mensaje.dedupeKey)) porDedupe.set(mensaje.dedupeKey, mensaje)

  const filas: FilaEnvioFalsa[] = [...porDedupe.values()].map((mensaje) => ({
    user_id: mensaje.userId,
    dedupe_key: mensaje.dedupeKey,
    sent_at: ahora.toISOString(),
    kind: mensaje.kind,
    event_id: mensaje.eventId,
    campaign_id: mensaje.campaignId ?? null,
  }))

  const resultadoInsert = filas.length > 0 ? baseFalsa.insertar(filas) : null
  return { mensajes, resultadoInsert }
}

/** Las 168 horas (`lunes 00:00` a `domingo 23:00`) de la semana que empieza en `lunes`. */
function horasDeLaSemana(lunes: Date): Date[] {
  const HORA_MS = 60 * 60 * 1000
  return Array.from({ length: 7 * 24 }, (_, i) => new Date(lunes.getTime() + i * HORA_MS))
}

const PREFIJO_TITULO_PATROCINADO = `${ETIQUETA_PATROCINADO} · `

// ---------------------------------------------------------------------------
// El escenario
// ---------------------------------------------------------------------------

describe('avisos patrocinados, una semana de punta a punta (D2/Ronda 51, tarea 51-q)', () => {
  it(
    '2 campañas seguidas (lunes-miércoles y jueves-domingo), corridas horarias de lunes a domingo: ' +
      'sponsored:true recibe exactamente 1 de la PRIMERA campaña, sponsored:false recibe 0, ' +
      'el de silencio lo recibe fuera de su horario, y el título siempre lleva el prefijo "Patrocinado · "',
    () => {
      const baseFalsa = creaBaseFalsa()
      const mensajesPatrocinadosDeLaSemana: MensajeDeTanda[] = []

      for (const ahora of horasDeLaSemana(LUNES_SEMANA_1)) {
        const { mensajes } = correrCron(baseFalsa, ahora)
        mensajesPatrocinadosDeLaSemana.push(...mensajes.filter((m) => m.kind === 'patrocinado'))
      }

      const filasPatrocinado = () => baseFalsa.filas.filter((f) => f.kind === 'patrocinado')
      const filasDe = (userId: string) => filasPatrocinado().filter((f) => f.user_id === userId)

      // Exactamente 1 envío lógico patrocinado en la semana para cada
      // sponsored:true, 0 para sponsored:false.
      expect(filasDe(USER_NORMAL)).toHaveLength(1)
      expect(filasDe(USER_SILENCIO)).toHaveLength(1)
      expect(filasDe(USER_SIN_SPONSOR)).toHaveLength(0)

      // Los dos que lo reciben: de la PRIMERA campaña (la de lunes-miércoles),
      // nunca de la segunda (jueves-domingo), aunque la semana entera corrió.
      expect(filasDe(USER_NORMAL)[0].campaign_id).toBe(CAMPANIA_1_ID)
      expect(filasDe(USER_SILENCIO)[0].campaign_id).toBe(CAMPANIA_1_ID)

      // El de silencio (20:00 a 12:00 de Salta) lo recibió FUERA de ese
      // horario: la hora de pared de `sent_at` cae en [12:00, 20:00).
      const horaDeEnvioSilencio = formatSaltaClock(filasDe(USER_SILENCIO)[0].sent_at)
      expect(horaDeEnvioSilencio >= '12:00' && horaDeEnvioSilencio < '20:00').toBe(true)

      // Ningún mensaje patrocinado posible, de toda la semana, empieza con
      // algo que no sea "Patrocinado · " (política de Ads de Google Play:
      // nunca imitar una notificación del sistema).
      expect(mensajesPatrocinadosDeLaSemana.length).toBeGreaterThan(0)
      for (const mensaje of mensajesPatrocinadosDeLaSemana) {
        expect(mensaje.title?.startsWith(PREFIJO_TITULO_PATROCINADO)).toBe(true)
      }

      // ---------------------------------------------------------------
      // Dos corridas en la MISMA hora (el atraso del cron de GitHub
      // Actions puede disparar dos triggers para el mismo horario
      // programado): repetir, tal cual, la hora en la que ya se mandó el
      // aviso de USER_NORMAL. Como la lectura de `notification_sends` en
      // esta repetición SÍ ve la fila que quedó de la corrida real (no hay
      // override acá), `armarTanda` ni siquiera arma el candidato de nuevo.
      // ---------------------------------------------------------------
      const horaDelEnvioNormal = new Date(filasDe(USER_NORMAL)[0].sent_at)
      const { mensajes: mensajesRepetidos } = correrCron(baseFalsa, horaDelEnvioNormal)
      expect(mensajesRepetidos.some((m) => m.userId === USER_NORMAL && m.kind === 'patrocinado')).toBe(false)
      expect(filasDe(USER_NORMAL)).toHaveLength(1) // sigue siendo 1 fila en la base

      // ---------------------------------------------------------------
      // El tope de "1 por semana" NO depende solo del conteo en memoria:
      // se fuerza una lectura de `notification_sends` que llega VACÍA para
      // USER_NORMAL (como si una réplica de lectura todavía no viera la
      // fila que la corrida real ya escribió). `armarTanda`, sin forma de
      // saber que ya se mandó, arma un candidato patrocinado nuevo — con
      // la MISMA `dedupeKey` (depende solo de userId + semana, no de los
      // envíos ya registrados). Lo que lo frena es la CLAVE ÚNICA del
      // doble de la base, no `armarTanda`.
      // ---------------------------------------------------------------
      const horaCualquieraDeLaSemana = horasDeLaSemana(LUNES_SEMANA_1)[20] // lunes 20:00: campaña 1 vigente, USER_NORMAL fuera de silencio
      const { mensajes: mensajesConLecturaVieja, resultadoInsert } = correrCron(
        baseFalsa,
        horaCualquieraDeLaSemana,
        { [USER_NORMAL]: [] },
      )
      expect(mensajesConLecturaVieja.some((m) => m.userId === USER_NORMAL && m.kind === 'patrocinado')).toBe(true)
      expect(resultadoInsert).not.toBeNull()
      expect(resultadoInsert?.ok).toBe(false)
      if (resultadoInsert && !resultadoInsert.ok) {
        expect(resultadoInsert.error).toMatch(/unique constraint/)
      }
      // La base sigue en 1 fila para USER_NORMAL: el choque de la clave
      // única frenó el INSERT completo (ninguna fila del lote se aplicó).
      expect(filasDe(USER_NORMAL)).toHaveLength(1)

      // ---------------------------------------------------------------
      // La semana siguiente (de Salta): vuelve a recibir 1. Una tercera
      // campaña, vigente de lunes a miércoles de la SEMANA 2, con el envío
      // de la semana 1 ya guardado en la base: `esDedupeKeyPatrocinadoDeLaSemana`
      // compara con igualdad exacta sobre `semanaSalta(ahora)`, así que la
      // clave de esta semana nunca coincide con la de la semana pasada.
      // ---------------------------------------------------------------
      for (const ahora of horasDeLaSemana(LUNES_SEMANA_2).slice(0, 3 * 24)) {
        correrCron(baseFalsa, ahora)
      }

      expect(filasDe(USER_NORMAL)).toHaveLength(2)
      expect(filasDe(USER_SILENCIO)).toHaveLength(2)
      expect(filasDe(USER_SIN_SPONSOR)).toHaveLength(0) // sigue en 0: nunca recibe nada, ninguna semana

      const [primeraFilaNormal, segundaFilaNormal] = filasDe(USER_NORMAL)
      expect(segundaFilaNormal.campaign_id).toBe(CAMPANIA_3_ID)
      expect(semanaSalta(new Date(segundaFilaNormal.sent_at))).not.toBe(semanaSalta(new Date(primeraFilaNormal.sent_at)))
    },
  )

  it('un título que imita una notificación del sistema (política de Ads de Google Play) nunca pasa validarCampania: no llega a existir ningún mensaje push con ese título', () => {
    const resultado = validarCampania(
      {
        titulo: 'Alerta de seguridad: actualización urgente de tu cuenta',
        cuerpo: 'Cuerpo de prueba.',
        eventId: EVENT_CAMPANIA_1,
        startsAt: LUNES_SEMANA_1,
        endsAt: JUEVES_SEMANA_1,
      },
      AHORA_DE_CARGA,
      [],
    )
    expect(resultado.ok).toBe(false)
  })

  it('tituloAvisoPatrocinado antepone siempre "Patrocinado · ", para las tres campañas válidas del escenario', () => {
    for (const [, datos] of datosPorCampaniaId) {
      expect(tituloAvisoPatrocinado(datos.titulo)).toBe(`${PREFIJO_TITULO_PATROCINADO}${datos.titulo}`)
      expect(tituloAvisoPatrocinado(datos.titulo).startsWith(PREFIJO_TITULO_PATROCINADO)).toBe(true)
    }
  })
})
