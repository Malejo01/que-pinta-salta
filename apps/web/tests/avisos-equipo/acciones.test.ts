/**
 * `lib/admin/avisos-equipo-actions.ts` (Ronda 70, tarea 70-b/70-b2): el aviso
 * del equipo de /admin/avisos. Sin red ni base:
 *
 *   - `@/lib/supabase/server` (createClient = sesión, createAdminClient =
 *     service role) y `next/cache` van mockeados, igual que
 *     `tests/admin/avisos-patrocinados.test.ts`.
 *   - `fetch` es un doble global. Corre el `expo-push.ts` y el
 *     `envio-admin.ts` REALES encima de ese doble (el contrato con Expo se
 *     prueba de verdad); la única excepción es `enviarLote`, envuelto para
 *     poder simular "se rompió el envío" (el real nunca tira).
 *   - La base del service role es `BaseEnMemoria` (ver `./dobles`), con
 *     `unique(dedupe_key)` y `ignoreDuplicates` como la real.
 *   - El reloj es falso solo en `Date` (lunes 12:00 de Salta, fuera del
 *     silencio por defecto 23:00-09:00).
 *
 * Lo que se vigila (plan de la tanda 70-q): solo un ADMIN prueba y envía; el
 * tope de 1 por día y el opt-out se respetan; la prueba no llega a nadie más
 * que al admin; ni las respuestas ni los logs llevan tokens, emails ni ids.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADMIN_EMAIL,
  ADMIN_ID,
  EVENTO_ID,
  OTRO_ID_DE_ENTRADA,
  TOKEN_ADMIN_1,
  TOKEN_ADMIN_2,
  BaseEnMemoria,
  crearClienteAdmin,
  crearClienteSesion,
  crearFetchExpo,
  idUsuario,
  secretos,
  sembrarUsuario,
  textoDeLlamadas,
  tokenUsuario,
  type ConfigSesion,
} from './dobles'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
  /** Si está puesto, `enviarLote` tira esto en vez de mandar (el real nunca tira). */
  enviarLoteTira: null as null | Error,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => mocks.createClient(...a),
  createAdminClient: (...a: unknown[]) => mocks.createAdminClient(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => mocks.revalidatePath(...a) }))
vi.mock('@/lib/notificaciones/expo-push', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/notificaciones/expo-push')>()
  return {
    ...real,
    enviarLote: (...a: Parameters<typeof real.enviarLote>) => {
      if (mocks.enviarLoteTira) return Promise.reject(mocks.enviarLoteTira)
      return real.enviarLote(...a)
    },
  }
})

import {
  contarDestinatariosAvisoEquipo,
  enviarAvisoEquipoATodos,
  enviarmePruebaAvisoEquipo,
  historialAvisosEquipo,
} from '@/lib/admin/avisos-equipo-actions'
import { claveDedupeAvisoEquipo } from '@qps/core/notificaciones/equipo'
import { urlEvento } from '@qps/core/metricas/links'

// Lunes 9/11/2026, 12:00 de Salta.
const AHORA = new Date('2026-11-09T15:00:00Z')
const AHORA_23_30_SALTA = new Date('2026-11-10T02:30:00Z')

const MENSAJE_YA_HUBO_HOY = 'Ya se mandó un aviso del equipo hoy.'
const MENSAJE_SIN_REGISTRO = 'El aviso salió, pero no se pudo registrar del todo. No lo vuelvas a mandar hoy.'
const MENSAJE_GENERICO = 'No se pudo completar la acción. Intentá de nuevo.'

function aviso(extra: Record<string, unknown> = {}) {
  return { titulo: 'Novedad de prueba', cuerpo: 'Texto de prueba del equipo.', ...extra }
}

interface Escenario {
  db: BaseEnMemoria
  sesion: ReturnType<typeof crearClienteSesion>
  expo: ReturnType<typeof crearFetchExpo>
  fetchMock: ReturnType<typeof vi.fn>
  errorLog: ReturnType<typeof vi.spyOn>
  consoleLog: ReturnType<typeof vi.spyOn>
}

function montar(sesionConfig: Partial<ConfigSesion> = {}): Escenario {
  const db = new BaseEnMemoria()
  const sesion = crearClienteSesion({
    user: { id: ADMIN_ID, email: ADMIN_EMAIL },
    role: 'ADMIN',
    eventStatus: 'PUBLISHED',
    tokens: [TOKEN_ADMIN_1, TOKEN_ADMIN_2],
    ...sesionConfig,
  })
  const expo = crearFetchExpo(db)
  const fetchMock = vi.fn(expo.fn)
  vi.stubGlobal('fetch', fetchMock)
  mocks.createClient.mockResolvedValue(sesion.cliente)
  mocks.createAdminClient.mockReturnValue(crearClienteAdmin(db))
  return {
    db,
    sesion,
    expo,
    fetchMock,
    errorLog: vi.spyOn(console, 'error').mockImplementation(() => {}),
    consoleLog: vi.spyOn(console, 'log').mockImplementation(() => {}),
  }
}

/** Ni el resultado ni nada que se haya logueado lleva un token, un email o un id de los fixtures. */
function sinDatosPersonales(e: Escenario, cantidadUsuarios: number, ...resultados: unknown[]) {
  const json = JSON.stringify(resultados)
  const logs = textoDeLlamadas([
    ...e.errorLog.mock.calls,
    ...e.consoleLog.mock.calls,
    ...vi.mocked(console.warn).mock.calls,
    ...vi.mocked(console.info).mock.calls,
  ])
  for (const secreto of secretos(cantidadUsuarios)) {
    expect(json, `respuesta con "${secreto}"`).not.toContain(secreto)
    expect(logs, `log con "${secreto}"`).not.toContain(secreto)
  }
  expect(json).not.toMatch(/ExponentPushToken/)
  expect(logs).not.toMatch(/ExponentPushToken/)
}

