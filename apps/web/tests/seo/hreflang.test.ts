/**
 * hreflang de las páginas en los dos idiomas (Q3): `/` ↔ `/en` y `/cines` ↔
 * `/en/cines`. Las páginas en inglés tienen metadata propia (título,
 * descripción, canónica, openGraph en_US con su imagen); las de castellano
 * solo suman `languages` a su `alternates`. Sin red ni base.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/portada/pagina-portada', () => ({ PaginaPortada: () => null }))
vi.mock('@/components/cines/pagina-cines', () => ({ PaginaCines: () => null }))

import { metadata as portadaEn } from '@/app/en/page'
import { metadata as cinesEn, revalidate as revalidateCinesEn } from '@/app/en/cines/page'
import { idiomasAlternos } from '@/lib/i18n/seo'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('idiomasAlternos', () => {
  it('castellano de Argentina, inglés y x-default (el castellano)', () => {
    expect(idiomasAlternos('/')).toEqual({ 'es-AR': '/', en: '/en', 'x-default': '/' })
    expect(idiomasAlternos('/cines')).toEqual({ 'es-AR': '/cines', en: '/en/cines', 'x-default': '/cines' })
  })
})

describe.each([
  ['/en', portadaEn, '/'],
  ['/en/cines', cinesEn, '/cines'],
])('metadata de %s', (ruta, meta, rutaEs) => {
  it('canónica propia y languages hacia las dos versiones', () => {
    expect(meta.alternates?.canonical).toBe(ruta)
    expect(meta.alternates?.languages).toEqual(idiomasAlternos(rutaEs))
  })

  it('título y descripción en inglés (título absoluto, sin el template del layout)', () => {
    expect(meta.title).toEqual({ absolute: expect.stringMatching(/Salta/) })
    expect(String((meta.title as { absolute: string }).absolute)).not.toMatch(/Cartelera|Agenda|Peñas y Boliches/)
    expect(meta.description).toMatch(/\b(the|and|in)\b/)
  })

  it('openGraph en_US, con su url y la imagen (reemplaza entero al del layout)', () => {
    const og = meta.openGraph as Record<string, unknown>
    expect(og.locale).toBe('en_US')
    expect(og.url).toBe(ruta)
    expect(og.images).toEqual([expect.objectContaining({ url: '/og-image.png', width: 1200, height: 630 })])
  })
})

describe('/en/cines repite el revalidate de /cines (Next no lo toma reexportado)', () => {
  it('revalidate = 0 literal en los dos archivos', () => {
    expect(revalidateCinesEn).toBe(0)
    expect(read('app/cines/page.tsx')).toMatch(/export const revalidate = 0\b/)
    expect(read('app/en/cines/page.tsx')).toMatch(/export const revalidate = 0\b/)
  })

  it('la portada no declara revalidate ni dynamic (no hay nada que repetir en /en)', () => {
    expect(read('app/page.tsx')).not.toMatch(/export const (revalidate|dynamic)\b/)
  })
})

describe('las páginas en castellano declaran sus alternos', () => {
  it.each([
    ['app/page.tsx', 'languages: idiomasAlternos("/")'],
    ['app/cines/page.tsx', "languages: idiomasAlternos('/cines')"],
  ])('%s', (archivo, esperado) => {
    expect(read(archivo)).toContain(esperado)
  })
})
