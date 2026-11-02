/**
 * hreflang y metadata de /mapa ↔ /en/mapa y /buscar ↔ /en/buscar (78-a). Las
 * páginas en inglés tienen metadata propia (título absoluto en inglés,
 * canónica /en…, openGraph en_US con su imagen); las de castellano conservan
 * su título y descripción de siempre y suman `languages`. Sin red ni base.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/mapa/pagina-mapa', () => ({ PaginaMapa: () => null }))
vi.mock('@/components/buscar/pagina-buscar', () => ({ PaginaBuscar: () => null }))

import { metadata as mapaEn } from '@/app/en/mapa/page'
import { metadata as buscarEn } from '@/app/en/buscar/page'
import { metadata as mapaEs } from '@/app/mapa/page'
import { metadata as buscarEs } from '@/app/buscar/page'
import { idiomasAlternos } from '@/lib/i18n/seo'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe.each([
  ['/en/mapa', mapaEn, '/mapa'],
  ['/en/buscar', buscarEn, '/buscar'],
])('metadata de %s', (ruta, meta, rutaEs) => {
  it('canónica propia y languages hacia las dos versiones (es-AR, en y x-default al castellano)', () => {
    expect(meta.alternates?.canonical).toBe(ruta)
    expect(meta.alternates?.languages).toEqual(idiomasAlternos(rutaEs))
    expect(meta.alternates?.languages).toEqual({ 'es-AR': rutaEs, en: ruta, 'x-default': rutaEs })
  })

  it('título absoluto en inglés (sin el template del layout) y descripción en inglés', () => {
    expect(meta.title).toEqual({ absolute: expect.stringMatching(/Salta/) })
    const titulo = String((meta.title as { absolute: string }).absolute)
    expect(titulo).toMatch(/Events|Search/)
    expect(titulo).not.toMatch(/Mapa de eventos|Buscar Eventos/)
    expect(meta.description).toMatch(/\b(the|and|in)\b/)
    expect(meta.description).not.toMatch(/Mirá|Buscá|Encontrá/)
  })

  it('openGraph en_US con su url y la imagen (reemplaza entero al del layout)', () => {
    const og = meta.openGraph as Record<string, unknown>
    expect(og.locale).toBe('en_US')
    expect(og.url).toBe(ruta)
    expect(og.images).toEqual([expect.objectContaining({ url: '/og-image.png', width: 1200, height: 630 })])
    expect(String(og.description)).not.toMatch(/Mirá|Buscá/)
  })

  it('twitter en inglés con su imagen', () => {
    const tw = meta.twitter as Record<string, unknown>
    expect(tw.title).toBe((meta.title as { absolute: string }).absolute)
    expect(tw.images).toEqual(['/og-image.png'])
  })
})

describe('las páginas en castellano conservan su metadata de antes y suman languages', () => {
  it('/mapa', () => {
    expect(mapaEs.title).toBe('Mapa de eventos en Salta')
    expect(mapaEs.description).toBe(
      'Mirá en el mapa dónde pasan los eventos de Salta Capital: peñas, recitales, boliches, ferias y más, hoy, este finde o el día que elijas.',
    )
    expect(mapaEs.alternates?.canonical).toBe('/mapa')
    expect(mapaEs.alternates?.languages).toEqual(idiomasAlternos('/mapa'))
    const og = mapaEs.openGraph as Record<string, unknown>
    expect(og.title).toBe('Mapa de eventos en Salta | Qué Pinta Salta')
    expect(og.url).toBe('https://www.quepintasalta.com.ar/mapa')
    expect(og).not.toHaveProperty('locale')
  })

  it('/buscar', () => {
    expect(buscarEs.title).toBe('Buscar Eventos en Salta Capital')
    expect(buscarEs.description).toBe(
      'Buscá peñas, recitales, boliches, ferias, talleres y teatro en Salta Capital. Encontrá qué hacer hoy en la ciudad.',
    )
    expect(buscarEs.alternates?.canonical).toBe('/buscar')
    expect(buscarEs.alternates?.languages).toEqual(idiomasAlternos('/buscar'))
    const og = buscarEs.openGraph as Record<string, unknown>
    expect(og.title).toBe('Buscar Eventos en Salta Capital | Qué Pinta Salta')
    expect(og.url).toBe('https://www.quepintasalta.com.ar/buscar')
    expect(og).not.toHaveProperty('locale')
  })

  it.each([
    ['app/mapa/page.tsx', 'languages: idiomasAlternos("/mapa")'],
    ['app/buscar/page.tsx', 'languages: idiomasAlternos("/buscar")'],
    ['app/en/mapa/page.tsx', 'languages: idiomasAlternos("/mapa")'],
    ['app/en/buscar/page.tsx', 'languages: idiomasAlternos("/buscar")'],
  ])('%s declara sus alternos', (archivo, esperado) => {
    expect(read(archivo)).toContain(esperado)
  })
})

describe('las páginas pasan el idioma al cuerpo compartido', () => {
  it('castellano e inglés usan el mismo componente con su idioma', () => {
    expect(read('app/mapa/page.tsx')).toMatch(/PaginaMapa\(\{ searchParams, idioma: "es" \}\)/)
    expect(read('app/en/mapa/page.tsx')).toMatch(/PaginaMapa\(\{ searchParams, idioma: "en" \}\)/)
    expect(read('app/buscar/page.tsx')).toMatch(/<PaginaBuscar idioma="es" \/>/)
    expect(read('app/en/buscar/page.tsx')).toMatch(/<PaginaBuscar idioma="en" \/>/)
  })
})
