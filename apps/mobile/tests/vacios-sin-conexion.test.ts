// A6 (nube Q1) · Vacíos y sin conexión. Dos partes, mismo estilo que el resto
// de los tests de la app (sin `@testing-library/react-native`: las pantallas
// importan React Native y no se pueden montar acá):
//
//   1. La lógica pura de `lib/vacios.ts` (cada pantalla × cada vacío × con y
//      sin conexión): textos, acciones, el mensaje de error de carga y
//      `decidirRefresco`.
//   2. Detectores estáticos (`readFileSync`) que atan esa lógica a las cinco
//      pantallas: que la usan, y que los tres literales que otros detectores
//      fijan en la pantalla (el vacío de "Hoy" de la web, el de Mis eventos y
//      las acciones de Buscar) son los mismos que el espejo de `lib/vacios.ts`.
//
// Fixtures inventados, sin red ni base.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'


import type { Atajo } from '@qps/core/home/atajos'
import * as mensajes from '../lib/mensajes'
import {
  MENSAJE_ERROR_SERVIDOR_CINES,
  MENSAJE_ERROR_SERVIDOR_EVENTOS,
  MENSAJE_ERROR_SERVIDOR_FAVORITOS,
  MENSAJE_ERROR_SERVIDOR_RADAR,
  MENSAJE_NO_SE_ACTUALIZO,
  MENSAJE_NO_SE_ACTUALIZO_SIN_CONEXION,
  MENSAJE_SEGUIMOS_SIN_CONEXION,
  MENSAJE_SIN_CONEXION_SIN_GUARDADO,
  MENSAJE_SIN_CONFIGURACION,
} from '../lib/mensajes'
import * as vacios from '../lib/vacios'
import {
  ACCIONES_VACIO_BUSCAR,
  accionesVacioBuscar,
  decidirRefresco,
  DETALLE_FAVORITOS_GUARDADO,
  MAXIMO_ACCIONES_VACIO,
  mensajeErrorCarga,
  textoSinResultadosBuscar,
  textoVacioCategoria,
  VACIO_CATEGORIAS_BUSCAR,
  VACIO_FAVORITOS,
  VACIO_FAVORITOS_GUARDADO,
  vacioBuscadorRadar,
  vacioCines,
  vacioFavoritos,
  vacioHoyEnSalta,
  type PantallaConLista,
} from '../lib/vacios'
import { textoCantidadEventos } from '../lib/formato'
import { TITULO_SIN_CONEXION } from '../lib/sin-conexion/aviso'
import type { Almacen } from '../lib/sin-conexion/almacen'
import { cargarAgendaConCache } from '../lib/sin-conexion/agenda'
import { cargarFavoritosConCache } from '../lib/sin-conexion/favoritos'
import { MENSAJE_ERROR_RED as ERROR_RED_EVENTOS } from '../lib/datos/eventos'
import { MENSAJE_ERROR_RED as ERROR_RED_CINES } from '../lib/datos/cines'

// `lib/datos/*` y `lib/favoritos.ts` importan `@/lib/supabase` (que arrastra
// react-native): nunca el cliente real. Mismo doble que
// `tests/favoritos-cache.test.ts` (`vi.mock` se eleva solo por encima de los
// imports, así que puede ir acá abajo, sin romper `import/first`).
vi.mock('@/lib/supabase', () => ({ supabase: null }))

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

/** Todos los textos que `lib/vacios.ts` puede devolver (funciones con cada combinación + constantes). */
function todosLosTextosDeVacios(): string[] {
  const textos = stringsExportados(vacios as unknown as Record<string, unknown>)
  for (const atajo of ATAJOS) {
    for (const hayEventosEnAtajo of [true, false]) {
      for (const desdeCache of [true, false]) {
        const vacio = vacioHoyEnSalta({ atajo, hayEventosEnAtajo, desdeCache })
        if (vacio) textos.push(vacio.texto, vacio.accion.texto)
        textos.push(textoVacioCategoria({ nombre: 'Música', atajo, esCine: false, desdeCache }))
        textos.push(textoVacioCategoria({ nombre: 'Cine', atajo, esCine: true, desdeCache }))
      }
    }
  }
  for (const pantalla of PANTALLAS) {
    textos.push(mensajeErrorCarga(pantalla, { error: 'x', sinConexion: true }))
    textos.push(mensajeErrorCarga(pantalla, { error: 'x' }))
  }
  textos.push(vacioCines('').texto, vacioCines('').accion.texto, vacioCines('zz').texto, vacioCines('zz').accion.texto)
  textos.push(vacioBuscadorRadar({ busqueda: 'zz', coincideConLoQueYaSeguis: false }).texto)
  textos.push(vacioBuscadorRadar({ busqueda: 'zz', coincideConLoQueYaSeguis: true }).texto)
  return textos
}

