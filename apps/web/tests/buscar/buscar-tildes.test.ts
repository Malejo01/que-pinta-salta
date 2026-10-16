/**
 * QPS-021: `/buscar` ignora tildes. Desde la Fase 2 de la R30 (16/10), la
 * búsqueda es la de core (`buscarEventosPorTexto`, de la R29), que normaliza
 * con `normalizeFilterText`, la misma de la portada (`home/filters`): "pena"
 * encuentra "Peña" y "musica" encuentra "Música", en la web y en la app.
 * También: "Explorar por categoría" con tilde, sin categorías con 0 eventos.
 *
 * Sin testing-library (entorno node, sin DOM): se prueba la función real de
 * core con fixtures inventadas, y se lee el código fuente para confirmar que
 * la web la usa y que nadie tiene su propia copia de la normalización.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buscarEventosPorTexto } from '@qps/core/home/busqueda'
import type { DisplayEvent } from '@qps/core/home/types'

const SOURCE_PATH = new URL('../../app/buscar/buscar-content.tsx', import.meta.url)
const source = readFileSync(SOURCE_PATH, 'utf8')
const CORE_PATH = new URL('../../../../packages/core/src/home/busqueda.ts', import.meta.url)
const core = readFileSync(CORE_PATH, 'utf8')

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

// La búsqueda real de /buscar (y de la app).
const filtrarComoBuscar = buscarEventosPorTexto

describe('la búsqueda de /buscar es la de core, y core normaliza con normalizeFilterText', () => {
  it('buscar-content.tsx usa buscarEventosPorTexto de @qps/core/home/busqueda', () => {
    expect(source).toMatch(/import\s*\{\s*buscarEventosPorTexto\s*\}\s*from\s*["']@qps\/core\/home\/busqueda["']/)
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

describe('filtrado real de /buscar (buscarEventosPorTexto de core)', () => {
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
    expect(source).toContain('Explorar por categoría')
    expect(source).not.toContain('Explorar por categoria')
  })

  it('el placeholder de búsqueda dice "descripción" con tilde', () => {
    expect(source).toContain('lugar o descripción')
    expect(source).not.toContain('lugar o descripcion')
  })
})

describe('"Explorar por categoría": no se muestran las categorías con 0 eventos', () => {
  it('filtra por count > 0 antes de mapear las categorías', () => {
    expect(source).toMatch(/\.filter\(\(\{\s*count\s*\}\)\s*=>\s*count\s*>\s*0\)/)
  })
})
