// A6 (nube Q1) · Vacíos y sin conexión. Dos partes, mismo estilo que el resto
// de los tests de la app (sin `@testing-library/react-native`: las pantallas
// importan React Native y no se pueden montar acá):
//
//   1. La lógica pura de `lib/vacios.ts` (cada pantalla × cada vacío × con y
//      sin conexión): textos, acciones, el mensaje de error de carga,
//      `decidirRefresco` y el reintento de la sesión.
//   2. Detectores estáticos (`readFileSync`) que atan esa lógica a las cinco
//      pantallas: que la usan, y que los tres literales que otros detectores
//      fijan en la pantalla (el vacío de "Hoy" de la web, el de Mis eventos y
//      las acciones de Buscar) son los mismos que el espejo de `lib/vacios.ts`.
//
// Ronda de correcciones: textos nuevos (sin "guardado" para la copia sin
// conexión ni "cargados"), "Esta noche" modelado con las funciones de core,
// el orden reintentar sesión → esperar borrado → leer en Mis eventos, el
// resultado de tres valores de `reintentarSesion` y `router.dismissTo` en Cines.
//
// Fixtures inventados, sin red ni base.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { AuthRetryableFetchError } from '@supabase/supabase-js'
import type { Atajo } from '@qps/core/home/atajos'
import { eventoEnAtajo } from '@qps/core/home/atajos'
import { selectTodayRow } from '@qps/core/home/filters'
import { formatDateInSalta } from '@qps/core/home/transform'
import type { DisplayEvent } from '@qps/core/home/types'
import { saltaWallClockToDate } from '@qps/core/date-format'
import * as mensajes from '../lib/mensajes'
import {
  MENSAJE_ACTUALIZADO,
  MENSAJE_ERROR_SERVIDOR_CINES,
  MENSAJE_ERROR_SERVIDOR_EVENTOS,
  MENSAJE_ERROR_SERVIDOR_FAVORITOS,
  MENSAJE_ERROR_SERVIDOR_RADAR,
  MENSAJE_NO_SE_ACTUALIZO,
  MENSAJE_NO_SE_ACTUALIZO_SIN_CONEXION,
  MENSAJE_RADAR_GUARDAR_SIN_CONEXION,
  MENSAJE_SEGUIMOS_SIN_CONEXION,
  MENSAJE_SIN_CONEXION_FAVORITOS,
  MENSAJE_SIN_CONEXION_INICIO,
  MENSAJE_SIN_CONFIGURACION,
  MENSAJE_VOLVIO_LA_CONEXION,
} from '../lib/mensajes'
import * as vacios from '../lib/vacios'
import {
  ACCIONES_VACIO_BUSCAR,
  accionesVacioBuscar,
  anuncioDeReintento,
  avisoReintentoSesion,
  decidirRefresco,
  DETALLE_FAVORITOS_PASADOS,
  detalleAvisoFavoritos,
  MAXIMO_ACCIONES_VACIO,
  mensajeErrorCarga,
  SIN_CONEXION_POR_PANTALLA,
  textoSinResultadosBuscar,
  textoVacioCategoria,
  VACIO_CATEGORIAS_BUSCAR,
  VACIO_FAVORITOS,
  VACIO_FAVORITOS_SIN_CONEXION,
  vacioBuscadorRadar,
  vacioCines,
  vacioFavoritos,
  vacioHoyEnSalta,
  type EntradaVacioHoy,
  type PantallaConLista,
} from '../lib/vacios'
import { textoCantidadEventos } from '../lib/formato'
import { reintentarSesion } from '../lib/session'
import { TITULO_SIN_CONEXION } from '../lib/sin-conexion/aviso'
import type { Almacen } from '../lib/sin-conexion/almacen'
import { cargarAgendaConCache } from '../lib/sin-conexion/agenda'
import { CLAVE_FAVORITOS, guardarCache } from '../lib/sin-conexion/cache'
import { cargarFavoritosConCache, leerFavoritosGuardados } from '../lib/sin-conexion/favoritos'
import { MENSAJE_ERROR_RED as ERROR_RED_EVENTOS } from '../lib/datos/eventos'
import { MENSAJE_ERROR_RED as ERROR_RED_CINES } from '../lib/datos/cines'

// `lib/datos/*`, `lib/favoritos.ts` y `lib/session` importan `@/lib/supabase`
// (que arrastra react-native): nunca el cliente real. El doble solo tiene
// `auth.getSession`, para `reintentarSesion`; las cargas de abajo reciben su
// `cargar`/`obtener` inyectado y no lo tocan. (`vi.mock` se eleva solo por
// encima de los imports, así que puede ir acá abajo, sin romper `import/first`.)
const doble = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: doble.getSession } } }))

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const leer = (...partes: string[]) => readFileSync(join(MOBILE_ROOT, ...partes), 'utf8').replace(/\r\n/g, '\n')

const SRC_INICIO = leer('app', '(tabs)', 'index.tsx')
const SRC_BUSCAR = leer('app', '(tabs)', 'buscar.tsx')
const SRC_CINES = leer('app', 'cines.tsx')
const SRC_FAVORITOS = leer('app', '(tabs)', 'favoritos.tsx')
const SRC_RADAR = leer('components', 'PantallaRadar.tsx')
const SRC_AVISO = leer('components', 'AvisoSinConexion.tsx')
const SRC_ESTADO_CARGA = leer('components', 'EstadoCarga.tsx')

const PANTALLAS: PantallaConLista[] = ['inicio', 'buscar', 'cines', 'favoritos', 'radar']
const ATAJOS: Atajo[] = ['hoy', 'esta-noche', 'finde', 'semana']

/** El texto de la web para "Hoy en Salta" vacío (lo fija `tests/portada.test.ts` en index.tsx). */
const TEXTO_HOY_WEB = 'Hoy no hay eventos cargados. Mirá qué viene en los próximos días.'

/** Saca los comentarios `// ...` y `/* ... *\/` (para que un comentario que nombra algo no tape ni invente un hallazgo). */
function sinComentariosDeLinea(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
}

/** Todos los strings exportados de un módulo (y los que viven adentro de objetos exportados), para barrerlos. */
function stringsExportados(modulo: Record<string, unknown>): string[] {
  const salida: string[] = []
  const visitar = (valor: unknown) => {
    if (typeof valor === 'string') salida.push(valor)
    else if (valor && typeof valor === 'object') Object.values(valor).forEach(visitar)
  }
  Object.values(modulo).forEach(visitar)
  return salida
}

const CASOS_HOY: EntradaVacioHoy[] = ATAJOS.flatMap((atajo) =>
  [true, false].flatMap((hayEventosEnAtajo) =>
    [true, false].flatMap((hayEventosEnFinde) =>
      [true, false].map((desdeCache) => ({ atajo, hayEventosEnAtajo, hayEventosEnFinde, desdeCache })),
    ),
  ),
)

/** Todos los textos que `lib/vacios.ts` puede devolver (funciones con cada combinación + constantes). */
function todosLosTextosDeVacios(): string[] {
  const textos = stringsExportados(vacios as unknown as Record<string, unknown>)
  for (const caso of CASOS_HOY) {
    const vacio = vacioHoyEnSalta(caso)
    if (vacio) textos.push(vacio.texto, vacio.accion.texto)
    textos.push(textoVacioCategoria({ nombre: 'Música', atajo: caso.atajo, esCine: false, desdeCache: caso.desdeCache }))
    textos.push(textoVacioCategoria({ nombre: 'Cine', atajo: caso.atajo, esCine: true, desdeCache: caso.desdeCache }))
  }
  for (const pantalla of PANTALLAS) {
    textos.push(mensajeErrorCarga(pantalla, { error: 'x', sinConexion: true }))
    textos.push(mensajeErrorCarga(pantalla, { error: 'x' }))
  }
  textos.push(vacioCines('').texto, vacioCines('').accion.texto, vacioCines('zz').texto, vacioCines('zz').accion.texto)
  textos.push(vacioBuscadorRadar({ busqueda: 'zz', coincideConLoQueYaSeguis: false }).texto)
  textos.push(vacioBuscadorRadar({ busqueda: 'zz', coincideConLoQueYaSeguis: true }).texto)
  textos.push(textoSinResultadosBuscar({ texto: 'x', soloGratis: true, nombreCategoria: 'Música', atajo: 'finde' }))
  return textos
}

