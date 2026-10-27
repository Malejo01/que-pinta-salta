/**
 * `/buscar`: chip "Para chicos" (Q3, C2), al lado de "Solo gratis" y
 * combinable con el texto y con "Solo gratis". Mismo estilo que
 * `solo-gratis-chip.test.ts`: sin testing-library, se prueba
 * `filtrarCombinado` con los mismos filtros que arma el componente (la regla
 * a fondo de `esParaChicos` está en `tests/core/filtros-publico.test.ts`) y
 * se lee el código de `app/buscar/buscar-content.tsx` para confirmar cómo
 * está conectado: apagado por defecto, accesible (aria-pressed, 44px, en un
 * grupo con nombre), contador en una región viva y "Quitar filtros" en el
 * vacío. El test con DOM real es `tests/dom/buscar-chips.dom.test.ts`.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { filtrarCombinado, type FiltrosCombinados } from '@qps/core/home/filtros-combinados'
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

/** Lo que hace `resultadosMostrados` del componente (sin fecha ni categoría). */
function comoBuscar(eventos: DisplayEvent[], filtros: Partial<FiltrosCombinados> = {}): DisplayEvent[] {
  return filtrarCombinado(
    eventos.map((e) => ({ evento: e, paraAtajo: null })),
    { atajo: null, categoria: null, ...filtros },
    new Date('2026-10-10T12:00:00-03:00')
  )
}

