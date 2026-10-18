// R43, 43-b: `cargarAgendaConCache` y `paraMostrar` (lib/sin-conexion/agenda.ts),
// con un almacén en memoria (igual que `tests/cache-sin-conexion.test.ts`,
// nunca AsyncStorage real) y una `ahora` fija. Fixtures inventados, sin red
// ni base.
import { beforeEach, describe, expect, it } from 'vitest'
import type { Almacen } from '../lib/sin-conexion/almacen'
import {
  CLAVE_AGENDA,
  guardarCache,
  leerCache,
  reiniciarBanderaDeLimpieza,
  TTL_AGENDA_MS,
  VERSION_CACHE,
} from '../lib/sin-conexion/cache'
import { cargarAgendaConCache, paraMostrar, type DatosAgenda } from '../lib/sin-conexion/agenda'
import type { CategoriaBasica, EventoVigenteParaInicio } from '../lib/datos/eventos'
import type { Pelicula } from '../lib/datos/cines'

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

function crearEvento(over: Partial<{
  id: string
  start_date: string
  end_date: string | null
  category: string | null
}> = {}): EventoVigenteParaInicio {
  const id = over.id ?? 'evento-1'
  return {
    evento: {
      id,
      slug: id,
      title: `Evento ${id}`,
      venue: 'Lugar de Prueba',
      date: '2026-10-20',
      time: '21:00',
      category: 'recitales',
      categoryName: 'Recitales',
      price: 'gratis',
      image: 'https://example.com/imagen.jpg',
      description: 'Una descripción de prueba.',
      address: 'Calle Falsa 123',
      startDateTime: over.start_date ?? '2026-10-20T21:00:00-03:00',
      isFeatured: false,
    },
    paraAtajo: {
      start_date: over.start_date ?? '2026-10-20T21:00:00-03:00',
      end_date: over.end_date ?? null,
      category: over.category ?? 'recitales',
    },
  }
}

function crearCategoria(id: string): CategoriaBasica {
  return { id, name: `Categoría ${id}`, slug: id }
}

function crearPelicula(id: string): Pelicula {
  return {
    id,
    slug: id,
    title: `Película ${id}`,
    poster_url: null,
    showings: { 'cine-de-prueba': { name: 'Cine de Prueba', booking_url: '', formats: [] } },
  }
}

