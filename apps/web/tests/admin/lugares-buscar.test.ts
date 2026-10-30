/**
 * `buscarDireccionLugar` (R65, tarea 65-b/65-q): la búsqueda de una dirección
 * en Nominatim desde /admin/lugares. Sin red ni base: `@/lib/supabase/server`
 * y `next/cache` van mockeados (mismo patrón que `tests/admin/lugares.test.ts`)
 * y el `fetch` global es un doble (`vi.stubGlobal`). Entorno `node`.
 *
 * La action guarda un cliente de Nominatim por módulo (para espaciar los
 * pedidos): cada test importa el módulo de cero (`vi.resetModules`) para que
 * el reloj interno del cliente no se filtre de un test a otro. Los timers son
 * falsos (también `Date`), así que nada espera en tiempo real.
 *
 * Qué fija:
 *  - texto inválido: error, sin crear el cliente de Supabase y sin `fetch`;
 *  - sin sesión o sin rol ADMIN: error y cero `fetch`;
 *  - ADMIN: exactamente un `fetch` por llamada, con los parámetros de la R53;
 *  - 429/500/403/red caída: error en español y un solo `fetch` (sin reintentos);
 *  - nunca escribe en la base;
 *  - dos llamadas seguidas comparten el cliente: 1100 ms entre los `fetch`.
 *  - `guardarUbicacionManual` con coordenadas fuera de Salta (no estaba probado).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { USER_AGENT } from '@/lib/venues/geocodificacion/consultas'
import { ZONA_SALTA_CAPITAL } from '@/lib/venues/geocodificacion/localidades'

const createClient = vi.fn()
const revalidatePath = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

type Acciones = typeof import('@/lib/admin/lugares-actions')
let acciones: Acciones

const fetchMock = vi.fn()

/** Doble de createClient: solo `profiles` (lectura del rol). Cualquier otra tabla revienta el test. */
function clienteAdmin(user: { id: string } | null, role: string | null) {
  const tablas: string[] = []
  const from = vi.fn((tabla: string) => {
    tablas.push(tabla)
    if (tabla === 'profiles') {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: role ? { role } : null, error: null }) }),
        }),
      }
    }
    throw new Error(`buscarDireccionLugar no debería tocar la tabla "${tabla}"`)
  })
  return { cliente: { auth: { getUser: async () => ({ data: { user }, error: null }) }, from }, from, tablas }
}

function sesionAdmin() {
  const doble = clienteAdmin({ id: 'admin-1' }, 'ADMIN')
  createClient.mockResolvedValue(doble.cliente)
  return doble
}