// ---------------------------------------------------------------------------
// 0. Sin jerga técnica en pantalla, y voseo.
// ---------------------------------------------------------------------------
describe('los textos nuevos de A6 no tienen jerga técnica', () => {
  const textos = [...todosLosTextosDeVacios(), ...stringsExportados(mensajes as unknown as Record<string, unknown>)]

  it('se juntaron textos para revisar', () => {
    expect(textos.length).toBeGreaterThan(40)
  })

  it.each(['caché', 'cache', 'servidor', 'error 500', '5xx', 'offline', 'red caída', 'timeout'])('ninguno dice "%s"', (jerga) => {
    const conJerga = textos.filter((texto) => texto.toLowerCase().includes(jerga))
    expect(conJerga).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 1. mensajeErrorCarga: las 5 pantallas × (sin red | error del servidor | sin configuración).
// ---------------------------------------------------------------------------
describe('mensajeErrorCarga: sin conexión vs. error del servidor, en las cinco pantallas', () => {
  it.each(PANTALLAS)('%s, sin conexión: dice que no hay conexión y que se toque Reintentar', (pantalla) => {
    const texto = mensajeErrorCarga(pantalla, { error: ERROR_RED_EVENTOS, sinConexion: true })
    expect(texto).toMatch(/^No hay conexión/)
    expect(texto).toContain('Conectate y tocá Reintentar.')
    expect(texto).not.toContain('Revisá tu conexión')
  })

  it.each(['inicio', 'favoritos'] as const)('%s (guarda lo último bueno), sin conexión y sin nada guardado: el texto del ticket', (pantalla) => {
    expect(mensajeErrorCarga(pantalla, { error: 'cualquiera', sinConexion: true })).toBe(
      'No hay conexión y todavía no hay nada guardado para mostrarte. Conectate y tocá Reintentar.',
    )
    expect(MENSAJE_SIN_CONEXION_SIN_GUARDADO).toContain('nada guardado')
  })

  it.each(['buscar', 'cines', 'radar'] as const)('%s (no guarda nada), sin conexión: no promete "lo guardado"', (pantalla) => {
    expect(mensajeErrorCarga(pantalla, { error: 'cualquiera', sinConexion: true })).not.toMatch(/guardad/)
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

// ---------------------------------------------------------------------------
// 1b. cargarAgendaConCache / cargarFavoritosConCache: `sinConexion` llega a la
// rama de error (y solo cuando fue por red).
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

describe('la rama de error de la carga con lo guardado trae sinConexion (A6)', () => {
  const AHORA = new Date('2030-10-17T12:00:00-03:00')

  it('agenda, por red y sin nada guardado: sinConexion true → la pantalla dice "No hay conexión y todavía no hay nada guardado..."', async () => {
    const resultado = await cargarAgendaConCache({
      cargar: async () => ({ ok: false, error: ERROR_RED_EVENTOS, sinConexion: true }),
      ahora: AHORA,
      almacen: almacenVacio(),
    })
    expect(resultado).toEqual({ tipo: 'error', error: ERROR_RED_EVENTOS, sinConexion: true })
    if (resultado.tipo !== 'error') throw new Error('tenía que ser error')
    expect(mensajeErrorCarga('inicio', resultado)).toBe(MENSAJE_SIN_CONEXION_SIN_GUARDADO)
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

  it('favoritos, por red y sin nada guardado: sinConexion true', async () => {
    const resultado = await cargarFavoritosConCache('usuario-ficticio', {
      obtener: async () => ({ ok: false, error: 'No pudimos cargar tus favoritos. Revisá tu conexión.', sinConexion: true }),
      ahora: AHORA,
      almacen: almacenVacio(),
    })
    expect(resultado).toMatchObject({ tipo: 'error', sinConexion: true })
  })

  it('favoritos, error que no es de red: sin la clave', async () => {
    const resultado = await cargarFavoritosConCache('usuario-ficticio', {
      obtener: async () => ({ ok: false, error: 'No pudimos cargar tus favoritos. Revisá tu conexión.' }),
      ahora: AHORA,
      almacen: almacenVacio(),
    })
    expect(resultado).not.toHaveProperty('sinConexion')
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
  const guardado: Estado = { tipo: 'ok', items: ['b'], desdeCache: { guardadoEn } }
  const guardadoOtraVez: Estado = { tipo: 'ok', items: ['b2'], desdeCache: { guardadoEn } }
  const errorRed: Estado = { tipo: 'error', error: 'x', sinConexion: true }
  const errorServidor: Estado = { tipo: 'error', error: 'x' }

  it('con datos frescos y un refresco que falla por red: CONSERVA los datos y avisa sin conexión', () => {
    const decision = decidirRefresco<Estado>(fresco, errorRed)
    expect(decision.estado).toBe(fresco)
    expect(decision.nota).toBe(MENSAJE_NO_SE_ACTUALIZO_SIN_CONEXION)
    expect(decision.anuncio).toBe(MENSAJE_NO_SE_ACTUALIZO_SIN_CONEXION)
  })

  it('con datos frescos (Buscar/Cines, sin desdeCache) y un error del servidor: conserva y avisa con el texto neutro', () => {
    const decision = decidirRefresco<Estado>(frescoSinCampo, errorServidor)
    expect(decision.estado).toBe(frescoSinCampo)
    expect(decision.nota).toBe(MENSAJE_NO_SE_ACTUALIZO)
    expect(decision.nota).not.toContain('conexión')
  })

  it('con lo guardado a la vista y un error (no se pudo leer nada nuevo): conserva lo guardado', () => {
    const decision = decidirRefresco<Estado>(guardado, errorServidor)
    expect(decision.estado).toBe(guardado)
    expect(decision.nota).toBe(MENSAJE_NO_SE_ACTUALIZO)
  })

  it('con lo guardado a la vista y otra vez lo guardado: "Seguimos sin conexión", visible y anunciado', () => {
    const decision = decidirRefresco<Estado>(guardado, guardadoOtraVez)
    expect(decision.estado).toBe(guardadoOtraVez)
    expect(decision.nota).toBe(MENSAJE_SEGUIMOS_SIN_CONEXION)
    expect(decision.anuncio).toBe(MENSAJE_SEGUIMOS_SIN_CONEXION)
    expect(MENSAJE_SEGUIMOS_SIN_CONEXION).toMatch(/^Seguimos sin conexión/)
  })

  it('con datos frescos y ahora lo guardado: queda lo guardado (el aviso aparece solo) y se anuncia su título', () => {
    const decision = decidirRefresco<Estado>(fresco, guardado)
    expect(decision.estado).toBe(guardado)
    expect(decision.nota).toBeNull()
    expect(decision.anuncio).toBe(TITULO_SIN_CONEXION)
  })

  it('volvió la conexión (de lo guardado a fresco): queda lo nuevo, sin aviso', () => {
    expect(decidirRefresco<Estado>(guardado, fresco)).toEqual({ estado: fresco, anuncio: null, nota: null })
  })

  it('sin datos a la vista (error o invitar), un error nuevo reemplaza al viejo', () => {
    expect(decidirRefresco<Estado>(errorServidor, errorRed).estado).toBe(errorRed)
    expect(decidirRefresco<Estado>({ tipo: 'invitar' }, { tipo: 'invitar' }).nota).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. Inicio: "Hoy en Salta" y el modo categoría.
// ---------------------------------------------------------------------------
describe('vacioHoyEnSalta: honesto con la pill elegida (4 pills × hay eventos en la pill × sin conexión)', () => {
  const casos = ATAJOS.flatMap((atajo) =>
    [true, false].flatMap((hayEventosEnAtajo) => [true, false].map((desdeCache) => ({ atajo, hayEventosEnAtajo, desdeCache }))),
  )

  it('pill "Hoy", con conexión: null (la portada dibuja el texto de la web y "Ver esta semana")', () => {
    expect(vacioHoyEnSalta({ atajo: 'hoy', hayEventosEnAtajo: false, desdeCache: false })).toBeNull()
    expect(vacioHoyEnSalta({ atajo: 'hoy', hayEventosEnAtajo: true, desdeCache: false })).toBeNull()
  })

  it.each(casos.filter((c) => !(c.atajo === 'hoy' && !c.desdeCache)))(
    'pill $atajo, eventos en la pill: $hayEventosEnAtajo, sin conexión: $desdeCache → texto propio y una acción que no es la pill elegida',
    (caso) => {
      const vacio = vacioHoyEnSalta(caso)
      expect(vacio).not.toBeNull()
      if (!vacio) return
      // La acción nunca es "quedarse donde ya estás".
      if (vacio.accion.destino.tipo === 'atajo') expect(vacio.accion.destino.atajo).not.toBe(caso.atajo)
      // Nunca el texto de la web a secas fuera del caso de siempre.
      expect(vacio.texto).not.toBe(TEXTO_HOY_WEB)
      // Ni más corto que el de la web: la caja (~188 dp) no se achica (regla (a) del anuncio).
      expect(vacio.texto.length).toBeGreaterThanOrEqual(TEXTO_HOY_WEB.length)
      expect(vacio.accion.texto.length).toBeGreaterThan(0)
    },
  )

  it('con "Finde" o "Semana" y eventos en la pill, no dice que no hay nada: dice que está más abajo', () => {
    for (const atajo of ['finde', 'semana'] as const) {
      const vacio = vacioHoyEnSalta({ atajo, hayEventosEnAtajo: true, desdeCache: false })
      expect(vacio?.texto).toContain('más abajo')
    }
  })

  it('"Semana" sin eventos en toda la semana: ofrece buscar en todas las fechas (no "Ver esta semana")', () => {
    const vacio = vacioHoyEnSalta({ atajo: 'semana', hayEventosEnAtajo: false, desdeCache: false })
    expect(vacio?.accion).toEqual({ texto: 'Buscar en todas las fechas', destino: { tipo: 'buscar' } })
  })

  it('"Esta noche": ofrece lo de hoy', () => {
    expect(vacioHoyEnSalta({ atajo: 'esta-noche', hayEventosEnAtajo: false, desdeCache: false })?.accion.destino).toEqual({
      tipo: 'atajo',
      atajo: 'hoy',
    })
  })

  it('sin conexión y sin eventos en la pill: dice que es lo último guardado', () => {
    for (const atajo of ATAJOS) {
      expect(vacioHoyEnSalta({ atajo, hayEventosEnAtajo: false, desdeCache: true })?.texto).toMatch(/^En lo último guardado/)
    }
  })
})

describe('textoVacioCategoria (modo categoría de Inicio)', () => {
  it('con conexión, el texto de siempre', () => {
    expect(textoVacioCategoria({ nombre: 'Música', atajo: 'finde', esCine: false, desdeCache: false })).toBe(
      'No hay eventos de Música para el finde.',
    )
  })

  it('sin conexión, aclara que es lo último guardado', () => {
    expect(textoVacioCategoria({ nombre: 'Música', atajo: 'hoy', esCine: false, desdeCache: true })).toBe(
      'En lo último guardado no hay eventos de Música para hoy.',
    )
  })

  it('con el cine, nombra también las películas (la fila mezcla películas y eventos)', () => {
    expect(textoVacioCategoria({ nombre: 'Cine', atajo: 'hoy', esCine: true, desdeCache: false })).toBe(
      'No hay películas en cartel ni eventos de Cine para hoy.',
    )
  })
})

describe('app/(tabs)/index.tsx usa lib/vacios (detector estático)', () => {
  it('el vacío de "Hoy en Salta" pasa por vacioHoyEnSalta, con el texto de la web como caso de siempre', () => {
    expect(SRC_INICIO).toMatch(/vacioHoyEnSalta\(\{\s*atajo,\s*hayEventosEnAtajo:/)
    expect(SRC_INICIO).toContain(`{vacioHoy ? vacioHoy.texto : '${TEXTO_HOY_WEB}'}`)
    expect(SRC_INICIO).toContain(`{vacioHoy ? vacioHoy.accion.texto : 'Ver esta semana'}`)
    expect(SRC_INICIO).toMatch(/onPress=\{\(\) => \(vacioHoy \? irADestino\(vacioHoy\.accion\.destino\) : cambiarAtajo\('semana'\)\)\}/)
  })

  it('la caja vacía de "Hoy en Salta" sigue usando estilos.vacioHoy, sin achicar padding ni gap', () => {
    const vacioHoy = SRC_INICIO.match(/vacioHoy: \{([^}]*)\}/)
    expect(vacioHoy).not.toBeNull()
    expect(vacioHoy![1]).toMatch(/padding: 20/)
    expect(vacioHoy![1]).toMatch(/gap: 16/)
    expect(SRC_INICIO).toMatch(/key="hoy-en-salta-vacio" style=\{\[estilos\.vacioHoy,/)
  })

  it('el modo categoría usa textoVacioCategoria con desdeCache', () => {
    expect(SRC_INICIO).toMatch(/textoVacioCategoria\(\{[\s\S]*?desdeCache: estado\.desdeCache !== null,?\s*\}\)/)
  })

  it('el error de carga pasa por mensajeErrorCarga("inicio", ...)', () => {
    expect(SRC_INICIO).toMatch(/mensajeErrorCarga\('inicio', resultado\)/)
  })

  it('refrescar usa decidirRefresco y anuncia con announceForAccessibility', () => {
    const refrescar = SRC_INICIO.slice(SRC_INICIO.indexOf('const refrescar = useCallback('), SRC_INICIO.indexOf('const datosPortada'))
    expect(refrescar).toMatch(/decidirRefresco\(estado, await cargarDatos\(\)\)/)
    expect(refrescar).toMatch(/AccessibilityInfo\.announceForAccessibility\(decision\.anuncio\)/)
    expect(refrescar).toMatch(/\[cargarDatos, estado\]/)
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
  it('con texto y "Solo gratis": nombra "gratis" (antes se perdía)', () => {
    expect(textoSinResultadosBuscar({ texto: 'peña', soloGratis: true, nombreCategoria: null, atajo: null })).toBe(
      'No se encontraron eventos gratis para "peña"',
    )
  })

  it('con texto, sin gratis: el de siempre', () => {
    expect(textoSinResultadosBuscar({ texto: 'peña', soloGratis: false, nombreCategoria: 'Música', atajo: 'finde' })).toBe(
      'No se encontraron eventos para "peña" en Música · el finde',
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

describe('accionesVacioBuscar: una salida por filtro, por prioridad, como mucho tres', () => {
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
      nombreCategoria: c.conCategoria ? 'Música' : null,
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

  it('con los cuatro filtros, queda afuera "Todas las categorías" (sus chips, con "Todas", están justo arriba)', () => {
    expect(accionesVacioBuscar({ texto: 'x', atajo: 'hoy', soloGratis: true, nombreCategoria: 'Música' })).toEqual([
      'Limpiar búsqueda',
      'Ver todas las fechas',
      'Sacar “Solo gratis”',
    ])
  })
})

describe('app/(tabs)/buscar.tsx: el vacío, el tile y la grilla vacía (detector estático)', () => {
  it('los accionesVacio.push están en el orden de ACCIONES_VACIO_BUSCAR, con esos textos', () => {
    const pushes = [...SRC_BUSCAR.matchAll(/accionesVacio\.push\(\{ texto: '([^']+)'/g)].map((m) => m[1])
    expect(pushes).toEqual(Object.values(ACCIONES_VACIO_BUSCAR))
  })

  it('cada push nuevo tiene su condición y su acción', () => {
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
    expect(SRC_BUSCAR).toMatch(/textoSinResultadosBuscar\(\{/)
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
    expect(VACIO_CATEGORIAS_BUSCAR).toContain('Reintentar')
  })

  it('el error pasa por mensajeErrorCarga("buscar", ...) y el refresco por decidirRefresco', () => {
    expect(SRC_BUSCAR.match(/mensajeErrorCarga\('buscar', \{ \.\.\.resultado(Eventos|Categorias), sinConexion \}\)/g)).toHaveLength(2)
    expect(SRC_BUSCAR).toMatch(/decidirRefresco\(estado, await obtenerDatos\(\)\)/)
    expect(SRC_BUSCAR).toMatch(/<AvisoNoSeActualizo texto=\{notaRefresco\} onReintentar=\{refrescar\}/)
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
    const vacio = vacioCines('')
    expect(vacio.texto).toMatch(/Todavía no hay películas cargadas/)
    expect(vacio.accion).toEqual({ texto: 'Ver eventos de hoy', destino: 'ver-eventos-de-hoy' })
  })
})

describe('app/cines.tsx (detector estático)', () => {
  it('el vacío usa vacioCines con su acción', () => {
    expect(SRC_CINES).toMatch(/const vacio = vacioCines\(busqueda\)/)
    expect(SRC_CINES).toMatch(/<Vacio mensaje=\{vacio\.texto\} textoAccion=\{vacio\.accion\.texto\} onAccion=\{alTocarAccionVacio\} \/>/)
  })

  it('"Ver eventos de hoy" va a Buscar con la fecha Hoy y el nonce v; "Limpiar búsqueda" vacía el buscador', () => {
    expect(SRC_CINES).toMatch(/router\.push\(`\/buscar\?atajo=hoy&v=\$\{Date\.now\(\)\}`\)/)
    expect(SRC_CINES).toMatch(/if \(vacio\.accion\.destino === 'limpiar-busqueda'\) setBusqueda\(''\)/)
  })

  it('el error pasa por mensajeErrorCarga("cines", ...) y el refresco por decidirRefresco', () => {
    expect(SRC_CINES).toMatch(/mensajeErrorCarga\('cines', resultado\)/)
    expect(SRC_CINES).toMatch(/decidirRefresco\(estado, await obtenerDatos\(\)\)/)
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

  it('mostrando lo guardado: aclara que los pasados no se muestran', () => {
    expect(vacioFavoritos(true)).toBe(VACIO_FAVORITOS_GUARDADO)
    expect(VACIO_FAVORITOS_GUARDADO.mensaje).toMatch(/ya pasaron no se muestran/)
    expect(DETALLE_FAVORITOS_GUARDADO).toMatch(/ya pasaron/)
  })
})

describe('app/(tabs)/favoritos.tsx (detector estático)', () => {
  it('el literal del vacío con red es el mismo que VACIO_FAVORITOS (espejo en lib/vacios.ts) y va a "/"', () => {
    expect(SRC_FAVORITOS).toContain(`<Vacio\n                mensaje="${VACIO_FAVORITOS.mensaje}"\n                textoAccion="${VACIO_FAVORITOS.textoAccion}"\n                onAccion={() => router.push('/')}`)
  })

  it('mostrando lo guardado, el vacío es VACIO_FAVORITOS_GUARDADO y el aviso lleva el detalle de los pasados y "Reintentar"', () => {
    expect(SRC_FAVORITOS).toMatch(/mensaje=\{VACIO_FAVORITOS_GUARDADO\.mensaje\}/)
    expect(SRC_FAVORITOS).toMatch(/<AvisoSinConexion\s+guardadoEn=\{estado\.desdeCache\.guardadoEn\}\s+detalle=\{DETALLE_FAVORITOS_GUARDADO\}\s+onReintentar=\{refrescar\}/)
  })

  it('sin sesión por falta de red: una vista propia ANTES de la de "Entrá…", sin "Entrá" ni "Ingresar", con Reintentar', () => {
    const idxSinRed = SRC_FAVORITOS.indexOf("if (vista === 'invitar' && sinConexion) {")
    const idxInvitar = SRC_FAVORITOS.indexOf("if (vista === 'invitar') {")
    expect(idxSinRed).toBeGreaterThan(-1)
    expect(idxInvitar).toBeGreaterThan(idxSinRed)
    const bloque = sinComentariosDeLinea(SRC_FAVORITOS.slice(idxSinRed, idxInvitar))
    expect(bloque).toMatch(/\{MENSAJE_SESION_SIN_CONEXION\}/)
    expect(bloque).toMatch(/<BotonReintentar onReintentar=\{refrescar\}/)
    expect(bloque).not.toMatch(/Entrá|Ingresar|\/cuenta/)
  })

  it('refrescar sin sesión vuelve a probar la sesión (reintentarSesion) antes de releer lo guardado', () => {
    const idxRefrescar = SRC_FAVORITOS.indexOf('const refrescar = useCallback(')
    const idxReintentar = SRC_FAVORITOS.indexOf('await reintentarSesion()', idxRefrescar)
    const idxLectura = SRC_FAVORITOS.indexOf('await leerFavoritosGuardados()', idxRefrescar)
    expect(idxReintentar).toBeGreaterThan(idxRefrescar)
    expect(idxLectura).toBeGreaterThan(idxReintentar)
  })

  it('el error pasa por mensajeErrorCarga("favoritos", ...) en cargar y en refrescar', () => {
    expect(SRC_FAVORITOS.match(/mensajeErrorCarga\('favoritos', resultado\)/g)).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// 7. Radar.
// ---------------------------------------------------------------------------
describe('vacioBuscadorRadar', () => {
  it('sin coincidencias: qué se buscó + "Limpiar"', () => {
    expect(vacioBuscadorRadar({ busqueda: ' usina ', coincideConLoQueYaSeguis: false })).toEqual({
      texto: 'No encontramos lugares ni cuentas con "usina". Probá con otro nombre.',
      textoAccion: 'Limpiar',
    })
  })

  it('si coincide con algo que ya se sigue, lo dice', () => {
    expect(vacioBuscadorRadar({ busqueda: 'metro', coincideConLoQueYaSeguis: true }).texto).toBe(
      'Ya seguís todo lo que coincide con "metro".',
    )
  })
})

describe('components/PantallaRadar.tsx (detector estático)', () => {
  it('sin sesión por falta de red, una rama propia antes de "Ingresar para armar tu Radar", con Reintentar', () => {
    const idxSinRed = SRC_RADAR.indexOf('} else if (!userId && sesionSinConexion) {')
    const idxSinSesion = SRC_RADAR.indexOf('} else if (!userId) {')
    expect(idxSinRed).toBeGreaterThan(-1)
    expect(idxSinSesion).toBeGreaterThan(idxSinRed)
    const bloque = sinComentariosDeLinea(SRC_RADAR.slice(idxSinRed, idxSinSesion))
    expect(bloque).toMatch(/\{MENSAJE_SESION_SIN_CONEXION\}/)
    expect(bloque).toMatch(/<BotonReintentar onReintentar=\{reintentarLaSesion\}/)
    expect(bloque).not.toMatch(/Ingresar/)
  })

  it('arriba de "Ingresar para armar tu Radar" hay un texto que dice para qué', () => {
    const idxSinSesion = SRC_RADAR.indexOf('} else if (!userId) {')
    const idxBoton = SRC_RADAR.indexOf('Ingresar para armar tu Radar', idxSinSesion)
    const idxTexto = SRC_RADAR.indexOf('{TEXTO_RADAR_SIN_SESION}', idxSinSesion)
    expect(idxTexto).toBeGreaterThan(idxSinSesion)
    expect(idxBoton).toBeGreaterThan(idxTexto)
  })

  it('las categorías vacías y el buscador sin coincidencias dicen algo (y el buscador ofrece Limpiar)', () => {
    expect(SRC_RADAR).toMatch(/opciones\.categorias\.length === 0 \? \(\s*<Texto[^>]*>\s*\{TEXTO_RADAR_SIN_CATEGORIAS\}/)
    expect(SRC_RADAR).toMatch(/\{vacioBuscador\.texto\}/)
    expect(SRC_RADAR).toMatch(/onPress=\{\(\) => setBusqueda\(''\)\}\s*accessibilityRole="button"/)
    expect(SRC_RADAR).not.toContain('No se encontraron coincidencias.')
  })

  it('el error de carga pasa por mensajeErrorCarga("radar", ...) y guardar sin red se nombra "Sin conexión"', () => {
    expect(SRC_RADAR).toMatch(/mensajeErrorCarga\('radar', resultado\)/)
    expect(SRC_RADAR).toMatch(/resultado\.sinConexion \? 'Sin conexión' : 'Error al guardar'/)
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

describe('components/AvisoSinConexion.tsx: "Reintentar" afuera del View accessible', () => {
  it('el View accessible (con el label) no contiene ningún botón', () => {
    const idxAccesible = SRC_AVISO.lastIndexOf('<View', SRC_AVISO.indexOf('accessibilityLabel='))
    const idxCierre = cierreDeView(SRC_AVISO, idxAccesible)
    expect(idxCierre).toBeGreaterThan(idxAccesible)
    const bloque = SRC_AVISO.slice(idxAccesible, idxCierre)
    expect(bloque).toMatch(/\baccessible\b/)
    expect(bloque).not.toMatch(/Reintentar|Pressable/)
  })

  it('el botón sale de BotonReintentar (EstadoCarga), dibujado después del bloque accesible', () => {
    expect(SRC_AVISO).toMatch(/import\s*\{\s*BotonReintentar\s*\}\s*from\s*'@\/components\/EstadoCarga'/)
    const idxAccesible = SRC_AVISO.lastIndexOf('<View', SRC_AVISO.indexOf('accessibilityLabel='))
    const idxCierre = cierreDeView(SRC_AVISO, idxAccesible)
    expect(SRC_AVISO.indexOf('<FilaReintentar', idxCierre)).toBeGreaterThan(idxCierre)
    expect(SRC_AVISO).toMatch(/<BotonReintentar onReintentar=\{onReintentar\}/)
  })

  it('la nota del refresco NO es live region (la anuncia la pantalla: Android leería dos veces)', () => {
    expect(SRC_AVISO.match(/accessibilityLiveRegion/g)).toHaveLength(1)
  })
})

describe('components/EstadoCarga.tsx: BotonReintentar con rol, 48 dp y colores de useColoresQPS', () => {
  const boton = SRC_ESTADO_CARGA.slice(
    SRC_ESTADO_CARGA.indexOf('export function BotonReintentar('),
    SRC_ESTADO_CARGA.indexOf('export function ErrorCarga('),
  )

  it('es un botón, con el borde de bordeChipInactivo y el texto en foreground', () => {
    expect(boton).toMatch(/accessibilityRole="button"/)
    expect(boton).toMatch(/borderColor: bordeChipInactivo\(colores\)/)
    expect(boton).toMatch(/color: colores\.foreground/)
    expect(boton).toMatch(/const colores = useColoresQPS\(\)/)
  })

  it('usa estilos.boton, que mide al menos 48 (AREA_TACTIL_MINIMA)', () => {
    expect(boton).toMatch(/style=\{\[estilos\.boton,/)
    expect(SRC_ESTADO_CARGA).toMatch(/boton: \{[^}]*minHeight: 48/)
  })

  it('ErrorCarga usa BotonReintentar (un solo "Reintentar" escrito en todo el archivo)', () => {
    expect(SRC_ESTADO_CARGA).toMatch(/<BotonReintentar onReintentar=\{onReintentar\} \/>/)
    expect(sinComentariosDeLinea(SRC_ESTADO_CARGA).match(/>Reintentar</g)).toHaveLength(1)
  })
})

describe('los botones nuevos de A6 en las pantallas: rol de botón y al menos 48 dp', () => {
  it('Radar: el "Limpiar" del buscador usa botonContorno (minHeight 48, borde bordeChipInactivo)', () => {
    expect(SRC_RADAR).toMatch(/style=\{\[estilos\.botonContorno, \{ borderColor: bordeChipInactivo\(colores\) \}\]\}/)
    expect(SRC_RADAR).toMatch(/botonContorno: \{[^}]*minHeight: 48/)
  })

  it('Inicio: el botón de "Hoy en Salta" suma estilos.botonVacio (minHeight 48)', () => {
    expect(SRC_INICIO).toMatch(/style=\{\[estilos\.vacioHoyBoton, estilos\.botonVacio, \{ backgroundColor: colores\.primary \}\]\}/)
    expect(SRC_INICIO).toMatch(/botonVacio: \{ minHeight: 48/)
  })
})
