// tests/sin-conexion-flujos.test.ts (R43, tarea 43-q, QA): integración de
// punta a punta de la caché sin conexión, más allá de lo que ya cubren
// 43-a/43-b/43-d/37-d (que, para controlar el contenido a mano, inyectan un
// `Almacen` propio y/o mockean `borrarCacheFavoritos`). Acá se usa
// `almacenPorDefecto` (nunca se pasa `almacen`), así que de verdad pasa por
// `lib/sin-conexion/almacen.ts` y por el doble de AsyncStorage
// (`tests/dobles/async-storage.ts`, vía el alias de `vitest.config.ts`), y
// para Favoritos se usa el `borrarCacheFavoritos` REAL (no mockeado) junto
// con `reducirSesion`/`dispararBorradoDeCacheFavoritos`/`esperarBorradoDeCache`
// de `lib/session`. Sin red ni base: Supabase se mockea a nivel de módulo
// (mismo patrón que `tests/datos-sin-conexion.test.ts`); `fetch` nunca pega
// contra la red de verdad (se reemplaza con `vi.stubGlobal`, como
// `tests/eliminar-cuenta.test.ts`).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type RespuestaFalsa = { data: unknown; error: unknown; status?: number }

const estadoSupabase = vi.hoisted(() => ({
  events: { data: [] as unknown, error: null as unknown, status: 200 } as RespuestaFalsa,
  categories: { data: [] as unknown, error: null as unknown, status: 200 } as RespuestaFalsa,
  cinemaMovies: { data: [] as unknown, error: null as unknown, status: 200 } as RespuestaFalsa,
}))

// Un solo mock de `@/lib/supabase`: resuelve al MISMO archivo
// (`lib/supabase.ts`) sin importar si quien lo importa usa el alias
// (`lib/datos/eventos.ts`, `lib/datos/cines.ts`, `lib/favoritos.ts`,
// `lib/cuenta.ts`) o una ruta relativa (`lib/session/index.tsx`, que importa
// `'../supabase'`) — mismo criterio que documenta `tests/sesion-cache.test.ts`.
// `auth.signOut` hace falta para `limpiarTrasEliminarCuenta` (lib/cuenta.ts).
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signOut: vi.fn(async () => {}) },
    from: (tabla: string) => {
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.or = () => builder
      builder.order = () => builder
      builder.in = () => builder
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        if (tabla === 'events') return Promise.resolve(estadoSupabase.events).then(resolve, reject)
        if (tabla === 'categories') return Promise.resolve(estadoSupabase.categories).then(resolve, reject)
        if (tabla === 'cinema_movies') return Promise.resolve(estadoSupabase.cinemaMovies).then(resolve, reject)
        throw new Error(`tabla inesperada en el doble de sin-conexion-flujos: ${tabla}`)
      }
      return builder
    },
  },
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}))

vi.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { signOut: vi.fn(async () => {}) },
}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import { reiniciar } from './dobles/async-storage'
import { obtenerCategorias, obtenerEventosVigentesParaInicio } from '@/lib/datos/eventos'
import { obtenerCines } from '@/lib/datos/cines'
import { cargarAgendaConCache, type DatosAgenda } from '@/lib/sin-conexion/agenda'
import { CLAVE_AGENDA, leerCache, reiniciarBanderaDeLimpieza, TTL_AGENDA_MS } from '@/lib/sin-conexion/cache'
import { cargarFavoritosConCache, leerFavoritosGuardados } from '@/lib/sin-conexion/favoritos'
import { completarEliminacionDeCuenta } from '@/lib/cuenta'
// Ruta relativa a propósito (no `@/lib/session`): `lib/session/index.tsx` es
// una carpeta con `index.tsx`, y `../lib/session` es justo lo que usa
// `tests/sesion-cache.test.ts` para resolverla sin React Native.
import { dispararBorradoDeCacheFavoritos, esperarBorradoDeCache, reducirSesion } from '../lib/session'
import type { DisplayEvent } from '@qps/core/home/types'

const AHORA = new Date('2026-10-17T20:00:00-03:00')