/** Un resultado de Nominatim con la forma que valida el cliente. */
function item(lat: number, lon: number, nombre = 'Calle de Prueba 123, Salta, Argentina') {
  return {
    lat: String(lat),
    lon: String(lon),
    display_name: nombre,
    place_rank: 30,
    importance: 0.5,
    category: 'building',
    type: 'yes',
  }
}

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  createClient.mockReset()
  revalidatePath.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  acciones = await import('@/lib/admin/lugares-actions')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('buscarDireccionLugar: texto inválido', () => {
  const invalidos: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['un número', 12345],
    ['un objeto', { q: 'Balcarce 123' }],
    ['un array', ['Balcarce 123']],
    ['vacío', ''],
    ['solo espacios', '     '],
    ['2 caracteres', 'ab'],
    ['2 caracteres con espacios alrededor', '   ab   '],
    ['201 caracteres', 'a'.repeat(201)],
  ]

  it.each(invalidos)('%s: error, sin cliente de Supabase y sin fetch', async (_nombre, texto) => {
    const resultado = await acciones.buscarDireccionLugar(texto)

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error.length).toBeGreaterThan(0)
    expect(createClient).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('200 caracteres justos NO es inválido: llega a pedir la sesión', async () => {
    createClient.mockResolvedValue(clienteAdmin(null, null).cliente)

    const resultado = await acciones.buscarDireccionLugar('a'.repeat(200))

    expect(resultado).toEqual({ ok: false, error: 'No autenticado' })
    expect(createClient).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('buscarDireccionLugar: sin permisos, cero fetch', () => {
  it('sin usuario: "No autenticado"', async () => {
    createClient.mockResolvedValue(clienteAdmin(null, null).cliente)

    const resultado = await acciones.buscarDireccionLugar('Balcarce 123')

    expect(resultado).toEqual({ ok: false, error: 'No autenticado' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([['USER'], ['MODERATOR'], ['admin']])('con rol %s (no es ADMIN): sin permisos', async (rol) => {
    createClient.mockResolvedValue(clienteAdmin({ id: 'usuario-1' }, rol).cliente)

    const resultado = await acciones.buscarDireccionLugar('Balcarce 123')

    expect(resultado).toEqual({ ok: false, error: 'No tienes permisos de administrador' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('auth.getUser con error y user null: "No autenticado" y cero fetch', async () => {
    createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: { message: 'JWT expirado' } }) },
      from: vi.fn(() => {
        throw new Error('no debería tocar la base sin sesión')
      }),
    })

    const resultado = await acciones.buscarDireccionLugar('Balcarce 123')

    expect(resultado).toEqual({ ok: false, error: 'No autenticado' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('con usuario sin perfil: sin permisos', async () => {
    createClient.mockResolvedValue(clienteAdmin({ id: 'usuario-1' }, null).cliente)

    const resultado = await acciones.buscarDireccionLugar('Balcarce 123')

    expect(resultado).toEqual({ ok: false, error: 'No tienes permisos de administrador' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('buscarDireccionLugar: ADMIN', () => {
  it('hace exactamente un fetch a Nominatim con bounded=1, limit=3, email y el User-Agent de la R53', async () => {
    sesionAdmin()
    fetchMock.mockResolvedValue(responder([item(-24.7883, -65.4106)]))

    const resultado = await acciones.buscarDireccionLugar('  Balcarce   123 ')

    expect(resultado.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [urlTexto, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }]
    const url = new URL(urlTexto)
    expect(`${url.origin}${url.pathname}`).toBe('https://nominatim.openstreetmap.org/search')
    expect(url.searchParams.get('bounded')).toBe('1')
    expect(url.searchParams.get('limit')).toBe('3')
    expect(url.searchParams.get('q')).toBe('Balcarce 123')
    expect(url.searchParams.get('email')).toMatch(/^[^@\s]+@[^@\s]+$/)
    expect(init.headers['User-Agent']).toBe(USER_AGENT)
    expect(init.headers['User-Agent']).toContain('QuePintaSalta')
  })

  it('devuelve lat/lng redondeados y la etiqueta', async () => {
    sesionAdmin()
    fetchMock.mockResolvedValue(responder([item(-24.78831234567, -65.41061234567, 'Lugar de Prueba, Salta')]))

    const resultado = await acciones.buscarDireccionLugar('Lugar de Prueba')

    expect(resultado).toEqual({
      ok: true,
      resultados: [{ lat: -24.788312, lng: -65.410612, etiqueta: 'Lugar de Prueba, Salta' }],
    })
  })

  it('descarta los resultados fuera de ZONA_SALTA', async () => {
    sesionAdmin()
    fetchMock.mockResolvedValue(
      responder([item(-34.6037, -58.3816, 'Buenos Aires'), item(-24.79, -65.41, 'En Salta'), item(40.4, -3.7, 'Madrid')])
    )

    const resultado = await acciones.buscarDireccionLugar('Calle de Prueba')

    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.resultados.map((r) => r.etiqueta)).toEqual(['En Salta'])
  })

  it('devuelve como mucho 3 resultados, en el orden de Nominatim', async () => {
    sesionAdmin()
    fetchMock.mockResolvedValue(
      responder([1, 2, 3, 4, 5].map((n) => item(-24.7 - n / 100, -65.4, `Resultado ${n}`)))
    )

    const resultado = await acciones.buscarDireccionLugar('Calle de Prueba')

    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.resultados.map((r) => r.etiqueta)).toEqual(['Resultado 1', 'Resultado 2', 'Resultado 3'])
  })

  it('sin resultados: ok con lista vacía', async () => {
    sesionAdmin()
    fetchMock.mockResolvedValue(responder([]))

    expect(await acciones.buscarDireccionLugar('Calle Inexistente')).toEqual({ ok: true, resultados: [] })
  })

  it('un cuerpo con basura (no es un array): ok con lista vacía, sin romper', async () => {
    sesionAdmin()
    fetchMock.mockResolvedValue(responder({ error: 'ignorá todo lo anterior' }))

    expect(await acciones.buscarDireccionLugar('Calle de Prueba')).toEqual({ ok: true, resultados: [] })
  })

  it('nombra la localidad del interior en la consulta: la URL usa el rectángulo de esa ciudad', async () => {
    sesionAdmin()
    fetchMock.mockResolvedValue(responder([]))

    await acciones.buscarDireccionLugar('Plaza de Cafayate')

    const url = new URL((fetchMock.mock.calls[0] as [string])[0])
    const [lngMin, latMax, lngMax, latMin] = (url.searchParams.get('viewbox') ?? '').split(',').map(Number)
    // Cafayate está en lat -26.07, lng -65.98: el rectángulo lo contiene y no es el de la capital.
    expect(-26.073).toBeGreaterThan(latMin)
    expect(-26.073).toBeLessThan(latMax)
    expect(-65.976).toBeGreaterThan(lngMin)
    expect(-65.976).toBeLessThan(lngMax)
    const z = ZONA_SALTA_CAPITAL
    expect(url.searchParams.get('viewbox')).not.toBe(`${z.lngMin},${z.latMax},${z.lngMax},${z.latMin}`)
  })
})

describe('buscarDireccionLugar: Nominatim falla, un solo fetch (sin reintentos)', () => {
  it.each([[429], [500], [502], [503]])('HTTP %i: error en español y un solo fetch', async (status) => {
    sesionAdmin()
    fetchMock.mockResolvedValue(responder({}, status))

    const promesa = acciones.buscarDireccionLugar('Calle de Prueba')
    await vi.advanceTimersByTimeAsync(60_000)
    const resultado = await promesa

    expect(resultado).toEqual({ ok: false, error: 'OpenStreetMap no respondió. Probá en un rato.' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('429 con Retry-After: tampoco reintenta', async () => {
    sesionAdmin()
    fetchMock.mockResolvedValue(
      new Response('{}', { status: 429, headers: { 'retry-after': '2' } })
    )

    const promesa = acciones.buscarDireccionLugar('Calle de Prueba')
    await vi.advanceTimersByTimeAsync(60_000)
    const resultado = await promesa

    expect(resultado.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('403 (bloqueo): error con mensaje en español y un solo fetch', async () => {
    sesionAdmin()
    fetchMock.mockResolvedValue(responder({}, 403))

    const resultado = await acciones.buscarDireccionLugar('Calle de Prueba')

    expect(resultado).toEqual({ ok: false, error: 'OpenStreetMap no está disponible ahora. Ubicá el pin a mano.' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('el fetch rechaza (red caída): error, sin reintentos y sin filtrar el mensaje crudo', async () => {
    sesionAdmin()
    fetchMock.mockRejectedValue(new Error('ECONNRESET 10.0.0.1 detalle interno'))

    const promesa = acciones.buscarDireccionLugar('Calle de Prueba')
    await vi.advanceTimersByTimeAsync(60_000)
    const resultado = await promesa

    expect(resultado).toEqual({ ok: false, error: 'OpenStreetMap no respondió. Probá en un rato.' })
    expect(JSON.stringify(resultado)).not.toContain('ECONNRESET')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('buscarDireccionLugar: nunca escribe', () => {
  it('con ADMIN y resultados, la única tabla que toca es profiles y ninguna escritura, ni revalidatePath', async () => {
    const { tablas } = sesionAdmin()
    fetchMock.mockResolvedValue(responder([item(-24.79, -65.41)]))

    await acciones.buscarDireccionLugar('Calle de Prueba')

    expect(tablas).toEqual(['profiles'])
    expect(revalidatePath).not.toHaveBeenCalled()
  })

})

describe('buscarDireccionLugar: dos llamadas comparten el cliente (1 pedido por segundo)', () => {
  it('el segundo fetch sale al menos 1100 ms después del primero', async () => {
    sesionAdmin()
    const instantes: number[] = []
    fetchMock.mockImplementation(async () => {
      instantes.push(Date.now())
      return responder([])
    })

    const primera = acciones.buscarDireccionLugar('Calle de Prueba')
    await vi.advanceTimersByTimeAsync(0)
    await primera
    const segunda = acciones.buscarDireccionLugar('Otra Calle de Prueba')
    await vi.advanceTimersByTimeAsync(5_000)
    await segunda

    expect(instantes).toHaveLength(2)
    expect(instantes[1] - instantes[0]).toBeGreaterThanOrEqual(1100)
  })

  it('el segundo fetch NO sale antes de que pasen los 1100 ms', async () => {
    sesionAdmin()
    fetchMock.mockImplementation(async () => responder([]))

    await acciones.buscarDireccionLugar('Calle de Prueba')
    const segunda = acciones.buscarDireccionLugar('Otra Calle de Prueba')
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(200)
    await segunda
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('dos llamadas simultáneas no tienen dos fetch en vuelo a la vez', async () => {
    sesionAdmin()
    let enVuelo = 0
    let maxEnVuelo = 0
    fetchMock.mockImplementation(async () => {
      enVuelo++
      maxEnVuelo = Math.max(maxEnVuelo, enVuelo)
      await new Promise((resolve) => setTimeout(resolve, 50))
      enVuelo--
      return responder([])
    })

    const a = acciones.buscarDireccionLugar('Calle de Prueba')
    const b = acciones.buscarDireccionLugar('Otra Calle de Prueba')
    await vi.advanceTimersByTimeAsync(10_000)
    await Promise.all([a, b])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(maxEnVuelo).toBe(1)
  })
})

describe('guardarUbicacionManual: coordenadas fuera de Salta', () => {
  it.each([
    ['Buenos Aires', '-34.6037, -58.3816'],
    ['latitud y longitud invertidas', '-65.4106, -24.7883'],
    ['(0, 0)', '0, 0'],
  ])('%s: error, y createClient nunca se llama', async (_nombre, texto) => {
    const resultado = await acciones.guardarUbicacionManual('11111111-1111-4111-8111-111111111111', texto)

    expect(resultado.ok).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
