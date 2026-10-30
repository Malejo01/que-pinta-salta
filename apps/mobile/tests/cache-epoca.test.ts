// R43, 43-b2: cierra el bloqueante que encontró seguridad sobre
// `cargarFavoritosConCache` (lib/sin-conexion/favoritos.ts) — una carga de
// favoritos que queda esperando `obtener(userId)` puede volver a escribir
// la caché EN EL DISCO después de que `borrarCacheFavoritos`/
// `borrarTodaLaCache` (lib/sin-conexion/cache.ts) ya decidieron borrarla
// (cierre de sesión, cambio de cuenta o eliminación de cuenta a mitad de la
// petición). El arreglo es una "época" de módulo (`epocaDeCacheFavoritos`),
// que sube como primera cosa que hace cada borrado, ANTES de cualquier
// `await` — eso es lo que hace correcto el arreglo (ver el primer describe).
//
// El camino normal (sin ningún borrado en el medio: una carga buena
// guarda, una falla de red muestra la caché) ya está cubierto en
// `tests/favoritos-cache.test.ts` — no se duplica acá.
//
// Fixtures inventados, sin red ni base: un almacén en memoria propio (mismo
// patrón que `tests/favoritos-cache.test.ts`), nunca AsyncStorage real.
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `lib/sin-conexion/favoritos.ts` importa `@/lib/favoritos`, que importa
// `@/lib/supabase` (AppState de react-native) a nivel de módulo: mismo
// doble que usa `tests/favoritos-cache.test.ts` para poder cargar el
// archivo sin React Native.
vi.mock('@/lib/supabase', () => ({ supabase: null }))

import type { Almacen } from '../lib/sin-conexion/almacen'
import {
  borrarCacheFavoritos,
  borrarTodaLaCache,
  CLAVE_FAVORITOS,
  epocaDeCacheFavoritos,
  guardarCache,
  reiniciarBanderaDeLimpieza,
} from '../lib/sin-conexion/cache'
import { cargarFavoritosConCache } from '../lib/sin-conexion/favoritos'
import type { DisplayEvent } from '@qps/core/home/types'