describe('buscar-content.tsx: wiring del chip "Para chicos"', () => {
  it('arranca apagado: useState(false)', () => {
    expect(source).toMatch(/paraChicosActivo,\s*setParaChicosActivo\]\s*=\s*useState\(false\)/)
  })

  it('el botón es accesible: aria-pressed enlazado al estado y el mismo estilo (44px) que "Solo gratis"', () => {
    expect(source).toContain('aria-pressed={paraChicosActivo}')
    expect(source).toContain('className={claseChip(paraChicosActivo)}')
    expect(source).toMatch(/>\s*Para chicos\s*</)
  })

  it('los dos chips van en un grupo con nombre que se acomoda en 360px (flex-wrap)', () => {
    expect(source).toMatch(/<div role="group" aria-label="Filtros" className="[^"]*\bflex flex-wrap gap-2\b[^"]*">/)
    const grupo = source.slice(source.indexOf('role="group"'), source.indexOf('</div>', source.indexOf('role="group"')))
    expect(grupo).toContain('Solo gratis')
    expect(grupo).toContain('Para chicos')
  })

  it('una sola llamada a filtrarCombinado con texto diferido, gratis y para chicos (sin fecha ni categoría)', () => {
    expect(source.match(/filtrarCombinado\(/g)).toHaveLength(1)
    expect(source).toMatch(
      /filtrarCombinado\(\s*itemsFiltrables,\s*\{\s*atajo: null,\s*categoria: null,\s*texto: deferredSearchQuery,\s*soloGratis: soloGratisActivo,\s*paraChicos: paraChicosActivo\s*\}/
    )
    expect(source).toMatch(/allDisplayEvents\.map\(\(evento\) => \(\{ evento, paraAtajo: null \}\)\)/)
  })

  it('sin texto: la lista se ve con cualquiera de los dos chips; sin texto ni chips, la grilla de categorías', () => {
    expect(source).toContain('const hayChip = soloGratisActivo || paraChicosActivo')
    expect(source).toContain('const mostrarListaResultados = textoBuscado !== "" || hayChip')
    expect(source).toContain('if (!mostrarListaResultados) return []')
  })

  it('el contador está en una región viva siempre montada (fuera de los condicionales de la lista)', () => {
    expect(source).toMatch(/<p\s+aria-live="polite"[\s\S]*?>\s*\{anuncio\}\s*<\/p>/)
    const antesDelP = source.slice(0, source.indexOf('aria-live="polite"'))
    const ultimaLlave = antesDelP.lastIndexOf('{')
    // Lo último que se abre antes del <p> es el className del <div> que lo
    // envuelve, no un `{cond && (`.
    expect(antesDelP.slice(ultimaLlave)).toMatch(/^\{sinResultados \? "py-16 text-center" : undefined\}/)
  })

  it('los textos del contador y del vacío nombran los chips prendidos', () => {
    expect(source).toContain('`${cantidad} resultado${plural} para "${textoBuscado}"${sufijoChips}`')
    expect(source).toContain('`${cantidad} evento${plural}${queEventos}`')
    expect(source).toContain('`No se encontraron eventos para "${textoBuscado}"${sufijoChips}`')
    expect(source).toContain('`No hay eventos${queEventos} por ahora.`')
    expect(source).toContain('`${soloGratisActivo ? " · gratis" : ""}${paraChicosActivo ? " · para chicos" : ""}`')
    expect(source).toContain('`${soloGratisActivo ? " gratis" : ""}${paraChicosActivo ? " para chicos" : ""}`')
  })

  it('"Quitar filtros" solo en el vacío con un chip prendido: apaga los dos (no el texto) y lleva el foco a "Solo gratis"', () => {
    expect(source).toMatch(/\{sinResultados && hayChip && \(\s*<Button[^>]*onClick=\{quitarFiltros\}[^>]*>\s*Quitar filtros/)
    const cuerpo = source.slice(source.indexOf('const quitarFiltros'), source.indexOf('}', source.indexOf('const quitarFiltros') + 30) + 1)
    expect(cuerpo).toContain('setSoloGratisActivo(false)')
    expect(cuerpo).toContain('setParaChicosActivo(false)')
    expect(cuerpo).toContain('soloGratisRef.current?.focus()')
    expect(cuerpo).not.toContain('setSearchQuery')
    expect(source).toMatch(/ref=\{soloGratisRef\}[\s\S]{0,80}aria-pressed=\{soloGratisActivo\}/)
  })
})

describe('"Para chicos" con filtrarCombinado (lo que muestra /buscar)', () => {
  const infantil = evento({ id: 'infantil', category: 'infantil', categoryName: 'Infantil', title: 'Títeres en la plaza' })
  const conTag = evento({ id: 'con-tag', tags: ['Niños'], title: 'Taller de dibujo', price: 'gratis' })
  const familia = evento({ id: 'familia', tags: ['FAMILIA'], title: 'Feria del libro', price: 1000 })
  const adultos = evento({ id: 'adultos', tags: ['+18'], title: 'Fiesta de dibujo', price: 'gratis' })
  const sinTags = evento({ id: 'sin-tags', title: 'Recital' })
  // Los flyers de Instagram y las películas no traen tags.
  const flyerInfantil = evento({ id: 'ig-1', category: 'infantil', isInstagramFlyer: true, title: 'Payasos' })
  const flyerBoliche = evento({ id: 'ig-2', category: 'boliches', isInstagramFlyer: true, title: 'Noche' })
  const pelicula = evento({ id: 'movie-1', category: 'cine', isCinemaMovie: true, title: 'Película animada' })
  const todos = [infantil, conTag, familia, adultos, sinTags, flyerInfantil, flyerBoliche, pelicula]

  it('prendido, sin texto: categoría infantil o algún tag de chicos, en el orden de entrada', () => {
    expect(comoBuscar(todos, { paraChicos: true, texto: '' })).toEqual([infantil, conTag, familia, flyerInfantil])
  })

  it('los flyers y las películas sin tags pasan solo si son de la categoría infantil', () => {
    const resultado = comoBuscar(todos, { paraChicos: true })
    expect(resultado).toContain(flyerInfantil)
    expect(resultado).not.toContain(flyerBoliche)
    expect(resultado).not.toContain(pelicula)
  })

  it('apagado: no saca nada', () => {
    expect(comoBuscar(todos, { paraChicos: false })).toEqual(todos)
  })

  it('con texto: se aplica sobre los resultados de la búsqueda', () => {
    expect(comoBuscar(todos, { paraChicos: true, texto: 'dibujo' })).toEqual([conTag])
  })

  it('con "Solo gratis": los dos a la vez', () => {
    expect(comoBuscar(todos, { paraChicos: true, soloGratis: true })).toEqual([conTag])
  })

  it('texto + "Solo gratis" + "Para chicos": los tres a la vez', () => {
    expect(comoBuscar(todos, { paraChicos: true, soloGratis: true, texto: 'dibujo' })).toEqual([conTag])
    expect(comoBuscar(todos, { paraChicos: true, soloGratis: true, texto: 'feria' })).toEqual([])
  })
})
