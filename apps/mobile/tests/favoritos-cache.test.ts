// R43, 43-b: `cargarFavoritosConCache`, `leerFavoritosGuardados` y
// `paraMostrarFavoritos` (lib/sin-conexion/favoritos.ts), con un almacén en
// memoria y una `ahora` fija. Fixtures inventados, sin red ni base.
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Todos los tests de este archivo inyectan `obtener`, así que nunca se llama
// al default (`obtenerFavoritos`, de `@/lib/favoritos`) — pero ES MODULE lo
// importa igual al cargar `lib/sin-conexion/favoritos.ts`, y `@/lib/favoritos`
// importa `@/lib/supabase`, que importa `react-native` (para `AppState`) a
// nivel de módulo: sin este doble, Vitest intentaría parsear el `react-native`
// real (entorno `node`, sin Metro) y fallaría al cargar el archivo, igual que
// `tests/favoritos.test.ts` y el resto de los tests que tocan `lib/favoritos`.
vi.mock('@/lib/supabase', () => ({ supabase: null }))

import type { Almacen } from '../lib/sin-conexion/almacen'
import {
  CLAVE_FAVORITOS,
  guardarCache,
  reiniciarBanderaDeLimpieza,
  TTL_FAVORITOS_MS,
  VERSION_CACHE,
} from '../lib/sin-conexion/cache'
import { cargarFavoritosConCache, leerFavoritosGuardados, paraMostrarFavoritos } from '../lib/sin-conexion/favoritos'
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

/** Escribe el sobre `{ v: VERSION_CACHE, guardadoEn, datos }` directo en el almacén, sin pasar por `guardarCache` — para forzar un `datos` que `guardarCache` nunca produciría (viene "de afuera": un backup restaurado o un teléfono con root). */
function escribirSobreCrudo(almacen: Almacen, clave: string, guardadoEn: Date, datos: unknown): Promise<void> {
  return almacen.escribir(clave, JSON.stringify({ v: VERSION_CACHE, guardadoEn: guardadoEn.toISOString(), datos }))
}

const AHORA = new Date('2026-10-17T12:00:00-03:00')

beforeEach(() => {
  reiniciarBanderaDeLimpieza()
})

describe('cargarFavoritosConCache: la carga sale bien', () => {
  it('guarda en la caché y devuelve la lista fresca, con desdeCache: null', async () => {
    const almacen = crearAlmacenEnMemoria()
    const eventos = [crearFavorito({ id: 'evento-1' }), crearFavorito({ id: 'evento-2' })]

    const resultado = await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
      obtener: async () => ({ ok: true, voy: [], eventos }),
      ahora: AHORA,
      almacen,
    })

    expect(resultado).toEqual({ tipo: 'ok', voy: [], eventos, desdeCache: null })
    expect(almacen.mapa.has(CLAVE_FAVORITOS)).toBe(true)
  })

  it('una lista vacía (sin favoritos) también sobreescribe la caché', async () => {
    const almacen = crearAlmacenEnMemoria()
    await guardarCache(CLAVE_FAVORITOS, { voy: [], eventos: [crearFavorito({ id: 'evento-viejo' })] }, { ahora: AHORA, almacen })

    const resultado = await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
      obtener: async () => ({ ok: true, voy: [], eventos: [] }),
      ahora: AHORA,
      almacen,
    })

    expect(resultado).toEqual({ tipo: 'ok', voy: [], eventos: [], desdeCache: null })

    const leido = await leerFavoritosGuardados({ ahora: AHORA, almacen })
    expect(leido?.eventos).toEqual([])
  })

  it('lo guardado no contiene el userId del test, ni user_id ni email', async () => {
    const almacen = crearAlmacenEnMemoria()
    const eventos = [crearFavorito({ id: 'evento-1' })]

    await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
      obtener: async () => ({ ok: true, voy: [], eventos }),
      ahora: AHORA,
      almacen,
    })

    const guardado = almacen.mapa.get(CLAVE_FAVORITOS) as string
    expect(guardado).toBeTruthy()
    expect(guardado).not.toContain(USER_ID_UUID_INVENTADO)
    expect(guardado).not.toMatch(/user_id/i)
    expect(guardado).not.toMatch(/\bemail\b/i)
  })
})

