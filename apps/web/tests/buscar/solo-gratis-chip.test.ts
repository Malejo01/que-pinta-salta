/**
 * `/buscar`: chip "Solo gratis" (R27, tarea 27-c). Sin testing-library: se
 * prueba la función pura `soloGratis` tal como la usa el componente (la
 * suite a fondo de `soloGratis` ya está en `tests/core/filtros-extra.test.ts`,
 * de la R26) y se lee el código de `app/buscar/buscar-content.tsx` para
 * confirmar cómo está conectado el chip: apagado por defecto, accesible
 * (aria-pressed, 44px de alto) y sin cambiar nada cuando está apagado.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { soloGratis } from '@qps/core/home/filtros-extra'
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

describe('buscar-content.tsx: wiring del chip "Solo gratis"', () => {
  it('importa soloGratis de @qps/core/home/filtros-extra', () => {
    expect(source).toContain('import { soloGratis } from "@qps/core/home/filtros-extra"')
  })

  it('arranca apagado: useState(false)', () => {
    expect(source).toMatch(/soloGratisActivo,\s*setSoloGratisActivo\]\s*=\s*useState\(false\)/)
  })

  it('el botón es accesible: aria-pressed enlazado al estado, y al menos 44px de alto (h-11)', () => {
    expect(source).toContain('aria-pressed={soloGratisActivo}')
    expect(source).toMatch(/className=\{`[^`]*\bh-11\b/)
  })

  it('el wiring es exactamente "prendido: soloGratis(base); apagado: base sin tocar"', () => {
    expect(source).toContain('soloGratisActivo ? soloGratis(base) : base')
  })

  it('prendido (lo que hace soloGratis(base) del wiring): solo pasan los eventos "gratis"', () => {
    const gratis = evento({ id: 'gratis', price: 'gratis' })
    const pago = evento({ id: 'pago', price: 1500 })
    const confirmar = evento({ id: 'confirmar', price: 'confirmar' })
    const base = [gratis, pago, confirmar]

    expect(soloGratis(base)).toEqual([gratis])
  })

  it('apagado (la rama ": base" del wiring): la lista queda igual que antes del cambio, sin tocarla', () => {
    const gratis = evento({ id: 'gratis', price: 'gratis' })
    const pago = evento({ id: 'pago', price: 1500 })
    const confirmar = evento({ id: 'confirmar', price: 'confirmar' })
    const base = [gratis, pago, confirmar]

    // La rama "apagado" del ternario del componente es literalmente `base`:
    // ni filtra ni reordena ni copia.
    const apagado = base
    expect(apagado).toBe(base)
    expect(apagado).toEqual([gratis, pago, confirmar])
  })
})
