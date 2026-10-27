// QPS-262 (decisión de Mauro, 18/10, opción 1): la caché de Favoritos guarda
// `{ voy, eventos }` (antes, el array pelado de eventos) para que sin
// conexión se vea igual que con red. Cubre `cargarFavoritosConCache`,
// `leerFavoritosGuardados`, `datosDeCacheFavoritos`,
// `recortarFavoritosParaCache` (lib/sin-conexion/favoritos.ts) y un detector
// estático sobre `app/(tabs)/favoritos.tsx`. Almacén en memoria, `ahora` fija,
// fixtures inventados, sin red ni base.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mismo motivo que en tests/favoritos-cache.test.ts: `@/lib/favoritos` importa
// `@/lib/supabase` -> `react-native`, que no se puede parsear en Vitest.
vi.mock('@/lib/supabase', () => ({ supabase: null }))

import type { DisplayEvent } from '@qps/core/home/types'
import type { Almacen } from '../lib/sin-conexion/almacen'
import {
  CLAVE_FAVORITOS,
  guardarCache,
  reiniciarBanderaDeLimpieza,
  TOPE_ITEMS_FAVORITOS,
  VERSION_CACHE,
} from '../lib/sin-conexion/cache'
import {
  cargarFavoritosConCache,
  datosDeCacheFavoritos,
  leerFavoritosGuardados,
  recortarFavoritosParaCache,
} from '../lib/sin-conexion/favoritos'

function crearAlmacenEnMemoria(): Almacen & { mapa: Map<string, string> } {
  const mapa = new Map<string, string>()
  return {
    mapa,
    leer: async (clave) => (mapa.has(clave) ? (mapa.get(clave) as string) : null),
    escribir: async (clave, valor) => {
      mapa.set(clave, valor)
    },
    borrar: async (clave) => {
      mapa.delete(clave)
    },
    claves: async () => [...mapa.keys()],
    borrarVarias: async (claves) => {
      for (const clave of claves) mapa.delete(clave)
    },
  }
}

const USER_ID_UUID_INVENTADO = '11111111-2222-3333-4444-555555555555'
const AHORA = new Date('2026-10-17T12:00:00-03:00')
const RAZON = 'No pudimos cargar tus favoritos.'

function crearEvento(id: string, over: Partial<DisplayEvent> = {}): DisplayEvent {
  return {
    id,
    slug: id,
    title: `Evento de Prueba ${id}`,
    venue: 'Lugar de Prueba',
    date: '2026-10-20',
    time: '21:00',
    category: 'teatro',
    categoryName: 'Teatro',
    price: 'gratis',
    image: 'https://example.com/imagen.jpg',
    description: 'Una descripción de prueba.',
    address: 'Calle Falsa 123',
    startDateTime: '2026-10-20T21:00:00-03:00',
    isFeatured: false,
    ...over,
  }
}

function lista(prefijo: string, cantidad: number): DisplayEvent[] {
  return Array.from({ length: cantidad }, (_, i) => crearEvento(`${prefijo}-${i}`))
}

function escribirSobreCrudo(almacen: Almacen, guardadoEn: Date, datos: unknown): Promise<void> {
  return almacen.escribir(CLAVE_FAVORITOS, JSON.stringify({ v: VERSION_CACHE, guardadoEn: guardadoEn.toISOString(), datos }))
}

const sinConexion = async () => ({ ok: false as const, error: RAZON, sinConexion: true as const })

beforeEach(() => {
  reiniciarBanderaDeLimpieza()
})

