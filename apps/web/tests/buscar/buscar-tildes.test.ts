/**
 * QPS-021: `/buscar` filtra con `normalizeFilterText` de `@qps/core`
 * (`home/filters`), la misma que usa la portada (`components/home-content.tsx`
 * -> `@/lib/home/filters`), en vez de su propia comparación. Se aplica al
 * texto buscado y a título, lugar y descripción: "pena" encuentra "Peña" y
 * "musica" encuentra "Música". También: "Explorar por categoría" con tilde,
 * sin categorías con 0 eventos.
 *
 * Sin testing-library (entorno node, sin DOM): se prueba la función real
 * (`normalizeFilterText`, tal como la usa el componente) con fixtures
 * inventadas, y se lee el código fuente de `buscar-content.tsx` para
 * confirmar el import y que no quedó una copia propia de la normalización.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeFilterText } from '@/lib/home/filters'
import type { DisplayEvent } from '@qps/core/home/types'

const SOURCE_PATH = new URL('../../app/buscar/buscar-content.tsx', import.meta.url)
const source = readFileSync(SOURCE_PATH, 'utf8')

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

// Reproduce exactamente el predicado de `filteredEvents` en buscar-content.tsx:
// título, lugar o descripción, los tres normalizados con `normalizeFilterText`.
function filtrarComoBuscar(eventos: DisplayEvent[], query: string): DisplayEvent[] {
  const q = normalizeFilterText(query)
  return eventos.filter(
    (event) =>
      normalizeFilterText(event.title).includes(q) ||
      normalizeFilterText(event.venue).includes(q) ||
      normalizeFilterText(event.description).includes(q)
  )
}

describe('buscar-content.tsx: importa normalizeFilterText de lib/home/filters (la misma de la portada), sin copia propia', () => {
  it('importa normalizeFilterText de "@/lib/home/filters"', () => {
    expect(source).toMatch(/import \{[^}]*\bnormalizeFilterText\b[^}]*\}\s*from\s*["']@\/lib\/home\/filters["']/)
  })

  it('no tiene su propia normalización de tildes (sin normalize("NFD") a mano en el filtro de búsqueda)', () => {
    expect(source).not.toMatch(/normalize\(\s*["']NFD["']\s*\)/)
    expect(source).not.toMatch(/event\.title\.toLowerCase\(\)/)
    expect(source).not.toMatch(/event\.venue\.toLowerCase\(\)/)
    expect(source).not.toMatch(/event\.description\.toLowerCase\(\)/)
  })
})

describe('filtrado real de /buscar (normalizeFilterText + el mismo predicado del componente)', () => {
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
