/**
 * Equivalencia entre `@qps/core/home/busqueda` (`buscarEventosPorTexto`,
 * nueva, R29 tarea 29-j) y la búsqueda de texto de
 * `apps/web/app/buscar/buscar-content.tsx` (el `useMemo` `filteredEvents`,
 * que la tarea no tocó: es de solo lectura para 29-j). Esta búsqueda nunca
 * fue un módulo de `apps/web/lib`, así que no hay un archivo puente que
 * comparar (a diferencia de `equivalencia.test.ts`): la prueba de que las
 * dos hacen lo mismo es, acá, reimplementar el cuerpo exacto del `useMemo`
 * (copiado tal cual de `buscar-content.tsx` líneas 155-164 al 15/10) y
 * comparar resultado a resultado con fixtures.
 *
 * El segundo bloque lee el archivo fuente de la web y confirma, por texto,
 * que las tres condiciones (`title`/`venue`/`description`, `toLowerCase` +
 * `includes`) siguen ahí tal cual: si alguien cambia esa lógica en la web,
 * este archivo lo nota sin que haga falta acordarse de venir a actualizarlo.
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

/**
 * Copia literal del cuerpo del `useMemo` `filteredEvents` de
 * `buscar-content.tsx` (líneas 155-164 al 15/10), sin el `useDeferredValue`
 * ni el `useMemo` en sí (eso es React, no la lógica de filtrado).
 */
function filteredEventsDeLaWeb(allDisplayEvents: DisplayEvent[], deferredSearchQuery: string): DisplayEvent[] {
  if (!deferredSearchQuery) return []
  const query = deferredSearchQuery.toLowerCase()
  return allDisplayEvents.filter(
    (event) =>
      event.title.toLowerCase().includes(query) ||
      event.venue.toLowerCase().includes(query) ||
      event.description.toLowerCase().includes(query)
  )
}

describe('buscarEventosPorTexto === filteredEvents de buscar-content.tsx (reimplementado)', () => {
  const eventos = [
    evento({ id: 'por-titulo', title: 'Festival de Jazz en el Parque' }),
    evento({ id: 'por-lugar', title: 'Show sorpresa', venue: 'Anfiteatro Parque San Martín' }),
    evento({ id: 'por-descripcion', title: 'Noche especial', description: 'Una noche con mucho parque y aire libre' }),
    evento({ id: 'sin-match', title: 'Teatro clásico', venue: 'Sala Chica', description: 'Obra de dos actos' }),
  ]

  it.each(['parque', 'PARQUE', 'Parque', '  no-such-term  '])('misma lista para la consulta %j', (query) => {
    expect(buscarEventosPorTexto(eventos, query)).toEqual(filteredEventsDeLaWeb(eventos, query))
  })

  it('consulta vacía: las dos devuelven []', () => {
    expect(buscarEventosPorTexto(eventos, '')).toEqual([])
    expect(filteredEventsDeLaWeb(eventos, '')).toEqual([])
  })

  it('encuentra por título', () => {
    const resultado = buscarEventosPorTexto(eventos, 'jazz')
    expect(resultado.map((e) => e.id)).toEqual(['por-titulo'])
    expect(resultado).toEqual(filteredEventsDeLaWeb(eventos, 'jazz'))
  })

  it('encuentra por lugar (venue)', () => {
    const resultado = buscarEventosPorTexto(eventos, 'anfiteatro')
    expect(resultado.map((e) => e.id)).toEqual(['por-lugar'])
    expect(resultado).toEqual(filteredEventsDeLaWeb(eventos, 'anfiteatro'))
  })

  it('encuentra por descripción', () => {
    const resultado = buscarEventosPorTexto(eventos, 'aire libre')
    expect(resultado.map((e) => e.id)).toEqual(['por-descripcion'])
    expect(resultado).toEqual(filteredEventsDeLaWeb(eventos, 'aire libre'))
  })

  it('sin coincidencias: lista vacía en las dos', () => {
    expect(buscarEventosPorTexto(eventos, 'inexistente-xyz')).toEqual([])
    expect(filteredEventsDeLaWeb(eventos, 'inexistente-xyz')).toEqual([])
  })

  it('no normaliza acentos (a diferencia de home/filters.ts): "cafe" no encuentra "café"', () => {
    const conAcento = [evento({ id: 'con-acento', title: 'Café literario' })]
    expect(buscarEventosPorTexto(conAcento, 'cafe')).toEqual([])
    expect(buscarEventosPorTexto(conAcento, 'cafe')).toEqual(filteredEventsDeLaWeb(conAcento, 'cafe'))
  })

  it('no muta la lista de entrada', () => {
    const entrada = [...eventos]
    const copia = [...entrada]
    buscarEventosPorTexto(entrada, 'parque')
    expect(entrada).toEqual(copia)
  })
})

describe('buscar-content.tsx (fuente, solo lectura): las tres condiciones siguen ahí', () => {
  const contenido = readFileSync(RUTA_BUSCAR_CONTENT, 'utf8')

  it('filtra por event.title.toLowerCase().includes(query)', () => {
    expect(contenido).toMatch(/event\.title\.toLowerCase\(\)\.includes\(query\)/)
  })

  it('filtra por event.venue.toLowerCase().includes(query)', () => {
    expect(contenido).toMatch(/event\.venue\.toLowerCase\(\)\.includes\(query\)/)
  })

  it('filtra por event.description.toLowerCase().includes(query)', () => {
    expect(contenido).toMatch(/event\.description\.toLowerCase\(\)\.includes\(query\)/)
  })

  it('sin query, no hay filteredEvents ("if (!deferredSearchQuery) return []")', () => {
    expect(contenido).toMatch(/if\s*\(\s*!deferredSearchQuery\s*\)\s*return\s*\[\]/)
  })
})