beforeEach(() => {
  mocks.createClient.mockReset()
  mocks.createAdminClient.mockReset()
  mocks.revalidatePath.mockReset()
  mocks.enviarLoteTira = null
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Solo ADMIN
// ---------------------------------------------------------------------------
describe('solo un ADMIN puede probar, contar, enviar y ver el historial', () => {
  const casosSinPermiso: Array<[string, Partial<ConfigSesion>, string]> = [
    ['sin sesión', { user: null, role: null }, 'No autenticado'],
    ['usuario común (USER)', { role: 'USER' }, 'No tenés permisos de administrador'],
    ['sin perfil (rol null)', { role: null }, 'No tenés permisos de administrador'],
    ['rol en minúscula ("admin")', { role: 'admin' }, 'No tenés permisos de administrador'],
    ['rol "ADMIN " con espacio', { role: 'ADMIN ' }, 'No tenés permisos de administrador'],
    ['otro rol ("MODERADOR")', { role: 'MODERADOR' }, 'No tenés permisos de administrador'],
  ]

  describe.each(casosSinPermiso)('%s', (_nombre, config, mensaje) => {
    beforeEach(() => vi.stubEnv('PUSH_ENVIO_REAL', '1'))

    it('enviarmePruebaAvisoEquipo: error, y no se crea el cliente de service role ni se llama a fetch', async () => {
      const e = montar(config)
      const r = await enviarmePruebaAvisoEquipo(aviso())
      expect(r).toMatchObject({ ok: false, error: mensaje })
      expect(mocks.createAdminClient).not.toHaveBeenCalled()
      expect(e.fetchMock).not.toHaveBeenCalled()
      expect(e.sesion.idsConsultadosEnTokens).toEqual([])
      expect(e.db.escrituras).toEqual([])
    })

    it('contarDestinatariosAvisoEquipo: error, createAdminClient nunca', async () => {
      const e = montar(config)
      sembrarUsuario(e.db, 1)
      const r = await contarDestinatariosAvisoEquipo()
      expect(r).toEqual({ ok: false, error: mensaje })
      expect(mocks.createAdminClient).not.toHaveBeenCalled()
      expect(e.fetchMock).not.toHaveBeenCalled()
    })

    it('enviarAvisoEquipoATodos: error, createAdminClient nunca, fetch nunca, ninguna escritura', async () => {
      const e = montar(config)
      sembrarUsuario(e.db, 1)
      const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 1 })
      expect(r).toMatchObject({ ok: false, error: mensaje })
      expect(mocks.createAdminClient).not.toHaveBeenCalled()
      expect(e.fetchMock).not.toHaveBeenCalled()
      expect(e.db.escrituras).toEqual([])
      expect(e.db.sends()).toEqual([])
    })

    it('historialAvisosEquipo: null, createAdminClient nunca', async () => {
      const e = montar(config)
      expect(await historialAvisosEquipo()).toBeNull()
      expect(mocks.createAdminClient).not.toHaveBeenCalled()
      expect(e.fetchMock).not.toHaveBeenCalled()
    })
  })

  it('el rol se lee con el cliente de la sesión (RLS), no con el de service role', async () => {
    const e = montar()
    await contarDestinatariosAvisoEquipo()
    expect(e.sesion.tablasTocadas).toContain('profiles')
    // y el cliente de service role se crea DESPUÉS de verificar el rol
    expect(mocks.createClient.mock.invocationCallOrder[0]).toBeLessThan(mocks.createAdminClient.mock.invocationCallOrder[0])
  })

  it('un ADMIN con el rol en "ADMIN" sí pasa (control del test de arriba)', async () => {
    montar()
    const r = await contarDestinatariosAvisoEquipo()
    expect(r.ok).toBe(true)
  })
})