// Fila cruda de `events`, con la forma que espera `transformEvent`/`isVigente`
// (categoría y venue incluidos, como `EventWithRelations`). Vigente de sobra
// (empieza en 24 h, sin `end_date`): lo único que importa es que atraviese
// toda la cadena real (filasVigentes -> transformEvent -> agenda) sin que el
// prefiltro ni `isVigente` la descarten.
const FILA_EVENTO = {
  id: 'evento-prueba-1',
  slug: 'evento-de-prueba',
  title: 'Evento de Prueba',
  start_date: new Date(AHORA.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  end_date: null,
  is_free: true,
  price_min: 0,
  image_url: null,
  description: 'Una descripción de prueba.',
  short_description: null,
  ticket_url: null,
  age_restriction: null,
  is_featured: false,
  status: 'PUBLISHED',
  category: { slug: 'teatro', name: 'Teatro' },
  venue: { name: 'Venue de Prueba', address: 'Calle Falsa 123' },
}

const FILA_CATEGORIA = { id: 'cat-teatro', name: 'Teatro', slug: 'teatro' }
const FILA_PELICULA = {
  id: 'pelicula-prueba-1',
  slug: 'pelicula-de-prueba',
  title: 'Película de Prueba',
  poster_url: null,
  showings: {},
}

function favoritoFixture(id: string): DisplayEvent {
  return {
    id,
    slug: id,
    title: `Favorito ${id}`,
    venue: 'Venue de Prueba',
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
  }
}

/**
 * La misma combinación que haría la pantalla de Inicio (app/(tabs)/index.tsx,
 * fuera de los archivos permitidos de esta tarea): las tres consultas reales
 * en paralelo, con `sinConexion` como el O lógico de las tres (comentario de
 * cabecera de `lib/sin-conexion/agenda.ts`). Solo código de test: no toca
 * ningún archivo de producción.
 */
async function cargarInicio(
  ahora: Date,
): Promise<{ ok: true; datos: DatosAgenda } | { ok: false; error: string; sinConexion: boolean }> {
  const [resEventos, resCategorias, resPeliculas] = await Promise.all([
    obtenerEventosVigentesParaInicio(ahora),
    obtenerCategorias(),
    obtenerCines(),
  ])

  const sinConexion =
    (!resEventos.ok && Boolean(resEventos.sinConexion)) ||
    (!resCategorias.ok && Boolean(resCategorias.sinConexion)) ||
    (!resPeliculas.ok && Boolean(resPeliculas.sinConexion))

  if (!resEventos.ok) return { ok: false, error: resEventos.error, sinConexion }
  if (!resCategorias.ok) return { ok: false, error: resCategorias.error, sinConexion }
  if (!resPeliculas.ok) return { ok: false, error: resPeliculas.error, sinConexion }

  return {
    ok: true,
    datos: { eventos: resEventos.eventos, categorias: resCategorias.categorias, peliculas: resPeliculas.peliculas },
  }
}

/** La forma real de postgrest-js 2.106 cuando el `fetch` rechaza (modo avión/DNS): ver `tests/red-sin-conexion.test.ts`. */
function respuestaDeRed(): RespuestaFalsa {
  return {
    data: null,
    error: { message: 'TypeError: Network request failed', details: null, hint: '', code: '' },
    status: 0,
  }
}

beforeEach(() => {
  reiniciar()
  reiniciarBanderaDeLimpieza()
  estadoSupabase.events = { data: [FILA_EVENTO], error: null, status: 200 }
  estadoSupabase.categories = { data: [FILA_CATEGORIA], error: null, status: 200 }
  estadoSupabase.cinemaMovies = { data: [FILA_PELICULA], error: null, status: 200 }
})

// ---------------------------------------------------------------------------
// Inicio, de punta a punta: Supabase doble (mock de `@/lib/supabase`, nunca
// la red) + AsyncStorage real (el doble del alias, nunca un `Almacen`
// inyectado a mano).
// ---------------------------------------------------------------------------
describe('Inicio de punta a punta (Supabase doble + AsyncStorage real, sin pasar almacen)', () => {
  it('una carga buena guarda de verdad en el AsyncStorage real, bajo CLAVE_AGENDA', async () => {
    const resultado = await cargarAgendaConCache({ cargar: () => cargarInicio(AHORA), ahora: AHORA })

    expect(resultado.tipo).toBe('ok')
    if (resultado.tipo !== 'ok') throw new Error('no debería fallar')
    expect(resultado.desdeCache).toBeNull()
    expect(resultado.datos.eventos.map((e) => e.evento.title)).toEqual(['Evento de Prueba'])

    const crudo = await AsyncStorage.getItem(CLAVE_AGENDA)
    expect(crudo).not.toBeNull()
    expect(JSON.parse(crudo as string).datos.eventos[0].evento.title).toBe('Evento de Prueba')
  })

  it('una carga con status: 0 (sin red) muestra lo guardado, con desdeCache', async () => {
    await cargarAgendaConCache({ cargar: () => cargarInicio(AHORA), ahora: AHORA })

    // Sin red: `events` vuelve con la forma real de un fetch rechazado.
    estadoSupabase.events = respuestaDeRed()

    const unaHoraDespues = new Date(AHORA.getTime() + 60 * 60 * 1000) // bien dentro del TTL de 48 h
    const resultado = await cargarAgendaConCache({
      cargar: () => cargarInicio(unaHoraDespues),
      ahora: unaHoraDespues,
    })

    expect(resultado.tipo).toBe('ok')
    if (resultado.tipo !== 'ok') throw new Error('no debería fallar')
    expect(resultado.desdeCache).not.toBeNull()
    expect(resultado.desdeCache?.guardadoEn.toISOString()).toBe(AHORA.toISOString())
    expect(resultado.datos.eventos.map((e) => e.evento.title)).toEqual(['Evento de Prueba'])
  })

  it('al pasar 48 h y un minuto, vuelve el error de siempre (no la caché), y la clave real queda borrada', async () => {
    await cargarAgendaConCache({ cargar: () => cargarInicio(AHORA), ahora: AHORA })

    estadoSupabase.events = respuestaDeRed()

    const muchoDespues = new Date(AHORA.getTime() + TTL_AGENDA_MS + 60 * 1000) // 48 h y 1 minuto
    const resultado = await cargarAgendaConCache({ cargar: () => cargarInicio(muchoDespues), ahora: muchoDespues })

    // A6 (nube Q1), a propósito: falló por red y no había nada guardado que sirviera → `sinConexion: true` en la rama de error.
    expect(resultado).toEqual({ tipo: 'error', error: expect.any(String), sinConexion: true })

    expect(await AsyncStorage.getItem(CLAVE_AGENDA)).toBeNull()
    expect(await leerCache(CLAVE_AGENDA, { ahora: muchoDespues, ttlMs: TTL_AGENDA_MS })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// El ciclo de Favoritos: sesión real (`reducirSesion`) + borrado real
// (`dispararBorradoDeCacheFavoritos`/`esperarBorradoDeCache`, SIN mockear
// `borrarCacheFavoritos`, a diferencia de `tests/sesion-cache.test.ts`) +
// AsyncStorage real.
// ---------------------------------------------------------------------------
describe('El ciclo de Favoritos: sesión A, SIGNED_OUT real, y la carga de después no encuentra nada', () => {
  const USUARIO_A = '99999999-8888-7777-6666-555555555555'

  it('con sesión A, una carga buena guarda; un SIGNED_OUT real borra; una carga por red después no encuentra nada', async () => {
    const eventos = [favoritoFixture('evento-a-1')]

    const cargaA = await cargarFavoritosConCache(USUARIO_A, {
      obtener: async (userId) => {
        expect(userId).toBe(USUARIO_A)
        return { ok: true, voy: [], eventos }
      },
      ahora: AHORA,
    })
    expect(cargaA).toEqual({ tipo: 'ok', voy: [], eventos, desdeCache: null })
    expect(await leerFavoritosGuardados({ ahora: AHORA })).toEqual({ guardadoEn: AHORA, voy: [], eventos })

    // Cierre de sesión real: `reducirSesion` dice que hay que borrar, y el
    // borrado de verdad (sin mock) deja la caché de favoritos vacía.
    const resultadoSesion = reducirSesion(
      { estado: { session: null, cargando: false, sinConexion: false }, usuarioConocido: USUARIO_A },
      { tipo: 'cambio', evento: 'SIGNED_OUT', session: null },
    )
    expect(resultadoSesion.borrarCacheFavoritos).toBe(true)

    dispararBorradoDeCacheFavoritos()
    await esperarBorradoDeCache()

    expect(await leerFavoritosGuardados({ ahora: AHORA })).toBeNull()

    // Una carga por red después del cierre de sesión no encuentra nada: sin
    // caché, da el error de siempre (no hay nada para mostrar).
    const mensaje = 'No pudimos cargar tus favoritos. Revisá tu conexión.'
    const cargaDespues = await cargarFavoritosConCache(USUARIO_A, {
      obtener: async () => ({ ok: false, error: mensaje, sinConexion: true }),
      ahora: AHORA,
    })
    // A6 (nube Q1), a propósito: falló por red y no había nada guardado que sirviera → `sinConexion: true` en la rama de error.
    expect(cargaDespues).toEqual({ tipo: 'error', error: mensaje, sinConexion: true })
  })
})

// ---------------------------------------------------------------------------
// Eliminar la cuenta: después del camino de éxito de `lib/cuenta.ts`, no
// queda ninguna clave `qps:cache:*` en el AsyncStorage real.
// ---------------------------------------------------------------------------
describe('Eliminar cuenta: después del camino de éxito, no queda ninguna clave qps:cache:*', () => {
  it('borra la agenda y los favoritos guardados antes, con AsyncStorage real', async () => {
    await cargarAgendaConCache({ cargar: () => cargarInicio(AHORA), ahora: AHORA })
    await cargarFavoritosConCache('99999999-8888-7777-6666-555555555555', {
      obtener: async () => ({ ok: true, voy: [], eventos: [favoritoFixture('evento-cuenta-1')] }),
      ahora: AHORA,
    })

    const clavesAntes = await AsyncStorage.getAllKeys()
    expect(clavesAntes.some((clave) => clave.startsWith('qps:cache:'))).toBe(true)

    const mockFetch = vi.fn(async () => ({ ok: true }) as Response)
    vi.stubGlobal('fetch', mockFetch)

    const resultado = await completarEliminacionDeCuenta('token-de-prueba', false, { navegarABienvenida: vi.fn() })

    expect(resultado).toEqual({ ok: true })
    const clavesDespues = await AsyncStorage.getAllKeys()
    expect(clavesDespues.filter((clave) => clave.startsWith('qps:cache:'))).toEqual([])

    vi.unstubAllGlobals()
  })
})

// ---------------------------------------------------------------------------
// Nada personal en el almacén: se recorre TODO lo que quedó en el doble
// (`AsyncStorage.getAllKeys()`, no una lista de claves esperada a mano), con
// un uuid de prueba concreto y de verdad usado (ver el `expect(userId)` de
// arriba, y el de acá abajo).
// ---------------------------------------------------------------------------
describe('Nada personal en el almacén sin conexión (recorrido exhaustivo del doble, con getAllKeys())', () => {
  const USUARIO_DE_PRUEBA = 'cccccccc-dddd-eeee-ffff-000011112222'
  const PALABRAS_PROHIBIDAS = [/user_id/i, /\bemail\b/i, /access_token/i, /refresh_token/i, /provider_token/i]

  it('después de Inicio + Favoritos (con sesión) + cierre de sesión + eliminar cuenta, no queda nada personal ni ninguna clave fuera de qps:cache:', async () => {
    await cargarAgendaConCache({ cargar: () => cargarInicio(AHORA), ahora: AHORA })

    const favoritos = [favoritoFixture('evento-personal-1')]
    await cargarFavoritosConCache(USUARIO_DE_PRUEBA, {
      obtener: async (userId) => {
        expect(userId).toBe(USUARIO_DE_PRUEBA) // de verdad se usa, no un uuid que viaja sin propósito
        return { ok: true, voy: [], eventos: favoritos }
      },
      ahora: AHORA,
    })

    // Revisión intermedia, con contenido todavía guardado: ningún valor
    // contiene datos personales, y toda clave cae bajo el prefijo de la
    // caché (recorriendo lo que el doble tiene de verdad, no una lista
    // armada a mano).
    const clavesConContenido = await AsyncStorage.getAllKeys()
    expect(clavesConContenido.length).toBeGreaterThan(0)
    for (const clave of clavesConContenido) {
      expect(clave.startsWith('qps:cache:')).toBe(true)
      const valor = await AsyncStorage.getItem(clave)
      expect(valor).not.toBeNull()
      expect(valor).not.toContain(USUARIO_DE_PRUEBA)
      for (const patron of PALABRAS_PROHIBIDAS) expect(valor).not.toMatch(patron)
    }

    // Cierre de sesión real: borra la caché de favoritos.
    const resultadoSesion = reducirSesion(
      { estado: { session: null, cargando: false, sinConexion: false }, usuarioConocido: USUARIO_DE_PRUEBA },
      { tipo: 'cambio', evento: 'SIGNED_OUT', session: null },
    )
    expect(resultadoSesion.borrarCacheFavoritos).toBe(true)
    dispararBorradoDeCacheFavoritos()
    await esperarBorradoDeCache()

    // Eliminar la cuenta: borra lo que quede (la agenda).
    const mockFetch = vi.fn(async () => ({ ok: true }) as Response)
    vi.stubGlobal('fetch', mockFetch)
    const resultado = await completarEliminacionDeCuenta('token-de-prueba', false, { navegarABienvenida: vi.fn() })
    expect(resultado).toEqual({ ok: true })
    vi.unstubAllGlobals()

    // Al final no queda ninguna clave: nada de este flujo toca AsyncStorage
    // fuera de la caché sin conexión, así que borrarla todo deja el doble
    // vacío.
    expect(await AsyncStorage.getAllKeys()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// La sesión no va a AsyncStorage (detector estático): `lib/supabase.ts`
// sigue usando `getItem`/`setItem`/`removeItem` de `lib/secure-storage.ts`
// (SecureStore, cifrado), y ningún archivo de `lib/` (recursivo, incluidos
// `lib/datos/`, `lib/session/`, `lib/sin-conexion/`), `components/` o `app/`
// importa `@react-native-async-storage/async-storage`, fuera de
// `lib/sin-conexion/almacen.ts` (el único archivo permitido, por diseño: ver
// su comentario de cabecera).
// ---------------------------------------------------------------------------
describe('La sesión no va a AsyncStorage (detector estático, sobre el código real en disco)', () => {
  const RAIZ = fileURLToPath(new URL('..', import.meta.url)) // apps/mobile/

  function listarArchivosDeCodigo(dir: string): string[] {
    const resultado: string[] = []
    let entradas: string[]
    try {
      entradas = readdirSync(dir)
    } catch {
      return resultado // la carpeta no existe en este checkout: nada que recorrer.
    }
    for (const nombre of entradas) {
      if (nombre === 'node_modules' || nombre.startsWith('.')) continue
      const ruta = join(dir, nombre)
      const info = statSync(ruta)
      if (info.isDirectory()) {
        resultado.push(...listarArchivosDeCodigo(ruta))
      } else if (/\.(ts|tsx)$/.test(nombre)) {
        resultado.push(ruta)
      }
    }
    return resultado
  }

  it('lib/supabase.ts sigue usando getItem/setItem/removeItem de lib/secure-storage.ts', () => {
    const codigo = readFileSync(join(RAIZ, 'lib', 'supabase.ts'), 'utf8')
    expect(codigo).toMatch(/from ['"]\.\/secure-storage['"]/)
    expect(codigo).toMatch(/\bgetItem\b/)
    expect(codigo).toMatch(/\bsetItem\b/)
    expect(codigo).toMatch(/\bremoveItem\b/)
  })

  it('ningún archivo de lib/ (recursivo), components/ o app/, fuera de lib/sin-conexion/almacen.ts, importa @react-native-async-storage/async-storage', () => {
    const permitido = join(RAIZ, 'lib', 'sin-conexion', 'almacen.ts')
    const ofensores: string[] = []

    for (const carpeta of ['lib', 'components', 'app']) {
      for (const archivo of listarArchivosDeCodigo(join(RAIZ, carpeta))) {
        if (archivo === permitido) continue
        const codigo = readFileSync(archivo, 'utf8')
        if (codigo.includes('@react-native-async-storage/async-storage')) ofensores.push(archivo)
      }
    }

    expect(ofensores).toEqual([])
  })
})
