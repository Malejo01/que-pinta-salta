// A3 (nube Q1): chip "Para chicos" en la portada y en Buscar. Partes:
//   1. `esParaChicos` (`@qps/core/filtros/publico`, el único archivo de core de
//      A3; core no tiene runner propio y el alias de Vitest de mobile resuelve
//      `@qps/core/*` a `packages/core/src/*`).
//   2. Los datos: `obtenerEventosVigentesParaInicio` calcula `paraChicos` con
//      los `tags` crudos de la fila (doble de Supabase, sin red), y la caché
//      sin conexión anterior a A3 (sin el campo) se completa de forma segura.
//   3. La lógica pura de `lib/para-chicos.ts`, `lib/portada-gratis.ts`,
//      `lib/portada-para-chicos.ts`, `lib/buscar-filtros.ts` y
//      `lib/chips-desplazamiento.ts`, importada de verdad, con datos
//      inventados: combinaciones de fecha + categoría + gratis + para chicos
//      (portada y Buscar), chips, títulos, vacíos, anuncio y la fila de chips.
//   4. Detectores sobre el fuente sin comentarios (no hay runner de React
//      Native): el chip (rol, estado, etiqueta, área, forma, ícono), la fila de
//      chips, la portada (grilla, vacío y sus salidas), Buscar, los datos y la
//      caché. Cada detector tiene sus roturas en memoria que lo ponen en rojo.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saltaWallClockToDate } from '@qps/core/date-format'
import { esParaChicos } from '@qps/core/filtros/publico'
import type { Atajo } from '@qps/core/home/atajos'
import { categoriasDisponibles, filtrarCombinado } from '@qps/core/home/filtros-combinados'
import { transformMovie } from '@qps/core/home/transform'
import type { DisplayEvent } from '@qps/core/home/types'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { NOMBRE_ATAJO, textoResultadosBuscar, textoSinResultadosBuscar, type FiltrosTextoBuscar } from '../lib/buscar-filtros'
import { obtenerEventosVigentesParaInicio, type EventoVigenteParaInicio } from '../lib/datos/eventos'
import {
  completarParaChicos,
  esItemParaChicos,
  filtrarConPublico,
  filtrarParaChicos,
  paraChicosDeLaFila,
  SLUG_INFANTIL,
  TEXTO_VER_TODAS_LAS_EDADES,
  type ItemConPublico,
} from '../lib/para-chicos'
import {
  anuncioDeLaGrilla,
  chipsDeLaPortada,
  enModoGrilla,
  eventosDeLaGrilla,
  eventosDeLosChips,
  FRASE_ATAJO,
} from '../lib/portada-gratis'
import { salidasVacioParaChicos, textoVacioParaChicos, tituloParaChicos } from '../lib/portada-para-chicos'
import type { Almacen } from '../lib/sin-conexion/almacen'
import { cargarAgendaConCache, paraMostrar, type DatosAgenda } from '../lib/sin-conexion/agenda'
import { CLAVE_AGENDA, guardarCache, reiniciarBanderaDeLimpieza, VERSION_CACHE } from '../lib/sin-conexion/cache'

const estadoSupabase = vi.hoisted(() => ({ data: [] as unknown[] }))

// Doble del cliente de Supabase (mismo patrón que `tests/datos-eventos.test.ts`):
// nunca el cliente real, ni red, ni .env. `vi.hoisted` y `vi.mock` se elevan
// por encima de los imports: `lib/datos/eventos` ya ve este doble.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = () => builder
      builder.or = () => builder
      builder.order = () => builder
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: estadoSupabase.data, error: null }).then(resolve, reject)
      return builder
    },
  },
}))

function leer(ruta: string): string {
  return readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
}

// ---------------------------------------------------------------------------
// 1. esParaChicos (core)
// ---------------------------------------------------------------------------
describe('esParaChicos (@qps/core/filtros/publico)', () => {
  it('la categoría infantil, aunque no tenga tags', () => {
    expect(esParaChicos({ categorySlug: 'infantil' })).toBe(true)
    expect(esParaChicos({ categorySlug: 'infantil', tags: null })).toBe(true)
    expect(esParaChicos({ categorySlug: 'infantil', tags: [] })).toBe(true)
    expect(SLUG_INFANTIL).toBe('infantil')
  })

  it.each(['infantil', 'apto-chicos', 'ninos', 'chicos', 'familia'])('el tag "%s", con otra categoría', (tag) => {
    expect(esParaChicos({ categorySlug: 'musica', tags: [tag] })).toBe(true)
  })

  it('ninguna otra marca parecida cuenta (la lista es exactamente la del ticket)', () => {
    for (const tag of ['nino', 'nina', 'ninas', 'chico', 'familias', 'kids', 'apto-ninos', 'infancia']) {
      expect(esParaChicos({ tags: [tag] }), tag).toBe(false)
    }
  })

  it('sin distinguir mayúsculas', () => {
    expect(esParaChicos({ tags: ['FAMILIA'] })).toBe(true)
    expect(esParaChicos({ tags: ['Apto-Chicos'] })).toBe(true)
    expect(esParaChicos({ categorySlug: 'Infantil' })).toBe(true)
  })

  it('sin distinguir tildes (NFD): "Niños" -> "ninos", "níños", "Fámília"', () => {
    expect(esParaChicos({ tags: ['Niños'] })).toBe(true)
    expect(esParaChicos({ tags: ['NIÑOS'] })).toBe(true)
    expect(esParaChicos({ tags: ['níños'] })).toBe(true)
    expect(esParaChicos({ tags: ['Fámília'] })).toBe(true)
    // La forma ya compuesta y la descompuesta de la ñ dan lo mismo.
    expect(esParaChicos({ tags: ['ni\u00f1os'] })).toBe(true)
    expect(esParaChicos({ tags: ['nin\u0303os'] })).toBe(true)
  })

  it('recorta los espacios de alrededor (pero no une palabras)', () => {
    expect(esParaChicos({ tags: ['  chicos  '] })).toBe(true)
    expect(esParaChicos({ tags: ['\tfamilia\n'] })).toBe(true)
    expect(esParaChicos({ categorySlug: ' infantil ' })).toBe(true)
    expect(esParaChicos({ tags: ['apto chicos'] })).toBe(false)
  })

  it('un tag que CONTIENE una marca pero no ES la marca no cuenta', () => {
    // A propósito: con "contiene", "no-apto-chicos" pasaría por "apto-chicos".
    expect(esParaChicos({ tags: ['infantiles'] })).toBe(false)
    expect(esParaChicos({ tags: ['chicos-grandes'] })).toBe(false)
    expect(esParaChicos({ tags: ['no-apto-chicos'] })).toBe(false)
    expect(esParaChicos({ tags: ['familiar'] })).toBe(false)
    expect(esParaChicos({ tags: ['para chicos y grandes'] })).toBe(false)
    expect(esParaChicos({ categorySlug: 'infantiles' })).toBe(false)
  })

  it('alcanza con un tag entre otros', () => {
    expect(esParaChicos({ categorySlug: 'teatro', tags: ['comedia', 'Niños', 'sala chica'] })).toBe(true)
  })

  it('null, undefined, strings vacíos y arrays vacíos: false, sin explotar', () => {
    expect(esParaChicos({})).toBe(false)
    expect(esParaChicos({ categorySlug: null, tags: null })).toBe(false)
    expect(esParaChicos({ categorySlug: undefined, tags: undefined })).toBe(false)
    expect(esParaChicos({ categorySlug: '', tags: [] })).toBe(false)
    expect(esParaChicos({ tags: ['', '   '] })).toBe(false)
  })

  it('tags que no son strings se ignoran (lo que llega de la base es dato)', () => {
    const raros = [null, undefined, 3, { chicos: true }, ['chicos']] as unknown as readonly string[]
    expect(esParaChicos({ tags: raros })).toBe(false)
    expect(esParaChicos({ tags: [...(raros as unknown[]), 'familia'] as unknown as readonly string[] })).toBe(true)
    // `tags` que no es un array (un string suelto, un objeto).
    expect(esParaChicos({ tags: 'chicos' as unknown as readonly string[] })).toBe(false)
    expect(esParaChicos({ categorySlug: 7 as unknown as string })).toBe(false)
  })

  it('otra categoría sin tags: false', () => {
    expect(esParaChicos({ categorySlug: 'musica' })).toBe(false)
    expect(esParaChicos({ categorySlug: 'cine', tags: [] })).toBe(false)
    expect(esParaChicos({ categorySlug: 'teatro', tags: ['comedia'] })).toBe(false)
  })
})