describe('cargarFavoritosConCache: falla por red', () => {
  it('con caché válida: devuelve la lista guardada y desdeCache con su guardadoEn', async () => {
    const almacen = crearAlmacenEnMemoria()
    const guardadoEn = new Date('2026-10-17T10:00:00-03:00')
    const eventos = [crearFavorito({ id: 'evento-1' })]
    await guardarCache(CLAVE_FAVORITOS, { voy: [], eventos }, { ahora: guardadoEn, almacen })

    const resultado = await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
      obtener: async () => ({ ok: false, error: 'No pudimos cargar tus favoritos.', sinConexion: true }),
      ahora: AHORA,
      almacen,
    })

    expect(resultado).toEqual({
      tipo: 'ok',
      voy: [],
      eventos,
      desdeCache: { guardadoEn },
    })
  })

  it('sin caché: da error', async () => {
    const almacen = crearAlmacenEnMemoria()

    const resultado = await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
      obtener: async () => ({ ok: false, error: 'No pudimos cargar tus favoritos.', sinConexion: true }),
      ahora: AHORA,
      almacen,
    })

    // A6 (nube Q1), a propósito: falló por red y no había nada guardado que sirviera → `sinConexion: true` en la rama de error.
    expect(resultado).toEqual({ tipo: 'error', error: 'No pudimos cargar tus favoritos.', sinConexion: true })
  })

  it('con la caché vencida (TTL_FAVORITOS_MS superado): da error, no la caché', async () => {
    const almacen = crearAlmacenEnMemoria()
    const guardadoEn = new Date('2026-10-17T10:00:00-03:00')
    await guardarCache(CLAVE_FAVORITOS, { voy: [], eventos: [crearFavorito()] }, { ahora: guardadoEn, almacen })

    const muchoDespues = new Date(guardadoEn.getTime() + TTL_FAVORITOS_MS + 1)
    const resultado = await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
      obtener: async () => ({ ok: false, error: 'No pudimos cargar tus favoritos.', sinConexion: true }),
      ahora: muchoDespues,
      almacen,
    })

    // A6 (nube Q1), a propósito: falló por red y no había nada guardado que sirviera → `sinConexion: true` en la rama de error.
    expect(resultado).toEqual({ tipo: 'error', error: 'No pudimos cargar tus favoritos.', sinConexion: true })
  })
})

describe('cargarFavoritosConCache: falla por otra cosa (no es de red)', () => {
  it('da error aunque haya caché válida: no la lee', async () => {
    const almacen = crearAlmacenEnMemoria()
    const guardadoEn = new Date('2026-10-17T10:00:00-03:00')
    await guardarCache(CLAVE_FAVORITOS, { voy: [], eventos: [crearFavorito()] }, { ahora: guardadoEn, almacen })

    const resultado = await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
      obtener: async () => ({ ok: false, error: 'La app no tiene la configuración de datos: avisá al equipo.' }),
      ahora: AHORA,
      almacen,
    })

    expect(resultado).toEqual({ tipo: 'error', error: 'La app no tiene la configuración de datos: avisá al equipo.' })
  })
})

describe('cargarFavoritosConCache: mientras se muestra la caché, no se escribe nada', () => {
  it('leer de la caché (carga por red) no dispara ningún guardarCache', async () => {
    const almacen = crearAlmacenEnMemoria()
    const guardadoEn = new Date('2026-10-17T10:00:00-03:00')
    await guardarCache(CLAVE_FAVORITOS, { voy: [], eventos: [crearFavorito()] }, { ahora: guardadoEn, almacen })
    const crudoAntes = almacen.mapa.get(CLAVE_FAVORITOS)

    await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
      obtener: async () => ({ ok: false, error: 'No pudimos cargar tus favoritos.', sinConexion: true }),
      ahora: AHORA,
      almacen,
    })

    expect(almacen.mapa.get(CLAVE_FAVORITOS)).toBe(crudoAntes)
  })
})

describe('leerFavoritosGuardados', () => {
  it('sin sesión por el token vencido: lee la caché sin intentar obtener', async () => {
    const almacen = crearAlmacenEnMemoria()
    const guardadoEn = new Date('2026-10-17T10:00:00-03:00')
    const eventos = [crearFavorito({ id: 'evento-1' })]
    await guardarCache(CLAVE_FAVORITOS, { voy: [], eventos }, { ahora: guardadoEn, almacen })

    const resultado = await leerFavoritosGuardados({ ahora: AHORA, almacen })

    expect(resultado).toEqual({ guardadoEn, voy: [], eventos })
  })

  it('sin caché: null', async () => {
    const almacen = crearAlmacenEnMemoria()
    const resultado = await leerFavoritosGuardados({ ahora: AHORA, almacen })
    expect(resultado).toBeNull()
  })
})

