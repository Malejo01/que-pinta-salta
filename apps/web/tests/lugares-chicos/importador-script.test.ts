// R-1 · El importador de OpenStreetMap (`scripts/importar-lugares-chicos.ts`,
// Q5-1) corrido de verdad: importarlo corre `main()`. Overpass (fetch), la
// caché en disco y Supabase son dobles: sin red, sin base y sin escribir
// `ops/lugares-chicos/overpass-cache.json`. Antes: la lógica pura del plan
// (osm.test.ts) y un detector que leía en el fuente «escribe solo detrás de
// --aplicar».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Escritura = { tabla: string; fila: Record<string, unknown> }

const estado = vi.hoisted(() => ({
  venues: [] as Record<string, unknown>[],
  fichas: [] as Record<string, unknown>[],
  escrituras: [] as Escritura[],
  errorAlCrearVenue: null as unknown,
  cache: null as string | null,
  cacheEscrita: null as string | null,
  clientes: 0,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    estado.clientes++
    return {
      from(tabla: string) {
        let pagina = 0
        let fila: Record<string, unknown> | null = null
        const b: Record<string, unknown> = {
          select: () => b,
          is: () => b,
          eq: () => b,
          order: () => b,
          range: (d: number) => ((pagina = d), b),
          insert: (f: Record<string, unknown>) => {
            fila = f
            estado.escrituras.push({ tabla, fila: f })
            return b
          },
          single: async () =>
            estado.errorAlCrearVenue && tabla === 'venues' ? { data: null, error: estado.errorAlCrearVenue } : { data: { id: `nuevo-${String(fila?.name)}` }, error: null },
          then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
            if (fila) return Promise.resolve({ error: null }).then(res, rej)
            const filas = pagina !== 0 ? [] : tabla === 'venues' ? estado.venues : estado.fichas
            return Promise.resolve({ data: filas, error: null }).then(res, rej)
          },
        }
        return b
      },
    }
  },
}))
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  const esCache = (r: unknown) => typeof r === 'string' && r.endsWith('overpass-cache.json')
  return {
    ...real,
    readFileSync: (ruta: unknown, ...resto: unknown[]) => {
      if (typeof ruta === 'string' && /[/\\]\.env(\.local)?$/.test(ruta)) throw new Error('ENOENT')
      if (esCache(ruta)) {
        if (estado.cache === null) throw new Error('ENOENT')
        return estado.cache
      }
      return (real.readFileSync as (...a: unknown[]) => unknown)(ruta, ...resto)
    },
    writeFileSync: (ruta: unknown, datos: unknown) => {
      if (!esCache(ruta)) throw new Error('el importador solo escribe su caché')
      estado.cacheEscrita = String(datos)
    },
    mkdirSync: () => undefined,
  }
})

import { USER_AGENT_OVERPASS, consultaOverpass } from '@/lib/lugares-chicos/osm'

const OVERPASS = {
  elements: [
    { type: 'node', id: 1, lat: -24.789, lon: -65.411, tags: { name: 'Plaza de los Juegos', leisure: 'playground' } },
    { type: 'way', id: 2, center: { lat: -24.78, lon: -65.42 }, tags: { name: 'Pelotero Feliz', leisure: 'indoor_play' } },
    { type: 'node', id: 3, lat: -24.79, lon: -65.4, tags: { name: 'Museo Viejo', tourism: 'museum' } },
    { type: 'node', id: 4, lat: -24.79, lon: -65.4, tags: { leisure: 'playground' } }, // sin nombre: afuera
  ],
}

let logs: string[]
let errores: string[]
let salida: { mock: { calls: unknown[][] } }
let fetchDoble: ReturnType<typeof vi.fn>
const ARGV = process.argv

async function correr(args: string[]) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
  process.argv = ['node', 'scripts/importar-lugares-chicos.ts', ...args]
  vi.resetModules()
  await import('@/scripts/importar-lugares-chicos')
  await vi.waitFor(() => {
    if (!(salida.mock.calls.length > 0 || logs.some((l) => /modo consulta|borradores creados/.test(l)))) throw new Error('corre')
  })
}