// ---------------------------------------------------------------------------
// 0. Sin jerga técnica en pantalla, sin "guardado" para la copia y sin "cargados".
// ---------------------------------------------------------------------------
describe('los textos nuevos de A6: sin jerga, sin "guardado" para la copia y sin "cargados"', () => {
  const textos = [...todosLosTextosDeVacios(), ...stringsExportados(mensajes as unknown as Record<string, unknown>)]

  it('se juntaron textos para revisar', () => {
    expect(textos.length).toBeGreaterThan(40)
  })

  it.each(['caché', 'cache', 'servidor', 'error 500', '5xx', 'offline', 'red caída', 'timeout', 'sesión'])(
    'ninguno dice "%s"',
    (jerga) => {
      const conJerga = textos.filter((texto) => texto.toLowerCase().includes(jerga))
      expect(conJerga).toEqual([])
    },
  )

  it('ninguno usa "guardado/a" (en la app "guardar" es el corazón); el título del aviso de la R43 queda afuera de este barrido', () => {
    expect(textos.filter((texto) => /\bguardad[oa]s?\b/i.test(texto))).toEqual([])
    expect(TITULO_SIN_CONEXION).toBe('Sin conexión, mostrando lo último guardado')
  })

  it('ninguno dice "cargados" (el literal de la web de "Hoy en Salta" vive en index.tsx, no acá)', () => {
    expect(textos.filter((texto) => /\bcargad[oa]s\b/i.test(texto))).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 1. mensajeErrorCarga: las 5 pantallas × (sin red | error del servidor | sin configuración).
// ---------------------------------------------------------------------------
describe('mensajeErrorCarga: sin conexión vs. error del servidor, en las cinco pantallas', () => {
  it.each([
    ['inicio', 'No hay conexión, así que no podemos traer la agenda. Conectate y tocá Reintentar.'],
    ['favoritos', 'No hay conexión, así que no podemos traer Mis eventos. Conectate y tocá Reintentar.'],
    ['buscar', 'No hay conexión, así que no podemos buscar eventos. Conectate y tocá Reintentar.'],
    ['cines', 'No hay conexión, así que no podemos traer la cartelera. Conectate y tocá Reintentar.'],
    ['radar', 'No hay conexión, así que no podemos traer tu Radar. Conectate y tocá Reintentar.'],
  ] as const)('%s, sin conexión: su propio texto', (pantalla, esperado) => {
    const texto = mensajeErrorCarga(pantalla, { error: ERROR_RED_EVENTOS, sinConexion: true })
    expect(texto).toBe(esperado)
    expect(texto).not.toContain('Revisá tu conexión')
    expect(texto).not.toContain('todavía no hay')
  })

  it('Mis eventos y Radar sin sesión por falta de red usan el mismo texto que su error sin red', () => {
    expect(SIN_CONEXION_POR_PANTALLA.favoritos).toBe(MENSAJE_SIN_CONEXION_FAVORITOS)
    expect(SIN_CONEXION_POR_PANTALLA.radar).toBe(mensajeErrorCarga('radar', { error: 'x', sinConexion: true }))
  })

  it.each([
    ['inicio', ERROR_RED_EVENTOS, MENSAJE_ERROR_SERVIDOR_EVENTOS],
    ['buscar', ERROR_RED_EVENTOS, MENSAJE_ERROR_SERVIDOR_EVENTOS],
    ['cines', ERROR_RED_CINES, MENSAJE_ERROR_SERVIDOR_CINES],
    ['favoritos', 'No pudimos cargar tus favoritos. Revisá tu conexión.', MENSAJE_ERROR_SERVIDOR_FAVORITOS],
    ['radar', 'No pudimos cargar tu Radar. Probá de nuevo.', MENSAJE_ERROR_SERVIDOR_RADAR],
  ] as const)('%s, error que no es de red (un 5xx): el texto neutro, sin "Revisá tu conexión"', (pantalla, errorDeLib, esperado) => {
    const texto = mensajeErrorCarga(pantalla, { error: errorDeLib })
    expect(texto).toBe(esperado)
    expect(texto).not.toContain('Revisá tu conexión')
    expect(texto).toContain('Probá de nuevo en un rato.')
    // `sinConexion: false` explícito es lo mismo que ausente.
    expect(mensajeErrorCarga(pantalla, { error: errorDeLib, sinConexion: false })).toBe(esperado)
  })

  it.each(PANTALLAS)('%s, sin la configuración de datos: ese mismo texto (es para el equipo, no es la red)', (pantalla) => {
    expect(mensajeErrorCarga(pantalla, { error: MENSAJE_SIN_CONFIGURACION })).toBe(MENSAJE_SIN_CONFIGURACION)
  })
})

describe('anuncioDeReintento: un "Reintentar" de ErrorCarga que vuelve a dar error se anuncia', () => {
  it('reintento + error: el texto del error', () => {
    expect(anuncioDeReintento(true, { tipo: 'error', error: MENSAJE_SIN_CONEXION_INICIO })).toBe(MENSAJE_SIN_CONEXION_INICIO)
  })

  it('primera carga (no hubo reintento), o salió bien: nada', () => {
    expect(anuncioDeReintento(false, { tipo: 'error', error: 'x' })).toBeNull()
    expect(anuncioDeReintento(true, { tipo: 'ok' })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 1b. cargarAgendaConCache / cargarFavoritosConCache: `sinConexion` llega a la
// rama de error (y solo cuando fue por red); `seOcultaronPasados`.
// ---------------------------------------------------------------------------
function almacenVacio(): Almacen {
  const mapa = new Map<string, string>()
  return {
    leer: async (clave) => mapa.get(clave) ?? null,
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

function favorito(id: string, date: string): DisplayEvent {
  return {
    id,
    slug: id,
    title: 'Evento de prueba',
    venue: 'Lugar de prueba',
    date,
    time: '21:00',
    category: 'teatro',
    categoryName: 'Teatro',
    price: 'confirmar',
    image: '/placeholder.svg',
    description: '',
    address: '',
    startDateTime: `${date}T21:00:00-03:00`,
    isFeatured: false,
  }
}

describe('la carga con la copia sin conexión: sinConexion en la rama de error, y seOcultaronPasados (A6)', () => {
  const AHORA = new Date('2030-10-17T12:00:00-03:00')
  const sinRed = async () => ({ ok: false as const, error: 'No pudimos cargar tus favoritos. Revisá tu conexión.', sinConexion: true })

  it('agenda, por red y sin copia: sinConexion true → "No hay conexión, así que no podemos traer la agenda..."', async () => {
    const resultado = await cargarAgendaConCache({
      cargar: async () => ({ ok: false, error: ERROR_RED_EVENTOS, sinConexion: true }),
      ahora: AHORA,
      almacen: almacenVacio(),
    })
    expect(resultado).toEqual({ tipo: 'error', error: ERROR_RED_EVENTOS, sinConexion: true })
    if (resultado.tipo !== 'error') throw new Error('tenía que ser error')
    expect(mensajeErrorCarga('inicio', resultado)).toBe(MENSAJE_SIN_CONEXION_INICIO)
  })

  it('agenda, error que no es de red: SIN la clave sinConexion → el texto neutro', async () => {
    const resultado = await cargarAgendaConCache({
      cargar: async () => ({ ok: false, error: ERROR_RED_EVENTOS }),
      ahora: AHORA,
      almacen: almacenVacio(),
    })
    expect(resultado).not.toHaveProperty('sinConexion')
    if (resultado.tipo !== 'error') throw new Error('tenía que ser error')
    expect(mensajeErrorCarga('inicio', resultado)).toBe(MENSAJE_ERROR_SERVIDOR_EVENTOS)
  })

  it('favoritos, por red y sin copia: sinConexion true; error que no es de red: sin la clave', async () => {
    expect(await cargarFavoritosConCache('usuario-ficticio', { obtener: sinRed, ahora: AHORA, almacen: almacenVacio() })).toMatchObject({
      tipo: 'error',
      sinConexion: true,
    })
    const otro = await cargarFavoritosConCache('usuario-ficticio', {
      obtener: async () => ({ ok: false, error: 'x' }),
      ahora: AHORA,
      almacen: almacenVacio(),
    })
    expect(otro).not.toHaveProperty('sinConexion')
  })

  it('la copia ya venía vacía (nunca se marcó nada): lista vacía SIN seOcultaronPasados — no dice que "ya pasaron"', async () => {
    const almacen = almacenVacio()
    await guardarCache(CLAVE_FAVORITOS, { voy: [], eventos: [] }, { ahora: AHORA, almacen })
    const resultado = await cargarFavoritosConCache('usuario-ficticio', { obtener: sinRed, ahora: AHORA, almacen })
    expect(resultado).toMatchObject({ tipo: 'ok', voy: [], eventos: [] })
    expect(resultado).not.toHaveProperty('seOcultaronPasados')
    expect(detalleAvisoFavoritos(false)).toBeUndefined()
    const leido = await leerFavoritosGuardados({ ahora: AHORA, almacen })
    expect(leido).not.toHaveProperty('seOcultaronPasados')
  })

  it('la copia quedó vacía al sacar lo que ya pasó: seOcultaronPasados true → el aviso lo dice', async () => {
    const almacen = almacenVacio()
    await guardarCache(CLAVE_FAVORITOS, { voy: [], eventos: [favorito('pasado-1', '2030-10-10')] }, { ahora: AHORA, almacen })
    const resultado = await cargarFavoritosConCache('usuario-ficticio', { obtener: sinRed, ahora: AHORA, almacen })
    expect(resultado).toMatchObject({ tipo: 'ok', eventos: [], seOcultaronPasados: true })
    expect((await leerFavoritosGuardados({ ahora: AHORA, almacen }))?.seOcultaronPasados).toBe(true)
    expect(detalleAvisoFavoritos(true)).toBe(DETALLE_FAVORITOS_PASADOS)
    expect(DETALLE_FAVORITOS_PASADOS).toBe('Los eventos que ya pasaron no se muestran.')
  })

  it('con eventos por venir y ninguno pasado: sin la clave', async () => {
    const almacen = almacenVacio()
    await guardarCache(CLAVE_FAVORITOS, { voy: [], eventos: [favorito('futuro-1', '2030-10-20')] }, { ahora: AHORA, almacen })
    const resultado = await cargarFavoritosConCache('usuario-ficticio', { obtener: sinRed, ahora: AHORA, almacen })
    expect(resultado).not.toHaveProperty('seOcultaronPasados')
  })
})

// ---------------------------------------------------------------------------
// 2. decidirRefresco.
// ---------------------------------------------------------------------------
describe('decidirRefresco: un refresco con algo ya a la vista', () => {
  type Estado =
    | { tipo: 'cargando' }
    | { tipo: 'error'; error: string; sinConexion?: boolean }
    | { tipo: 'ok'; items: string[]; desdeCache?: { guardadoEn: Date } | null }
    | { tipo: 'invitar' }

  const guardadoEn = new Date('2030-10-17T10:00:00-03:00')
  const fresco: Estado = { tipo: 'ok', items: ['a'], desdeCache: null }
  const frescoSinCampo: Estado = { tipo: 'ok', items: ['a'] }
  const copia: Estado = { tipo: 'ok', items: ['b'], desdeCache: { guardadoEn } }
  const copiaOtraVez: Estado = { tipo: 'ok', items: ['b2'], desdeCache: { guardadoEn } }
  const errorRed: Estado = { tipo: 'error', error: 'x', sinConexion: true }
  const errorServidor: Estado = { tipo: 'error', error: 'x' }

  it('con datos frescos y un refresco que falla por red: CONSERVA los datos y avisa "No pudimos actualizar: no hay conexión."', () => {
    const decision = decidirRefresco<Estado>(fresco, errorRed)
    expect(decision.estado).toBe(fresco)
    expect(decision.nota).toBe('No pudimos actualizar: no hay conexión.')
    expect(decision.anuncio).toBe(MENSAJE_NO_SE_ACTUALIZO_SIN_CONEXION)
  })

  it('con datos frescos (Buscar/Cines, sin desdeCache) y un error del servidor: conserva y avisa con el texto neutro', () => {
    const decision = decidirRefresco<Estado>(frescoSinCampo, errorServidor)
    expect(decision.estado).toBe(frescoSinCampo)
    expect(decision.nota).toBe('No pudimos actualizar. Probá de nuevo en un rato.')
    expect(decision.nota).toBe(MENSAJE_NO_SE_ACTUALIZO)
  })

  it('con la copia a la vista y un error: conserva la copia', () => {
    const decision = decidirRefresco<Estado>(copia, errorServidor)
    expect(decision.estado).toBe(copia)
    expect(decision.nota).toBe(MENSAJE_NO_SE_ACTUALIZO)
  })

  it('con la copia a la vista y otra vez la copia: "Probamos de nuevo y seguimos sin conexión.", visible y anunciado', () => {
    const decision = decidirRefresco<Estado>(copia, copiaOtraVez)
    expect(decision.estado).toBe(copiaOtraVez)
    expect(decision.nota).toBe('Probamos de nuevo y seguimos sin conexión.')
    expect(decision.anuncio).toBe(MENSAJE_SEGUIMOS_SIN_CONEXION)
  })

  it('con datos frescos y ahora la copia: queda la copia (el aviso aparece solo) y se anuncia su título', () => {
    const decision = decidirRefresco<Estado>(fresco, copia)
    expect(decision.estado).toBe(copia)
    expect(decision.nota).toBeNull()
    expect(decision.anuncio).toBe(TITULO_SIN_CONEXION)
  })

  it('de la copia a datos frescos: se anuncia "Volvió la conexión."', () => {
    expect(decidirRefresco<Estado>(copia, fresco)).toEqual({ estado: fresco, anuncio: MENSAJE_VOLVIO_LA_CONEXION, nota: null })
    expect(MENSAJE_VOLVIO_LA_CONEXION).toBe('Volvió la conexión.')
  })

  it('se va la banda "No pudimos actualizar" (había nota y ahora salió bien): se anuncia "Listo, actualizado."', () => {
    expect(decidirRefresco<Estado>(fresco, frescoSinCampo, MENSAJE_NO_SE_ACTUALIZO)).toEqual({
      estado: frescoSinCampo,
      anuncio: MENSAJE_ACTUALIZADO,
      nota: null,
    })
    expect(MENSAJE_ACTUALIZADO).toBe('Listo, actualizado.')
  })

  it('un refresco fresco sin banda antes: sin anuncio', () => {
    expect(decidirRefresco<Estado>(fresco, frescoSinCampo)).toEqual({ estado: frescoSinCampo, anuncio: null, nota: null })
  })

  it('sin datos a la vista (error o invitar), un error nuevo reemplaza al viejo', () => {
    expect(decidirRefresco<Estado>(errorServidor, errorRed).estado).toBe(errorRed)
    expect(decidirRefresco<Estado>({ tipo: 'invitar' }, { tipo: 'invitar' }).nota).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2b. reintentarSesion (lib/session) y avisoReintentoSesion.
// ---------------------------------------------------------------------------
describe('reintentarSesion: volvió / sin red / sin sesión (isAuthRetryableFetchError)', () => {
  it('con sesión: "volvio"', async () => {
    doble.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'u' } } }, error: null })
    expect(await reintentarSesion()).toBe('volvio')
  })

  it('sin sesión con un error de red de supabase-js: "sin-red"', async () => {
    doble.getSession.mockResolvedValueOnce({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) })
    expect(await reintentarSesion()).toBe('sin-red')
  })

  it('getSession tira un error de red: "sin-red"', async () => {
    doble.getSession.mockRejectedValueOnce(new AuthRetryableFetchError('Failed to fetch', 0))
    expect(await reintentarSesion()).toBe('sin-red')
  })

  it('sin sesión y sin error de red (por ejemplo, el token fue revocado): "sin-sesion"', async () => {
    doble.getSession.mockResolvedValueOnce({ data: { session: null }, error: null })
    expect(await reintentarSesion()).toBe('sin-sesion')
    doble.getSession.mockRejectedValueOnce(new Error('otra cosa'))
    expect(await reintentarSesion()).toBe('sin-sesion')
  })

  it('avisoReintentoSesion: solo "sin-red" dice "seguimos sin conexión"; "volvio" anuncia que volvió; "sin-sesion", nada', () => {
    expect(avisoReintentoSesion('sin-red')).toEqual({ anuncio: MENSAJE_SEGUIMOS_SIN_CONEXION, nota: MENSAJE_SEGUIMOS_SIN_CONEXION })
    expect(avisoReintentoSesion('volvio')).toEqual({ anuncio: MENSAJE_VOLVIO_LA_CONEXION, nota: null })
    expect(avisoReintentoSesion('sin-sesion')).toEqual({ anuncio: null, nota: null })
  })
})

// ---------------------------------------------------------------------------
// 3. Inicio: "Hoy en Salta" y el modo categoría.
// ---------------------------------------------------------------------------
describe('vacioHoyEnSalta: honesto con la pill elegida (4 pills × eventos en la pill × en el finde × sin conexión)', () => {
  it('pill "Hoy", con conexión: null (la portada dibuja el texto de la web y "Ver esta semana")', () => {
    for (const caso of CASOS_HOY.filter((c) => c.atajo === 'hoy' && !c.desdeCache)) expect(vacioHoyEnSalta(caso)).toBeNull()
  })

  it.each(CASOS_HOY.filter((c) => !(c.atajo === 'hoy' && !c.desdeCache)))(
    'pill $atajo · en la pill $hayEventosEnAtajo · en el finde $hayEventosEnFinde · sin conexión $desdeCache → texto propio y una acción que no es la pill elegida',
    (caso) => {
      const vacio = vacioHoyEnSalta(caso)
      expect(vacio).not.toBeNull()
      if (!vacio) return
      if (vacio.accion.destino.tipo === 'atajo') expect(vacio.accion.destino.atajo).not.toBe(caso.atajo)
      expect(vacio.texto).not.toBe(TEXTO_HOY_WEB)
      expect(vacio.accion.texto.length).toBeGreaterThan(0)
    },
  )

  it.each([
    [{ atajo: 'hoy', hayEventosEnAtajo: false, hayEventosEnFinde: false, desdeCache: true }, 'Sin conexión no vemos eventos para hoy. Mirá qué viene en los próximos días.', 'Ver esta semana'],
    [{ atajo: 'esta-noche', hayEventosEnAtajo: true, hayEventosEnFinde: false, desdeCache: false }, 'Lo de esta noche está más abajo, por categoría.', 'Ver lo de hoy'],
    [{ atajo: 'esta-noche', hayEventosEnAtajo: false, hayEventosEnFinde: false, desdeCache: false }, 'No hay eventos para esta noche. Fijate qué hay durante el día.', 'Ver lo de hoy'],
    [{ atajo: 'esta-noche', hayEventosEnAtajo: false, hayEventosEnFinde: false, desdeCache: true }, 'Sin conexión no vemos eventos para esta noche. Fijate qué hay durante el día.', 'Ver lo de hoy'],
    [{ atajo: 'finde', hayEventosEnAtajo: true, hayEventosEnFinde: true, desdeCache: false }, 'Lo del finde no es para hoy: está más abajo, por categoría.', 'Ver lo de hoy'],
    [{ atajo: 'finde', hayEventosEnAtajo: false, hayEventosEnFinde: false, desdeCache: true }, 'Sin conexión no vemos eventos para el finde. Mirá qué viene en la semana.', 'Ver esta semana'],
    [{ atajo: 'semana', hayEventosEnAtajo: true, hayEventosEnFinde: true, desdeCache: false }, 'Hoy no hay nada, pero esta semana sí: está más abajo, por categoría.', 'Ver el finde'],
    [{ atajo: 'semana', hayEventosEnAtajo: true, hayEventosEnFinde: false, desdeCache: false }, 'Hoy no hay nada, pero esta semana sí: está más abajo, por categoría.', 'Buscar en todas las fechas'],
    [{ atajo: 'semana', hayEventosEnAtajo: false, hayEventosEnFinde: false, desdeCache: true }, 'Sin conexión no vemos eventos para esta semana.', 'Buscar en todas las fechas'],
  ] as [EntradaVacioHoy, string, string][])('%o → "%s" + "%s"', (entrada, texto, accion) => {
    const vacio = vacioHoyEnSalta(entrada)
    expect(vacio?.texto).toBe(texto)
    expect(vacio?.accion.texto).toBe(accion)
  })

  it('"Semana" con eventos más abajo ofrece "Ver el finde" SOLO si el finde tiene eventos', () => {
    expect(vacioHoyEnSalta({ atajo: 'semana', hayEventosEnAtajo: true, hayEventosEnFinde: true, desdeCache: false })?.accion.destino).toEqual({
      tipo: 'atajo',
      atajo: 'finde',
    })
    expect(vacioHoyEnSalta({ atajo: 'semana', hayEventosEnAtajo: true, hayEventosEnFinde: false, desdeCache: false })?.accion.destino).toEqual({
      tipo: 'buscar',
    })
  })
})

// Bug 1 de la ronda de correcciones: "Hoy en Salta" es `date === hoy` (core,
// `selectTodayRow`) y la ventana de "Esta noche" llega a las 05:59 del día
// siguiente. Se modela con las MISMAS funciones de core que usa el
// `useMemo` de `datosPortada`: un boliche a las 00:30 entra en la pill pero
// no en "Hoy en Salta", y el vacío tiene que decir que está más abajo.
describe('"Esta noche" con un boliche a las 00:30: hoyEventos vacío, eventosDelAtajo lleno (core)', () => {
  const ahora = saltaWallClockToDate('2030-10-18T22:00:00') // viernes 22:00 de Salta
  const inicio = saltaWallClockToDate('2030-10-19T00:30:00')
  const item = {
    paraAtajo: { start_date: inicio.toISOString(), end_date: null, category: 'boliches' },
    evento: { ...favorito('boliche-1', formatDateInSalta(inicio)), category: 'boliches', startDateTime: inicio.toISOString() },
  }

  it('el modelo: entra en la pill, no en "Hoy en Salta"', () => {
    const eventosDelAtajo = [item].filter((i) => eventoEnAtajo(i.paraAtajo, 'esta-noche', ahora)).map((i) => i.evento)
    expect(eventosDelAtajo).toHaveLength(1)
    expect(selectTodayRow(eventosDelAtajo, formatDateInSalta(ahora), ahora)).toEqual([])
  })

  it('con hayEventosEnAtajo (lo que mira la portada), el vacío dice que está más abajo, no que no hay nada', () => {
    const eventosDelAtajo = [item].filter((i) => eventoEnAtajo(i.paraAtajo, 'esta-noche', ahora))
    const vacio = vacioHoyEnSalta({
      atajo: 'esta-noche',
      hayEventosEnAtajo: eventosDelAtajo.length > 0,
      hayEventosEnFinde: true,
      desdeCache: false,
    })
    expect(vacio?.texto).toBe('Lo de esta noche está más abajo, por categoría.')
  })

  it('index.tsx arma hayEventosEnAtajo con eventosDelAtajo (no con hoyEventos) y hayEventosEnFinde con eventoEnAtajo(..., "finde", ...)', () => {
    expect(SRC_INICIO).toMatch(/const hayEventosEnAtajo = eventosDelAtajo\.length > 0/)
    expect(SRC_INICIO).toMatch(/const hayEventosEnFinde = estado\.eventos\.some\(\(item\) => eventoEnAtajo\(item\.paraAtajo, 'finde', ahora\)\)/)
  })
})

describe('textoVacioCategoria (modo categoría de Inicio)', () => {
  it('con conexión, el texto de siempre', () => {
    expect(textoVacioCategoria({ nombre: 'Música', atajo: 'finde', esCine: false, desdeCache: false })).toBe(
      'No hay eventos de Música para el finde.',
    )
  })

  it('sin conexión: "Sin conexión no vemos eventos de X para ..."', () => {
    expect(textoVacioCategoria({ nombre: 'Música', atajo: 'hoy', esCine: false, desdeCache: true })).toBe(
      'Sin conexión no vemos eventos de Música para hoy.',
    )
  })

  it('con el cine: nombra también las películas; sin conexión (la copia no trae la cartelera de otro día), no podemos mostrarla', () => {
    expect(textoVacioCategoria({ nombre: 'Cine', atajo: 'hoy', esCine: true, desdeCache: false })).toBe(
      'No hay películas en cartel ni eventos de Cine para hoy.',
    )
    expect(textoVacioCategoria({ nombre: 'Cine', atajo: 'hoy', esCine: true, desdeCache: true })).toBe(
      'Sin conexión no podemos mostrarte la cartelera.',
    )
  })
})

describe('app/(tabs)/index.tsx usa lib/vacios (detector estático)', () => {
  it('el vacío de "Hoy en Salta" pasa por vacioHoyEnSalta, con el texto de la web como caso de siempre', () => {
    expect(SRC_INICIO).toMatch(/vacioHoyEnSalta\(\{\s*atajo,\s*hayEventosEnAtajo: datosPortada\.hayEventosEnAtajo,\s*hayEventosEnFinde: datosPortada\.hayEventosEnFinde,/)
    expect(SRC_INICIO).toContain(`{vacioHoy ? vacioHoy.texto : '${TEXTO_HOY_WEB}'}`)
    expect(SRC_INICIO).toContain(`{vacioHoy ? vacioHoy.accion.texto : 'Ver esta semana'}`)
    expect(SRC_INICIO).toMatch(/onPress=\{\(\) => \(vacioHoy \? irADestino\(vacioHoy\.accion\.destino\) : cambiarAtajo\('semana'\)\)\}/)
  })

  it('la caja vacía de "Hoy en Salta" no se achica: vacioHoy sin cambios y vacioHoyAlto con minHeight 188 (regla (a))', () => {
    const vacioHoy = SRC_INICIO.match(/vacioHoy: \{([^}]*)\}/)
    expect(vacioHoy).not.toBeNull()
    expect(vacioHoy![1]).toMatch(/padding: 20/)
    expect(vacioHoy![1]).toMatch(/gap: 16/)
    expect(SRC_INICIO).toMatch(/vacioHoyAlto: \{ minHeight: 188,/)
    expect(SRC_INICIO).toMatch(/key="hoy-en-salta-vacio"\s+style=\{\[estilos\.vacioHoy, estilos\.vacioHoyAlto,/)
  })

  it('el modo categoría usa textoVacioCategoria con desdeCache', () => {
    // Integración R76: el texto se arma una vez (`textoVacio`) y lo usan el nodo
    // visible y el anuncio de A8, así que el desdeCache sale de `estado.tipo === 'ok'`.
    expect(SRC_INICIO).toMatch(/textoVacioCategoria\(\{[\s\S]*?desdeCache: estado\.tipo === 'ok' && estado\.desdeCache !== null,?\s*\}\)/)
    expect(SRC_INICIO).toMatch(/<Texto tono="secundario">\s*\{textoVacio\}\s*<\/Texto>/)
  })

  it('el error de carga pasa por mensajeErrorCarga("inicio", ...) y un reintento con error se anuncia', () => {
    expect(SRC_INICIO).toMatch(/mensajeErrorCarga\('inicio', resultado\)/)
    expect(SRC_INICIO).toMatch(/anuncioDeReintento\(intento > 0, resultado\)/)
  })

  it('refrescar usa decidirRefresco (con la nota previa) y anuncia con anunciar() (lib/anunciar.ts)', () => {
    const refrescar = SRC_INICIO.slice(SRC_INICIO.indexOf('const refrescar = useCallback('), SRC_INICIO.indexOf('const datosPortada'))
    expect(refrescar).toMatch(/decidirRefresco\(estado, await cargarDatos\(\), notaRefresco\)/)
    expect(refrescar).toMatch(/const aviso = decision\.anuncio\s*if \(aviso\) anunciar\(aviso\)/)
    expect(refrescar).not.toMatch(/AccessibilityInfo/)
    expect(refrescar).toMatch(/\[cargarDatos, estado, notaRefresco\]/)
  })

  it('el aviso de sin conexión lleva "Reintentar" (onReintentar={refrescar}) y la nota del refresco', () => {
    expect(SRC_INICIO).toMatch(/<AvisoSinConexion guardadoEn=\{estado\.desdeCache\.guardadoEn\} onReintentar=\{refrescar\}[^>]*nota=\{notaRefresco\}/)
    expect(SRC_INICIO).toMatch(/<AvisoNoSeActualizo texto=\{notaRefresco\} onReintentar=\{refrescar\}/)
  })
})

// ---------------------------------------------------------------------------
// 4. Buscar.
// ---------------------------------------------------------------------------
describe('textoSinResultadosBuscar', () => {
  it('con texto, "Solo gratis", categoría y fecha: todo nombrado, con punto final y sin "·"', () => {
    expect(textoSinResultadosBuscar({ texto: 'x', soloGratis: true, nombreCategoria: 'Música', atajo: 'esta-noche' })).toBe(
      'No encontramos eventos gratis con "x" en Música para esta noche.',
    )
  })

  it('con texto solo', () => {
    expect(textoSinResultadosBuscar({ texto: 'peña', soloGratis: false, nombreCategoria: null, atajo: null })).toBe(
      'No encontramos eventos con "peña".',
    )
  })

  it('sin texto: el de siempre', () => {
    expect(textoSinResultadosBuscar({ texto: '', soloGratis: true, nombreCategoria: 'Teatro', atajo: 'hoy' })).toBe(
      'No hay eventos gratis en Teatro para hoy.',
    )
    expect(textoSinResultadosBuscar({ texto: '', soloGratis: false, nombreCategoria: null, atajo: null })).toBe(
      'No hay eventos por ahora.',
    )
  })
})

describe('accionesVacioBuscar: una salida por filtro, por prioridad, como mucho tres (mismo criterio que la pantalla)', () => {
  const combinaciones = [true, false].flatMap((conTexto) =>
    [true, false].flatMap((conAtajo) =>
      [true, false].flatMap((soloGratis) => [true, false].map((conCategoria) => ({ conTexto, conAtajo, soloGratis, conCategoria }))),
    ),
  )

  it.each(combinaciones)('texto $conTexto · fecha $conAtajo · gratis $soloGratis · categoría $conCategoria', (c) => {
    const acciones = accionesVacioBuscar({
      texto: c.conTexto ? 'algo' : '',
      atajo: c.conAtajo ? 'hoy' : null,
      soloGratis: c.soloGratis,
      categoria: c.conCategoria ? 'musica' : null,
    })
    const esperadas = [
      c.conTexto && ACCIONES_VACIO_BUSCAR.texto,
      c.conAtajo && ACCIONES_VACIO_BUSCAR.atajo,
      c.soloGratis && ACCIONES_VACIO_BUSCAR.soloGratis,
      c.conCategoria && ACCIONES_VACIO_BUSCAR.categoria,
    ].filter((x): x is (typeof ACCIONES_VACIO_BUSCAR)[keyof typeof ACCIONES_VACIO_BUSCAR] => Boolean(x))
    expect(acciones).toEqual(esperadas.slice(0, MAXIMO_ACCIONES_VACIO))
    expect(acciones.length).toBeLessThanOrEqual(3)
  })

  it('una categoría elegida cuyo nombre no se encontró (slug desconocido) igual ofrece "Todas las categorías", como la pantalla', () => {
    expect(accionesVacioBuscar({ texto: '', atajo: null, soloGratis: false, categoria: 'slug-que-no-existe' })).toEqual([
      'Todas las categorías',
    ])
    // `!== null`, no "truthy": la pantalla compara `categoriaFiltro !== null`.
    expect(accionesVacioBuscar({ texto: '', atajo: null, soloGratis: false, categoria: '' })).toEqual(['Todas las categorías'])
  })

  it('con los cuatro filtros, queda afuera "Todas las categorías" (sus chips, con "Todas", están justo arriba)', () => {
    expect(accionesVacioBuscar({ texto: 'x', atajo: 'hoy', soloGratis: true, categoria: 'musica' })).toEqual([
      'Limpiar búsqueda',
      'Ver todas las fechas',
      'Sacar “Solo gratis”',
    ])
  })
})

describe('app/(tabs)/buscar.tsx: el vacío, el tile y la grilla vacía (detector estático)', () => {
  it('los accionesVacio.push están en el orden de ACCIONES_VACIO_BUSCAR, con esos textos y las MISMAS condiciones que accionesVacioBuscar', () => {
    const pushes = [...SRC_BUSCAR.matchAll(/if \(([^)]+?)\) accionesVacio\.push\(\{ texto: '([^']+)'/g)].map((m) => [m[1], m[2]])
    expect(pushes).toEqual([
      ['texto', ACCIONES_VACIO_BUSCAR.texto],
      ['atajo !== null', ACCIONES_VACIO_BUSCAR.atajo],
      ['soloGratisActivo', ACCIONES_VACIO_BUSCAR.soloGratis],
      ['categoriaFiltro !== null', ACCIONES_VACIO_BUSCAR.categoria],
    ])
  })

  it('cada push nuevo tiene su acción', () => {
    expect(SRC_BUSCAR).toMatch(/if \(texto\) accionesVacio\.push\(\{ texto: 'Limpiar búsqueda', alTocar: \(\) => setTexto\(''\) \}\)/)
    expect(SRC_BUSCAR).toMatch(
      /if \(soloGratisActivo\) accionesVacio\.push\(\{ texto: 'Sacar “Solo gratis”', alTocar: \(\) => setSoloGratisActivo\(false\) \}\)/,
    )
  })

  it('corta en MAXIMO_ACCIONES_VACIO después de los push', () => {
    const idxSplice = SRC_BUSCAR.indexOf('accionesVacio.splice(MAXIMO_ACCIONES_VACIO)')
    expect(idxSplice).toBeGreaterThan(SRC_BUSCAR.lastIndexOf('accionesVacio.push('))
  })

  it('el mensaje del vacío sale de textoSinResultadosBuscar', () => {
    // Integración R76: con texto, la de A6 (`lib/vacios.ts`, importada como
    // `textoSinResultadosConTexto`); sin texto, la de A3 (`lib/buscar-filtros.ts`).
    expect(SRC_BUSCAR).toMatch(/textoSinResultadosBuscar as textoSinResultadosConTexto/)
    expect(SRC_BUSCAR).toMatch(/textoSinResultadosConTexto\(\{/)
    expect(SRC_BUSCAR).toMatch(/<Vacio mensaje=\{textoSinResultados\} \/>/)
  })

  it('el tile ya no dice "1 eventos": textoCantidadEventos', () => {
    expect(SRC_BUSCAR).toMatch(/\{textoCantidadEventos\(cantidad\)\}/)
    expect(SRC_BUSCAR).not.toMatch(/\{cantidad\} eventos/)
    expect(textoCantidadEventos(1)).toBe('1 evento')
    expect(textoCantidadEventos(0)).toBe('0 eventos')
    expect(textoCantidadEventos(7)).toBe('7 eventos')
  })

  it('la grilla de categorías vacía ofrece Reintentar (ErrorCarga con refrescar)', () => {
    expect(SRC_BUSCAR).toMatch(/ListEmptyComponent=\{<ErrorCarga mensaje=\{VACIO_CATEGORIAS_BUSCAR\} onReintentar=\{refrescar\} \/>\}/)
    expect(VACIO_CATEGORIAS_BUSCAR).toBe('Por ahora no hay categorías para mostrar. Tocá Reintentar o buscá por nombre arriba.')
  })

  it('el error pasa por mensajeErrorCarga("buscar", ...), el refresco por decidirRefresco y un reintento con error se anuncia', () => {
    expect(SRC_BUSCAR.match(/mensajeErrorCarga\('buscar', \{ \.\.\.resultado(Eventos|Categorias), sinConexion \}\)/g)).toHaveLength(2)
    expect(SRC_BUSCAR).toMatch(/decidirRefresco\(estado, await obtenerDatos\(\), notaRefresco\)/)
    expect(SRC_BUSCAR).toMatch(/<AvisoNoSeActualizo texto=\{notaRefresco\} onReintentar=\{refrescar\}/)
    expect(SRC_BUSCAR).toMatch(/anuncioDeReintento\(intento > 0, resultado\)/)
  })
})

// ---------------------------------------------------------------------------
// 5. Cines.
// ---------------------------------------------------------------------------
describe('vacioCines', () => {
  it('con búsqueda: el texto de la web + "Limpiar búsqueda"', () => {
    expect(vacioCines('dune')).toEqual({
      texto: 'No hay resultados para "dune". Probá buscando con otro título.',
      accion: { texto: 'Limpiar búsqueda', destino: 'limpiar-busqueda' },
    })
  })

  it('sin búsqueda: por qué no hay nada + "Ver eventos de hoy"', () => {
    expect(vacioCines('')).toEqual({
      texto: 'Por ahora no hay películas en cartel. Mientras tanto, mirá qué otros eventos hay hoy.',
      accion: { texto: 'Ver eventos de hoy', destino: 'ver-eventos-de-hoy' },
    })
  })
})

describe('app/cines.tsx (detector estático)', () => {
  it('el vacío usa vacioCines con su acción, rellena (es la única)', () => {
    expect(SRC_CINES).toMatch(/const vacio = vacioCines\(busqueda\)/)
    expect(SRC_CINES).toMatch(
      /<Vacio mensaje=\{vacio\.texto\} textoAccion=\{vacio\.accion\.texto\} onAccion=\{alTocarAccionVacio\} accionPrincipal \/>/,
    )
  })

  it('"Ver eventos de hoy" vuelve al (tabs) de abajo con dismissTo (nunca push ni navigate: apilan otro (tabs))', () => {
    expect(SRC_CINES).toMatch(/router\.dismissTo\(`\/buscar\?atajo=hoy&v=\$\{Date\.now\(\)\}`\)/)
    expect(sinComentariosDeLinea(SRC_CINES)).not.toMatch(/router\.(push|navigate)\(/)
    expect(SRC_CINES).toMatch(/if \(vacio\.accion\.destino === 'limpiar-busqueda'\) setBusqueda\(''\)/)
  })

  it('el error pasa por mensajeErrorCarga("cines", ...), el refresco por decidirRefresco y un reintento con error se anuncia', () => {
    expect(SRC_CINES).toMatch(/mensajeErrorCarga\('cines', resultado\)/)
    expect(SRC_CINES).toMatch(/decidirRefresco\(estado, await obtenerDatos\(\), notaRefresco\)/)
    expect(SRC_CINES).toMatch(/anuncioDeReintento\(intento > 0, resultado\)/)
  })
})

// ---------------------------------------------------------------------------
// 6. Mis eventos (Favoritos).
// ---------------------------------------------------------------------------
describe('vacioFavoritos', () => {
  it('con conexión: porqué + "Ver la agenda", y menciona "Mis eventos"', () => {
    expect(vacioFavoritos(false)).toBe(VACIO_FAVORITOS)
    expect(VACIO_FAVORITOS.mensaje).toContain('Mis eventos')
    expect(VACIO_FAVORITOS.mensaje).toContain('Tocá el corazón')
    expect(VACIO_FAVORITOS.textoAccion).toBe('Ver la agenda')
  })

  it('sin conexión: "No hay eventos por venir en Mis eventos." — los pasados se explican solo en el aviso', () => {
    expect(vacioFavoritos(true)).toBe(VACIO_FAVORITOS_SIN_CONEXION)
    expect(VACIO_FAVORITOS_SIN_CONEXION.mensaje).toBe('No hay eventos por venir en Mis eventos.')
    expect(VACIO_FAVORITOS_SIN_CONEXION.mensaje).not.toMatch(/pasaron/)
  })
})

describe('app/(tabs)/favoritos.tsx (detector estático)', () => {
  it('el literal del vacío con red es el mismo que VACIO_FAVORITOS (espejo en lib/vacios.ts), va a "/" y es la acción principal', () => {
    expect(SRC_FAVORITOS).toContain(
      `<Vacio\n                mensaje="${VACIO_FAVORITOS.mensaje}"\n                textoAccion="${VACIO_FAVORITOS.textoAccion}"\n                onAccion={() => router.push('/')}\n                accionPrincipal`,
    )
  })

  it('sin conexión, el vacío es VACIO_FAVORITOS_SIN_CONEXION y el detalle de los pasados solo si seOcultaronPasados', () => {
    expect(SRC_FAVORITOS).toMatch(/mensaje=\{VACIO_FAVORITOS_SIN_CONEXION\.mensaje\}/)
    expect(SRC_FAVORITOS).toMatch(
      /<AvisoSinConexion\s+guardadoEn=\{estado\.desdeCache\.guardadoEn\}\s+detalle=\{detalleAvisoFavoritos\(estado\.seOcultaronPasados === true\)\}\s+onReintentar=\{refrescar\}/,
    )
    // Las tres lecturas de la copia pasan la marca al estado.
    expect(SRC_FAVORITOS.match(/seOcultaronPasados: (resultado|cache)\.seOcultaronPasados/g)).toHaveLength(4)
  })

  it('sin sesión por falta de red: una vista propia ANTES de la de "Entrá…", sin "Entrá" ni "Ingresar", con Reintentar', () => {
    const idxSinRed = SRC_FAVORITOS.indexOf("if (vista === 'invitar' && sinConexion) {")
    const idxInvitar = SRC_FAVORITOS.indexOf("if (vista === 'invitar') {")
    expect(idxSinRed).toBeGreaterThan(-1)
    expect(idxInvitar).toBeGreaterThan(idxSinRed)
    const bloque = sinComentariosDeLinea(SRC_FAVORITOS.slice(idxSinRed, idxInvitar))
    expect(bloque).toMatch(/\{SIN_CONEXION_POR_PANTALLA\.favoritos\}/)
    expect(bloque).toMatch(/<BotonReintentar onReintentar=\{refrescar\} reintentando=\{refrescando\} \/>/)
    expect(bloque).not.toMatch(/Entrá|Ingresar|\/cuenta/)
  })

  it('refrescar sin sesión: PRIMERO reintentarSesion (si volvió, sale), DESPUÉS esperarBorradoDeCache y recién ahí leer la copia', () => {
    const idxRefrescar = SRC_FAVORITOS.indexOf('const refrescar = useCallback(')
    const idxReintentar = SRC_FAVORITOS.indexOf('await reintentarSesion()', idxRefrescar)
    const idxVolvio = SRC_FAVORITOS.indexOf("if (resultadoSesion === 'volvio') {", idxRefrescar)
    const idxEspera = SRC_FAVORITOS.indexOf('await esperarBorradoDeCache()', idxRefrescar)
    const idxLectura = SRC_FAVORITOS.indexOf('await leerFavoritosGuardados()', idxRefrescar)
    expect(idxReintentar).toBeGreaterThan(idxRefrescar)
    expect(idxVolvio).toBeGreaterThan(idxReintentar)
    expect(idxEspera).toBeGreaterThan(idxVolvio)
    expect(idxLectura).toBeGreaterThan(idxEspera)
    // Entre "volvió" y la espera hay un `return` (no lee la copia si volvió la sesión).
    expect(SRC_FAVORITOS.slice(idxVolvio, idxEspera)).toMatch(/\breturn\b/)
  })

  it('refrescar con sesión descarta la respuesta si cambió la carga vigente (cargaVigenteRef), y el foco la invalida', () => {
    const idxRefrescar = SRC_FAVORITOS.indexOf('const refrescar = useCallback(')
    const idxConSesion = SRC_FAVORITOS.indexOf('const resultado = await cargarFavoritosConCache(userId)', idxRefrescar)
    expect(idxConSesion).toBeGreaterThan(idxRefrescar)
    expect(SRC_FAVORITOS.slice(idxConSesion, idxConSesion + 200)).toMatch(/if \(cargaVigenteRef\.current !== estaCarga\) \{/)
    const foco = SRC_FAVORITOS.slice(SRC_FAVORITOS.indexOf('useFocusEffect(\n'), SRC_FAVORITOS.indexOf('if (userId) {\n        cargar()'))
    expect(foco).toMatch(/const estaCarga = \+\+cargaVigenteRef\.current/)
  })

  it('el error pasa por mensajeErrorCarga("favoritos", ...) en cargar y en refrescar, y un reintento con error se anuncia', () => {
    expect(SRC_FAVORITOS.match(/mensajeErrorCarga\('favoritos', resultado\)/g)).toHaveLength(2)
    expect(SRC_FAVORITOS).toMatch(/anuncioDeReintento\(habiaError, nuevo\)/)
  })
})

// ---------------------------------------------------------------------------
// 7. Radar.
// ---------------------------------------------------------------------------
describe('vacioBuscadorRadar', () => {
  it('sin coincidencias: qué se buscó + "Limpiar búsqueda"', () => {
    expect(vacioBuscadorRadar({ busqueda: ' usina ', coincideConLoQueYaSeguis: false })).toEqual({
      texto: 'No encontramos lugares ni cuentas con "usina". Probá con otro nombre.',
      textoAccion: 'Limpiar búsqueda',
    })
  })

  it('si coincide con algo que ya se sigue, lo dice', () => {
    expect(vacioBuscadorRadar({ busqueda: 'metro', coincideConLoQueYaSeguis: true }).texto).toBe(
      'Ya seguís todo lo que coincide con "metro".',
    )
  })

  it('guardar sin red: dice que puede haber quedado a medias y que los cambios siguen acá', () => {
    expect(MENSAJE_RADAR_GUARDAR_SIN_CONEXION).toMatch(/^No pudimos guardar tu Radar/)
    expect(MENSAJE_RADAR_GUARDAR_SIN_CONEXION).toMatch(/a medias/)
    expect(MENSAJE_RADAR_GUARDAR_SIN_CONEXION).toMatch(/Tus cambios siguen acá: cuando vuelva la conexión, tocá Guardar de nuevo\.$/)
  })
})

describe('components/PantallaRadar.tsx (detector estático)', () => {
  it('sin sesión por falta de red, una rama propia antes de "Ingresar para armar tu Radar", con Reintentar', () => {
    const idxSinRed = SRC_RADAR.indexOf('} else if (!userId && sesionSinConexion) {')
    const idxSinSesion = SRC_RADAR.indexOf('} else if (!userId) {')
    expect(idxSinRed).toBeGreaterThan(-1)
    expect(idxSinSesion).toBeGreaterThan(idxSinRed)
    const bloque = sinComentariosDeLinea(SRC_RADAR.slice(idxSinRed, idxSinSesion))
    expect(bloque).toMatch(/\{SIN_CONEXION_POR_PANTALLA\.radar\}/)
    expect(bloque).toMatch(/<BotonReintentar onReintentar=\{reintentarLaSesion\} reintentando=\{reintentandoSesion\} \/>/)
    expect(bloque).not.toMatch(/Ingresar/)
  })

  it('reintentarLaSesion usa avisoReintentoSesion (solo "sin-red" dice que seguimos sin conexión)', () => {
    expect(SRC_RADAR).toMatch(/const aviso = avisoReintentoSesion\(await reintentarSesion\(\)\)/)
  })

  it('arriba de "Ingresar para armar tu Radar" hay un texto que dice para qué', () => {
    const idxSinSesion = SRC_RADAR.indexOf('} else if (!userId) {')
    const idxBoton = SRC_RADAR.indexOf('Ingresar para armar tu Radar', idxSinSesion)
    const idxTexto = SRC_RADAR.indexOf('{TEXTO_RADAR_SIN_SESION}', idxSinSesion)
    expect(idxTexto).toBeGreaterThan(idxSinSesion)
    expect(idxBoton).toBeGreaterThan(idxTexto)
    expect(vacios.TEXTO_RADAR_SIN_SESION).toBe('Con tu cuenta elegís qué eventos te llegan por correo.')
  })

  it('las categorías vacías y el buscador sin coincidencias dicen algo (y el buscador ofrece Limpiar búsqueda)', () => {
    expect(SRC_RADAR).toMatch(/opciones\.categorias\.length === 0 \? \(\s*<Texto[^>]*>\s*\{TEXTO_RADAR_SIN_CATEGORIAS\}/)
    expect(SRC_RADAR).toMatch(/\{vacioBuscador\.texto\}/)
    expect(SRC_RADAR).toMatch(/onPress=\{\(\) => setBusqueda\(''\)\}\s*accessibilityRole="button"/)
    expect(SRC_RADAR).not.toContain('No se encontraron coincidencias.')
  })

  it('el error de carga pasa por mensajeErrorCarga("radar", ...); guardar sin red se titula "Sin conexión" y se anuncia', () => {
    expect(SRC_RADAR).toMatch(/mensajeErrorCarga\('radar', resultado\)/)
    expect(SRC_RADAR).toMatch(/resultado\.sinConexion \? 'Sin conexión' : 'Error al guardar'/)
    // R76: los anuncios pasan por anunciar() de lib/anunciar.ts (#122).
    expect(SRC_RADAR).toMatch(/if \(resultado\.sinConexion\) anunciar\(`Sin conexión\. \$\{resultado\.error\}`\)/)
    expect(SRC_RADAR).toMatch(/anuncioDeReintento\(intento > 0, \{ tipo: 'error', error \}\)/)
  })
})

// ---------------------------------------------------------------------------
// 8. Los botones: "Reintentar" afuera del bloque accesible del aviso, y con
// rol, alto mínimo y colores de useColoresQPS.
// ---------------------------------------------------------------------------
/** Índice del `</View>` que cierra el `<View` que empieza en `idxApertura` (cuenta `<View` / `</View>`). */
function cierreDeView(texto: string, idxApertura: number): number {
  const re = /<View\b|<\/View>/g
  re.lastIndex = idxApertura
  let profundidad = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) {
    profundidad += m[0] === '</View>' ? -1 : 1
    if (profundidad === 0) return m.index
  }
  return -1
}

describe('components/AvisoSinConexion.tsx: "Reintentar" a la derecha, afuera del View accessible; la nota debajo', () => {
  const idxAccesible = SRC_AVISO.lastIndexOf('<View', SRC_AVISO.indexOf('accessibilityLabel='))
  const idxCierre = cierreDeView(SRC_AVISO, idxAccesible)

  it('el View accessible (con el label) no contiene ningún botón y ocupa lo que sobra (flex: 1)', () => {
    expect(idxCierre).toBeGreaterThan(idxAccesible)
    const bloque = SRC_AVISO.slice(idxAccesible, idxCierre)
    expect(bloque).toMatch(/\baccessible\b/)
    expect(bloque).not.toMatch(/Reintentar|Pressable/)
    expect(bloque).toMatch(/style=\{estilos\.bloqueTexto\}/)
    expect(SRC_AVISO).toMatch(/bloqueTexto: \{ flex: 1/)
  })

  it('el botón es hermano del bloque accesible dentro de la misma fila (flexDirection: row), y la nota va después de la fila', () => {
    const idxFila = SRC_AVISO.lastIndexOf('<View style={estilos.fila}>', idxAccesible)
    expect(idxFila).toBeGreaterThan(-1)
    const idxCierreFila = cierreDeView(SRC_AVISO, idxFila)
    const idxBoton = SRC_AVISO.indexOf('<BotonReintentar onReintentar={onReintentar}', idxCierre)
    expect(idxBoton).toBeGreaterThan(idxCierre)
    expect(idxBoton).toBeLessThan(idxCierreFila)
    expect(SRC_AVISO.indexOf('{nota}', idxCierreFila)).toBeGreaterThan(idxCierreFila)
    expect(SRC_AVISO).toMatch(/fila: \{ flexDirection: 'row'/)
    expect(SRC_AVISO).toMatch(/import\s*\{\s*BotonReintentar\s*\}\s*from\s*'@\/components\/EstadoCarga'/)
  })

  it('AvisoNoSeActualizo: el texto en la fila, a la izquierda del botón (sin una fila vacía al lado)', () => {
    const cuerpo = SRC_AVISO.slice(SRC_AVISO.indexOf('export function AvisoNoSeActualizo('))
    expect(cuerpo).toMatch(/<View style=\{estilos\.fila\}>\s*<Texto[^>]*estilos\.bloqueTexto[^>]*>\s*\{texto\}\s*<\/Texto>\s*<BotonReintentar/)
  })

  it('la nota del refresco NO es live region (la anuncia la pantalla: Android leería dos veces)', () => {
    expect(SRC_AVISO.match(/accessibilityLiveRegion/g)).toHaveLength(1)
  })
})

describe('components/EstadoCarga.tsx: BotonReintentar y Vacio', () => {
  const boton = SRC_ESTADO_CARGA.slice(
    SRC_ESTADO_CARGA.indexOf('export function BotonReintentar('),
    SRC_ESTADO_CARGA.indexOf('export function ErrorCarga('),
  )
  const vacio = SRC_ESTADO_CARGA.slice(SRC_ESTADO_CARGA.indexOf('export function Vacio('))

  it('BotonReintentar: botón con borde bordeChipInactivo, Texto semibold en foreground y "Reintentando…" mientras reintenta', () => {
    expect(boton).toMatch(/accessibilityRole="button"/)
    expect(boton).toMatch(/borderColor: bordeChipInactivo\(colores\)/)
    expect(boton).toMatch(/<Texto peso="semibold" style=\{\{ color: colores\.foreground \}\}>/)
    expect(boton).toMatch(/\{reintentando \? 'Reintentando…' : 'Reintentar'\}/)
    expect(boton).toMatch(/disabled=\{reintentando\}/)
    expect(boton).not.toMatch(/<Text\b(?!o)/)
  })

  it('usa estilos.boton, que mide al menos 48 (AREA_TACTIL_MINIMA)', () => {
    expect(boton).toMatch(/style=\{\[estilos\.boton,/)
    expect(SRC_ESTADO_CARGA).toMatch(/boton: \{[^}]*minHeight: 48/)
  })

  it('ErrorCarga usa BotonReintentar', () => {
    expect(SRC_ESTADO_CARGA).toMatch(/<BotonReintentar onReintentar=\{onReintentar\} \/>/)
  })

  it('Vacio: variante accionPrincipal (relleno primary) y Texto semibold', () => {
    expect(vacio).toMatch(/accionPrincipal = false/)
    expect(vacio).toMatch(/\{ borderColor: colores\.primary, backgroundColor: colores\.primary \}/)
    expect(vacio).toMatch(/<Texto peso="semibold" style=\{\{ color: accionPrincipal \? colores\.primaryForeground : colores\.foreground \}\}>/)
  })
})

describe('los botones nuevos de A6 en las pantallas: rol de botón y al menos 48 dp', () => {
  it('Radar: el "Limpiar búsqueda" del buscador usa botonContorno (minHeight 48, borde bordeChipInactivo)', () => {
    expect(SRC_RADAR).toMatch(/style=\{\[estilos\.botonContorno, \{ borderColor: bordeChipInactivo\(colores\) \}\]\}/)
    expect(SRC_RADAR).toMatch(/botonContorno: \{[^}]*minHeight: 48/)
  })

  it('Inicio: el botón de "Hoy en Salta" suma estilos.botonVacio (minHeight 48)', () => {
    expect(SRC_INICIO).toMatch(/style=\{\[estilos\.vacioHoyBoton, estilos\.botonVacio, \{ backgroundColor: colores\.primary \}\]\}/)
    expect(SRC_INICIO).toMatch(/botonVacio: \{ minHeight: 48/)
  })
})
