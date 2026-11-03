/**
 * Q5-16 (decisión nº7): `confirmarSugerenciaUbicacion` y
 * `descartarSugerenciaUbicacion` de `lib/admin/lugares-actions.ts`. Mismo
 * patrón que `tests/admin/lugares.test.ts` (sin red ni base:
 * `@/lib/supabase/server` y `next/cache` mockeados), pero con un doble de
 * `venues` en memoria que aplica los filtros DE VERDAD (`.eq`, `.or`, `.not`,
 * `.is`), para que «nunca pisa una ubicación a mano» no dependa solo de leer
 * el código.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
const revalidatePath = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

import { confirmarSugerenciaUbicacion, descartarSugerenciaUbicacion, guardarUbicacionManual } from '@/lib/admin/lugares-actions'

const VENUE_ID = '11111111-1111-4111-8111-111111111111'

type Fila = Record<string, unknown> & { id: string }

function filaConSugerencia(overrides: Partial<Fila> = {}): Fila {
  return {
    id: VENUE_ID,
    latitude: null,
    longitude: null,
    geocode_source: null,
    geocoded_at: null,
    geocode_intentado_at: '2026-10-01T09:30:00.000Z',
    geocode_sugerencia_lat: -24.7883,
    geocode_sugerencia_lng: -65.4106,
    geocode_sugerencia_texto: 'Balcarce 123, Salta, Argentina',
    geocode_sugerencia_at: '2026-11-02T09:30:00.000Z',
    ...overrides,
  }
}

/** Una condición de `.or('col.op.val,…')`. */
function condicionOr(texto: string): (fila: Fila) => boolean {
  const [columna, operador, valor] = texto.split('.')
  return (fila) => {
    if (operador === 'is' && valor === 'null') return fila[columna] === null
    if (operador === 'eq') return fila[columna] === valor
    throw new Error(`operador de OR no soportado en el doble: "${operador}"`)
  }
}

/**
 * Doble de `venues` con filtros reales. `select(...).eq().maybeSingle()` lee;
 * `update(v).eq()/.or()/.not()/.is()…select('id')` escribe solo en las filas
 * que pasan todos los filtros. `intercalar` corre justo antes de aplicar un
 * update (para simular una carrera).
 */
function crearTabla(filasIniciales: Fila[], opciones: { errorUpdate?: { code: string; message: string } } = {}) {
  const filas = filasIniciales.map((f) => ({ ...f }))
  const updates: Array<Record<string, unknown>> = []
  const filtrosDelUpdate: string[] = []
  const estado = { intercalar: null as null | (() => void) }

  function filtros() {
    const condiciones: Array<(fila: Fila) => boolean> = []
    const api = {
      eq(columna: string, valor: unknown) {
        filtrosDelUpdate.push(`eq:${columna}`)
        condiciones.push((f) => f[columna] === valor)
        return api
      },
      is(columna: string, valor: null) {
        filtrosDelUpdate.push(`is:${columna}`)
        condiciones.push((f) => f[columna] === valor)
        return api
      },
      not(columna: string, operador: string, valor: null) {
        if (operador !== 'is' || valor !== null) throw new Error('el doble solo soporta .not(col, "is", null)')
        filtrosDelUpdate.push(`not:${columna}`)
        condiciones.push((f) => f[columna] !== null)
        return api
      },
      or(clausula: string) {
        filtrosDelUpdate.push(`or:${clausula}`)
        const partes = clausula.split(',').map(condicionOr)
        condiciones.push((f) => partes.some((p) => p(f)))
        return api
      },
      coinciden: () => filas.filter((f) => condiciones.every((c) => c(f))),
    }
    return api
  }

  return {
    filas,
    updates,
    filtrosDelUpdate,
    estado,
    desde: {
      select(columnas: string) {
        if (!columnas.includes('geocode_sugerencia_lat')) throw new Error(`lectura inesperada de venues: "${columnas}"`)
        const f = filtros()
        const builder = {
          eq(columna: string, valor: unknown) {
            f.eq(columna, valor)
            filtrosDelUpdate.pop() // la lectura no cuenta como filtro del update
            return builder
          },
          async maybeSingle() {
            const [fila] = f.coinciden()
            return { data: fila ? { ...fila } : null, error: null }
          },
        }
        return builder
      },
      update(valores: Record<string, unknown>) {
        updates.push(valores)
        const f = filtros()
        const builder = {
          eq: (c: string, v: unknown) => (f.eq(c, v), builder),
          is: (c: string, v: null) => (f.is(c, v), builder),
          not: (c: string, o: string, v: null) => (f.not(c, o, v), builder),
          or: (cl: string) => (f.or(cl), builder),
          async select(columnas: string) {
            if (columnas !== 'id') throw new Error(`select inesperado tras el update: "${columnas}"`)
            if (opciones.errorUpdate) return { data: null, error: opciones.errorUpdate }
            estado.intercalar?.()
            const coinciden = f.coinciden()
            for (const fila of coinciden) Object.assign(fila, valores)
            return { data: coinciden.map((x) => ({ id: x.id })), error: null }
          },
        }
        return builder
      },
    },
  }
}

