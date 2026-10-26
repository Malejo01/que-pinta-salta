/**
 * `enviarmePruebaCampania` (Ronda 70, tarea 70-c): "Enviarme una prueba" de la
 * campaña patrocinada, en `lib/admin/avisos-patrocinados-actions.ts`. Sin red
 * ni base: mismos dobles que `./acciones.test.ts` (ver `./dobles.ts`), con el
 * `expo-push.ts` y el `envio-admin.ts` reales encima de un `fetch` falso.
 *
 * Lo que se vigila: solo un ADMIN prueba; los tokens son SOLO los del admin de
 * la sesión; no se escribe nada (ni `notification_sends` ni
 * `sponsored_campaigns`); y el contenido es IDÉNTICO al que arma `armarTanda`
 * para la misma campaña (si no, la prueba mentiría sobre lo que va a llegar).
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
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => mocks.createClient(...a),
  createAdminClient: (...a: unknown[]) => mocks.createAdminClient(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => mocks.revalidatePath(...a) }))

import { enviarmePruebaCampania } from '@/lib/admin/avisos-patrocinados-actions'
import { armarTanda } from '@qps/core/notificaciones/tanda'
import {
  CATEGORIA_PATROCINADO,
  contenidoAvisoPatrocinado,
  tituloAvisoPatrocinado,
} from '@qps/core/notificaciones/patrocinados'
import { PREFERENCIAS_POR_DEFECTO } from '@qps/core/notificaciones/preferencias'

const AHORA = new Date('2026-11-09T15:00:00Z') // lunes 12:00 de Salta

function campania(extra: Record<string, unknown> = {}) {
  return {
    titulo: 'Entradas 2x1 esta semana',
    cuerpo: 'Llevá a un amigo gratis en la función de las 22hs.',
    eventId: EVENTO_ID,
    ...extra,
  }
}

function montar(sesionConfig: Partial<ConfigSesion> = {}) {
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
  return { db, sesion, expo, fetchMock, errorLog: vi.spyOn(console, 'error').mockImplementation(() => {}) }
}

function sinDatosPersonales(e: ReturnType<typeof montar>, cantidadUsuarios: number, ...resultados: unknown[]) {
  const json = JSON.stringify(resultados)
  const logs = textoDeLlamadas([...e.errorLog.mock.calls, ...vi.mocked(console.log).mock.calls])
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
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('enviarmePruebaCampania: solo ADMIN', () => {
  it.each([
    ['sin sesión', { user: null, role: null }, 'No autenticado'],
    ['usuario común', { role: 'USER' }, 'No tenés permisos de administrador'],
    ['sin perfil', { role: null }, 'No tenés permisos de administrador'],
    ['rol "admin" en minúscula', { role: 'admin' }, 'No tenés permisos de administrador'],
  ] as Array<[string, Partial<ConfigSesion>, string]>)('%s: error, y ni se leen tokens ni hay fetch', async (_n, config, mensaje) => {
    vi.stubEnv('PUSH_ENVIO_REAL', '1')
    const e = montar(config)
    const r = await enviarmePruebaCampania(campania())
    expect(r).toEqual({ ok: false, errores: [{ campo: 'general', mensaje }] })
    expect(e.sesion.idsConsultadosEnTokens).toEqual([])
    expect(e.fetchMock).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it.each([[null], [undefined], ['texto'], [42], [[]]])('entrada %j: error sin crear ningún cliente', async (entrada) => {
    const e = montar()
    const r = await enviarmePruebaCampania(entrada)
    expect(r.ok).toBe(false)
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(e.fetchMock).not.toHaveBeenCalled()
  })
})

describe('enviarmePruebaCampania: solo llega al admin y no escribe nada', () => {
  beforeEach(() => vi.stubEnv('PUSH_ENVIO_REAL', '1'))

  it('lee los tokens con el user.id de la sesión, aunque la entrada traiga otro userId', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1)
    const r = await enviarmePruebaCampania(campania({ userId: OTRO_ID_DE_ENTRADA, user_id: idUsuario(1), tokens: ['ExponentPushToken[ajeno]'] }))
    expect(r).toEqual({ ok: true, simulado: false, telefonos: 2 })
    expect(e.sesion.idsConsultadosEnTokens).toEqual([ADMIN_ID])
    expect(e.expo.destinatarios()).toEqual([TOKEN_ADMIN_1, TOKEN_ADMIN_2])
  })

  it('no usa el cliente de service role y no escribe: ni notification_sends ni sponsored_campaigns', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1)
    await enviarmePruebaCampania(campania())
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    // El doble de la sesión tira si se toca otra tabla; además se comprueba lo tocado.
    expect(new Set(e.sesion.tablasTocadas)).toEqual(new Set(['profiles', 'events', 'push_tokens']))
    expect(e.db.escrituras).toEqual([])
    expect(e.db.sends()).toEqual([])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('no cuenta para el tope semanal: no queda ninguna fila "patrocinado"', async () => {
    const e = montar()
    await enviarmePruebaCampania(campania())
    await enviarmePruebaCampania(campania())
    expect(e.db.sends().filter((f) => f.kind === 'patrocinado')).toEqual([])
  })

  it('simulado (sin PUSH_ENVIO_REAL=1): ok simulado, cuenta teléfonos y NO hay fetch', async () => {
    for (const valor of [undefined, 'true', '0', '']) {
      vi.unstubAllEnvs()
      if (valor !== undefined) vi.stubEnv('PUSH_ENVIO_REAL', valor)
      const e = montar()
      const r = await enviarmePruebaCampania(campania())
      expect(r).toEqual({ ok: true, simulado: true, telefonos: 2 })
      expect(e.fetchMock).not.toHaveBeenCalled()
    }
  })

  it('sin teléfonos del admin: error y sin fetch', async () => {
    const e = montar({ tokens: [] })
    const r = await enviarmePruebaCampania(campania())
    expect(r).toEqual({ ok: false, errores: [{ campo: 'general', mensaje: 'No tenés la app con avisos activos en tu teléfono.' }] })
    expect(e.fetchMock).not.toHaveBeenCalled()
  })

  it('falla la lectura de tokens: error, sin fetch, y no se filtra el mensaje de la base', async () => {
    const e = montar({ tokensError: { code: 'XX020', message: `rota ${TOKEN_ADMIN_1} ${ADMIN_ID}` } })
    const r = await enviarmePruebaCampania(campania())
    expect(r.ok).toBe(false)
    expect(e.fetchMock).not.toHaveBeenCalled()
    expect(textoDeLlamadas(e.errorLog.mock.calls)).not.toContain('rota')
    sinDatosPersonales(e, 0, r)
  })

  it('si Expo no entrega a ningún teléfono: error (no dice que salió)', async () => {
    const e = montar()
    e.expo.ticketsPorToken.set(TOKEN_ADMIN_1, { status: 'error', message: `x ${TOKEN_ADMIN_1}`, details: { error: 'MessageRateExceeded' } })
    e.expo.ticketsPorToken.set(TOKEN_ADMIN_2, { status: 'error', message: 'x', details: { error: 'MessageRateExceeded' } })
    const r = await enviarmePruebaCampania(campania())
    expect(r.ok).toBe(false)
    sinDatosPersonales(e, 0, r)
  })

  it('no hay tokens, emails ni ids de usuario en la respuesta ni en los logs', async () => {
    const e = montar()
    sembrarUsuario(e.db, 1)
    const r = await enviarmePruebaCampania(campania())
    sinDatosPersonales(e, 1, r)
  })
})

describe('enviarmePruebaCampania: validación', () => {
  beforeEach(() => vi.stubEnv('PUSH_ENVIO_REAL', '1'))

  it.each([
    ['título vacío', { titulo: '' }, 'titulo'],
    ['título de 51 caracteres', { titulo: 'a'.repeat(51) }, 'titulo'],
    ['cuerpo de 151 caracteres', { cuerpo: 'a'.repeat(151) }, 'cuerpo'],
    ['título que imita al sistema ("Alerta")', { titulo: 'Alerta de entradas' }, 'titulo'],
    ['cuerpo que imita al sistema ("tu cuenta")', { cuerpo: 'Revisá tu cuenta ya' }, 'cuerpo'],
    ['título con salto de línea', { titulo: 'Hola\nmundo' }, 'titulo'],
    ['sin eventId', { eventId: undefined }, 'eventId'],
    ['eventId que no es uuid', { eventId: 'no-es-uuid' }, 'eventId'],
  ])('%s: rechazado con el campo %s, sin fetch', async (_n, extra, campo) => {
    const e = montar()
    const r = await enviarmePruebaCampania(campania(extra))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.map((x) => x.campo)).toContain(campo)
    expect(e.fetchMock).not.toHaveBeenCalled()
    expect(e.sesion.idsConsultadosEnTokens).toEqual([])
  })

  it('no pide fechas: sin startsAt ni endsAt es válida', async () => {
    montar()
    expect((await enviarmePruebaCampania(campania())).ok).toBe(true)
  })

  it.each(['DRAFT', null] as const)('evento %s (no publicado o inexistente): error y sin fetch', async (eventStatus) => {
    const e = montar({ eventStatus })
    const r = await enviarmePruebaCampania(campania())
    expect(r).toEqual({ ok: false, errores: [{ campo: 'eventId', mensaje: 'El evento tiene que estar publicado.' }] })
    expect(e.fetchMock).not.toHaveBeenCalled()
  })

  it('error leyendo el evento: error general y sin fetch', async () => {
    const e = montar({ eventError: { code: 'XX021', message: 'rota' } })
    const r = await enviarmePruebaCampania(campania())
    expect(r.ok).toBe(false)
    expect(e.fetchMock).not.toHaveBeenCalled()
    expect(textoDeLlamadas(e.errorLog.mock.calls)).toContain('XX021')
  })
})

describe('enviarmePruebaCampania: el contenido es el mismo que arma armarTanda', () => {
  beforeEach(() => vi.stubEnv('PUSH_ENVIO_REAL', '1'))

  function mensajeDeTanda(titulo: string, cuerpo: string) {
    const token = tokenUsuario(1)
    const tanda = armarTanda(
      {
        usuarios: [
          {
            userId: idUsuario(1),
            preferencias: { ...PREFERENCIAS_POR_DEFECTO, sponsored: true, quiet_start: '23:00', quiet_end: '09:00' },
            tokens: [token],
            favoritos: [],
            novedades: [],
            enviosRegistrados: [],
          },
        ],
        patrocinado: { id: 'ffffffff-ffff-4fff-8fff-000000000001', titulo, cuerpo, eventId: EVENTO_ID },
      },
      AHORA,
    )
    expect(tanda).toHaveLength(1)
    return tanda[0]
  }

  it('título, cuerpo, categoryId y data son idénticos campo por campo', async () => {
    const e = montar()
    const entrada = campania({ titulo: '  Entradas 2x1  ', cuerpo: '  Texto de la campaña  ' })
    await enviarmePruebaCampania(entrada)
    const [enPrueba] = e.expo.mensajes()
    const enTanda = mensajeDeTanda('Entradas 2x1', 'Texto de la campaña')

    expect(enPrueba.title).toBe(enTanda.title)
    expect(enPrueba.body).toBe(enTanda.body)
    expect(enPrueba.categoryId).toBe(enTanda.categoryId)
    expect(enPrueba.data).toEqual(enTanda.data)
    expect(enPrueba.title).toBe(tituloAvisoPatrocinado('Entradas 2x1'))
    expect(enPrueba.categoryId).toBe(CATEGORIA_PATROCINADO)
    expect((enPrueba.data as Record<string, unknown>).tipo).toBe(CATEGORIA_PATROCINADO)
  })

  it('el mensaje que se manda no trae campos de más que la tanda no tenga (misma forma exacta)', async () => {
    const e = montar()
    await enviarmePruebaCampania(campania())
    const [enPrueba] = e.expo.mensajes()
    const enTanda = mensajeDeTanda('Entradas 2x1 esta semana', 'Llevá a un amigo gratis en la función de las 22hs.')
    // Lo que `armarTanda` suma es de la base (userId, kind, eventId, dedupeKey, campaignId), no del push.
    const delPush = Object.keys(enTanda).filter((k) => !['userId', 'kind', 'eventId', 'dedupeKey', 'campaignId'].includes(k))
    expect(Object.keys(enPrueba).sort()).toEqual(delPush.sort())
  })

  it('coincide con contenidoAvisoPatrocinado (la fuente única que comparten los dos caminos)', async () => {
    const e = montar()
    await enviarmePruebaCampania(campania())
    const contenido = contenidoAvisoPatrocinado({
      titulo: 'Entradas 2x1 esta semana',
      cuerpo: 'Llevá a un amigo gratis en la función de las 22hs.',
      eventId: EVENTO_ID,
    })
    expect(contenido).not.toBeNull()
    for (const m of e.expo.mensajes()) {
      expect(m).toMatchObject({ title: contenido!.title, body: contenido!.body, categoryId: contenido!.categoryId, data: contenido!.data })
    }
  })
})
