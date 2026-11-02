/**
 * `/buscar`: chip "Solo gratis" (R27, tarea 27-c). Sin testing-library: se
 * prueba la función pura `soloGratis` tal como la usa el componente (la
 * suite a fondo de `soloGratis` ya está en `tests/core/filtros-extra.test.ts`,
 * de la R26) y se lee el código de `app/buscar/buscar-content.tsx` para
 * confirmar cómo está conectado el chip: apagado por defecto, accesible
 * (aria-pressed, 44px de alto) y sin cambiar nada cuando está apagado.
 *
 * Q3 (C2): el chip ya no llama a `soloGratis` desde el componente: va como
 * `soloGratis: soloGratisActivo` a `filtrarCombinado` (junto con el texto y
 * "Para chicos"), que aplica `soloGratis` de `./filtros-extra`. Las pruebas
 * de comportamiento llaman a `filtrarCombinado` con los mismos filtros que
 * arma el componente.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { filtrarCombinado, type FiltrosCombinados } from '@qps/core/home/filtros-combinados'
import type { DisplayEvent } from '@qps/core/home/types'
import { es } from '@/lib/i18n/diccionarios/es'

const SOURCE_PATH = new URL('../../app/buscar/buscar-content.tsx', import.meta.url)
const source = readFileSync(SOURCE_PATH, 'utf8')
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

/** Lo que hace `resultadosMostrados` del componente, sin texto ni "Para chicos". */
function comoBuscar(eventos: DisplayEvent[], filtros: Partial<FiltrosCombinados> = {}): DisplayEvent[] {
  return filtrarCombinado(
    eventos.map((e) => ({ evento: e, paraAtajo: null })),
    { atajo: null, categoria: null, ...filtros },
    new Date('2026-10-10T12:00:00-03:00')
  )
}

describe('buscar-content.tsx: wiring del chip "Solo gratis"', () => {
  it('filtra con filtrarCombinado de @qps/core/home/filtros-combinados, que importa soloGratis de ./filtros-extra', () => {
    expect(source).toContain('import { filtrarCombinado, type ItemFiltrable } from "@qps/core/home/filtros-combinados"')
    expect(combinado).toContain('import { soloGratis } from "./filtros-extra"')
    expect(combinado).toContain('if (filtros.soloGratis) eventos = soloGratis(eventos)')
  })

  it('arranca apagado: useState(false)', () => {
    expect(source).toMatch(/soloGratisActivo,\s*setSoloGratisActivo\]\s*=\s*useState\(false\)/)
  })

  it('el botón es accesible: aria-pressed enlazado al estado, y al menos 44px de alto (h-11)', () => {
    expect(source).toContain('aria-pressed={soloGratisActivo}')
    expect(source).toContain('className={claseChip(soloGratisActivo)}')
    expect(source).toMatch(/function claseChip\(activo: boolean\): string \{\s*return `[^`]*\bh-11\b/)
  })

  it('el texto del chip sigue siendo "Solo gratis" (paridad con la app)', () => {
    // Desde C4 el texto sale del diccionario (en castellano, el mismo de siempre).
    expect(source).toMatch(/>\s*\{t\.soloGratis\}\s*</)
    expect(es.buscar.soloGratis).toBe('Solo gratis')
  })

  it('el wiring es exactamente "soloGratis: soloGratisActivo" dentro de la llamada a filtrarCombinado', () => {
    expect(source).toMatch(/filtrarCombinado\(\s*itemsFiltrables,\s*\{[^}]*\bsoloGratis:\s*soloGratisActivo\b[^}]*\}/)
    // Ya no queda un filtro de gratis propio en el componente.
    expect(source).not.toMatch(/\bsoloGratis\(/)
  })

  it('prendido (soloGratis: true): solo pasan los eventos "gratis"', () => {
    const gratis = evento({ id: 'gratis', price: 'gratis' })
    const pago = evento({ id: 'pago', price: 1500 })
    const confirmar = evento({ id: 'confirmar', price: 'confirmar' })

    expect(comoBuscar([gratis, pago, confirmar], { soloGratis: true })).toEqual([gratis])
  })

  it('apagado (soloGratis: false), sin texto: la lista queda igual, en el mismo orden', () => {
    const gratis = evento({ id: 'gratis', price: 'gratis' })
    const pago = evento({ id: 'pago', price: 1500 })
    const confirmar = evento({ id: 'confirmar', price: 'confirmar' })

    expect(comoBuscar([gratis, pago, confirmar], { soloGratis: false, texto: '' })).toEqual([gratis, pago, confirmar])
  })

  it('con texto, "Solo gratis" se aplica sobre los resultados de la búsqueda', () => {
    const jazzGratis = evento({ id: 'jazz-gratis', title: 'Jazz en la plaza', price: 'gratis' })
    const jazzPago = evento({ id: 'jazz-pago', title: 'Jazz en el teatro', price: 1500 })
    const rockGratis = evento({ id: 'rock-gratis', title: 'Rock en la plaza', price: 'gratis' })

    expect(comoBuscar([jazzGratis, jazzPago, rockGratis], { soloGratis: true, texto: 'jazz' })).toEqual([jazzGratis])
  })
})