describe('entradas con forma inválida: se cortan ANTES de crear ningún cliente', () => {
  it.each([[null], [undefined], ['texto'], [42], [[]]])('enviarmePrueba(%j)', async (entrada) => {
    const e = montar()
    const r = await enviarmePruebaAvisoEquipo(entrada)
    expect(r.ok).toBe(false)
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(e.fetchMock).not.toHaveBeenCalled()
  })

  it('enviarmePrueba con un aviso que no valida (título con "Patrocinado"): error con errores por campo, sin clientes', async () => {
    montar()
    const r = await enviarmePruebaAvisoEquipo(aviso({ titulo: 'Patrocinado: 2x1' }))
    expect(r).toMatchObject({ ok: false, errores: [{ campo: 'titulo' }] })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it.each([
    ['sin confirmación', undefined],
    ['confirmación null', null],
    ['telefonosEsperados texto', { telefonosEsperados: '3' }],
    ['telefonosEsperados decimal', { telefonosEsperados: 1.5 }],
    ['telefonosEsperados negativo', { telefonosEsperados: -1 }],
    ['telefonosEsperados NaN', { telefonosEsperados: Number.NaN }],
    ['sin el campo', {}],
  ])('enviarAvisoEquipoATodos %s: error, sin clientes ni fetch', async (_n, confirmacion) => {
    const e = montar()
    vi.stubEnv('PUSH_ENVIO_REAL', '1')
    const r = await enviarAvisoEquipoATodos(aviso(), confirmacion as { telefonosEsperados: number })
    expect(r.ok).toBe(false)
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(e.fetchMock).not.toHaveBeenCalled()
  })

  it('enviarAvisoEquipoATodos con aviso inválido (cuerpo vacío): error, sin clientes', async () => {
    const e = montar()
    const r = await enviarAvisoEquipoATodos(aviso({ cuerpo: '   ' }), { telefonosEsperados: 1 })
    expect(r).toMatchObject({ ok: false, errores: [{ campo: 'cuerpo' }] })
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(e.fetchMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// enviarmePruebaAvisoEquipo
// ---------------------------------------------------------------------------
describe('enviarmePruebaAvisoEquipo: solo llega al admin', () => {
  it('lee los tokens con el user.id de la SESIÓN, aunque la entrada traiga otro userId', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1)
    const r = await enviarmePruebaAvisoEquipo(
      aviso({ userId: OTRO_ID_DE_ENTRADA, user_id: idUsuario(1), destinatario: idUsuario(1), tokens: [`ExponentPushToken[ajeno]`] }),
    )
    expect(r.ok).toBe(true)
    expect(e.sesion.idsConsultadosEnTokens).toEqual([ADMIN_ID])
    expect(e.sesion.columnasPedidasEnTokens).toEqual(['token'])
  })

  it('no crea el cliente de service role (no tiene cómo leer los tokens de otros)', async () => {
    montar()
    await enviarmePruebaAvisoEquipo(aviso())
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('no escribe nada: la sesión solo toca profiles y push_tokens (lectura) y la base no recibe escrituras', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1)
    vi.stubEnv('PUSH_ENVIO_REAL', '1')
    await enviarmePruebaAvisoEquipo(aviso())
    expect(new Set(e.sesion.tablasTocadas)).toEqual(new Set(['profiles', 'push_tokens']))
    expect(e.db.escrituras).toEqual([])
    expect(e.db.sends()).toEqual([])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('en real, el único fetch a /send lleva SOLO los tokens del admin, no los de otros usuarios sembrados', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1)
    sembrarUsuario(e.db, 2, { tokens: 2 })
    vi.stubEnv('PUSH_ENVIO_REAL', '1')
    const r = await enviarmePruebaAvisoEquipo(aviso())
    expect(r).toEqual({ ok: true, simulado: false, telefonos: 2 })
    expect(e.expo.destinatarios()).toEqual([TOKEN_ADMIN_1, TOKEN_ADMIN_2])
  })

  it('la prueba no cuenta para el tope: después de probar, "ya hubo hoy" sigue en false', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1)
    vi.stubEnv('PUSH_ENVIO_REAL', '1')
    await enviarmePruebaAvisoEquipo(aviso())
    const conteo = await contarDestinatariosAvisoEquipo()
    expect(conteo).toMatchObject({ ok: true, yaHuboHoy: false, telefonos: 1 })
  })

  it('el mensaje de la prueba es el del envío real: título, cuerpo, sin tipo ni categoryId', async () => {
    const e = montar()
    vi.stubEnv('PUSH_ENVIO_REAL', '1')
    await enviarmePruebaAvisoEquipo(aviso({ titulo: '  Título  ', cuerpo: ' Cuerpo ' }))
    const [m] = e.expo.mensajes()
    expect(m).toMatchObject({ to: TOKEN_ADMIN_1, title: 'Título', body: 'Cuerpo' })
    expect(m).not.toHaveProperty('categoryId')
    expect(m).not.toHaveProperty('data')
  })

  it('destino evento: data.url del evento; cines: data.destino = "cines"', async () => {
    const e = montar()
    vi.stubEnv('PUSH_ENVIO_REAL', '1')
    await enviarmePruebaAvisoEquipo(aviso({ destino: { tipo: 'evento', eventId: EVENTO_ID } }))
    await enviarmePruebaAvisoEquipo(aviso({ destino: { tipo: 'cines' } }))
    const mensajes = e.expo.mensajes()
    expect(mensajes[0].data).toEqual({ url: urlEvento(EVENTO_ID, 'app') })
    expect(mensajes[2].data).toEqual({ destino: 'cines' })
    for (const m of mensajes) {
      expect(m).not.toHaveProperty('categoryId')
      expect(m.data as object).not.toHaveProperty('tipo')
    }
  })

  it('evento que no está publicado (o no existe): error, sin fetch', async () => {
    for (const eventStatus of ['DRAFT', null] as const) {
      const e = montar({ eventStatus })
      vi.stubEnv('PUSH_ENVIO_REAL', '1')
      const r = await enviarmePruebaAvisoEquipo(aviso({ destino: { tipo: 'evento', eventId: EVENTO_ID } }))
      expect(r).toMatchObject({ ok: false, error: 'El evento tiene que estar publicado.' })
      expect(e.fetchMock).not.toHaveBeenCalled()
    }
  })

  it('error leyendo el evento: mensaje genérico, sin fetch, y se loguea solo el código', async () => {
    const e = montar({ eventError: { code: 'XX001', message: `falló ${TOKEN_ADMIN_1}` } })
    vi.stubEnv('PUSH_ENVIO_REAL', '1')
    const r = await enviarmePruebaAvisoEquipo(aviso({ destino: { tipo: 'evento', eventId: EVENTO_ID } }))
    expect(r).toEqual({ ok: false, error: MENSAJE_GENERICO })
    expect(e.fetchMock).not.toHaveBeenCalled()
    expect(textoDeLlamadas(e.errorLog.mock.calls)).toContain('XX001')
    sinDatosPersonales(e, 0, r)
  })

  it('sin teléfonos del admin: error, sin fetch', async () => {
    const e = montar({ tokens: [] })
    vi.stubEnv('PUSH_ENVIO_REAL', '1')
    const r = await enviarmePruebaAvisoEquipo(aviso())
    expect(r).toMatchObject({ ok: false, error: 'No tenés la app con avisos activos en tu teléfono.' })
    expect(e.fetchMock).not.toHaveBeenCalled()
  })

  it('falla la lectura de tokens: error genérico, sin fetch', async () => {
    const e = montar({ tokensError: { code: 'XX002', message: `boom ${ADMIN_ID}` } })
    const r = await enviarmePruebaAvisoEquipo(aviso())
    expect(r).toEqual({ ok: false, error: MENSAJE_GENERICO })
    expect(e.fetchMock).not.toHaveBeenCalled()
    sinDatosPersonales(e, 0, r)
  })

  it('en real, si Expo no entrega a ningún teléfono: error (no se dice que salió)', async () => {
    const e = montar()
    e.expo.ticketsPorToken.set(TOKEN_ADMIN_1, { status: 'error', message: `token ${TOKEN_ADMIN_1} inválido`, details: { error: 'MessageRateExceeded' } })
    e.expo.ticketsPorToken.set(TOKEN_ADMIN_2, { status: 'error', message: 'x', details: { error: 'MessageRateExceeded' } })
    vi.stubEnv('PUSH_ENVIO_REAL', '1')
    const r = await enviarmePruebaAvisoEquipo(aviso())
    expect(r).toEqual({ ok: false, error: 'No se pudo entregar la prueba a tu teléfono.' })
    sinDatosPersonales(e, 0, r)
  })
})

describe('enviarmePruebaAvisoEquipo: modo simulado (dryRun)', () => {
  it.each([[undefined], ['true'], ['0'], [''], ['yes'], ['TRUE'], [' 1'], ['1 ']])('PUSH_ENVIO_REAL=%j: ningún fetch', async (valor) => {
    const e = montar()
    if (valor !== undefined) vi.stubEnv('PUSH_ENVIO_REAL', valor)
    else vi.stubEnv('PUSH_ENVIO_REAL', undefined as unknown as string)
    const r = await enviarmePruebaAvisoEquipo(aviso())
    expect(r).toEqual({ ok: true, simulado: true, telefonos: 2 })
    expect(e.fetchMock).not.toHaveBeenCalled()
    expect(e.db.escrituras).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// contarDestinatariosAvisoEquipo
// ---------------------------------------------------------------------------
describe('contarDestinatariosAvisoEquipo', () => {
  it('cuenta personas y teléfonos de quien lo prendió, con excluidos, solo números', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1, { tokens: 2 })
    sembrarUsuario(e.db, 2)
    sembrarUsuario(e.db, 3, { prefs: { announcements: false } })
    sembrarUsuario(e.db, 4, { prefs: null })
    const r = await contarDestinatariosAvisoEquipo()
    expect(r).toEqual({
      ok: true,
      personas: 2,
      telefonos: 3,
      excluidos: { sinPermiso: 2, silencio: 0, tope: 0, yaRecibio: 0 },
      yaHuboHoy: false,
    })
    sinDatosPersonales(e, 4, r)
    expect(e.db.escrituras).toEqual([])
    expect(e.fetchMock).not.toHaveBeenCalled()
  })

  it('con un aviso del equipo de hoy ya registrado: yaHuboHoy true', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1, {
      envios: [{ kind: 'anuncio', dedupe_key: claveDedupeAvisoEquipo(idUsuario(1), AHORA), sent_at: '2026-11-09T13:00:00.000Z', status: 'SUCCESS' }],
    })
    const r = await contarDestinatariosAvisoEquipo()
    expect(r).toMatchObject({ ok: true, yaHuboHoy: true })
  })

  it('un aviso del equipo de AYER no cuenta como "hoy"', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1, {
      envios: [{ kind: 'anuncio', dedupe_key: 'anuncio:x:2026-11-08', sent_at: '2026-11-08T14:00:00.000Z', status: 'SUCCESS' }],
    })
    expect(await contarDestinatariosAvisoEquipo()).toMatchObject({ ok: true, yaHuboHoy: false })
  })

  it('error de lectura: mensaje genérico, sin filtrar el mensaje de la base', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1)
    e.db.alInvocar(({ tabla, op }) => {
      if (tabla === 'notification_preferences' && op === 'select') return { error: { code: 'XX003', message: `rota ${tokenUsuario(1)} ${idUsuario(1)}` } }
    })
    const r = await contarDestinatariosAvisoEquipo()
    expect(r).toEqual({ ok: false, error: MENSAJE_GENERICO })
    sinDatosPersonales(e, 1, r)
  })
})