describe('packages/core/src/filtros/publico.ts: la firma compartida con la web', () => {
  const fuente = quitarComentarios(leer('../../../packages/core/src/filtros/publico.ts'))
  const FIRMA = /export function esParaChicos\(e: \{ categorySlug\?: string \| null; tags\?: readonly string\[\] \| null \}\): boolean \{/

  it('la firma es exactamente la acordada y el archivo no importa React ni nada de la app', () => {
    expect(fuente).toMatch(FIRMA)
    expect(fuente).not.toMatch(/from\s*["']react/)
    expect(fuente).not.toMatch(/from\s*["']@\//)
  })

  // Ronda de correcciones de A3: la web crea este mismo archivo; cuanto menos
  // exporte, menos choca y la app no depende de algo que la otra versión no tenga.
  const exportados = (c: string) => [...c.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\s+(\w+)/gm)].map((m) => m[1])
  it('exporta SOLO esParaChicos (sin export default ni export { … })', () => {
    expect(exportados(fuente)).toEqual(['esParaChicos'])
    expect(fuente).not.toMatch(/^export\s+(?:default|\{|\*)/m)
  })

  // Regla del repo (`core/home/filters.ts`): sin caracteres invisibles en el
  // fuente; el rango de marcas combinantes va con escapes.
  const MARCA_LITERAL = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`)
  it('las marcas combinantes van con escapes, no tal cual', () => {
    const crudo = leer('../../../packages/core/src/filtros/publico.ts')
    expect(crudo).not.toMatch(MARCA_LITERAL)
    expect(crudo).toContain('/[\\u0300-\\u036f]/g')
  })

  it.each([
    ['otra constante exportada', (c: string) => c.replace('const MARCAS:', 'export const MARCAS:'), ['MARCAS', 'esParaChicos']],
    ['export default', (c: string) => `${c}\nexport default esParaChicos\n`, null],
  ])('rotura en memoria de los exports: %s -> detectada', (_n, romper, nombres) => {
    const roto = romper(fuente)
    expect(roto).not.toBe(fuente)
    if (nombres) expect(exportados(roto)).toEqual(nombres)
    else expect(roto).toMatch(/^export\s+(?:default|\{|\*)/m)
  })

  it('rotura en memoria: el rango con los caracteres tal cual -> detectada', () => {
    const crudo = leer('../../../packages/core/src/filtros/publico.ts')
    const roto = crudo.replace('\\u0300-\\u036f', `${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}`)
    expect(roto).not.toBe(crudo)
    expect(roto).toMatch(MARCA_LITERAL)
  })

  it.each([
    ['otro nombre', (s: string) => s.replace('function esParaChicos(', 'function esParaNinos(')],
    ['tags mutable', (s: string) => s.replace('tags?: readonly string[] | null', 'tags?: string[] | null')],
    ['otro retorno', (s: string) => s.replace('| null }): boolean {', '| null }): boolean | null {')],
  ])('rotura en memoria: %s -> detectada', (_n, romper) => {
    const roto = romper(fuente)
    expect(roto).not.toBe(fuente)
    expect(roto).not.toMatch(FIRMA)
  })
})

// ---------------------------------------------------------------------------
// 2. Datos: `paraChicos` sale de la fila (tags crudos), y la caché vieja
// ---------------------------------------------------------------------------
function fila(id: string, categoria: { slug: string; name: string }, tags: unknown, ageRestriction: number | null = 0) {
  return {
    id,
    slug: id,
    title: `Evento ${id}`,
    description: null,
    short_description: null,
    start_date: '2026-10-13T21:00:00-03:00',
    end_date: null,
    price_min: 0,
    is_free: true,
    image_url: null,
    ticket_url: null,
    age_restriction: ageRestriction,
    is_featured: false,
    tags,
    category: categoria,
    venue: { name: 'Lugar', address: 'Calle 1' },
  }
}

describe('obtenerEventosVigentesParaInicio: paraChicos con los tags de la fila', () => {
  const AHORA_DATOS = new Date('2026-10-13T12:00:00-03:00')
  beforeEach(() => {
    estadoSupabase.data = []
  })

  it('categoría infantil, tag "Niños", tag que no es, sin tags y tags null', async () => {
    estadoSupabase.data = [
      fila('titeres', { slug: 'infantil', name: 'Infantil' }, null),
      fila('recital-familiar', { slug: 'musica', name: 'Música' }, ['Rock', 'Niños']),
      fila('teatro-grandes', { slug: 'teatro', name: 'Teatro' }, ['chicos-grandes']),
      fila('feria', { slug: 'ferias', name: 'Ferias' }, []),
      fila('humor', { slug: 'humor', name: 'Humor' }, null),
    ]
    const r = await obtenerEventosVigentesParaInicio(AHORA_DATOS)
    if (!r.ok) throw new Error('no debería fallar')
    expect(r.eventos.map((e) => [e.evento.id, e.paraChicos])).toEqual([
      ['titeres', true],
      ['recital-familiar', true],
      ['teatro-grandes', false],
      ['feria', false],
      ['humor', false],
    ])
  })

  it('el DisplayEvent no gana tags (transformEvent no se toca): el dato viaja aparte', async () => {
    estadoSupabase.data = [fila('recital-familiar', { slug: 'musica', name: 'Música' }, ['familia'])]
    const r = await obtenerEventosVigentesParaInicio(AHORA_DATOS)
    if (!r.ok) throw new Error('no debería fallar')
    expect(r.eventos[0].evento.tags).toEqual(['familia'])
    expect(r.eventos[0].paraChicos).toBe(true)
  })

  // Ronda de correcciones de A3: `age_restriction >= 18` nunca es para chicos.
  it('un evento solo para adultos (age_restriction >= 18) no es para chicos, aunque tenga la categoría o el tag', async () => {
    estadoSupabase.data = [
      fila('infantil-18', { slug: 'infantil', name: 'Infantil' }, null, 18),
      fila('familia-21', { slug: 'musica', name: 'Música' }, ['familia'], 21),
      fila('familia-17', { slug: 'musica', name: 'Música' }, ['familia'], 17),
      fila('familia-null', { slug: 'musica', name: 'Música' }, ['familia'], null),
    ]
    const r = await obtenerEventosVigentesParaInicio(AHORA_DATOS)
    if (!r.ok) throw new Error('no debería fallar')
    expect(r.eventos.map((e) => [e.evento.id, e.paraChicos])).toEqual([
      ['infantil-18', false],
      ['familia-21', false],
      ['familia-17', true],
      ['familia-null', true],
    ])
  })

  it('paraChicosDeLaFila: el corte en 18', () => {
    const f = (ageRestriction: number | null | undefined) => paraChicosDeLaFila({ categorySlug: 'infantil', tags: null, ageRestriction })
    expect([f(undefined), f(null), f(0), f(13), f(17), f(18), f(99)]).toEqual([true, true, true, true, true, false, false])
    expect(paraChicosDeLaFila({ categorySlug: 'musica', tags: null, ageRestriction: 0 })).toBe(false)
  })

  it('tags raros de la base (no array, con no-strings) no rompen la carga', async () => {
    estadoSupabase.data = [
      fila('raro-1', { slug: 'musica', name: 'Música' }, 'familia'),
      fila('raro-2', { slug: 'musica', name: 'Música' }, [null, 4, 'chicos']),
    ]
    const r = await obtenerEventosVigentesParaInicio(AHORA_DATOS)
    if (!r.ok) throw new Error('no debería fallar')
    expect(r.eventos.map((e) => e.paraChicos)).toEqual([false, true])
  })
})

// ---------------------------------------------------------------------------
// Datos inventados para la portada y Buscar. "Ahora": miércoles 9/10/2030,
// 12:00 en Salta. El finde arranca el viernes 11 a las 19:00.
// ---------------------------------------------------------------------------
const salta = (wallClock: string) => saltaWallClockToDate(wallClock)
const AHORA = salta('2030-10-09T12:00:00')

const CATEGORIAS = [
  { slug: 'musica', name: 'Música' },
  { slug: 'teatro', name: 'Teatro' },
  { slug: 'cine', name: 'Cine' },
  { slug: 'infantil', name: 'Infantil' },
  { slug: 'ferias', name: 'Ferias' },
]

interface EventoInventado {
  id: string
  titulo: string
  categoria: string
  inicio: string
  price: DisplayEvent['price']
  tags: string[] | null
}

function displayEvent(e: EventoInventado): DisplayEvent {
  return {
    id: e.id,
    slug: e.id,
    title: e.titulo,
    venue: 'Lugar',
    date: e.inicio.slice(0, 10),
    time: e.inicio.slice(11, 16),
    category: e.categoria,
    categoryName: CATEGORIAS.find((c) => c.slug === e.categoria)?.name ?? e.categoria,
    price: e.price,
    image: '/placeholder.svg',
    description: '',
    address: '',
    startDateTime: salta(e.inicio).toISOString(),
    isFeatured: false,
  }
}

const INVENTADOS: EventoInventado[] = [
  { id: 'titeres-hoy', titulo: 'Títeres en la plaza', categoria: 'infantil', inicio: '2030-10-09T17:00:00', price: 'gratis', tags: null },
  { id: 'musica-familia-hoy', titulo: 'Recital para toda la familia', categoria: 'musica', inicio: '2030-10-09T19:00:00', price: 3000, tags: ['Familia'] },
  { id: 'musica-gratis-hoy', titulo: 'Rock en el parque', categoria: 'musica', inicio: '2030-10-09T21:00:00', price: 'gratis', tags: ['rock'] },
  { id: 'feria-infantiles-jueves', titulo: 'Feria de juguetes', categoria: 'ferias', inicio: '2030-10-10T18:00:00', price: 'confirmar', tags: ['infantiles'] },
  { id: 'teatro-ninos-sabado', titulo: 'Teatro para niños', categoria: 'teatro', inicio: '2030-10-12T16:00:00', price: 'gratis', tags: ['Niños'] },
  { id: 'teatro-grandes-sabado', titulo: 'Teatro para grandes', categoria: 'teatro', inicio: '2030-10-12T22:00:00', price: 5000, tags: ['chicos-grandes'] },
  // Un evento real de la categoría cine, para chicos (un ciclo en la plaza).
  { id: 'cine-chicos-domingo', titulo: 'Cine en la plaza', categoria: 'cine', inicio: '2030-10-13T18:00:00', price: 'gratis', tags: ['apto-chicos'] },
]

const PELICULAS = [
  transformMovie({ id: 'p1', slug: 'p1', title: 'Película animada', poster_url: null, showings: {} }, '2030-10-09'),
  transformMovie({ id: 'p2', slug: 'p2', title: 'Película de terror', poster_url: null, showings: {} }, '2030-10-09'),
]

/** Los eventos como los arma `obtenerEventosVigentesParaInicio` (con `paraChicos` de core). */
const EVENTOS: EventoVigenteParaInicio[] = INVENTADOS.map((e) => {
  const evento = displayEvent(e)
  return {
    evento,
    paraAtajo: { start_date: evento.startDateTime, category: e.categoria },
    paraChicos: esParaChicos({ categorySlug: e.categoria, tags: e.tags }),
  }
})

/** Lo mismo que arma la portada: los eventos + las películas con `paraAtajo: null` (sin `paraChicos`). */
const ITEMS: ItemConPublico[] = [...EVENTOS, ...PELICULAS.map((evento) => ({ evento, paraAtajo: null }))]

const ids = (lista: DisplayEvent[]) => lista.map((e) => e.id)

describe('los datos inventados (guarda)', () => {
  it('paraChicos de cada evento', () => {
    expect(EVENTOS.filter((e) => e.paraChicos).map((e) => e.evento.id)).toEqual([
      'titeres-hoy',
      'musica-familia-hoy',
      'teatro-ninos-sabado',
      'cine-chicos-domingo',
    ])
  })
  it('hoy: los tres de hoy; finde: los del sábado y el domingo', () => {
    expect(ids(filtrarCombinado(EVENTOS, { atajo: 'hoy', categoria: null }, AHORA))).toEqual(['titeres-hoy', 'musica-familia-hoy', 'musica-gratis-hoy'])
    expect(ids(filtrarCombinado(EVENTOS, { atajo: 'finde', categoria: null }, AHORA))).toEqual([
      'teatro-ninos-sabado',
      'teatro-grandes-sabado',
      'cine-chicos-domingo',
    ])
  })
})

// ---------------------------------------------------------------------------
// 3. Lógica pura
// ---------------------------------------------------------------------------
describe('esItemParaChicos / filtrarParaChicos / completarParaChicos (lib/para-chicos.ts)', () => {
  const peli = { evento: PELICULAS[0], paraAtajo: null }

  it('usa el booleano si está', () => {
    expect(esItemParaChicos({ evento: { category: 'musica' }, paraChicos: true })).toBe(true)
    expect(esItemParaChicos({ evento: { category: 'infantil' }, paraChicos: false })).toBe(false)
  })

  it('sin el booleano ("no se sabe"): la categoría infantil y nada más', () => {
    expect(esItemParaChicos({ evento: { category: 'infantil' } })).toBe(true)
    expect(esItemParaChicos({ evento: { category: 'musica' } })).toBe(false)
    // Un valor que no es booleano (caché tocada) se trata igual que ausente.
    expect(esItemParaChicos({ evento: { category: 'musica' }, paraChicos: 'true' })).toBe(false)
    expect(esItemParaChicos({ evento: { category: 'infantil' }, paraChicos: 1 })).toBe(true)
  })

  it('sin el booleano, un evento solo para adultos (vibe "adultos", de age_restriction >= 18) no es para chicos', () => {
    expect(esItemParaChicos({ evento: { category: 'infantil', vibe: 'adultos' } })).toBe(false)
    expect(esItemParaChicos({ evento: { category: 'infantil', vibe: null } })).toBe(true)
  })

  it('las películas no son para chicos (su categoría es cine)', () => {
    expect(PELICULAS.every((p) => p.category === 'cine')).toBe(true)
    expect(esItemParaChicos(peli)).toBe(false)
  })

  it('filtrarParaChicos: apagado devuelve los mismos items; prendido, solo los para chicos en orden', () => {
    expect(filtrarParaChicos(ITEMS, false)).toBe(ITEMS)
    expect(filtrarParaChicos(ITEMS, undefined)).toBe(ITEMS)
    expect(filtrarParaChicos(ITEMS, true).map((i) => i.evento.id)).toEqual([
      'titeres-hoy',
      'musica-familia-hoy',
      'teatro-ninos-sabado',
      'cine-chicos-domingo',
    ])
  })

  it('completarParaChicos: deja el booleano (misma referencia) o lo completa por la categoría', () => {
    const conDato = EVENTOS[1]
    expect(completarParaChicos(conDato)).toBe(conDato)
    const viejo = { evento: EVENTOS[0].evento, paraAtajo: EVENTOS[0].paraAtajo }
    expect(completarParaChicos(viejo)).toEqual({ ...viejo, paraChicos: true })
    const viejoMusica = { evento: EVENTOS[1].evento, paraAtajo: EVENTOS[1].paraAtajo }
    expect(completarParaChicos(viejoMusica).paraChicos).toBe(false)
  })
})

describe('caché sin conexión guardada antes de A3 (sin `paraChicos`)', () => {
  function sinCampo(item: EventoVigenteParaInicio): Omit<EventoVigenteParaInicio, 'paraChicos'> {
    const { paraChicos: _fuera, ...resto } = item
    return resto
  }
  const DATOS_VIEJOS = { eventos: EVENTOS.map(sinCampo), categorias: [], peliculas: [] } as unknown as DatosAgenda

  it('paraMostrar completa el campo: solo la categoría infantil queda como para chicos (los tags no están en la caché)', () => {
    const datos = paraMostrar(DATOS_VIEJOS, AHORA, AHORA)
    expect(datos.eventos.every((e) => typeof e.paraChicos === 'boolean')).toBe(true)
    expect(datos.eventos.filter((e) => e.paraChicos).map((e) => e.evento.id)).toEqual(['titeres-hoy'])
  })

  it('una caché nueva conserva lo que trae', () => {
    const datos = paraMostrar({ eventos: EVENTOS, categorias: [], peliculas: [] }, AHORA, AHORA)
    expect(datos.eventos.filter((e) => e.paraChicos).map((e) => e.evento.id)).toEqual([
      'titeres-hoy',
      'musica-familia-hoy',
      'teatro-ninos-sabado',
      'cine-chicos-domingo',
    ])
  })

  it('de punta a punta: una caché v1 sin el campo se muestra sin conexión, y "Para chicos" deja solo lo seguro', async () => {
    reiniciarBanderaDeLimpieza()
    const mapa = new Map<string, string>()
    const almacen: Almacen = {
      leer: async (c) => mapa.get(c) ?? null,
      escribir: async (c, v) => {
        mapa.set(c, v)
      },
      borrar: async (c) => {
        mapa.delete(c)
      },
      claves: async () => [...mapa.keys()],
      borrarVarias: async (cs) => {
        for (const c of cs) mapa.delete(c)
      },
    }
    await guardarCache(CLAVE_AGENDA, DATOS_VIEJOS, { ahora: AHORA, almacen })
    const r = await cargarAgendaConCache({
      ahora: AHORA,
      almacen,
      cargar: async () => ({ ok: false, error: 'sin red', sinConexion: true }),
    })
    if (r.tipo !== 'ok') throw new Error('debería mostrar la caché')
    expect(r.desdeCache).not.toBeNull()
    const grilla = eventosDeLaGrilla(r.datos.eventos, { atajo: 'semana', categoria: null, gratis: false, paraChicos: true }, AHORA)
    expect(ids(grilla)).toEqual(['titeres-hoy'])
  })

  it('no se sube la versión de la caché (subirla tira la de los testers)', () => {
    expect(VERSION_CACHE).toBe(1)
    expect(CLAVE_AGENDA).toBe('qps:cache:v1:agenda')
  })
})

describe('enModoGrilla con "Para chicos"', () => {
  it.each([
    [null, false, false, false],
    [null, false, true, true],
    [null, true, true, true],
    ['musica', false, true, true],
  ] as const)('categoría %s + gratis %s + para chicos %s -> %s', (categoria, gratis, paraChicos, esperado) => {
    expect(enModoGrilla({ categoria, gratis, paraChicos })).toBe(esperado)
  })
  it('sin la clave paraChicos (como en A2) queda igual', () => {
    expect(enModoGrilla({ categoria: null, gratis: false })).toBe(false)
  })
})

describe('eventosDeLaGrilla: fecha + categoría + gratis + para chicos (portada)', () => {
  const grilla = (atajo: Atajo, categoria: string | null, gratis: boolean, paraChicos: boolean) =>
    ids(eventosDeLaGrilla(ITEMS, { atajo, categoria, gratis, paraChicos }, AHORA))

  it('Para chicos + Todas + Hoy: el de Infantil y el que tiene el tag "Familia"', () => {
    expect(grilla('hoy', null, false, true)).toEqual(['titeres-hoy', 'musica-familia-hoy'])
  })
  it('Para chicos + Gratis + Hoy: los dos prendidos = gratis Y para chicos', () => {
    expect(grilla('hoy', null, true, true)).toEqual(['titeres-hoy'])
  })
  it('Para chicos + Música + Hoy', () => {
    expect(grilla('hoy', 'musica', false, true)).toEqual(['musica-familia-hoy'])
  })
  it('Para chicos + Gratis + Música + Hoy: vacío (el gratis de música no es para chicos)', () => {
    expect(grilla('hoy', 'musica', true, true)).toEqual([])
  })
  it('Para chicos + Semana: los cuatro, en orden; "infantiles" y "chicos-grandes" no', () => {
    expect(grilla('semana', null, false, true)).toEqual(['titeres-hoy', 'musica-familia-hoy', 'teatro-ninos-sabado', 'cine-chicos-domingo'])
  })
  it('Para chicos + Cine + Finde: el evento real de cine para chicos, sin películas', () => {
    expect(grilla('finde', 'cine', false, true)).toEqual(['cine-chicos-domingo'])
    // Sin "Para chicos", con "Cine" están las películas (no se filtran por fecha).
    expect(grilla('finde', 'cine', false, false)).toEqual(['cine-chicos-domingo', 'movie-p1', 'movie-p2'])
  })
  it('apagado es lo mismo que A2 (filtrarCombinado con atajo + categoría + gratis)', () => {
    for (const atajo of ['hoy', 'esta-noche', 'finde', 'semana'] as const) {
      for (const categoria of [null, 'musica', 'cine']) {
        for (const gratis of [false, true]) {
          expect(grilla(atajo, categoria, gratis, false)).toEqual(ids(filtrarCombinado(ITEMS, { atajo, categoria, soloGratis: gratis }, AHORA)))
        }
      }
    }
  })
})

describe('chips de categoría sobre lo que queda (eventosDeLosChips + chipsDeLaPortada)', () => {
  const chips = (atajo: Atajo, categoria: string | null, gratis: boolean, paraChicos: boolean) =>
    chipsDeLaPortada(eventosDeLosChips(ITEMS, { atajo, paraChicos }, AHORA), CATEGORIAS, categoria, gratis).map((c) => [c.slug, c.cantidad])

  it('Para chicos + Hoy: Infantil y Música (sin Cine: las películas no son para chicos)', () => {
    expect(chips('hoy', null, false, true)).toEqual([
      ['infantil', 1],
      ['musica', 1],
    ])
  })
  it('Para chicos + Gratis + Hoy: solo Infantil', () => {
    expect(chips('hoy', null, true, true)).toEqual([['infantil', 1]])
  })
  it('la categoría elegida queda aunque no tenga (al final, con 0)', () => {
    expect(chips('hoy', 'cine', false, true)).toEqual([
      ['infantil', 1],
      ['musica', 1],
      ['cine', 0],
    ])
  })
  it('apagado: los mismos chips que antes de A3 (los eventos de la fecha más las películas)', () => {
    const todosLosEventos = [...ids(filtrarCombinado(EVENTOS, { atajo: 'hoy', categoria: null }, AHORA)), ...ids(PELICULAS)]
    const base = eventosDeLosChips(ITEMS, { atajo: 'hoy', paraChicos: false }, AHORA)
    expect(ids(base)).toEqual(todosLosEventos)
    expect(chips('hoy', null, false, false)).toEqual(categoriasDisponibles(base, CATEGORIAS, null).map((c) => [c.slug, c.cantidad]))
  })
})

describe('título de la grilla con "Para chicos" (tituloParaChicos)', () => {
  it.each([
    [null, null, 'finde', false, 'Para chicos · Finde'],
    [null, null, 'hoy', true, 'Gratis para chicos · Hoy'],
    ['Música', 'musica', 'hoy', false, 'Música para chicos · Hoy'],
    ['Música', 'musica', 'finde', true, 'Música gratis para chicos · Finde'],
    // Con "Cine" va la fecha (las películas no entran).
    ['Cine', 'cine', 'semana', false, 'Cine para chicos · Semana'],
    // Con "Infantil" no se repite "para chicos".
    ['Infantil', 'infantil', 'esta-noche', false, 'Infantil · Esta noche'],
    ['Infantil', 'infantil', 'hoy', true, 'Infantil gratis · Hoy'],
  ] as const)('%s (%s), %s, gratis %s -> "%s"', (nombre, slug, atajo, gratis, esperado) => {
    expect(tituloParaChicos(nombre, slug, atajo, gratis)).toBe(esperado)
  })
})

describe('vacío de "Para chicos" (textoVacioParaChicos y la segunda salida)', () => {
  it.each([
    [null, '', 'hoy', false, 'No hay eventos para chicos hoy.'],
    [null, '', 'finde', false, 'No hay eventos para chicos el finde.'],
    [null, '', 'esta-noche', true, 'No hay eventos gratis para chicos esta noche.'],
    ['musica', 'Música', 'semana', false, 'No hay eventos de Música para chicos esta semana.'],
    ['musica', 'Música', 'hoy', true, 'No hay eventos gratis de Música para chicos hoy.'],
    ['infantil', 'Infantil', 'hoy', false, 'No hay eventos de Infantil para hoy.'],
    ['cine', 'Cine', 'hoy', false, 'No hay eventos de Cine para chicos hoy. Las películas en cartel no tienen la edad cargada, así que no aparecen con "Para chicos".'],
    ['cine', 'Cine', 'finde', true, 'No hay eventos gratis de Cine para chicos el finde. Las películas en cartel no son gratis.'],
  ] as const)('%s, %s, gratis %s -> "%s"', (categoria, nombre, atajo, gratis, esperado) => {
    expect(textoVacioParaChicos(categoria, nombre, atajo, gratis)).toBe(esperado)
  })

  it('la frase de la fecha es la de A2 (FRASE_ATAJO)', () => {
    for (const atajo of ['hoy', 'esta-noche', 'finde', 'semana'] as const) {
      expect(textoVacioParaChicos(null, '', atajo, false)).toBe(`No hay eventos para chicos ${FRASE_ATAJO[atajo]}.`)
    }
  })

  it('la salida que apaga el filtro: "Ver todas las edades" (paralela a "Ver todos los precios")', () => {
    expect(TEXTO_VER_TODAS_LAS_EDADES).toBe('Ver todas las edades')
  })

  const tipos = (categoria: string | null, atajo: Atajo, gratis: boolean) => {
    const { principal, segunda } = salidasVacioParaChicos(categoria, atajo, gratis)
    return [principal.tipo, segunda?.tipo ?? null]
  }

  it('sin Infantil: la principal es "Ver todas las edades"; la segunda, categoría -> fecha -> precios', () => {
    expect(salidasVacioParaChicos('musica', 'hoy', true)).toEqual({
      principal: { tipo: 'todas-las-edades', texto: 'Ver todas las edades' },
      segunda: { tipo: 'todas-las-categorias', texto: 'Todas las categorías' },
    })
    expect(tipos(null, 'hoy', true)).toEqual(['todas-las-edades', 'esta-semana'])
    expect(tipos(null, 'semana', true)).toEqual(['todas-las-edades', 'todos-los-precios'])
    expect(tipos(null, 'semana', false)).toEqual(['todas-las-edades', null])
    expect(salidasVacioParaChicos(null, 'semana', true).segunda?.texto).toBe('Ver todos los precios')
  })

  it('con Infantil no se ofrece "Ver todas las edades" (no cambiaría nada): fecha, si no precios, si no categorías', () => {
    expect(tipos('infantil', 'hoy', false)).toEqual(['esta-semana', 'todas-las-categorias'])
    expect(tipos('infantil', 'finde', true)).toEqual(['esta-semana', 'todas-las-categorias'])
    expect(tipos('infantil', 'semana', true)).toEqual(['todos-los-precios', 'todas-las-categorias'])
    expect(tipos('infantil', 'semana', false)).toEqual(['todas-las-categorias', null])
    for (const atajo of ['hoy', 'esta-noche', 'finde', 'semana'] as const) {
      for (const gratis of [false, true]) {
        const { principal, segunda } = salidasVacioParaChicos('infantil', atajo, gratis)
        expect(principal.tipo).not.toBe('todas-las-edades')
        expect(segunda?.tipo).not.toBe('todas-las-edades')
      }
    }
  })

  it('con Infantil, apagar "Para chicos" de verdad no cambia nada (por eso no se ofrece)', () => {
    for (const atajo of ['hoy', 'finde', 'semana'] as const) {
      for (const gratis of [false, true]) {
        const con = ids(eventosDeLaGrilla(ITEMS, { atajo, categoria: 'infantil', gratis, paraChicos: true }, AHORA))
        const sin = ids(eventosDeLaGrilla(ITEMS, { atajo, categoria: 'infantil', gratis, paraChicos: false }, AHORA))
        expect(con).toEqual(sin)
      }
    }
  })
})

describe('anuncioDeLaGrilla con "Para chicos" (el mismo camino que A2)', () => {
  const base = { modoGrilla: true, gratis: false, cantidad: 0, textoConteo: '2 eventos', textoVacio: 'No hay eventos para chicos hoy.' }
  it('con resultados, el conteo', () => {
    expect(anuncioDeLaGrilla({ ...base, paraChicos: true, cantidad: 2 })).toEqual({ texto: '2 eventos', tipo: 'conteo' })
  })
  it('sin resultados, el texto del vacío en su propio nodo (también con Gratis)', () => {
    expect(anuncioDeLaGrilla({ ...base, paraChicos: true })).toEqual({ texto: base.textoVacio, tipo: 'vacio-para-chicos' })
    expect(anuncioDeLaGrilla({ ...base, gratis: true, paraChicos: true })).toEqual({ texto: base.textoVacio, tipo: 'vacio-para-chicos' })
  })
  it('apagado, como en A2', () => {
    expect(anuncioDeLaGrilla({ ...base, gratis: true })?.tipo).toBe('vacio-gratis')
    expect(anuncioDeLaGrilla({ ...base, paraChicos: false })?.tipo).toBe('vacio-categoria')
    expect(anuncioDeLaGrilla({ ...base, modoGrilla: false, paraChicos: true })).toBeNull()
  })
})

describe('Buscar: filtrarConPublico (texto + fecha + categoría + gratis + para chicos)', () => {
  // Buscar no suma películas: solo los eventos.
  const buscar = (f: { texto?: string; atajo?: Atajo | null; categoria?: string | null; soloGratis?: boolean; paraChicos?: boolean }) =>
    ids(filtrarConPublico(EVENTOS, { atajo: f.atajo ?? null, categoria: f.categoria ?? null, texto: f.texto, soloGratis: f.soloGratis, paraChicos: f.paraChicos }, AHORA))

  it('solo "Para chicos": los cuatro, en todas las fechas', () => {
    expect(buscar({ paraChicos: true })).toEqual(['titeres-hoy', 'musica-familia-hoy', 'teatro-ninos-sabado', 'cine-chicos-domingo'])
  })
  it('con texto: "teatro" + para chicos', () => {
    expect(buscar({ texto: 'teatro', paraChicos: true })).toEqual(['teatro-ninos-sabado'])
    expect(buscar({ texto: 'teatro' })).toEqual(['teatro-ninos-sabado', 'teatro-grandes-sabado'])
  })
  it('con fecha + gratis + para chicos', () => {
    expect(buscar({ atajo: 'finde', soloGratis: true, paraChicos: true })).toEqual(['teatro-ninos-sabado', 'cine-chicos-domingo'])
  })
  it('con categoría + para chicos', () => {
    expect(buscar({ categoria: 'teatro', paraChicos: true })).toEqual(['teatro-ninos-sabado'])
  })
  it('todo junto, sin resultados', () => {
    expect(buscar({ texto: 'rock', atajo: 'hoy', categoria: 'musica', soloGratis: true, paraChicos: true })).toEqual([])
  })
  it('apagado es filtrarCombinado tal cual', () => {
    expect(buscar({ texto: 'en', soloGratis: true })).toEqual(ids(filtrarCombinado(EVENTOS, { atajo: null, categoria: null, texto: 'en', soloGratis: true }, AHORA)))
  })
})

describe('Buscar: textos del conteo y del vacío (lib/buscar-filtros.ts)', () => {
  const f = (over: Partial<FiltrosTextoBuscar>): FiltrosTextoBuscar => ({
    texto: '',
    soloGratis: false,
    paraChicos: false,
    categoria: null,
    nombreCategoria: null,
    atajo: null,
    ...over,
  })

  it('conteo: "para chicos" va como "gratis"', () => {
    expect(textoResultadosBuscar(4, f({ paraChicos: true }))).toBe('4 eventos para chicos')
    expect(textoResultadosBuscar(1, f({ paraChicos: true, soloGratis: true }))).toBe('1 evento gratis para chicos')
    expect(textoResultadosBuscar(3, f({ paraChicos: true, categoria: 'teatro', nombreCategoria: 'Teatro', atajo: 'finde' }))).toBe('3 eventos para chicos en Teatro · el finde')
  })
  it('con Infantil no se repite "para chicos" (como en la portada)', () => {
    expect(textoResultadosBuscar(3, f({ paraChicos: true, categoria: 'infantil', nombreCategoria: 'Infantil' }))).toBe('3 eventos en Infantil')
    expect(textoResultadosBuscar(1, f({ paraChicos: true, soloGratis: true, categoria: 'infantil', nombreCategoria: 'Infantil', atajo: 'hoy' }))).toBe('1 evento gratis en Infantil · hoy')
    expect(textoSinResultadosBuscar(f({ paraChicos: true, categoria: 'infantil', nombreCategoria: 'Infantil', atajo: 'finde' }))).toBe('No hay eventos en Infantil para el finde.')
  })

  it('conteo con texto: como con "Solo gratis", no se nombra', () => {
    expect(textoResultadosBuscar(2, f({ texto: 'títeres', paraChicos: true }))).toBe('2 resultados para "títeres"')
  })
  it('vacío: dice por qué (sin el segundo "para")', () => {
    expect(textoSinResultadosBuscar(f({ paraChicos: true }))).toBe('No hay eventos para chicos por ahora.')
    expect(textoSinResultadosBuscar(f({ paraChicos: true, atajo: 'finde' }))).toBe('No hay eventos para chicos el finde.')
    expect(textoSinResultadosBuscar(f({ paraChicos: true, soloGratis: true, categoria: 'teatro', nombreCategoria: 'Teatro', atajo: 'hoy' }))).toBe(
      'No hay eventos gratis para chicos en Teatro hoy.',
    )
  })
  it('sin "Para chicos", los textos de siempre (R66)', () => {
    expect(textoResultadosBuscar(2, f({ soloGratis: true, nombreCategoria: 'Música', atajo: 'hoy' }))).toBe('2 eventos gratis en Música · hoy')
    expect(textoSinResultadosBuscar(f({ soloGratis: true, atajo: 'semana' }))).toBe('No hay eventos gratis para esta semana.')
    expect(textoSinResultadosBuscar(f({}))).toBe('No hay eventos por ahora.')
    expect(textoSinResultadosBuscar(f({ texto: 'x', atajo: 'hoy' }))).toBe('No se encontraron eventos para "x" · hoy')
    expect(NOMBRE_ATAJO.finde).toBe('el finde')
  })
})

// ---------------------------------------------------------------------------
// 4. Detectores sobre el fuente
// ---------------------------------------------------------------------------

/** Desde el `{` en `desde`, el bloque hasta su `}` par (con las llaves). */
function bloque(texto: string, desde: number): string {
  let nivel = 0
  for (let i = desde; i < texto.length; i++) {
    if (texto[i] === '{') nivel++
    else if (texto[i] === '}') {
      nivel--
      if (nivel === 0) return texto.slice(desde, i + 1)
    }
  }
  return texto.slice(desde)
}

const numero = (obj: string, clave: string): number | null => {
  const m = new RegExp(`\\b${clave}\\s*:\\s*(\\d+)`).exec(obj)
  return m ? Number(m[1]) : null
}

/** Los nombres de ícono que existen en `components/Icono.tsx` (las claves de ICONOS_LUCIDE). */
function iconosQueExisten(fuenteIcono: string): Set<string> {
  const inicio = fuenteIcono.indexOf('const ICONOS_LUCIDE = {')
  const cuerpo = bloque(fuenteIcono, fuenteIcono.indexOf('{', inicio))
  return new Set([...cuerpo.matchAll(/\b([A-Z]\w*)\b/g)].map((m) => m[1]))
}

const ICONOS = iconosQueExisten(quitarComentarios(leer('../components/Icono.tsx')))

/** Violaciones del chip "Para chicos" de la portada (`components/ChipParaChicos.tsx`). */
function violacionesChipParaChicos(fuenteCruda: string): string[] {
  const c = quitarComentarios(fuenteCruda)
  const v: string[] = []
  const desde = c.indexOf('<Pressable')
  const hasta = c.indexOf('</Pressable>', desde)
  if (desde < 0 || hasta < 0) return ['no hay <Pressable']
  const pressable = c.slice(desde, hasta)

  if (!/accessibilityRole="button"/.test(pressable)) v.push('rol: el chip no es accessibilityRole="button"')
  if (!/accessibilityState=\{\{\s*selected:\s*activo\s*\}\}/.test(pressable)) v.push('estado: falta accessibilityState={{ selected: activo }}')
  if (!/onPress=\{\(\) => onCambiar\(!activo\)\}/.test(pressable)) v.push('no es un interruptor: onPress no llama onCambiar(!activo)')
  if (!/>\s*Para chicos\s*</.test(pressable)) v.push('el texto visible no es "Para chicos"')
  if (!/accessibilityLabel="Solo eventos para chicos"/.test(pressable)) v.push('etiqueta: falta accessibilityLabel="Solo eventos para chicos"')

  const clave = /style=\{\[\s*estilos\.(\w+)/.exec(pressable)
  if (!clave) v.push('el style del Pressable no arranca con una clave de estilos.*')
  else {
    const m = new RegExp(`\\b${clave[1]}:\\s*\\{([^}]*)\\}`).exec(c)
    const minimo = m ? numero(m[1], 'minHeight') : null
    if (minimo === null || minimo < 48) v.push(`área: la clave "${clave[1]}" no tiene minHeight >= 48`)
  }

  const ternario = /\bactivo\s*\?\s*\{/.exec(pressable)
  if (!ternario) v.push('no hay estilo activo ? {…} : {…}')
  else {
    const ini = ternario.index + ternario[0].length - 1
    const activoObj = bloque(pressable, ini)
    const resto = /^\s*:\s*\{/.exec(pressable.slice(ini + activoObj.length))
    const inactivoObj = resto ? bloque(pressable, ini + activoObj.length + resto[0].length - 1) : ''
    const bA = numero(activoObj, 'borderWidth')
    const bI = numero(inactivoObj, 'borderWidth')
    if (bA === null || bI === null || bA <= bI) v.push('forma: el activo no tiene un contorno más grueso que el inactivo')
    else {
      const padA = numero(activoObj, 'paddingHorizontal') ?? 16
      const padI = numero(inactivoObj, 'paddingHorizontal') ?? 16
      if (bA + padA !== bI + padI) v.push('ancho: el chip salta al prenderse')
    }
    if (!/backgroundColor:\s*colores\.primary\b/.test(activoObj)) v.push('forma: el activo no va relleno de colores.primary')
    if (!/borderColor:\s*bordeInactivo\b/.test(inactivoObj)) v.push('borde: el inactivo no usa bordeInactivo (3:1)')
  }
  if (!/peso=\{activo \? 'bold' : 'semibold'\}/.test(pressable)) v.push("peso: falta peso={activo ? 'bold' : 'semibold'}")
  if (!/const bordeInactivo = bordeChipInactivo\(colores\)/.test(c)) v.push('borde: no usa bordeChipInactivo(colores)')
  if (!/const colores = useColoresQPS\(\)/.test(c)) v.push('colores: no salen de useColoresQPS()')
  if (/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/.test(c)) v.push('colores: hay un color literal')
  if (/colores\.border\b/.test(c)) v.push('borde: usa colores.border (no llega a 3:1)')

  const icono = /<Icono\s+nombre=\{([^}]*)\}/.exec(pressable)
  if (!icono) v.push('no hay <Icono nombre={…}>')
  else {
    const nombres = [...icono[1].matchAll(/'(\w+)'/g)].map((m) => m[1])
    if (nombres.length < 2) v.push('el ícono no cambia al prenderse')
    for (const n of nombres) if (!ICONOS.has(n)) v.push(`ícono: "${n}" no existe en components/Icono.tsx`)
    // Ronda de correcciones de A3: `Baby` sonaba a bebés y repetía el de Infantil.
    if (nombres.includes('Baby')) v.push('ícono: repite el de la categoría Infantil (Baby)')
  }
  return v
}

describe('components/ChipParaChicos.tsx', () => {
  const real = leer('../components/ChipParaChicos.tsx')

  it('la guarda: los íconos que usa existen', () => {
    expect(ICONOS.has('Balloon')).toBe(true)
    expect(ICONOS.has('Check')).toBe(true)
    expect(ICONOS.has('PersonStanding')).toBe(false)
  })

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesChipParaChicos(real)).toEqual([])
  })

  it.each([
    ['sin rol', (s: string) => s.replace('accessibilityRole="button"\n      accessibilityState', 'accessibilityState'), 'rol: el chip no es accessibilityRole="button"'],
    ['estado fijo', (s: string) => s.replace('selected: activo', 'selected: false'), 'estado: falta accessibilityState={{ selected: activo }}'],
    ['checked en vez de selected', (s: string) => s.replace('selected: activo', 'checked: activo'), 'estado: falta accessibilityState={{ selected: activo }}'],
    ['etiqueta pelada', (s: string) => s.replace('accessibilityLabel="Solo eventos para chicos"', 'accessibilityLabel="Para chicos"'), 'etiqueta: falta accessibilityLabel="Solo eventos para chicos"'],
    ['sin etiqueta', (s: string) => s.replace('      accessibilityLabel="Solo eventos para chicos"\n', ''), 'etiqueta: falta accessibilityLabel="Solo eventos para chicos"'],
    ['texto "Chicos"', (s: string) => s.replace('        Para chicos\n', '        Chicos\n'), 'el texto visible no es "Para chicos"'],
    ['no alterna', (s: string) => s.replace('onCambiar(!activo)', 'onCambiar(true)'), 'no es un interruptor: onPress no llama onCambiar(!activo)'],
    ['minHeight 44', (s: string) => s.replace('minHeight: 48,\n  },\n})', 'minHeight: 44,\n  },\n})'), 'área: la clave "chipParaChicos" no tiene minHeight >= 48'],
    ['contorno igual', (s: string) => s.replace('borderWidth: 2', 'borderWidth: 1'), 'forma: el activo no tiene un contorno más grueso que el inactivo'],
    ['sin compensar el padding', (s: string) => s.replace('paddingHorizontal: 15', 'paddingHorizontal: 16'), 'ancho: el chip salta al prenderse'],
    ['sin negrita', (s: string) => s.replace("peso={activo ? 'bold' : 'semibold'}", "peso={activo ? 'semibold' : 'semibold'}"), "peso: falta peso={activo ? 'bold' : 'semibold'}"],
    ['borde genérico', (s: string) => s.replace('borderColor: bordeInactivo', 'borderColor: colores.border'), 'borde: el inactivo no usa bordeInactivo (3:1)'],
    ['color literal', (s: string) => s.replace('backgroundColor: colores.primary,', "backgroundColor: '#C0392B',"), 'colores: hay un color literal'],
    ['ícono inventado', (s: string) => s.replace("'Balloon'", "'PersonStanding'"), 'ícono: "PersonStanding" no existe en components/Icono.tsx'],
    ['ícono fijo', (s: string) => s.replace("nombre={activo ? 'Check' : 'Balloon'}", "nombre={'Balloon'}"), 'el ícono no cambia al prenderse'],
    ['el de la categoría Infantil', (s: string) => s.replace("'Balloon'", "'Baby'"), 'ícono: repite el de la categoría Infantil (Baby)'],
  ])('rotura en memoria: %s -> detectada', (_nombre, romper, esperada) => {
    const roto = romper(real)
    expect(roto).not.toBe(real)
    expect(violacionesChipParaChicos(roto)).toContain(esperada)
  })
})

/**
 * Ronda de correcciones de A3: "Gratis" y "Para chicos" en una fila PROPIA,
 * fija y sin scroll, primera de la cabecera fija de la portada; después la
 * fila con scroll de "Todas" + categorías (sin filtros adentro) y al final las
 * pills de fecha.
 */
function violacionesCabeceraFiltros(portadaCruda: string, chipsCrudo: string): string[] {
  const c = quitarComentarios(portadaCruda)
  const v: string[] = []
  const ini = c.indexOf('<View style={[estilos.cabecera,')
  const fila = /<View style=\{estilos\.filaFiltros\}>([\s\S]*?)<\/View>/.exec(c)
  if (!fila) return ['no hay una fila filaFiltros']
  if (!/^\s*<ChipGratis activo=\{gratis\} onCambiar=\{cambiarGratis\} \/>\s*<ChipParaChicos activo=\{paraChicos\} onCambiar=\{cambiarParaChicos\} \/>\s*$/.test(fila[1])) {
    v.push('la fila de filtros no es Gratis y después Para chicos (y nada más)')
  }
  if (/ScrollView/.test(fila[1])) v.push('la fila de filtros tiene scroll')
  const posFila = fila.index
  const posChips = c.indexOf('<ChipsCategorias')
  const posPills = c.indexOf('<PillsAtajos')
  if (!(ini >= 0 && ini < posFila && posFila < posChips && posChips < posPills)) v.push('el orden de la cabecera no es filtros, categorías, fecha')
  // Primer hijo de la cabecera, sin condición: siempre se puede apagar un filtro.
  if (!/<View style=\{\[estilos\.cabecera,[^\n]*\]\}>\s*<View style=\{estilos\.filaFiltros\}>/.test(c)) v.push('la fila de filtros no es el primer hijo (sin condición) de la cabecera')
  const estilo = /\bfilaFiltros:\s*\{([^}]*)\}/.exec(c)?.[1] ?? ''
  if (!/flexDirection:\s*'row'/.test(estilo) || !/flexWrap:\s*'wrap'/.test(estilo) || numero(estilo, 'gap') !== 8) v.push("filaFiltros no es row + wrap + gap 8")
  // La fila con scroll ya no tiene filtros.
  const chips = quitarComentarios(chipsCrudo)
  if (/\bChipParaChicos\b|\bChipGratis\b/.test(chips)) v.push('un chip de filtro sigue dentro de ChipsCategorias')
  if (/destinoScrollFila/.test(chips)) v.push('ChipsCategorias usa destinoScrollFila (ya no hace falta)')
  if (!/const destino = destinoScrollChip\(posiciones\.current\[clave\], anchoVisible\.current\)/.test(chips)) v.push('traerALaVista no usa destinoScrollChip')
  return v
}

describe('la cabecera de la portada: la fila fija de filtros', () => {
  const portada = leer('../app/(tabs)/index.tsx')
  const chips = leer('../components/ChipsCategorias.tsx')

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesCabeceraFiltros(portada, chips)).toEqual([])
  })

  it.each([
    ['sin la fila', (p: string) => p.replace('<View style={estilos.filaFiltros}>', '<View>'), 'no hay una fila filaFiltros'],
    [
      'Para chicos antes de Gratis',
      (p: string) =>
        p.replace(
          '<ChipGratis activo={gratis} onCambiar={cambiarGratis} />\n              <ChipParaChicos activo={paraChicos} onCambiar={cambiarParaChicos} />',
          '<ChipParaChicos activo={paraChicos} onCambiar={cambiarParaChicos} />\n              <ChipGratis activo={gratis} onCambiar={cambiarGratis} />',
        ),
      'la fila de filtros no es Gratis y después Para chicos (y nada más)',
    ],
    ['sin Para chicos', (p: string) => p.replace('<ChipParaChicos activo={paraChicos} onCambiar={cambiarParaChicos} />', ''), 'la fila de filtros no es Gratis y después Para chicos (y nada más)'],
    ['con scroll', (p: string) => p.replace('<View style={estilos.filaFiltros}>', '<View style={estilos.filaFiltros}><ScrollView horizontal />'), 'la fila de filtros tiene scroll'],
    ['condicional', (p: string) => p.replace('<View style={estilos.filaFiltros}>', '{modoGrilla ? null : null}<View style={estilos.filaFiltros}>'), 'la fila de filtros no es el primer hijo (sin condición) de la cabecera'],
    ['sin wrap', (p: string) => p.replace("filaFiltros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8,", "filaFiltros: { flexDirection: 'row', gap: 8,"), 'filaFiltros no es row + wrap + gap 8'],
  ])('rotura en memoria (portada): %s -> detectada', (_n, romper, esperada) => {
    const roto = romper(portada)
    expect(roto).not.toBe(portada)
    expect(violacionesCabeceraFiltros(roto, chips)).toContain(esperada)
  })

  it.each([
    ['Para chicos de vuelta en la fila con scroll', (c: string) => c.replace("import { Icono,", "import { ChipParaChicos } from '@/components/ChipParaChicos'\nimport { Icono,"), 'un chip de filtro sigue dentro de ChipsCategorias'],
    ['otro destino', (c: string) => c.replace('const destino = destinoScrollChip(', 'const destino = destinoScrollFila(clave, '), 'traerALaVista no usa destinoScrollChip'],
  ])('rotura en memoria (ChipsCategorias): %s -> detectada', (_n, romper, esperada) => {
    const roto = romper(chips)
    expect(roto).not.toBe(chips)
    expect(violacionesCabeceraFiltros(portada, roto)).toContain(esperada)
  })

  it('Buscar no le pasa nada nuevo a ChipsCategorias (tiene sus propios chips al lado de "Solo gratis")', () => {
    const buscar = quitarComentarios(leer('../app/(tabs)/buscar.tsx'))
    const uso = /<ChipsCategorias\b[^>]*\/>/.exec(buscar)
    expect(uso).not.toBeNull()
    expect(uso![0]).not.toMatch(/\bparaChicos=|\bgratis=|\bmostrarBarra\b/)
  })
})

/** Violaciones del modo "Para chicos" en la portada (`app/(tabs)/index.tsx`). */
function violacionesPortada(fuenteCruda: string): string[] {
  const c = quitarComentarios(fuenteCruda)
  const v: string[] = []
  if (!/const \[paraChicos, setParaChicos\] = useState\(false\)/.test(c)) v.push('Para chicos no arranca apagado')
  if (!/<ChipParaChicos activo=\{paraChicos\} onCambiar=\{cambiarParaChicos\} \/>/.test(c)) v.push('el chip no recibe activo={paraChicos} onCambiar={cambiarParaChicos}')

  const handler = /const cambiarParaChicos = useCallback\(\(nuevo: boolean\) => \{([\s\S]*?)\}, \[\]\)/.exec(c)
  if (!handler) v.push('no existe el handler cambiarParaChicos')
  else {
    if (!/\bsetParaChicos\(nuevo\)/.test(handler[1])) v.push('cambiarParaChicos no llama setParaChicos(nuevo)')
    if (!/\.scrollTo\(\{\s*y:\s*0\b/.test(handler[1])) v.push('cambiarParaChicos no vuelve el scroll arriba')
  }

  if (!/const modoGrilla = enModoGrilla\(\{ categoria, gratis, paraChicos \}\)/.test(c)) v.push('modoGrilla no cuenta Para chicos')
  if (!/if \(enModoGrilla\(\{ categoria, gratis, paraChicos \}\)\) \{/.test(c)) v.push('la grilla del useMemo no se arma con Para chicos')

  // Los items llevan `paraChicos` (de `estado.eventos`) y se filtran con él.
  if (!/const items: ItemConPublico\[\] = \[\s*\.\.\.estado\.eventos,/.test(c)) v.push('los items no salen de estado.eventos (con paraChicos)')
  if (!/eventosCategoria = eventosDeLaGrilla\(items, \{ atajo, categoria, gratis, paraChicos \}, ahora\)/.test(c)) v.push('la grilla no filtra con Para chicos')
  if (!/chipsDeLaPortada\(eventosDeLosChips\(items, \{ atajo, paraChicos \}, ahora\),/.test(c)) v.push('los chips no salen de lo que queda con Para chicos')
  if (!/\}, \[estado, atajo, categoria, gratis, paraChicos\]\)/.test(c)) v.push('datosPortada no depende de Para chicos')

  // Título, texto del vacío y anuncio.
  if (!/\{paraChicos \? \(\s*tituloParaChicos\(categoria === null \? null : nombreCategoria, categoria, atajo, gratis\)/.test(c)) v.push('el título no sale de tituloParaChicos')
  if (!/const textoVacio = paraChicos\s*\?\s*textoVacioParaChicos\(categoria, nombreCategoria, atajo, gratis\)/.test(c)) v.push('el texto del vacío no sale de textoVacioParaChicos')
  if (!/anuncioDeLaGrilla\(\{\s*modoGrilla,\s*gratis,\s*paraChicos,/.test(c)) v.push('el anuncio no sabe de Para chicos')

  // El vacío: su rama va antes que la de Gratis, y cada salida llama a su handler.
  const rama = /datosPortada\.eventosCategoria\.length === 0 && paraChicos \? \(\s*<VacioParaChicos\b[\s\S]*?\/>/.exec(c)
  if (!rama) v.push('no hay rama del vacío de Para chicos')
  else {
    const uso = rama[0]
    if (c.indexOf(uso) > c.indexOf('<VacioGratis')) v.push('el vacío de Gratis va antes que el de Para chicos')
    if (!/texto=\{textoVacio\}/.test(uso)) v.push('el vacío de Para chicos no recibe textoVacio')
    if (!/\{\.\.\.salidasVacioParaChicos\(categoria, atajo, gratis\)\}/.test(uso)) v.push('las salidas no salen de salidasVacioParaChicos')
    if (!/onTodasLasEdades=\{\(\) => cambiarParaChicos\(false\)\}/.test(uso)) v.push('"Ver todas las edades" no apaga Para chicos')
    if (!/onTodasLasCategorias=\{\(\) => cambiarCategoria\(null\)\}/.test(uso)) v.push('"Todas las categorías" no vuelve a "Todas"')
    if (!/onEstaSemana=\{\(\) => cambiarAtajo\('semana'\)\}/.test(uso)) v.push('"Ver esta semana" no pasa a la semana')
    if (!/onTodosLosPrecios=\{\(\) => cambiarGratis\(false\)\}/.test(uso)) v.push('"Ver todos los precios" no apaga Gratis')
    if (!/bordeSecundario=\{bordeInactivo\}/.test(uso)) v.push('el secundario del vacío de Para chicos no usa bordeInactivo')
  }

  const vacio = /function VacioParaChicos\([\s\S]*?\n\}\n/.exec(c)
  if (!vacio) v.push('no hay function VacioParaChicos')
  else {
    const cuerpo = vacio[0]
    const pressables = cuerpo.match(/<Pressable\b/g) ?? []
    const roles = cuerpo.match(/accessibilityRole="button"/g) ?? []
    if (pressables.length !== 2 || pressables.length !== roles.length) v.push('un botón del vacío no tiene accessibilityRole="button"')
    if (!/<Pressable\s+onPress=\{alTocar\(principal\)\}[\s\S]*?\{principal\.texto\}/.test(cuerpo)) v.push('la salida principal no muestra principal.texto con alTocar(principal)')
    if (!/<Pressable\s+onPress=\{alTocar\(segunda\)\}[\s\S]*?\{segunda\.texto\}/.test(cuerpo)) v.push('la segunda salida no muestra segunda.texto con alTocar(segunda)')
    const despacho = /const alTocar = \(salida: SalidaParaChicos\) =>([\s\S]*?)\n  return/.exec(cuerpo)?.[1].replace(/\s+/g, ' ') ?? ''
    if (despacho.trim() !== "salida.tipo === 'todas-las-edades' ? onTodasLasEdades : salida.tipo === 'todas-las-categorias' ? onTodasLasCategorias : salida.tipo === 'esta-semana' ? onEstaSemana : onTodosLosPrecios") {
      v.push('una salida no despacha a su handler')
    }
    if (!/borderColor: bordeSecundario/.test(cuerpo)) v.push('el secundario del vacío de Para chicos no usa bordeSecundario')
    if (!/accessibilityLiveRegion="polite">\s*\{texto\}/.test(cuerpo)) v.push('el texto del vacío de Para chicos no es una live region')
    if (/BannerAnuncio|BannerRadar/.test(cuerpo)) v.push('hay un banner en el vacío')
    if (!/estilos\.botonVacio/.test(cuerpo)) v.push('los botones del vacío no usan estilos.botonVacio (minHeight 48)')
  }
  return v
}

describe('app/(tabs)/index.tsx: el modo "Para chicos"', () => {
  const real = leer('../app/(tabs)/index.tsx')

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesPortada(real)).toEqual([])
  })

  it.each([
    ['arranca prendido', (s: string) => s.replace('const [paraChicos, setParaChicos] = useState(false)', 'const [paraChicos, setParaChicos] = useState(true)'), 'Para chicos no arranca apagado'],
    ['chip con el estado de Gratis', (s: string) => s.replace('<ChipParaChicos activo={paraChicos}', '<ChipParaChicos activo={gratis}'), 'el chip no recibe activo={paraChicos} onCambiar={cambiarParaChicos}'],
    ['sin scroll arriba', (s: string) => s.replace(/(const cambiarParaChicos[\s\S]*?)scrollRef\.current\?\.scrollTo\(\{ y: 0, animated: false \}\)/, '$1void 0'), 'cambiarParaChicos no vuelve el scroll arriba'],
    ['modo grilla sin Para chicos', (s: string) => s.replace('const modoGrilla = enModoGrilla({ categoria, gratis, paraChicos })', 'const modoGrilla = enModoGrilla({ categoria, gratis })'), 'modoGrilla no cuenta Para chicos'],
    ['grilla sin Para chicos', (s: string) => s.replace('{ atajo, categoria, gratis, paraChicos }, ahora)', '{ atajo, categoria, gratis }, ahora)'), 'la grilla no filtra con Para chicos'],
    ['items sin paraChicos', (s: string) => s.replace('...estado.eventos,\n', '...estado.eventos.map(({ evento, paraAtajo }) => ({ evento, paraAtajo })),\n'), 'los items no salen de estado.eventos (con paraChicos)'],
    ['chips sin Para chicos', (s: string) => s.replace('eventosDeLosChips(items, { atajo, paraChicos }, ahora)', 'eventosDeLosChips(items, { atajo }, ahora)'), 'los chips no salen de lo que queda con Para chicos'],
    ['sin la dependencia', (s: string) => s.replace('}, [estado, atajo, categoria, gratis, paraChicos])', '}, [estado, atajo, categoria, gratis])'), 'datosPortada no depende de Para chicos'],
    ['título de Gratis', (s: string) => s.replace('tituloParaChicos(categoria === null ? null : nombreCategoria, categoria, atajo, gratis)', 'tituloGratis(categoria === null ? null : nombreCategoria, atajo)'), 'el título no sale de tituloParaChicos'],
    ['vacío con el texto de Gratis', (s: string) => s.replace('? textoVacioParaChicos(categoria, nombreCategoria, atajo, gratis)', '? textoVacioGratis(categoria, nombreCategoria, atajo)'), 'el texto del vacío no sale de textoVacioParaChicos'],
    ['anuncio sin Para chicos', (s: string) => s.replace(/(anuncioDeLaGrilla\(\{\s*modoGrilla,\s*gratis,)\s*paraChicos,/, '$1'), 'el anuncio no sabe de Para chicos'],
    ['sin rama del vacío', (s: string) => s.replace('datosPortada.eventosCategoria.length === 0 && paraChicos ? (', 'datosPortada.eventosCategoria.length === 0 && false ? ('), 'no hay rama del vacío de Para chicos'],
    ['"Ver todas las edades" que apaga Gratis', (s: string) => s.replace('onTodasLasEdades={() => cambiarParaChicos(false)}', 'onTodasLasEdades={() => cambiarGratis(false)}'), '"Ver todas las edades" no apaga Para chicos'],
    ['"Ver todos los precios" que apaga Para chicos', (s: string) => s.replace('onTodosLosPrecios={() => cambiarGratis(false)}', 'onTodosLosPrecios={() => cambiarParaChicos(false)}'), '"Ver todos los precios" no apaga Gratis'],
    ['salidas fijas', (s: string) => s.replace('{...salidasVacioParaChicos(categoria, atajo, gratis)}', "principal={{ tipo: 'todas-las-edades', texto: 'Ver todas las edades' }}\n                  segunda={null}"), 'las salidas no salen de salidasVacioParaChicos'],
    ['salida cruzada', (s: string) => s.replace("salida.tipo === 'todas-las-categorias'\n        ? onTodasLasCategorias", "salida.tipo === 'todas-las-categorias'\n        ? onEstaSemana"), 'una salida no despacha a su handler'],
    ['"Ver todas las edades" siempre', (s: string) => s.replace("salida.tipo === 'todas-las-edades'\n      ? onTodasLasEdades", "true\n      ? onTodasLasEdades"), 'una salida no despacha a su handler'],
    ['salida principal con otro texto', (s: string) => s.replace('{principal.texto}', 'Ver todas las edades'), 'la salida principal no muestra principal.texto con alTocar(principal)'],
    ['segunda con el handler de la principal', (s: string) => s.replace('onPress={alTocar(segunda)}', 'onPress={alTocar(principal)}'), 'la segunda salida no muestra segunda.texto con alTocar(segunda)'],
    ['botón del vacío sin rol', (s: string) => s.replace(/(onPress=\{alTocar\(principal\)\}\s*)accessibilityRole="button"/, '$1'), 'un botón del vacío no tiene accessibilityRole="button"'],
    ['vacío sin live region', (s: string) => s.replace(/(function VacioParaChicos[\s\S]*?)accessibilityLiveRegion="polite">/, '$1>'), 'el texto del vacío de Para chicos no es una live region'],
    ['secundario con colores.border', (s: string) => s.replace(/(function VacioParaChicos[\s\S]*?)borderColor: bordeSecundario/, '$1borderColor: colores.border'), 'el secundario del vacío de Para chicos no usa bordeSecundario'],
  ])('rotura en memoria: %s -> detectada', (_nombre, romper, esperada) => {
    const roto = romper(real)
    expect(roto).not.toBe(real)
    expect(violacionesPortada(roto)).toContain(esperada)
  })
})

/** Violaciones del chip "Para chicos" de Buscar (`app/(tabs)/buscar.tsx`). */
function violacionesBuscar(fuenteCruda: string): string[] {
  const c = quitarComentarios(fuenteCruda)
  const v: string[] = []
  if (!/const \[paraChicosActivo, setParaChicosActivo\] = useState\(false\)/.test(c)) v.push('Para chicos no arranca apagado')

  // Los dos chips de filtro, en la misma fila (la cabecera fija no crece: regla (a)).
  const ini = c.indexOf('<View style={estilos.filaFiltros}>')
  const fin = ini < 0 ? -1 : c.indexOf('</View>', ini)
  const fila = ini < 0 || fin < 0 ? '' : c.slice(ini, fin)
  if (!fila) v.push('no hay una fila filaFiltros')
  if (!/>\s*Solo gratis\s*</.test(fila)) v.push('"Solo gratis" no está en la fila de filtros')
  const chips = fila.split('<Pressable').slice(1)
  const chip = chips.find((p) => />\s*Para chicos\s*</.test(p)) ?? ''
  if (!chip) v.push('"Para chicos" no está en la fila de filtros, al lado de "Solo gratis"')
  else {
    if (!/onPress=\{\(\) => setParaChicosActivo\(\(valor\) => !valor\)\}/.test(chip)) v.push('el chip no alterna paraChicosActivo')
    if (!/accessibilityRole="button"/.test(chip)) v.push('rol: el chip no es accessibilityRole="button"')
    if (!/accessibilityState=\{\{\s*selected:\s*paraChicosActivo\s*\}\}/.test(chip)) v.push('estado: falta accessibilityState={{ selected: paraChicosActivo }}')
    if (!/accessibilityLabel="Solo eventos para chicos"/.test(chip)) v.push('etiqueta: falta accessibilityLabel="Solo eventos para chicos"')
    if (!/style=\{\[\s*estilos\.chipGratis,/.test(chip)) v.push('el chip no usa el estilo de "Solo gratis" (estilos.chipGratis)')
    if (!/borderColor: paraChicosActivo \? colores\.primary : bordeInactivo/.test(chip)) v.push('borde: activo primary, inactivo bordeInactivo')
    if (!/backgroundColor: paraChicosActivo \? colores\.primary : colores\.card/.test(chip)) v.push('forma: el activo no va relleno')
    if (!/peso=\{paraChicosActivo \? 'bold' : 'semibold'\}/.test(chip)) v.push("peso: falta peso={paraChicosActivo ? 'bold' : 'semibold'}")
  }
  const estiloFila = /\bfilaFiltros:\s*\{([^}]*)\}/.exec(c)
  if (!estiloFila || !/flexDirection:\s*'row'/.test(estiloFila[1])) v.push('filaFiltros no es una fila')
  const estiloChip = /\bchipGratis:\s*\{([^}]*)\}/.exec(c)
  if (!estiloChip || (numero(estiloChip[1], 'minHeight') ?? 0) < 48) v.push('área: chipGratis sin minHeight >= 48')

  // Combinación: cuenta como filtro, y se filtra antes de filtrarCombinado en los resultados y en los chips.
  if (!/const mostrarResultados = [^\n]*\bparaChicosActivo\b/.test(c)) v.push('Para chicos no cuenta como filtro (mostrarResultados)')
  const memoResultados = /const resultadosMostrados = useMemo\(\(\) => \{([\s\S]*?)\}, \[([^\]]*)\]\)/.exec(c)
  if (!memoResultados || !/filtrarConPublico\(\s*estado\.items,\s*\{[^}]*\bparaChicos: paraChicosActivo\b[^}]*\}/.test(memoResultados[1])) v.push('los resultados no filtran con Para chicos')
  if (!memoResultados || !/\bparaChicosActivo\b/.test(memoResultados[2])) v.push('los resultados no dependen de Para chicos')
  const memoChips = /const categoriasParaChips = useMemo\(\(\) => \{([\s\S]*?)\}, \[([^\]]*)\]\)/.exec(c)
  if (!memoChips || !/filtrarConPublico\(\s*estado\.items,\s*\{[^}]*categoria: null[^}]*\bparaChicos: paraChicosActivo\b[^}]*\}/.test(memoChips[1])) v.push('los chips de categoría no salen de lo que queda con Para chicos')
  if (!memoChips || !/\bparaChicosActivo\b/.test(memoChips[2])) v.push('los chips no dependen de Para chicos')
  // "Explorar por categoria" sigue contando sobre todos los eventos.
  if (!/estado\.items\.filter\(\(item\) => item\.evento\.category === slug\)\.length/.test(c)) v.push('la grilla "Explorar por categoria" ya no cuenta sobre todos los eventos')

  // Textos y vacío.
  const filtrosTexto = /const filtrosTexto = \{[^}]*\}/.exec(c)?.[0] ?? ''
  if (!/paraChicos: paraChicosActivo,/.test(filtrosTexto)) v.push('los textos no saben de Para chicos')
  if (!/categoria: categoriaFiltro,/.test(filtrosTexto)) v.push('los textos no saben qué categoría (Infantil) está elegida')
  if (!/textoResultadosBuscar\(resultadosMostrados\.length, filtrosTexto\)/.test(c)) v.push('el conteo no sale de textoResultadosBuscar')
  if (!/textoSinResultadosBuscar\(filtrosTexto\)/.test(c)) v.push('el vacío no sale de textoSinResultadosBuscar')
  // Ronda de correcciones de A3: con Infantil elegida no se ofrece (no cambiaría nada).
  const salida = /if \(paraChicosActivo && categoriaFiltro !== SLUG_INFANTIL\) \{\s*accionesVacio\.push\(\{\s*texto:\s*TEXTO_VER_TODAS_LAS_EDADES,\s*alTocar:\s*\(\) => setParaChicosActivo\(false\)\s*\}\)\s*\}/.exec(c)
  if (!salida) v.push('el vacío no ofrece "Ver todas las edades" (salvo con Infantil)')
  else if (salida.index > c.indexOf("if (atajo !== null) accionesVacio.push(")) v.push('"Ver todas las edades" no es la salida principal (la primera)')
  return v
}

describe('app/(tabs)/buscar.tsx: el chip "Para chicos"', () => {
  const real = leer('../app/(tabs)/buscar.tsx')

  it('el fuente real no tiene violaciones', () => {
    expect(violacionesBuscar(real)).toEqual([])
  })

  it.each([
    ['arranca prendido', (s: string) => s.replace('const [paraChicosActivo, setParaChicosActivo] = useState(false)', 'const [paraChicosActivo, setParaChicosActivo] = useState(true)'), 'Para chicos no arranca apagado'],
    ['sin rol', (s: string) => s.replace(/(setParaChicosActivo\(\(valor\) => !valor\)\}\s*)accessibilityRole="button"/, '$1'), 'rol: el chip no es accessibilityRole="button"'],
    ['estado fijo', (s: string) => s.replace('selected: paraChicosActivo', 'selected: false'), 'estado: falta accessibilityState={{ selected: paraChicosActivo }}'],
    ['sin etiqueta', (s: string) => s.replace('accessibilityLabel="Solo eventos para chicos"', ''), 'etiqueta: falta accessibilityLabel="Solo eventos para chicos"'],
    ['fuera de la fila', (s: string) => s.replace('<View style={estilos.filaFiltros}>', '<View>'), 'no hay una fila filaFiltros'],
    ['estilo propio', (s: string) => s.replace(/(setParaChicosActivo\(\(valor\) => !valor\)\}[\s\S]*?)estilos\.chipGratis,/, '$1estilos.chipChicos,'), 'el chip no usa el estilo de "Solo gratis" (estilos.chipGratis)'],
    ['sin negrita', (s: string) => s.replace("peso={paraChicosActivo ? 'bold' : 'semibold'}", "peso=\"semibold\""), "peso: falta peso={paraChicosActivo ? 'bold' : 'semibold'}"],
    ['no cuenta como filtro', (s: string) => s.replace('|| paraChicosActivo ||', '||'), 'Para chicos no cuenta como filtro (mostrarResultados)'],
    ['resultados sin Para chicos', (s: string) => s.replace('{ atajo, categoria: categoriaFiltro, soloGratis: soloGratisActivo, texto, paraChicos: paraChicosActivo }', '{ atajo, categoria: categoriaFiltro, soloGratis: soloGratisActivo, texto }'), 'los resultados no filtran con Para chicos'],
    ['chips sin Para chicos', (s: string) => s.replace('{ atajo, categoria: null, soloGratis: soloGratisActivo, texto, paraChicos: paraChicosActivo }', '{ atajo, categoria: null, soloGratis: soloGratisActivo, texto }'), 'los chips de categoría no salen de lo que queda con Para chicos'],
    ['sin dependencia', (s: string) => s.replace('}, [estado, texto, atajo, categoriaFiltro, soloGratisActivo, paraChicosActivo])', '}, [estado, texto, atajo, categoriaFiltro, soloGratisActivo])'), 'los resultados no dependen de Para chicos'],
    ['grilla de categorías filtrada', (s: string) => s.replace('estado.items.filter((item) => item.evento.category === slug).length', 'estado.items.filter((item) => item.paraChicos && item.evento.category === slug).length'), 'la grilla "Explorar por categoria" ya no cuenta sobre todos los eventos'],
    ['textos sin Para chicos', (s: string) => s.replace('    paraChicos: paraChicosActivo,\n    categoria', '    paraChicos: false,\n    categoria'), 'los textos no saben de Para chicos'],
    ['vacío sin la salida', (s: string) => s.replace('texto: TEXTO_VER_TODAS_LAS_EDADES', "texto: 'Ver todo'"), 'el vacío no ofrece "Ver todas las edades" (salvo con Infantil)'],
    ['salida que no apaga', (s: string) => s.replace('alTocar: () => setParaChicosActivo(false)', 'alTocar: () => setAtajo(null)'), 'el vacío no ofrece "Ver todas las edades" (salvo con Infantil)'],
    ['salida también con Infantil', (s: string) => s.replace('if (paraChicosActivo && categoriaFiltro !== SLUG_INFANTIL) {', 'if (paraChicosActivo) {'), 'el vacío no ofrece "Ver todas las edades" (salvo con Infantil)'],
    ['textos sin la categoría', (s: string) => s.replace('    categoria: categoriaFiltro,\n    nombreCategoria', '    categoria: null,\n    nombreCategoria'), 'los textos no saben qué categoría (Infantil) está elegida'],
    [
      'salida al final',
      (s: string) => {
        const bloque = "  if (paraChicosActivo && categoriaFiltro !== SLUG_INFANTIL) {\n    accionesVacio.push({ texto: TEXTO_VER_TODAS_LAS_EDADES, alTocar: () => setParaChicosActivo(false) })\n  }\n"
        return moverAlFinal(s.replace(bloque, ''), bloque)
      },
      '"Ver todas las edades" no es la salida principal (la primera)',
    ],
  ])('rotura en memoria: %s -> detectada', (_nombre, romper, esperada) => {
    const roto = romper(real)
    expect(roto).not.toBe(real)
    expect(violacionesBuscar(roto)).toContain(esperada)
  })
})

/** Pone `linea` después de la última `accionesVacio.push(` (para la rotura "salida al final"). */
function moverAlFinal(fuente: string, linea: string): string {
  const marca = "if (categoriaFiltro !== null) accionesVacio.push("
  const ini = fuente.indexOf(marca)
  const fin = fuente.indexOf('\n', ini) + 1
  return fuente.slice(0, fin) + linea + fuente.slice(fin)
}

describe('los datos y la caché (detectores)', () => {
  const eventos = quitarComentarios(leer('../lib/datos/eventos.ts'))
  const agenda = quitarComentarios(leer('../lib/sin-conexion/agenda.ts'))

  const violacionesDatos = (c: string): string[] => {
    const v: string[] = []
    if (!/import \{ paraChicosDeLaFila \} from '@\/lib\/para-chicos'/.test(c)) v.push('no usa paraChicosDeLaFila (esParaChicos de core + la edad)')
    if (!/paraChicos: paraChicosDeLaFila\(\{ categorySlug: fila\.category\?\.slug \?\? null, tags: fila\.tags, ageRestriction: fila\.age_restriction \}\)/.test(c)) v.push('paraChicos no sale de la categoría, los tags crudos y la edad de la fila')
    if (!/evento: transformEvent\(fila\),/.test(c)) v.push('el evento ya no es transformEvent(fila)')
    return v
  }
  const violacionesCache = (c: string): string[] => {
    const v: string[] = []
    if (!/isVigente\(item\.paraAtajo, ahora\)\)\.map\(completarParaChicos\)/.test(c)) v.push('paraMostrar no completa paraChicos de la caché vieja')
    return v
  }

  it('los fuentes reales no tienen violaciones', () => {
    expect(violacionesDatos(eventos)).toEqual([])
    expect(violacionesCache(agenda)).toEqual([])
  })

  it.each([
    ['sin tags', (s: string) => s.replace('tags: fila.tags', 'tags: null'), 'paraChicos no sale de la categoría, los tags crudos y la edad de la fila'],
    ['sin la edad', (s: string) => s.replace('ageRestriction: fila.age_restriction', 'ageRestriction: 0'), 'paraChicos no sale de la categoría, los tags crudos y la edad de la fila'],
    ['regla propia', (s: string) => s.replace("import { paraChicosDeLaFila } from '@/lib/para-chicos'", 'const paraChicosDeLaFila = (_: unknown) => false'), 'no usa paraChicosDeLaFila (esParaChicos de core + la edad)'],
  ])('rotura en memoria (datos): %s -> detectada', (_n, romper, esperada) => {
    const roto = romper(eventos)
    expect(roto).not.toBe(eventos)
    expect(violacionesDatos(roto)).toContain(esperada)
  })

  it('rotura en memoria (caché): sin completar -> detectada', () => {
    const roto = agenda.replace('.map(completarParaChicos)', '')
    expect(roto).not.toBe(agenda)
    expect(violacionesCache(roto)).toContain('paraMostrar no completa paraChicos de la caché vieja')
  })
})