describe('paraMostrarFavoritos', () => {
  it('saca un evento de ayer', () => {
    const deAyer = crearFavorito({ id: 'evento-de-ayer', date: '2026-10-16' })
    const deHoy = crearFavorito({ id: 'evento-de-hoy', date: '2026-10-17' })
    const resultado = paraMostrarFavoritos([deAyer, deHoy], AHORA)
    expect(resultado.map((e) => e.id)).toEqual(['evento-de-hoy'])
  })

  it('deja una película (isCinemaMovie), aunque su date sea de ayer', () => {
    const pelicula = crearFavorito({ id: 'movie-1', date: '2026-10-16', isCinemaMovie: true })
    const resultado = paraMostrarFavoritos([pelicula], AHORA)
    expect(resultado).toEqual([pelicula])
  })

  it('deja un flyer (isInstagramFlyer), aunque su date sea de ayer', () => {
    const flyer = crearFavorito({ id: 'ig-1', date: '2026-10-16', isInstagramFlyer: true })
    const resultado = paraMostrarFavoritos([flyer], AHORA)
    expect(resultado).toEqual([flyer])
  })

  it('mantiene el orden original', () => {
    const uno = crearFavorito({ id: 'uno', date: '2026-10-20' })
    const dos = crearFavorito({ id: 'dos', date: '2026-10-18' })
    const resultado = paraMostrarFavoritos([uno, dos], AHORA)
    expect(resultado.map((e) => e.id)).toEqual(['uno', 'dos'])
  })
})

describe('una caché con `datos` de forma inesperada no tira (vuelta 1 de la revisión, seguridad)', () => {
  // Lo que de verdad desreferencia `paraMostrarFavoritos`: `eventos` tiene
  // que ser un array (si no, `.filter` tira) y cada ítem tiene que ser un
  // objeto (si no, leer `item.isCinemaMovie` tira). `v` y `guardadoEn` son
  // correctos: el sobre pasa `leerCache` (43-a) tal cual, porque esa
  // validación es solo del sobre — por eso se escribe crudo
  // (`escribirSobreCrudo`), no con `guardarCache`, que nunca produciría una
  // forma así.
  //
  // De dónde puede venir esto de verdad: un backup de Android restaurado
  // (Expo deja `allowBackup` en `true` por defecto) con una versión vieja
  // de la app que guardaba otra forma, o un archivo tocado a mano en un
  // teléfono con root. No es un caso imposible: no hay que borrar estos
  // tests pensando que sí lo es.
  const RAZON = 'No pudimos cargar tus favoritos.'

  describe('cargarFavoritosConCache', () => {
    it('datos: null', async () => {
      const almacen = crearAlmacenEnMemoria()
      await escribirSobreCrudo(almacen, CLAVE_FAVORITOS, new Date('2026-10-17T10:00:00-03:00'), null)

      const resultado = await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
        obtener: async () => ({ ok: false, error: RAZON, sinConexion: true }),
        ahora: AHORA,
        almacen,
      })

      // A6 (nube Q1), a propósito: falló por red y no había nada guardado que sirviera → `sinConexion: true` en la rama de error.
      expect(resultado).toEqual({ tipo: 'error', error: RAZON, sinConexion: true })
    })

    it('datos es un objeto (donde se espera el array DisplayEvent[])', async () => {
      const almacen = crearAlmacenEnMemoria()
      await escribirSobreCrudo(almacen, CLAVE_FAVORITOS, new Date('2026-10-17T10:00:00-03:00'), { eventos: [] })

      const resultado = await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
        obtener: async () => ({ ok: false, error: RAZON, sinConexion: true }),
        ahora: AHORA,
        almacen,
      })

      // A6 (nube Q1), a propósito: falló por red y no había nada guardado que sirviera → `sinConexion: true` en la rama de error.
      expect(resultado).toEqual({ tipo: 'error', error: RAZON, sinConexion: true })
    })

    it('un ítem que no es un objeto (null): tira al leer item.isCinemaMovie', async () => {
      const almacen = crearAlmacenEnMemoria()
      await escribirSobreCrudo(almacen, CLAVE_FAVORITOS, new Date('2026-10-17T10:00:00-03:00'), [null])

      const resultado = await cargarFavoritosConCache(USER_ID_UUID_INVENTADO, {
        obtener: async () => ({ ok: false, error: RAZON, sinConexion: true }),
        ahora: AHORA,
        almacen,
      })

      // A6 (nube Q1), a propósito: falló por red y no había nada guardado que sirviera → `sinConexion: true` en la rama de error.
      expect(resultado).toEqual({ tipo: 'error', error: RAZON, sinConexion: true })
    })
  })

  describe('leerFavoritosGuardados', () => {
    it('datos: null: da null, igual que "no hay caché"', async () => {
      const almacen = crearAlmacenEnMemoria()
      await escribirSobreCrudo(almacen, CLAVE_FAVORITOS, new Date('2026-10-17T10:00:00-03:00'), null)

      const resultado = await leerFavoritosGuardados({ ahora: AHORA, almacen })

      expect(resultado).toBeNull()
    })

    it('un ítem que no es un objeto (null): da null, no tira', async () => {
      const almacen = crearAlmacenEnMemoria()
      await escribirSobreCrudo(almacen, CLAVE_FAVORITOS, new Date('2026-10-17T10:00:00-03:00'), [null])

      const resultado = await leerFavoritosGuardados({ ahora: AHORA, almacen })

      expect(resultado).toBeNull()
    })
  })
})