// ---------------------------------------------------------------------------
// enviarAvisoEquipoATodos: simulado
// ---------------------------------------------------------------------------
describe('enviarAvisoEquipoATodos: modo simulado (dryRun)', () => {
  it.each([[undefined], ['true'], ['0'], [''], ['yes'], ['TRUE'], [' 1']])(
    'PUSH_ENVIO_REAL=%j: ok simulado, ningún fetch y ninguna escritura (ni insert, ni update, ni delete)',
    async (valor) => {
      const e = montar()
      sembrarUsuario(e.db, 1)
      sembrarUsuario(e.db, 2, { tokens: 2 })
      vi.stubEnv('PUSH_ENVIO_REAL', valor as string)
      const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 3 })
      expect(r).toEqual({ ok: true, simulado: true, personas: 2, telefonos: 3 })
      expect(e.fetchMock).not.toHaveBeenCalled()
      expect(e.db.escrituras).toEqual([])
      expect(e.db.sends()).toEqual([])
      expect(e.db.tablas.push_tokens).toHaveLength(3)
      expect(mocks.revalidatePath).not.toHaveBeenCalled()
      sinDatosPersonales(e, 2, r)
    },
  )
})

// ---------------------------------------------------------------------------
// enviarAvisoEquipoATodos: confirmación de cantidad y reglas de destinatarios
// ---------------------------------------------------------------------------
describe('enviarAvisoEquipoATodos: confirmación y reglas', () => {
  beforeEach(() => vi.stubEnv('PUSH_ENVIO_REAL', '1'))

  it('si cambió la cantidad de teléfonos respecto de la confirmada: no manda, pide confirmar de nuevo', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1)
    sembrarUsuario(e.db, 2)
    const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 1 })
    expect(r).toMatchObject({ ok: false, requiereConfirmar: { personas: 2, telefonos: 2 } })
    expect(e.fetchMock).not.toHaveBeenCalled()
    expect(e.db.escrituras).toEqual([])
  })

  it('también si la cantidad real es MENOR que la confirmada', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1)
    const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 5 })
    expect(r).toMatchObject({ ok: false, requiereConfirmar: { personas: 1, telefonos: 1 } })
    expect(e.fetchMock).not.toHaveBeenCalled()
  })

  it('sin nadie a quien mandarle: error y nada se escribe (aunque se haya confirmado 0)', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1, { prefs: { announcements: false } })
    const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 0 })
    expect(r).toEqual({ ok: false, error: 'No hay nadie a quien mandarle este aviso ahora.' })
    expect(e.fetchMock).not.toHaveBeenCalled()
    expect(e.db.escrituras).toEqual([])
  })

  it('respeta el opt-out: solo recibe quien tiene announcements en true (sin fila de preferencias tampoco)', async () => {
    const e = montar()
    const a = sembrarUsuario(e.db, 1)
    sembrarUsuario(e.db, 2, { prefs: { announcements: false } })
    sembrarUsuario(e.db, 3, { prefs: null })
    const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 1 })
    expect(r).toMatchObject({ ok: true, simulado: false, personas: 1, telefonos: 1 })
    expect(e.expo.destinatarios()).toEqual(a.tokens)
    expect(e.db.sends().map((f) => f.user_id)).toEqual([a.userId])
  })

  it('respeta el horario de silencio (23:30 de Salta): no manda a nadie', async () => {
    const e = montar()
    vi.setSystemTime(AHORA_23_30_SALTA)
    sembrarUsuario(e.db, 1)
    const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 0 })
    expect(r.ok).toBe(false)
    expect(e.fetchMock).not.toHaveBeenCalled()
  })

  it('respeta el tope diario de cada persona (daily_cap 1 con un envío de hoy): queda afuera', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1, {
      prefs: { daily_cap: 1 },
      envios: [{ kind: 'favorito', dedupe_key: 'favorito:u1:e1', sent_at: '2026-11-09T13:00:00.000Z', status: 'SUCCESS' }],
    })
    const b = sembrarUsuario(e.db, 2)
    const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 1 })
    expect(r).toMatchObject({ ok: true, personas: 1 })
    expect(e.expo.destinatarios()).toEqual(b.tokens)
  })

  it('tope de 1 por día (global): con un aviso del equipo ya registrado hoy, "Ya se mandó…" y nada sale', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1)
    sembrarUsuario(e.db, 2, {
      envios: [{ kind: 'anuncio', dedupe_key: claveDedupeAvisoEquipo(idUsuario(2), AHORA), sent_at: '2026-11-09T13:00:00.000Z', status: 'SUCCESS' }],
    })
    const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 1 })
    expect(r).toEqual({ ok: false, error: MENSAJE_YA_HUBO_HOY })
    expect(e.fetchMock).not.toHaveBeenCalled()
    expect(e.db.escrituras).toEqual([])
  })

  it('evento no publicado: error, sin escrituras ni fetch', async () => {
    const e = montar({ eventStatus: 'DRAFT' })
    sembrarUsuario(e.db, 1)
    const r = await enviarAvisoEquipoATodos(aviso({ destino: { tipo: 'evento', eventId: EVENTO_ID } }), { telefonosEsperados: 1 })
    expect(r).toMatchObject({ ok: false, error: 'El evento tiene que estar publicado.' })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(e.fetchMock).not.toHaveBeenCalled()
  })

  it('error leyendo push_tokens: genérico, sin escrituras ni fetch, sin datos personales en el log', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1)
    e.db.alInvocar(({ tabla }) => {
      if (tabla === 'push_tokens') return { error: { code: 'XX004', message: `rota ${tokenUsuario(1)}` } }
    })
    const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 1 })
    expect(r).toEqual({ ok: false, error: MENSAJE_GENERICO })
    expect(e.fetchMock).not.toHaveBeenCalled()
    expect(e.db.escrituras).toEqual([])
    sinDatosPersonales(e, 1, r)
  })
})