function datosAgenda(over: Partial<DatosAgenda> = {}): DatosAgenda {
  return {
    eventos: [crearEvento()],
    categorias: [crearCategoria('cat-1')],
    peliculas: [crearPelicula('pelicula-1')],
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

describe('cargarAgendaConCache: la carga sale bien', () => {
  it('guarda en la caché y devuelve los datos frescos, con desdeCache: null', async () => {
    const almacen = crearAlmacenEnMemoria()
    const datos = datosAgenda()
    const resultado = await cargarAgendaConCache({
      cargar: async () => ({ ok: true, datos }),
      ahora: AHORA,
      almacen,
    })

    expect(resultado).toEqual({ tipo: 'ok', datos, desdeCache: null })

    const leido = await leerCache<DatosAgenda>(CLAVE_AGENDA, { ahora: AHORA, ttlMs: TTL_AGENDA_MS, almacen })
    expect(leido).not.toBeNull()
    expect(leido?.datos.eventos.map((e) => e.evento.id)).toEqual(['evento-1'])
    expect(leido?.datos.categorias).toEqual(datos.categorias)
    expect(leido?.datos.peliculas).toEqual(datos.peliculas)
  })
})

describe('cargarAgendaConCache: falla por red', () => {
  it('con caché válida: devuelve los datos guardados y desdeCache con su guardadoEn', async () => {
    const almacen = crearAlmacenEnMemoria()
    const guardadoEn = new Date('2026-10-17T10:00:00-03:00')
    const datos = datosAgenda()
    await guardarCache(CLAVE_AGENDA, datos, { ahora: guardadoEn, almacen })

    const resultado = await cargarAgendaConCache({
      cargar: async () => ({ ok: false, error: 'No pudimos cargar la agenda.', sinConexion: true }),
      ahora: AHORA,
      almacen,
    })

    expect(resultado.tipo).toBe('ok')
    if (resultado.tipo !== 'ok') throw new Error('no debería fallar')
    expect(resultado.desdeCache).toEqual({ guardadoEn })
    expect(resultado.datos.eventos.map((e) => e.evento.id)).toEqual(['evento-1'])
  })

  it('sin caché: da error, con el mensaje de la carga', async () => {
    const almacen = crearAlmacenEnMemoria()
    const resultado = await cargarAgendaConCache({
      cargar: async () => ({ ok: false, error: 'No pudimos cargar la agenda.', sinConexion: true }),
      ahora: AHORA,
      almacen,
    })

    expect(resultado).toEqual({ tipo: 'error', error: 'No pudimos cargar la agenda.' })
  })

  it('con la caché vencida (TTL_AGENDA_MS superado): da error, no la caché', async () => {
    const almacen = crearAlmacenEnMemoria()
    const guardadoEn = new Date('2026-10-17T10:00:00-03:00')
    await guardarCache(CLAVE_AGENDA, datosAgenda(), { ahora: guardadoEn, almacen })

    const muchoDespues = new Date(guardadoEn.getTime() + TTL_AGENDA_MS + 1)
    const resultado = await cargarAgendaConCache({
      cargar: async () => ({ ok: false, error: 'No pudimos cargar la agenda.', sinConexion: true }),
      ahora: muchoDespues,
      almacen,
    })

    expect(resultado).toEqual({ tipo: 'error', error: 'No pudimos cargar la agenda.' })
  })
})

describe('cargarAgendaConCache: falla por otra cosa (no es de red)', () => {
  it('da error aunque haya caché válida: no la lee', async () => {
    const almacen = crearAlmacenEnMemoria()
    const guardadoEn = new Date('2026-10-17T10:00:00-03:00')
    await guardarCache(CLAVE_AGENDA, datosAgenda(), { ahora: guardadoEn, almacen })

    const resultado = await cargarAgendaConCache({
      cargar: async () => ({ ok: false, error: 'La app no tiene la configuración de datos: avisá al equipo.' }),
      ahora: AHORA,
      almacen,
    })

    expect(resultado).toEqual({ tipo: 'error', error: 'La app no tiene la configuración de datos: avisá al equipo.' })
  })
})

describe('cargarAgendaConCache: mientras se muestra la caché, no se escribe nada', () => {
  it('leer de la caché (carga por red) no dispara ningún guardarCache', async () => {
    const almacen = crearAlmacenEnMemoria()
    const guardadoEn = new Date('2026-10-17T10:00:00-03:00')
    await guardarCache(CLAVE_AGENDA, datosAgenda(), { ahora: guardadoEn, almacen })
    const crudoAntes = almacen.mapa.get(CLAVE_AGENDA)

    await cargarAgendaConCache({
      cargar: async () => ({ ok: false, error: 'No pudimos cargar la agenda.', sinConexion: true }),
      ahora: AHORA,
      almacen,
    })

    expect(almacen.mapa.get(CLAVE_AGENDA)).toBe(crudoAntes)
  })
})

describe('paraMostrar', () => {
  it('saca un evento que terminó después de guardar (vuelve a filtrar con isVigente y la ahora de la pantalla)', () => {
    const vigenteAlGuardar = crearEvento({
      id: 'evento-que-ya-termino',
      start_date: '2026-10-17T08:00:00-03:00',
      end_date: '2026-10-17T09:00:00-03:00',
    })
    const sigueVigente = crearEvento({
      id: 'evento-que-sigue',
      start_date: '2026-10-20T21:00:00-03:00',
      end_date: null,
    })
    const guardadoEn = new Date('2026-10-17T08:30:00-03:00') // el primero todavía no había terminado
    const ahora = new Date('2026-10-17T12:00:00-03:00') // el primero ya terminó (end_date 09:00)

    const resultado = paraMostrar(
      { eventos: [vigenteAlGuardar, sigueVigente], categorias: [], peliculas: [] },
      guardadoEn,
      ahora,
    )

    expect(resultado.eventos.map((e) => e.evento.id)).toEqual(['evento-que-sigue'])
  })

  it('saca las películas guardadas ayer (otro día de Salta)', () => {
    const guardadoEn = new Date('2026-10-16T20:00:00-03:00') // ayer
    const ahora = new Date('2026-10-17T12:00:00-03:00') // hoy

    const resultado = paraMostrar(
      { eventos: [], categorias: [], peliculas: [crearPelicula('pelicula-de-ayer')] },
      guardadoEn,
      ahora,
    )

    expect(resultado.peliculas).toEqual([])
  })

  it('deja las películas guardadas el mismo día de Salta', () => {
    const guardadoEn = new Date('2026-10-17T08:00:00-03:00')
    const ahora = new Date('2026-10-17T20:00:00-03:00')
    const peliculas = [crearPelicula('pelicula-de-hoy')]

    const resultado = paraMostrar({ eventos: [], categorias: [], peliculas }, guardadoEn, ahora)

    expect(resultado.peliculas).toEqual(peliculas)
  })

  it('deja pasar las categorías tal cual, sin filtrarlas', () => {
    const categorias = [crearCategoria('cat-a'), crearCategoria('cat-b')]
    const resultado = paraMostrar({ eventos: [], categorias, peliculas: [] }, AHORA, AHORA)
    expect(resultado.categorias).toEqual(categorias)
  })

  // La hora tiene que estar lejos de medianoche de Salta a propósito: con
  // horas cercanas a las 00:00 UTC (21:00-24:00 de Salta, UTC-3), el día de
  // Salta y el día UTC pelado pueden coincidir por casualidad y el test no
  // detectaría una regresión que cambiara `formatDateInSalta` por
  // `toISOString().slice(0, 10)`. Este caso SÍ los separa: 17/10 22:00 de
  // Salta es 18/10 01:00 UTC, y 18/10 01:00 de Salta es 18/10 04:00 UTC —
  // ambos "18" en UTC, pero "17" y "18" en Salta.
  it('"mismo día de Salta" no es lo mismo que "mismo día en UTC" (vuelta 1 de la revisión)', () => {
    const guardadoEn = new Date('2026-10-17T22:00:00-03:00') // 17/10 en Salta, 18/10 01:00 en UTC
    const ahora = new Date('2026-10-18T01:00:00-03:00') // 18/10 en Salta, 18/10 04:00 en UTC
    const peliculas = [crearPelicula('pelicula-de-anoche')]

    const resultado = paraMostrar({ eventos: [], categorias: [], peliculas }, guardadoEn, ahora)

    // Si la comparación usara el día UTC pelado, los dos caerían el mismo
    // "18" y esto fallaría (seguiría dejando la película).
    expect(resultado.peliculas).toEqual([])
  })
})

describe('cargarAgendaConCache: una caché con `datos` de forma inesperada no tira (vuelta 1 de la revisión, seguridad)', () => {
  // Estos tres casos son los que de verdad desreferencia `paraMostrar`:
  // `datos.eventos` tiene que ser un array (si no, `.filter` tira), y cada
  // ítem tiene que tener `paraAtajo` (si no, `isVigente` tira adentro de
  // `@qps/core`, al leer `e.end_date`/`e.start_date` de `undefined`). `v` y
  // `guardadoEn` son correctos en los tres: el sobre pasa `leerCache`
  // (43-a) tal cual, porque esa validación es solo del sobre, no de
  // `datos` — por eso hay que escribirlo crudo (`escribirSobreCrudo`), no
  // con `guardarCache`, que nunca produciría una forma así.
  //
  // De dónde puede venir esto de verdad: un backup de Android restaurado
  // (Expo deja `allowBackup` en `true` por defecto) con una versión vieja
  // de la app que guardaba otra forma, o un archivo tocado a mano en un
  // teléfono con root. No es un caso imposible: no hay que borrar estos
  // tests pensando que sí lo es.
  const RAZON = 'No pudimos cargar la agenda.'

  it('datos: null', async () => {
    const almacen = crearAlmacenEnMemoria()
    await escribirSobreCrudo(almacen, CLAVE_AGENDA, new Date('2026-10-17T10:00:00-03:00'), null)

    const resultado = await cargarAgendaConCache({
      cargar: async () => ({ ok: false, error: RAZON, sinConexion: true }),
      ahora: AHORA,
      almacen,
    })

    expect(resultado).toEqual({ tipo: 'error', error: RAZON })
  })

  it('datos es un array (donde se espera el objeto { eventos, categorias, peliculas })', async () => {
    const almacen = crearAlmacenEnMemoria()
    await escribirSobreCrudo(almacen, CLAVE_AGENDA, new Date('2026-10-17T10:00:00-03:00'), [crearEvento()])

    const resultado = await cargarAgendaConCache({
      cargar: async () => ({ ok: false, error: RAZON, sinConexion: true }),
      ahora: AHORA,
      almacen,
    })

    expect(resultado).toEqual({ tipo: 'error', error: RAZON })
  })

  it('un evento sin paraAtajo (el caso que tira desde isVigente, en @qps/core)', async () => {
    const almacen = crearAlmacenEnMemoria()
    const datosRotos = { eventos: [{ evento: crearEvento().evento }], categorias: [], peliculas: [] }
    await escribirSobreCrudo(almacen, CLAVE_AGENDA, new Date('2026-10-17T10:00:00-03:00'), datosRotos)

    const resultado = await cargarAgendaConCache({
      cargar: async () => ({ ok: false, error: RAZON, sinConexion: true }),
      ahora: AHORA,
      almacen,
    })

    expect(resultado).toEqual({ tipo: 'error', error: RAZON })
  })
})