beforeEach(() => {
  estado.venues = [{ id: 'v-museo', name: 'Museo Viejo', latitude: -24.79, longitude: -65.4 }]
  estado.fichas = [{ venue_id: 'v-otro', osm_ref: 'way/2' }] // el pelotero ya se importó antes
  estado.escrituras = []
  estado.errorAlCrearVenue = null
  estado.cache = null
  estado.cacheEscrita = null
  estado.clientes = 0
  logs = []
  errores = []
  fetchDoble = vi.fn(async () => new Response(JSON.stringify(OVERPASS), { status: 200 }))
  vi.stubGlobal('fetch', fetchDoble)
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')))
  vi.spyOn(console, 'table').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errores.push(a.map(String).join(' ')))
  salida = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  process.argv = ARGV
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

describe('scripts/importar-lugares-chicos.ts', () => {
  it('sin --aplicar: un pedido a Overpass con su User-Agent, el plan, y NINGUNA escritura en la base', async () => {
    await correr([])
    expect(salida).not.toHaveBeenCalled()
    expect(fetchDoble).toHaveBeenCalledTimes(1)
    const [url, init] = fetchDoble.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/overpass/)
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(USER_AGENT_OVERPASS)
    expect(estado.escrituras).toEqual([])
    expect(logs.find((l) => l.includes('candidatos'))).toBe('[importar-lugares-chicos] 3 candidatos con nombre en Capital (1 descartados)')
    expect(logs.find((l) => l.includes('resumen'))).toContain('{"ya_importado":1,"ya_tiene_ficha":0,"usar_venue":1,"crear_venue":1}')
    // La respuesta queda en la caché (doble: no toca el disco).
    expect(JSON.parse(estado.cacheEscrita!).consulta).toBe(consultaOverpass())
  })

  it('con una caché fresca, no le pide nada a Overpass', async () => {
    estado.cache = JSON.stringify({ guardadoEn: new Date().toISOString(), consulta: consultaOverpass(), datos: OVERPASS })
    await correr([])
    expect(fetchDoble).not.toHaveBeenCalled()
    expect(logs.some((l) => l.includes('uso la caché'))).toBe(true)
  })

  it('--sin-cache: pide aunque haya caché', async () => {
    estado.cache = JSON.stringify({ guardadoEn: new Date().toISOString(), consulta: consultaOverpass(), datos: OVERPASS })
    await correr(['--sin-cache'])
    expect(fetchDoble).toHaveBeenCalledTimes(1)
  })

  it('--aplicar: crea el venue que falta y las fichas como BORRADOR de OpenStreetMap (nunca publicadas); lo ya importado no se repite', async () => {
    await correr(['--aplicar'])
    expect(estado.escrituras.map((e) => e.tabla)).toEqual(['venues', 'lugares_permanentes', 'lugares_permanentes'])
    expect(estado.escrituras[0]!.fila).toEqual({ name: 'Plaza de los Juegos', address: expect.any(String), slug: 'plaza-de-los-juegos', latitude: -24.789, longitude: -65.411 })
    const [plaza, museo] = estado.escrituras.slice(1).map((e) => e.fila)
    expect(plaza).toEqual({
      venue_id: 'nuevo-Plaza de los Juegos',
      tipo: 'plaza_juegos',
      estado: 'borrador',
      fuente: 'openstreetmap',
      fuente_detalle: 'https://www.openstreetmap.org/node/1',
      osm_ref: 'node/1',
      acceso: 'gratis',
      horarios: { version: 1, siempre_abierto: true, semana: {} },
    })
    expect(museo).toMatchObject({ venue_id: 'v-museo', tipo: 'espacio_cultural_infantil', estado: 'borrador', acceso: 'consultar', osm_ref: 'node/3' })
    expect(estado.escrituras.every((e) => e.fila.estado !== 'publicado')).toBe(true)
    expect(logs.at(-1)).toBe('[importar-lugares-chicos] 2 borradores creados, 0 errores. Verificalos en /admin/lugares-chicos.')
  })

  it('--aplicar con un venue que no se puede crear: lo cuenta como error (con el código) y sigue con los demás', async () => {
    estado.errorAlCrearVenue = { code: '23505', message: 'duplicate key' }
    await correr(['--aplicar'])
    expect(estado.escrituras.filter((e) => e.tabla === 'lugares_permanentes')).toHaveLength(1)
    expect(errores).toContain('[importar-lugares-chicos] no se pudo crear el venue node/1 23505')
    expect(logs.at(-1)).toContain('1 borradores creados, 1 errores')
  })

  it('Overpass responde error: sale con 1 y no escribe', async () => {
    fetchDoble.mockResolvedValue(new Response('busy', { status: 429 }))
    await correr(['--aplicar'])
    expect(salida).toHaveBeenCalledWith(1)
    expect(errores).toContain('[importar-lugares-chicos] falló: Overpass respondió 429')
    expect(estado.escrituras).toEqual([])
    expect(estado.cacheEscrita).toBeNull()
  })
})