function clienteCon(tabla: ReturnType<typeof crearTabla>, rol: string | null = 'ADMIN') {
  const from = vi.fn((nombre: string) => {
    if (nombre === 'profiles') {
      return { select: () => ({ eq: () => ({ single: async () => ({ data: rol ? { role: rol } : null, error: null }) }) }) }
    }
    if (nombre === 'venues') return tabla.desde
    throw new Error(`tabla inesperada: "${nombre}"`)
  })
  return { auth: { getUser: async () => ({ data: { user: { id: 'persona-1' } }, error: null }) }, from }
}

function clienteSinSesion() {
  const from = vi.fn((nombre: string) => {
    throw new Error(`no debería llamar a from("${nombre}") sin sesión`)
  })
  return { cliente: { auth: { getUser: async () => ({ data: { user: null }, error: null }) }, from }, from }
}

beforeEach(() => {
  createClient.mockReset()
  revalidatePath.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe.each([
  ['confirmarSugerenciaUbicacion', confirmarSugerenciaUbicacion],
  ['descartarSugerenciaUbicacion', descartarSugerenciaUbicacion],
] as const)('%s: validación y permisos', (_nombre, accion) => {
  it('un id que no es uuid: error, createClient nunca se llama', async () => {
    const resultado = await accion('no-es-un-uuid')
    expect(resultado).toEqual({ ok: false, error: 'El lugar no es válido' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('sin sesión: error, y from() nunca se llama', async () => {
    const { cliente, from } = clienteSinSesion()
    createClient.mockResolvedValue(cliente)
    expect(await accion(VENUE_ID)).toEqual({ ok: false, error: 'No autenticado' })
    expect(from).not.toHaveBeenCalled()
  })

  it('con sesión que no es ADMIN: error, y la fila no cambia', async () => {
    const tabla = crearTabla([filaConSugerencia()])
    createClient.mockResolvedValue(clienteCon(tabla, 'USER'))
    expect(await accion(VENUE_ID)).toEqual({ ok: false, error: 'No tienes permisos de administrador' })
    expect(tabla.updates).toHaveLength(0)
    expect(tabla.filas[0]).toEqual(filaConSugerencia())
  })
})

describe('confirmarSugerenciaUbicacion: admin', () => {
  it('copia la sugerencia a latitude/longitude, geocode_source "nominatim", geocoded_at ahora, y limpia la sugerencia', async () => {
    const tabla = crearTabla([filaConSugerencia()])
    createClient.mockResolvedValue(clienteCon(tabla))

    const resultado = await confirmarSugerenciaUbicacion(VENUE_ID)

    expect(resultado).toEqual({ ok: true })
    expect(tabla.updates).toHaveLength(1)
    const fila = tabla.filas[0]
    expect(fila.latitude).toBe(-24.7883)
    expect(fila.longitude).toBe(-65.4106)
    expect(fila.geocode_source).toBe('nominatim')
    expect(typeof fila.geocoded_at).toBe('string')
    expect(Number.isNaN(Date.parse(fila.geocoded_at as string))).toBe(false)
    expect(fila.geocode_sugerencia_lat).toBeNull()
    expect(fila.geocode_sugerencia_lng).toBeNull()
    expect(fila.geocode_sugerencia_texto).toBeNull()
    expect(fila.geocode_sugerencia_at).toBeNull()
    // El intento queda como estaba (no es asunto de esta acción).
    expect(fila.geocode_intentado_at).toBe('2026-10-01T09:30:00.000Z')
    expect(tabla.filtrosDelUpdate).toContain('eq:id')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/lugares')
  })

  it('nunca pisa una ubicación cargada a mano: error claro y la fila no cambia', async () => {
    const manual = filaConSugerencia({ latitude: -24.9, longitude: -65.5, geocode_source: 'manual' })
    const tabla = crearTabla([manual])
    createClient.mockResolvedValue(clienteCon(tabla))

    const resultado = await confirmarSugerenciaUbicacion(VENUE_ID)

    expect(resultado.ok).toBe(false)
    expect(tabla.updates).toHaveLength(0)
    expect(tabla.filas[0]).toEqual(manual)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('carrera: si la cargan a mano entre la lectura y el update, el filtro del update la protege', async () => {
    const tabla = crearTabla([filaConSugerencia()])
    tabla.estado.intercalar = () => {
      Object.assign(tabla.filas[0], { latitude: -24.9, longitude: -65.5, geocode_source: 'manual' })
    }
    createClient.mockResolvedValue(clienteCon(tabla))

    const resultado = await confirmarSugerenciaUbicacion(VENUE_ID)

    expect(resultado.ok).toBe(false)
    expect(tabla.filas[0]).toMatchObject({ latitude: -24.9, longitude: -65.5, geocode_source: 'manual' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('sin sugerencia pendiente: error y ninguna escritura', async () => {
    const tabla = crearTabla([
      filaConSugerencia({
        geocode_sugerencia_lat: null,
        geocode_sugerencia_lng: null,
        geocode_sugerencia_texto: null,
        geocode_sugerencia_at: null,
      }),
    ])
    createClient.mockResolvedValue(clienteCon(tabla))

    const resultado = await confirmarSugerenciaUbicacion(VENUE_ID)

    expect(resultado).toEqual({ ok: false, error: 'Este lugar ya no tiene una ubicación sugerida' })
    expect(tabla.updates).toHaveLength(0)
  })

  it('un lugar que no existe: "No se encontró el lugar"', async () => {
    const tabla = crearTabla([])
    createClient.mockResolvedValue(clienteCon(tabla))
    expect(await confirmarSugerenciaUbicacion(VENUE_ID)).toEqual({ ok: false, error: 'No se encontró el lugar' })
  })

  it('un error de la base: mensaje genérico, nunca el message crudo', async () => {
    const tabla = crearTabla([filaConSugerencia()], { errorUpdate: { code: '42501', message: 'detalle interno sensible' } })
    createClient.mockResolvedValue(clienteCon(tabla))

    const resultado = await confirmarSugerenciaUbicacion(VENUE_ID)

    expect(resultado).toEqual({ ok: false, error: 'No se pudo confirmar la ubicación. Intentá de nuevo' })
    expect(JSON.stringify(resultado)).not.toContain('detalle interno sensible')
  })
})

describe('descartarSugerenciaUbicacion: admin', () => {
  it('pone en null solo las cuatro columnas de la sugerencia (ni coordenadas ni el intento)', async () => {
    const tabla = crearTabla([filaConSugerencia()])
    createClient.mockResolvedValue(clienteCon(tabla))

    const resultado = await descartarSugerenciaUbicacion(VENUE_ID)

    expect(resultado).toEqual({ ok: true })
    expect(tabla.updates).toEqual([
      {
        geocode_sugerencia_lat: null,
        geocode_sugerencia_lng: null,
        geocode_sugerencia_texto: null,
        geocode_sugerencia_at: null,
      },
    ])
    expect(tabla.filas[0]).toMatchObject({
      latitude: null,
      longitude: null,
      geocode_source: null,
      // Vuelve a la regla de los 30 días: el intento no se toca.
      geocode_intentado_at: '2026-10-01T09:30:00.000Z',
    })
    expect(tabla.filtrosDelUpdate).toContain('eq:id')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/lugares')
  })

  it('un lugar que no existe: "No se encontró el lugar"', async () => {
    const tabla = crearTabla([])
    createClient.mockResolvedValue(clienteCon(tabla))
    expect(await descartarSugerenciaUbicacion(VENUE_ID)).toEqual({ ok: false, error: 'No se encontró el lugar' })
  })

  it('un error de la base: mensaje genérico, nunca el message crudo', async () => {
    const tabla = crearTabla([filaConSugerencia()], { errorUpdate: { code: '42501', message: 'detalle interno sensible' } })
    createClient.mockResolvedValue(clienteCon(tabla))

    const resultado = await descartarSugerenciaUbicacion(VENUE_ID)

    expect(resultado).toEqual({ ok: false, error: 'No se pudo descartar la sugerencia. Intentá de nuevo' })
    expect(JSON.stringify(resultado)).not.toContain('detalle interno sensible')
  })
})

describe('guardarUbicacionManual limpia la sugerencia (Q5-16)', () => {
  it('cargada a mano, la sugerencia pendiente queda en null', async () => {
    const tabla = crearTabla([filaConSugerencia()])
    createClient.mockResolvedValue(clienteCon(tabla))

    const resultado = await guardarUbicacionManual(VENUE_ID, '-24.79, -65.42')

    expect(resultado.ok).toBe(true)
    expect(tabla.filas[0]).toMatchObject({
      latitude: -24.79,
      longitude: -65.42,
      geocode_source: 'manual',
      geocode_sugerencia_lat: null,
      geocode_sugerencia_lng: null,
      geocode_sugerencia_texto: null,
      geocode_sugerencia_at: null,
    })
  })
})