function crearAlmacenEnMemoria(inicial: Record<string, string> = {}): Almacen & { mapa: Map<string, string> } {
  const mapa = new Map(Object.entries(inicial))
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

/** Un `Almacen.claves()` que no resuelve hasta que el test llama a `resolver()` — para poner en pausa a `borrarCacheFavoritos`/`borrarTodaLaCache` justo en su primer `await`, y poder mirar la época ANTES de que ese `await` termine. */
function crearAlmacenConClavesControladas(): { almacen: Almacen; resolver: () => void } {
  let resolver: () => void = () => {}
  const clavesControladas = new Promise<string[]>((resolve) => {
    resolver = () => resolve([])
  })
  const almacen: Almacen = {
    leer: async () => null,
    escribir: async () => {},
    borrar: async () => {},
    claves: () => clavesControladas,
    borrarVarias: async () => {},
  }
  return { almacen, resolver }
}

const USER_ID_UUID_INVENTADO = '11111111-2222-3333-4444-555555555555'

function crearFavorito(over: Partial<DisplayEvent> = {}): DisplayEvent {
  return {
    id: 'evento-1',
    slug: 'evento-1',
    title: 'Evento de Prueba',
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

const AHORA = new Date('2026-10-17T12:00:00-03:00')

beforeEach(() => {
  reiniciarBanderaDeLimpieza()
})

// ---------------------------------------------------------------------------
// El punto exacto del arreglo: el incremento tiene que pasar ANTES del
// primer `await` de la función (sincrónico, en la misma llamada), no
// después de que el borrado en el almacén termine. Con `claves()` en pausa
// (todavía no resuelta), la época ya tiene que haber subido.
// ---------------------------------------------------------------------------
describe('el incremento de la época pasa antes del await, no al final del borrado', () => {
  it('borrarCacheFavoritos: la época ya subió mientras almacen.claves() todavía no resolvió', async () => {
    const { almacen, resolver } = crearAlmacenConClavesControladas()
    const antes = epocaDeCacheFavoritos()

    const promesaBorrado = borrarCacheFavoritos(almacen)

    // Todavía no se resolvió `claves()`: si el incremento estuviera al
    // final de la función (después del `await`/`try`), acá seguiría en
    // `antes`.
    expect(epocaDeCacheFavoritos()).toBe(antes + 1)

    resolver()
    await promesaBorrado
  })

  it('borrarTodaLaCache: lo mismo, para el camino de eliminar la cuenta', async () => {
    const { almacen, resolver } = crearAlmacenConClavesControladas()
    const antes = epocaDeCacheFavoritos()

    const promesaBorrado = borrarTodaLaCache(almacen)

    expect(epocaDeCacheFavoritos()).toBe(antes + 1)

    resolver()
    await promesaBorrado
  })
})

// ---------------------------------------------------------------------------
// epocaDeCacheFavoritos, de forma directa: ambos borrados la suben, y es
// monótona creciente.
// ---------------------------------------------------------------------------
describe('epocaDeCacheFavoritos', () => {
  it('borrarCacheFavoritos la sube', async () => {
    const almacen = crearAlmacenEnMemoria()
    const antes = epocaDeCacheFavoritos()
    await borrarCacheFavoritos(almacen)
    expect(epocaDeCacheFavoritos()).toBe(antes + 1)
  })

  it('borrarTodaLaCache también la sube (el camino de eliminar la cuenta)', async () => {
    const almacen = crearAlmacenEnMemoria()
    const antes = epocaDeCacheFavoritos()
    await borrarTodaLaCache(almacen)
    expect(epocaDeCacheFavoritos()).toBe(antes + 1)
  })

  it('es monótona creciente: dos borrados seguidos suben dos veces', async () => {
    const almacen = crearAlmacenEnMemoria()
    const antes = epocaDeCacheFavoritos()
    await borrarCacheFavoritos(almacen)
    await borrarCacheFavoritos(almacen)
    expect(epocaDeCacheFavoritos()).toBe(antes + 2)
  })
})

// ---------------------------------------------------------------------------
// El bloqueante en su forma real, de punta a punta con
// `cargarFavoritosConCache`: un `obtener` inyectado que dispara el borrado
// ANTES de resolver, exactamente como un cierre de sesión (o un cambio de
// cuenta, o una eliminación de cuenta) que llega mientras la petición de
// red todavía está en vuelo.
// ---------------------------------------------------------------------------
describe('cargarFavoritosConCache: el borrado llega mientras obtener está en vuelo', () => {
  it('rama ok: no deja la lista en el disco, pero el resultado de este render sigue siendo "ok"', async () => {
    const almacen = crearAlmacenEnMemoria()
    const eventos = [crearFavorito({ id: 'evento-de-A' })]

    const resultado = await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
      obtener: async () => {
        // El cierre de sesión (o cambio/eliminación de cuenta) que llega
        // ANTES de que la respuesta de red vuelva.
        await borrarCacheFavoritos(almacen)
        return { ok: true, voy: [], eventos }
      },
      ahora: AHORA,
      almacen,
    })

    // El render en curso sigue mostrando lo que ya tenía resuelto: el
    // cambio de sesión lo va a reemplazar cuando llegue al estado de
    // React, no acá.
    expect(resultado).toEqual({ tipo: 'ok', voy: [], eventos, desdeCache: null })

    // Lo que sí cambia con el arreglo: la clave de favoritos NO existe en
    // el disco (antes del arreglo, volvía con la lista de A).
    expect(almacen.mapa.has(CLAVE_FAVORITOS)).toBe(false)
  })

  it('rama de error por red: no lee la caché resucitada, da el error de siempre', async () => {
    const almacen = crearAlmacenEnMemoria()
    const guardadoEn = new Date('2026-10-17T10:00:00-03:00')
    // Caché válida de ANTES de que arrancara esta carga.
    await guardarCache(CLAVE_FAVORITOS, { voy: [], eventos: [crearFavorito({ id: 'evento-viejo' })] }, { ahora: guardadoEn, almacen })

    const mensaje = 'No pudimos cargar tus favoritos. Revisá tu conexión.'
    const resultado = await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
      obtener: async () => {
        await borrarCacheFavoritos(almacen)
        return { ok: false, error: mensaje, sinConexion: true }
      },
      ahora: AHORA,
      almacen,
    })

    // A6 (nube Q1), a propósito: falló por red y no había nada guardado que sirviera → `sinConexion: true` en la rama de error.
    expect(resultado).toEqual({ tipo: 'error', error: mensaje, sinConexion: true })
  })
})