// ---------------------------------------------------------------------------
// enviarAvisoEquipoATodos: real (reserva, envío, registro)
// ---------------------------------------------------------------------------
describe('enviarAvisoEquipoATodos: envío real', () => {
  beforeEach(() => vi.stubEnv('PUSH_ENVIO_REAL', '1'))

  it('RESERVA antes de mandar: el upsert va antes del fetch y, al mandar, ya están todas en PENDIENTE', async () => {
    const e = montar()
    const a = sembrarUsuario(e.db, 1)
    const b = sembrarUsuario(e.db, 2)
    await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 2 })
    const iUpsert = e.db.linea.indexOf('upsert:notification_sends')
    const iFetch = e.db.linea.indexOf('fetch')
    expect(iUpsert).toBeGreaterThan(-1)
    expect(iFetch).toBeGreaterThan(iUpsert)
    expect(new Set(e.expo.pendientesAlMandar[0])).toEqual(new Set([a.userId, b.userId]))
  })

  it('la reserva usa la clave de hoy, kind "anuncio", canal push y el evento del destino', async () => {
    const e = montar()
    const a = sembrarUsuario(e.db, 1)
    await enviarAvisoEquipoATodos(aviso({ destino: { tipo: 'evento', eventId: EVENTO_ID } }), { telefonosEsperados: 1 })
    expect(e.db.sendDe(a.userId)).toMatchObject({
      kind: 'anuncio',
      channel: 'push',
      dedupe_key: claveDedupeAvisoEquipo(a.userId, AHORA),
      event_id: EVENTO_ID,
    })
  })

  it('manda solo a los reservados: si otro admin ya reservó a una persona entre la lectura y la reserva, a esa no se le manda', async () => {
    const e = montar()
    const a = sembrarUsuario(e.db, 1)
    const b = sembrarUsuario(e.db, 2)
    // Otro admin reserva a B justo antes de nuestro upsert.
    let yaSePuso = false
    e.db.alInvocar(({ tabla, op, db }) => {
      if (tabla === 'notification_sends' && op === 'upsert' && !yaSePuso) {
        yaSePuso = true
        db.tablas.notification_sends.push({ id: 999, user_id: b.userId, kind: 'anuncio', status: 'PENDIENTE', dedupe_key: claveDedupeAvisoEquipo(b.userId, AHORA), sent_at: AHORA.toISOString() })
      }
    })
    const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 2 })
    expect(e.expo.destinatarios()).toEqual(a.tokens)
    expect(r).toMatchObject({ ok: true, personas: 1, telefonos: 1 })
    // la reserva del otro admin no se toca
    expect(e.db.sendDe(b.userId)).toMatchObject({ id: 999, status: 'PENDIENTE' })
  })

  it('si TODAS ya estaban reservadas por otro: "Ya se mandó…" y no se llama a fetch', async () => {
    const e = montar()
    const a = sembrarUsuario(e.db, 1)
    e.db.alInvocar(({ tabla, op, db }) => {
      if (tabla === 'notification_sends' && op === 'upsert') {
        db.tablas.notification_sends.push({ id: 999, user_id: a.userId, kind: 'anuncio', status: 'PENDIENTE', dedupe_key: claveDedupeAvisoEquipo(a.userId, AHORA), sent_at: AHORA.toISOString() })
      }
    })
    const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 1 })
    expect(r).toEqual({ ok: false, error: MENSAJE_YA_HUBO_HOY })
    expect(e.fetchMock).not.toHaveBeenCalled()
  })

  it('SUCCESS a quien tuvo algún ticket ok; libera al resto; borra el token muerto (DeviceNotRegistered)', async () => {
    const e = montar()
    const a = sembrarUsuario(e.db, 1)
    const b = sembrarUsuario(e.db, 2)
    const c = sembrarUsuario(e.db, 3)
    const d = sembrarUsuario(e.db, 4, { tokens: 2 }) // un token ok y uno que falla: cuenta como recibido
    e.expo.ticketsPorToken.set(b.tokens[0], { status: 'error', message: 'rate', details: { error: 'MessageRateExceeded' } })
    e.expo.ticketsPorToken.set(c.tokens[0], { status: 'error', message: `no registrado ${c.tokens[0]}`, details: { error: 'DeviceNotRegistered' } })
    e.expo.ticketsPorToken.set(d.tokens[1], { status: 'error', message: 'rate', details: { error: 'MessageRateExceeded' } })

    const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 5 })

    expect(r).toEqual({ ok: true, simulado: false, personas: 2, telefonos: 2, fallidos: 3 })
    expect(e.db.sendDe(a.userId)).toMatchObject({ status: 'SUCCESS' })
    expect(e.db.sendDe(d.userId)).toMatchObject({ status: 'SUCCESS' })
    expect(e.db.sendDe(b.userId)).toBeUndefined() // reserva liberada: puede volver a ser candidato
    expect(e.db.sendDe(c.userId)).toBeUndefined()
    // el token muerto se borró, los demás siguen
    const quedan = e.db.tablas.push_tokens.map((f) => f.token)
    expect(quedan).not.toContain(c.tokens[0])
    expect(quedan).toContain(b.tokens[0])
    expect(quedan).toContain(d.tokens[1])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/avisos')
    sinDatosPersonales(e, 4, r)
  })

  it('el SUCCESS no toca las reservas de OTROS (solo las claves de este envío)', async () => {
    const e = montar()
    const a = sembrarUsuario(e.db, 1)
    await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 1 })
    const ajeno = e.db.sends().filter((f) => f.user_id !== a.userId)
    expect(ajeno).toEqual([])
  })

  it('un segundo envío el mismo día: "Ya se mandó…", sin segundo fetch ni más escrituras', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1)
    sembrarUsuario(e.db, 2)
    const primero = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 2 })
    expect(primero).toMatchObject({ ok: true, personas: 2 })
    const llamadas = e.fetchMock.mock.calls.length
    const escrituras = e.db.escrituras.length

    const segundo = await enviarAvisoEquipoATodos(aviso({ titulo: 'Otro aviso' }), { telefonosEsperados: 2 })
    expect(segundo).toEqual({ ok: false, error: MENSAJE_YA_HUBO_HOY })
    expect(e.fetchMock.mock.calls.length).toBe(llamadas)
    expect(e.db.escrituras.length).toBe(escrituras)
  })

  it('doble click casi simultáneo: el segundo no manda a nadie a quien el primero ya reservó', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1)
    sembrarUsuario(e.db, 2)
    const [x, y] = await Promise.all([
      enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 2 }),
      enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 2 }),
    ])
    const destinatarios = e.expo.destinatarios()
    expect(new Set(destinatarios).size).toBe(destinatarios.length) // nadie recibió dos veces
    expect([x.ok, y.ok].filter(Boolean).length).toBeLessThanOrEqual(2)
    expect(destinatarios).toHaveLength(2)
  })

  it('al día siguiente (día de Salta nuevo) se puede volver a mandar', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1)
    await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 1 })
    vi.setSystemTime(new Date('2026-11-10T15:00:00Z'))
    const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 1 })
    expect(r).toMatchObject({ ok: true, personas: 1 })
    expect(e.expo.destinatarios()).toHaveLength(2)
  })

  it('el mensaje que sale: título, cuerpo y data del destino, sin tipo ni categoryId; un mensaje por token', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1, { tokens: 2 })
    await enviarAvisoEquipoATodos(aviso({ destino: { tipo: 'cines' } }), { telefonosEsperados: 2 })
    const mensajes = e.expo.mensajes()
    expect(mensajes).toHaveLength(2)
    for (const m of mensajes) {
      expect(m).toMatchObject({ title: 'Novedad de prueba', body: 'Texto de prueba del equipo.', data: { destino: 'cines' } })
      expect(m).not.toHaveProperty('categoryId')
      expect(m.data as object).not.toHaveProperty('tipo')
    }
  })

  it('fallos al reservar (error de la base): nada se manda, genérico, y lo reservado en lotes previos se libera', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1)
    e.db.alInvocar(({ tabla, op }) => {
      if (tabla === 'notification_sends' && op === 'upsert') return { error: { code: 'XX005', message: `rota ${tokenUsuario(1)}` } }
    })
    const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 1 })
    expect(r).toEqual({ ok: false, error: MENSAJE_GENERICO })
    expect(e.fetchMock).not.toHaveBeenCalled()
    expect(e.db.sends()).toEqual([])
    sinDatosPersonales(e, 1, r)
  })
})

