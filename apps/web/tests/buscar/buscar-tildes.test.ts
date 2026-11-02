/**
 * QPS-021: `/buscar` ignora tildes. Desde la Fase 2 de la R30 (16/10), la
 * búsqueda es la de core (`buscarEventosPorTexto`, de la R29), que normaliza
 * con `normalizeFilterText`, la misma de la portada (`home/filters`): "pena"
 * encuentra "Peña" y "musica" encuentra "Música", en la web y en la app.
 * También: "Explorar por categoría" con tilde, sin categorías con 0 eventos.
 * Desde Q3 (C2) la web le pasa el texto a `filtrarCombinado` (texto + chips),
 * que busca con `buscarEventosPorTexto`: las pruebas de abajo filtran por
 * ese mismo camino.
 *
 * Sin testing-library (entorno node, sin DOM): se prueba la función real de
 * core con fixtures inventadas, y se lee el código fuente para confirmar que
 * la web la usa y que nadie tiene su propia copia de la normalización.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { filtrarCombinado } from '@qps/core/home/filtros-combinados'
import type { DisplayEvent } from '@qps/core/home/types'
import { es } from '@/lib/i18n/diccionarios/es'

const SOURCE_PATH = new URL('../../app/buscar/buscar-content.tsx', import.meta.url)
const source = readFileSync(SOURCE_PATH, 'utf8')
const CORE_PATH = new URL('../../../../packages/core/src/home/busqueda.ts', import.meta.url)
const core = readFileSync(CORE_PATH, 'utf8')
const COMBINADO_PATH = new URL('../../../../packages/core/src/home/filtros-combinados.ts', import.meta.url)
const combinado = readFileSync(COMBINADO_PATH, 'utf8')

function evento(overrides: Partial<DisplayEvent> = {}): DisplayEvent {
  return {
    id: 'evento-de-prueba',
    slug: 'evento-de-prueba',
    title: 'Evento de Prueba',
    venue: 'Venue de Prueba',
    date: '2026-10-10',
    time: '21:00',
    category: 'recitales',
    categoryName: 'Recitales',
    price: 'confirmar',
    image: '/placeholder.svg',
    description: '',
    address: '',
    startDateTime: '2026-10-10T21:00:00-03:00',
    isFeatured: false,
    ...overrides,
  }
}

// La búsqueda real de /buscar (y de la app): `filtrarCombinado` solo con texto,
// con los mismos items que arma `buscar-content.tsx` (sin fecha ni categoría).
const filtrarComoBuscar = (eventos: DisplayEvent[], texto: string) =>
  filtrarCombinado(
    eventos.map((evento) => ({ evento, paraAtajo: null })),
    { atajo: null, categoria: null, texto },
    new Date('2026-10-10T12:00:00-03:00')
  )

describe('la búsqueda de /buscar es la de core, y core normaliza con normalizeFilterText', () => {
  it('buscar-content.tsx busca con filtrarCombinado de @qps/core/home/filtros-combinados, que usa buscarEventosPorTexto de ./busqueda', () => {
    expect(source).toMatch(/import\s*\{[^}]*\bfiltrarCombinado\b[^}]*\}\s*from\s*["']@qps\/core\/home\/filtros-combinados["']/)
    expect(source).toMatch(/\btexto:\s*deferredSearchQuery\b/)
    expect(combinado).toMatch(/import\s*\{\s*buscarEventosPorTexto\s*\}\s*from\s*["']\.\/busqueda["']/)
  })

  it('buscar-content.tsx no tiene su propia normalización ni comparación', () => {
    expect(source).not.toMatch(/normalize\(\s*["']NFD["']\s*\)/)
    expect(source).not.toMatch(/event\.title\.toLowerCase\(\)/)
    expect(source).not.toMatch(/normalizeFilterText\(event\./)
  })

  it('core/home/busqueda.ts usa normalizeFilterText de ./filters (la de la portada), sin copia propia', () => {
    expect(core).toMatch(/import\s*\{\s*normalizeFilterText\s*\}\s*from\s*["']\.\/filters["']/)
    expect(core).not.toMatch(/normalize\(\s*["']NFD["']\s*\)/)
  })
})

describe('filtrado real de /buscar (filtrarCombinado → buscarEventosPorTexto de core)', () => {
  it('"pena" encuentra "Peña" (por título)', () => {
    const pena = evento({ id: 'pena', title: 'Peña Folklórica' })
    const otro = evento({ id: 'otro', title: 'Recital de Rock' })
    expect(filtrarComoBuscar([pena, otro], 'pena')).toEqual([pena])
  })

  it('"musica" encuentra "Música" (por descripción)', () => {
    const musica = evento({ id: 'musica', title: 'Evento sin relación en el título', description: 'Noche de Música en vivo' })
    const otro = evento({ id: 'otro', title: 'Otro evento', description: 'sin relación' })
    expect(filtrarComoBuscar([musica, otro], 'musica')).toEqual([musica])
  })

  it('también encuentra por lugar (venue), sin tildes', () => {
    const conPena = evento({ id: 'con-pena', title: 'Noche especial', venue: 'Peña del Sol' })
    const sinPena = evento({ id: 'sin-pena', title: 'Otra noche', venue: 'Boliche Cualquiera' })
    expect(filtrarComoBuscar([conPena, sinPena], 'pena')).toEqual([conPena])
  })

  it('sigue siendo insensible a mayúsculas, como antes', () => {
    const evt = evento({ id: 'mayus', title: 'FIESTA DE MÚSICA' })
    expect(filtrarComoBuscar([evt], 'musica')).toEqual([evt])
  })
})

describe('tildes en /buscar', () => {
  it('"Explorar por categoría" con tilde', () => {
    // Desde C4 los textos salen del diccionario: el componente los usa y el castellano tiene la tilde.
    expect(source).toContain('{t.explorarPorCategoria}')
    expect(es.buscar.explorarPorCategoria).toBe('Explorar por categoría')
  })

  it('el placeholder de búsqueda dice "descripción" con tilde', () => {
    expect(source).toContain('placeholder={t.placeholder}')
    expect(es.buscar.placeholder).toContain('lugar o descripción')
    expect(es.buscar.placeholder).not.toContain('lugar o descripcion')
  })
})

describe('"Explorar por categoría": no se muestran las categorías con 0 eventos', () => {
  it('filtra por count > 0 antes de mapear las categorías', () => {
    expect(source).toMatch(/\.filter\(\(\{\s*count\s*\}\)\s*=>\s*count\s*>\s*0\)/)
  })
})