describe('QPS-262 (a): una carga buena guarda { voy, eventos } y una carga por red devuelve las dos listas', () => {
  it('lo guardado es el objeto { voy, eventos } (no el array pelado)', async () => {
    const almacen = crearAlmacenEnMemoria()
    const voy = [crearEvento('voy-1')]
    const eventos = [crearEvento('guardado-1'), crearEvento('guardado-2')]

    await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
      obtener: async () => ({ ok: true, voy, eventos }),
      ahora: AHORA,
      almacen,
    })

    const sobre = JSON.parse(almacen.mapa.get(CLAVE_FAVORITOS) as string)
    expect(Array.isArray(sobre.datos)).toBe(false)
    expect(sobre.datos.voy.map((e: DisplayEvent) => e.id)).toEqual(['voy-1'])
    expect(sobre.datos.eventos.map((e: DisplayEvent) => e.id)).toEqual(['guardado-1', 'guardado-2'])
  })

  it('después, sin red: devuelve las dos listas iguales, con desdeCache', async () => {
    const almacen = crearAlmacenEnMemoria()
    const voy = [crearEvento('voy-1'), crearEvento('voy-2')]
    const eventos = [crearEvento('guardado-1')]
    await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
      obtener: async () => ({ ok: true, voy, eventos }),
      ahora: AHORA,
      almacen,
    })

    const despues = new Date('2026-10-17T18:00:00-03:00')
    const resultado = await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, { obtener: sinConexion, ahora: despues, almacen })

    expect(resultado).toEqual({ tipo: 'ok', voy, eventos, desdeCache: { guardadoEn: AHORA } })
  })

  it('paraMostrarFavoritos se aplica a las dos listas: un Voy pasado y un Guardado pasado se caen', async () => {
    const almacen = crearAlmacenEnMemoria()
    const voyVigente = crearEvento('voy-vigente', { date: '2026-10-20' })
    const voyPasado = crearEvento('voy-pasado', { date: '2026-10-18' })
    const guardadoVigente = crearEvento('guardado-vigente', { date: '2026-10-21' })
    const guardadoPasado = crearEvento('guardado-pasado', { date: '2026-10-18' })
    await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
      obtener: async () => ({ ok: true, voy: [voyPasado, voyVigente], eventos: [guardadoPasado, guardadoVigente] }),
      ahora: AHORA,
      almacen,
    })

    const dosDiasDespues = new Date('2026-10-19T12:00:00-03:00')
    const resultado = await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
      obtener: sinConexion,
      ahora: dosDiasDespues,
      almacen,
    })
    if (resultado.tipo !== 'ok') throw new Error('debería salir ok desde la caché')
    expect(resultado.voy.map((e) => e.id)).toEqual(['voy-vigente'])
    expect(resultado.eventos.map((e) => e.id)).toEqual(['guardado-vigente'])

    const leido = await leerFavoritosGuardados({ ahora: dosDiasDespues, almacen })
    expect(leido?.voy.map((e) => e.id)).toEqual(['voy-vigente'])
    expect(leido?.eventos.map((e) => e.id)).toEqual(['guardado-vigente'])
  })

  it('leerFavoritosGuardados devuelve voy y eventos de una caché nueva', async () => {
    const almacen = crearAlmacenEnMemoria()
    const voy = [crearEvento('voy-1')]
    const eventos = [crearEvento('guardado-1')]
    await guardarCache(CLAVE_FAVORITOS, { voy, eventos }, { ahora: AHORA, almacen })

    expect(await leerFavoritosGuardados({ ahora: AHORA, almacen })).toEqual({ guardadoEn: AHORA, voy, eventos })
  })
})

describe('QPS-262 (b): una caché vieja con el array pelado se lee con voy: []', () => {
  it('cargarFavoritosConCache (falla por red)', async () => {
    const almacen = crearAlmacenEnMemoria()
    const eventos = [crearEvento('viejo-1'), crearEvento('viejo-2')]
    await escribirSobreCrudo(almacen, AHORA, eventos)

    const resultado = await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, { obtener: sinConexion, ahora: AHORA, almacen })

    expect(resultado).toEqual({ tipo: 'ok', voy: [], eventos, desdeCache: { guardadoEn: AHORA } })
  })

  it('leerFavoritosGuardados', async () => {
    const almacen = crearAlmacenEnMemoria()
    const eventos = [crearEvento('viejo-1')]
    await escribirSobreCrudo(almacen, AHORA, eventos)

    expect(await leerFavoritosGuardados({ ahora: AHORA, almacen })).toEqual({ guardadoEn: AHORA, voy: [], eventos })
  })

  it('datosDeCacheFavoritos: array -> { voy: [], eventos: <ese array> }; array vacío también', () => {
    const eventos = [crearEvento('viejo-1')]
    expect(datosDeCacheFavoritos(eventos)).toEqual({ voy: [], eventos })
    expect(datosDeCacheFavoritos([])).toEqual({ voy: [], eventos: [] })
  })
})

describe('QPS-262 (c): una caché con forma inválida se trata como "no hay caché"', () => {
  const invalidas: Array<[string, unknown]> = [
    ["{ voy: 'x' }", { voy: 'x' }],
    ["{ voy: 'x', eventos: [] }", { voy: 'x', eventos: [] }],
    ['{ voy: [] } (sin eventos)', { voy: [] }],
    ['{ eventos: [] } (sin voy)', { eventos: [] }],
    ['{}', {}],
    ['un número', 42],
    ['un string', 'texto'],
    ['null', null],
    ['voy con un ítem null', { voy: [null], eventos: [] }],
    ['eventos con un ítem null', { voy: [], eventos: [null] }],
  ]

  it.each(invalidas)('cargarFavoritosConCache con %s: da el error de siempre', async (_nombre, datos) => {
    const almacen = crearAlmacenEnMemoria()
    await escribirSobreCrudo(almacen, AHORA, datos)

    const resultado = await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, { obtener: sinConexion, ahora: AHORA, almacen })

    // A6 (nube Q1), a propósito: falló por red y no había nada guardado que sirviera → `sinConexion: true` en la rama de error.
    expect(resultado).toEqual({ tipo: 'error', error: RAZON, sinConexion: true })
  })

  it.each(invalidas)('leerFavoritosGuardados con %s: da null, no tira', async (_nombre, datos) => {
    const almacen = crearAlmacenEnMemoria()
    await escribirSobreCrudo(almacen, AHORA, datos)

    expect(await leerFavoritosGuardados({ ahora: AHORA, almacen })).toBeNull()
  })

  it.each(invalidas.filter(([, d]) => !Array.isArray((d as { voy?: unknown } | null)?.voy) || !Array.isArray((d as { eventos?: unknown }).eventos)))(
    'datosDeCacheFavoritos con %s: tira',
    (_nombre, datos) => {
      expect(() => datosDeCacheFavoritos(datos)).toThrow()
    },
  )
})