// ---------------------------------------------------------------------------
// enviarAvisoEquipoATodos: si algo tira
// ---------------------------------------------------------------------------
describe('enviarAvisoEquipoATodos: si algo tira', () => {
  beforeEach(() => vi.stubEnv('PUSH_ENVIO_REAL', '1'))

  it('ANTES de que el envío vuelva (enviarLote tira): se liberan TODAS las reservas y el error es el genérico', async () => {
    const e = montar()
    const a = sembrarUsuario(e.db, 1)
    const b = sembrarUsuario(e.db, 2)
    mocks.enviarLoteTira = new Error(`boom ${a.tokens[0]} ${a.userId}`)
    const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 2 })
    expect(r).toEqual({ ok: false, error: MENSAJE_GENERICO })
    expect(e.db.sendDe(a.userId)).toBeUndefined()
    expect(e.db.sendDe(b.userId)).toBeUndefined()
    expect(e.fetchMock).not.toHaveBeenCalled()
    sinDatosPersonales(e, 2, r)
  })

  it('DESPUÉS de que el envío volvió (falla el marcado SUCCESS): NO se libera la reserva de quien ya recibió, SÍ la de quien no', async () => {
    const e = montar()
    const recibio = sembrarUsuario(e.db, 1)
    const noRecibio = sembrarUsuario(e.db, 2)
    e.expo.ticketsPorToken.set(noRecibio.tokens[0], { status: 'error', message: 'rate', details: { error: 'MessageRateExceeded' } })
    e.db.alInvocar(({ tabla, op }) => {
      if (tabla === 'notification_sends' && op === 'update') throw new Error(`se cayó la base ${recibio.tokens[0]} ${recibio.userId}`)
    })
    const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 2 })
    // quien recibió conserva su fila (PENDIENTE): un reintento del admin no le manda el aviso otra vez
    expect(e.db.sendDe(recibio.userId)).toMatchObject({ status: 'PENDIENTE', dedupe_key: claveDedupeAvisoEquipo(recibio.userId, AHORA) })
    // quien no lo recibió queda libre para un reintento
    expect(e.db.sendDe(noRecibio.userId)).toBeUndefined()
    expect(r).toEqual({ ok: false, error: MENSAJE_SIN_REGISTRO })
    sinDatosPersonales(e, 2, r)
  })

  it('...y el reintento del admin ese mismo día NO repite el aviso a quien ya lo recibió (lo frena el tope global de 1 por día)', async () => {
    const e = montar()
    const recibio = sembrarUsuario(e.db, 1)
    let rompe = true
    e.db.alInvocar(({ tabla, op }) => {
      if (rompe && tabla === 'notification_sends' && op === 'update') throw new Error('se cayó la base')
    })
    await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 1 })
    rompe = false
    const llamadas = e.fetchMock.mock.calls.length
    const reintento = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 1 })
    expect(reintento.ok).toBe(false)
    expect(e.fetchMock.mock.calls.length).toBe(llamadas)
    expect(e.expo.destinatarios()).toEqual(recibio.tokens)
  })

  it('falla el borrado de la reserva de quien no recibió (liberar): no tira hacia afuera, el envío queda ok y se loguea solo el código', async () => {
    const e = montar()
    const a = sembrarUsuario(e.db, 1)
    const b = sembrarUsuario(e.db, 2)
    e.expo.ticketsPorToken.set(b.tokens[0], { status: 'error', message: 'rate', details: { error: 'MessageRateExceeded' } })
    e.db.alInvocar(({ tabla, op }) => {
      if (tabla === 'notification_sends' && op === 'delete') return { error: { code: 'XX006', message: `rota ${b.tokens[0]}` } }
    })
    const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 2 })
    expect(r).toMatchObject({ ok: true, personas: 1 })
    expect(e.db.sendDe(a.userId)).toMatchObject({ status: 'SUCCESS' })
    expect(textoDeLlamadas(e.errorLog.mock.calls)).toContain('XX006')
    sinDatosPersonales(e, 2, r)
  })

  it('falla marcar SUCCESS con error devuelto (no excepción): se loguea el código, el envío sigue y responde ok', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1)
    e.db.alInvocar(({ tabla, op }) => {
      if (tabla === 'notification_sends' && op === 'update') return { error: { code: 'XX007', message: 'x' } }
    })
    const r = await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 1 })
    expect(r).toMatchObject({ ok: true, personas: 1 })
    expect(textoDeLlamadas(e.errorLog.mock.calls)).toContain('XX007')
  })
})

