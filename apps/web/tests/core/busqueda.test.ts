/**
 * Equivalencia entre `@qps/core/home/busqueda` (`buscarEventosPorTexto`,
 * R29, tarea 29-j) y la búsqueda de texto de
 * `apps/web/app/buscar/buscar-content.tsx`.
 *
 * Cierre de ronda (29, última pasada): el `useMemo` `filteredEvents` de
 * `buscar-content.tsx` ya no reimplementa el filtro de texto a mano, llama
 * a `buscarEventosPorTexto` de core. Por eso este test ya no reimplementa
 * el cuerpo del `useMemo` para comparse contra sí mismo (eso quedaba verde
 * aunque la web cambiara de lógica real): ahora fija, por un lado, que la
 * web *usa* `buscarEventosPorTexto` (lectura estática del archivo fuente,
 * sin levantar React) y, por otro, que `buscarEventosPorTexto` filtra por
 * título, lugar y descripción sin distinguir mayúsculas — que es, en los
 * hechos, todo lo que la web necesita de esta función.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buscarEventosPorTexto } from '@qps/core/home/busqueda'
import type { DisplayEvent } from '@qps/core/home/types'

const RUTA_BUSCAR_CONTENT = fileURLToPath(new URL('../../app/buscar/buscar-content.tsx', import.meta.url))

let autoId = 0
function evento(overrides: Partial<DisplayEvent> = {}): DisplayEvent {
  autoId += 1
  return {
    id: `evento-de-prueba-${autoId}`,
    slug: `evento-de-prueba-${autoId}`,
    title: `Evento de Prueba ${autoId}`,
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

describe('buscar-content.tsx (fuente, solo lectura): usa buscarEventosPorTexto de core', () => {
  const contenido = readFileSync(RUTA_BUSCAR_CONTENT, 'utf8')

  it('importa buscarEventosPorTexto de @qps/core/home/busqueda', () => {
    expect(contenido).toMatch(/import\s*\{\s*buscarEventosPorTexto\s*\}\s*from\s*["']@qps\/core\/home\/busqueda["']/)
  })

  it('el useMemo de filteredEvents llama a buscarEventosPorTexto (no reimplementa el filtro)', () => {
    expect(contenido).toMatch(/buscarEventosPorTexto\(allDisplayEvents,\s*deferredSearchQuery\)/)
  })

  it('ya no queda una copia inline del filtro (toLowerCase().includes() sobre title/venue/description)', () => {
    expect(contenido).not.toMatch(/event\.title\.toLowerCase\(\)\.includes\(/)
    expect(contenido).not.toMatch(/event\.venue\.toLowerCase\(\)\.includes\(/)
    expect(contenido).not.toMatch(/event\.description\.toLowerCase\(\)\.includes\(/)
  })
})

describe('buscarEventosPorTexto: título, lugar y descripción, sin distinguir mayúsculas', () => {
  const eventos = [
    evento({ id: 'por-titulo', title: 'Festival de Jazz en el Parque' }),
    evento({ id: 'por-lugar', title: 'Show sorpresa', venue: 'Anfiteatro Parque San Martín' }),
    evento({ id: 'por-descripcion', title: 'Noche especial', description: 'Una noche con mucho parque y aire libre' }),
    evento({ id: 'sin-match', title: 'Teatro clásico', venue: 'Sala Chica', description: 'Obra de dos actos' }),
  ]

  it('consulta vacía: lista vacía', () => {
    expect(buscarEventosPorTexto(eventos, '')).toEqual([])
  })

  it('encuentra por título', () => {
    expect(buscarEventosPorTexto(eventos, 'jazz').map((e) => e.id)).toEqual(['por-titulo'])
  })

  it('encuentra por lugar (venue)', () => {
    expect(buscarEventosPorTexto(eventos, 'anfiteatro').map((e) => e.id)).toEqual(['por-lugar'])
  })

  it('encuentra por descripción', () => {
    expect(buscarEventosPorTexto(eventos, 'aire libre').map((e) => e.id)).toEqual(['por-descripcion'])
  })

  it('sin distinguir mayúsculas', () => {
    const resultado = buscarEventosPorTexto(eventos, 'PARQUE').map((e) => e.id)
    expect(resultado.sort()).toEqual(['por-descripcion', 'por-lugar', 'por-titulo'])
  })

  it('sin coincidencias: lista vacía', () => {
    expect(buscarEventosPorTexto(eventos, 'inexistente-xyz')).toEqual([])
  })

  it('no normaliza acentos (a diferencia de home/filters.ts): "cafe" no encuentra "café"', () => {
    const conAcento = [evento({ id: 'con-acento', title: 'Café literario' })]
    expect(buscarEventosPorTexto(conAcento, 'cafe')).toEqual([])
  })

  it('no muta la lista de entrada', () => {
    const entrada = [...eventos]
    const copia = [...entrada]
    buscarEventosPorTexto(entrada, 'parque')
    expect(entrada).toEqual(copia)
  })
})