describe('QPS-262 (d): recortarFavoritosParaCache', () => {
  it('con menos ítems que el tope, devuelve las dos listas tal cual y en su orden', () => {
    const voy = lista('voy', 3)
    const eventos = lista('guardado', 4)
    expect(recortarFavoritosParaCache(voy, eventos)).toEqual({ voy, eventos })
  })

  it('con más ítems que el tope, salen los últimos Guardados antes que un Voy, y el orden se mantiene', () => {
    const voy = lista('voy', 150)
    const eventos = lista('guardado', 100) // 250 en total, tope 200
    const r = recortarFavoritosParaCache(voy, eventos)
    if (r === null) throw new Error('no debería dar null')

    expect(r.voy.length + r.eventos.length).toBe(TOPE_ITEMS_FAVORITOS)
    expect(r.voy.map((e) => e.id)).toEqual(voy.map((e) => e.id)) // ningún Voy se sacó
    expect(r.eventos.map((e) => e.id)).toEqual(eventos.slice(0, TOPE_ITEMS_FAVORITOS - 150).map((e) => e.id))
  })

  it('si los Voy solos pasan el tope, quedan los primeros Voy y ningún Guardado', () => {
    const voy = lista('voy', TOPE_ITEMS_FAVORITOS + 10)
    const eventos = lista('guardado', 5)
    const r = recortarFavoritosParaCache(voy, eventos)
    if (r === null) throw new Error('no debería dar null')

    expect(r.eventos).toEqual([])
    expect(r.voy.map((e) => e.id)).toEqual(voy.slice(0, TOPE_ITEMS_FAVORITOS).map((e) => e.id))
  })

  it('sin Voy, recorta los Guardados al tope como antes', () => {
    const eventos = lista('guardado', TOPE_ITEMS_FAVORITOS + 5)
    const r = recortarFavoritosParaCache([], eventos)
    expect(r?.voy).toEqual([])
    expect(r?.eventos.map((e) => e.id)).toEqual(eventos.slice(0, TOPE_ITEMS_FAVORITOS).map((e) => e.id))
  })

  it('dos listas vacías: { voy: [], eventos: [] } (sirve para sobrescribir la caché)', () => {
    expect(recortarFavoritosParaCache([], [])).toEqual({ voy: [], eventos: [] })
  })

  it('una carga buena con más del tope guarda las dos listas recortadas', async () => {
    const almacen = crearAlmacenEnMemoria()
    const voy = lista('voy', 150)
    const eventos = lista('guardado', 100)
    await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
      obtener: async () => ({ ok: true, voy, eventos }),
      ahora: AHORA,
      almacen,
    })

    const leido = await leerFavoritosGuardados({ ahora: AHORA, almacen })
    expect(leido?.voy).toHaveLength(150)
    expect(leido?.eventos).toHaveLength(TOPE_ITEMS_FAVORITOS - 150)
  })
})

describe('QPS-262 (e): app/(tabs)/favoritos.tsx, los dos caminos sin sesión pasan voy: cache.voy (detector estático)', () => {
  const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
  const contenido = readFileSync(join(MOBILE_ROOT, 'app', '(tabs)', 'favoritos.tsx'), 'utf8')
  const SIN_SESION = /\{\s*tipo:\s*'ok',\s*voy:\s*cache\.voy,\s*eventos:\s*cache\.eventos,\s*desdeCache:\s*\{\s*guardadoEn:\s*cache\.guardadoEn\s*\}\s*\}/g

  it('hay exactamente dos llamadas a leerFavoritosGuardados() (el useFocusEffect y refrescar)', () => {
    expect(contenido.match(/await leerFavoritosGuardados\(\)/g)?.length).toBe(2)
  })

  it('cada una arma el estado ok con voy: cache.voy, eventos: cache.eventos y el guardadoEn de la caché', () => {
    expect(contenido.match(SIN_SESION)?.length).toBe(2)
  })

  it('ninguna arma un estado ok desde la caché sin voy (no queda "eventos: cache.eventos" sin "voy: cache.voy" antes)', () => {
    const conEventos = contenido.match(/eventos:\s*cache\.eventos/g)?.length ?? 0
    const conVoy = contenido.match(/voy:\s*cache\.voy,\s*eventos:\s*cache\.eventos/g)?.length ?? 0
    expect(conEventos).toBe(2)
    expect(conVoy).toBe(2)
  })

  it('el camino con sesión pasa voy: resultado.voy', () => {
    expect(contenido).toMatch(/voy:\s*resultado\.voy,\s*eventos:\s*resultado\.eventos/)
  })
})