// ---------------------------------------------------------------------------
// historialAvisosEquipo
// ---------------------------------------------------------------------------
describe('historialAvisosEquipo', () => {
  it('cuenta personas con SUCCESS por día de Salta (no UTC), del más nuevo al más viejo, solo números y fechas', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1, {
      envios: [
        { kind: 'anuncio', status: 'SUCCESS', dedupe_key: 'k1', sent_at: '2026-11-09T14:00:00Z' },
      ],
    })
    sembrarUsuario(e.db, 2, {
      envios: [
        { kind: 'anuncio', status: 'SUCCESS', dedupe_key: 'k2', sent_at: '2026-11-09T14:05:00Z' },
        // 02:30 UTC del 10 = 23:30 del 9 en Salta: mismo día que los de arriba
        { kind: 'anuncio', status: 'SUCCESS', dedupe_key: 'k3', sent_at: '2026-11-10T02:30:00Z' },
        { kind: 'anuncio', status: 'PENDIENTE', dedupe_key: 'k4', sent_at: '2026-11-09T14:06:00Z' },
        { kind: 'favorito', status: 'SUCCESS', dedupe_key: 'k5', sent_at: '2026-11-09T14:07:00Z' },
        { kind: 'anuncio', status: 'SUCCESS', dedupe_key: 'k6', sent_at: '2026-11-05T14:00:00Z' },
      ],
    })
    const h = await historialAvisosEquipo()
    expect(h).toEqual([
      { dia: '2026-11-09', personas: 3 },
      { dia: '2026-11-05', personas: 1 },
    ])
    sinDatosPersonales(e, 2, h)
  })

  it('error de lectura: null y sin datos personales en el log', async () => {
    const e = montar()
    e.db.alInvocar(({ tabla }) => {
      if (tabla === 'notification_sends') return { error: { code: 'XX008', message: tokenUsuario(1) } }
    })
    expect(await historialAvisosEquipo()).toBeNull()
    sinDatosPersonales(e, 1)
  })
})

// ---------------------------------------------------------------------------
// Ni la respuesta ni los logs llevan tokens, emails ni ids (recorrido completo)
// ---------------------------------------------------------------------------
describe('sin tokens, emails ni ids de usuario en respuestas ni en logs', () => {
  it('el chequeo mismo falla de verdad: detecta un token en la respuesta, un email en un log y un id en un log', () => {
    const e = montar()
    expect(() => sinDatosPersonales(e, 1, { ok: true, token: tokenUsuario(1) })).toThrow()
    console.error('algo salió mal con persona-1-de-prueba@ejemplo.invalid')
    expect(() => sinDatosPersonales(e, 1, { ok: true })).toThrow()
    e.errorLog.mockClear()
    console.log(`usuario ${idUsuario(1)}`)
    expect(() => sinDatosPersonales(e, 1, { ok: true })).toThrow()
  })

  it('recorrido completo en real con fallos de Expo que citan el token en su mensaje', async () => {
    vi.stubEnv('PUSH_ENVIO_REAL', '1')
    const e = montar()
    const u1 = sembrarUsuario(e.db, 1, { tokens: 2 })
    const u2 = sembrarUsuario(e.db, 2)
    const u3 = sembrarUsuario(e.db, 3)
    e.expo.ticketsPorToken.set(u2.tokens[0], { status: 'error', message: `El token ${u2.tokens[0]} del usuario ${u2.userId} falló`, details: { error: 'MessageRateExceeded' } })
    e.expo.ticketsPorToken.set(u3.tokens[0], { status: 'error', message: `no registrado ${u3.tokens[0]}`, details: { error: 'DeviceNotRegistered' } })
    void u1

    const resultados = [
      await enviarmePruebaAvisoEquipo(aviso({ destino: { tipo: 'evento', eventId: EVENTO_ID } })),
      await contarDestinatariosAvisoEquipo(),
      await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 99 }), // "cambió la cantidad"
      await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 4 }), // real
      await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 4 }), // "ya hubo hoy"
      await historialAvisosEquipo(),
    ]
    sinDatosPersonales(e, 3, ...resultados)
  })

  it('con la base y Expo caídas en todos los frentes: tampoco', async () => {
    vi.stubEnv('PUSH_ENVIO_REAL', '1')
    const e = montar({ tokensError: { code: 'XX010', message: `rota ${TOKEN_ADMIN_1}` }, eventError: { code: 'XX011', message: ADMIN_EMAIL } })
    sembrarUsuario(e.db, 1)
    e.db.alInvocar(({ tabla }) => ({ error: { code: 'XX012', message: `${tabla} ${tokenUsuario(1)} ${idUsuario(1)} ${emailUsuarioDeLaFila()}` } }))
    const resultados = [
      await enviarmePruebaAvisoEquipo(aviso()),
      await contarDestinatariosAvisoEquipo(),
      await enviarAvisoEquipoATodos(aviso(), { telefonosEsperados: 1 }),
      await historialAvisosEquipo(),
    ]
    sinDatosPersonales(e, 1, ...resultados)
    // y se loguea el código, que es lo único que se puede loguear
    expect(textoDeLlamadas(e.errorLog.mock.calls)).toMatch(/XX01[0-2]/)
  })
})

function emailUsuarioDeLaFila(): string {
  return 'persona-1-de-prueba@ejemplo.invalid'
}
