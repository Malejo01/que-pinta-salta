/**
 * hreflang de las páginas en los dos idiomas (Q3): `/` ↔ `/en`, `/cines` ↔
 * `/en/cines` y `/evento/<id>` ↔ `/en/evento/<id>`. Las páginas en inglés tienen metadata propia (título,
 * descripción, canónica, openGraph en_US con su imagen); las de castellano
 * solo suman `languages` a su `alternates`. Sin red ni base.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/portada/pagina-portada', () => ({ PaginaPortada: () => null }))
vi.mock('@/components/cines/pagina-cines', () => ({ PaginaCines: () => null }))
vi.mock('@/components/event-detail-page', () => ({ EventDetailPage: () => null }))

const { eventos } = vi.hoisted(() => ({ eventos: new Map<string, Record<string, unknown>>() }))
vi.mock('@/lib/data', () => ({
  getEventById: async (id: string) => eventos.get(id) ?? null,
  getCategories: async () => [],
}))

import { metadata as portadaEn } from '@/app/en/page'
import { metadata as cinesEn, revalidate as revalidateCinesEn } from '@/app/en/cines/page'
import { generateMetadata as fichaEn } from '@/app/en/evento/[id]/page'
import { generateMetadata as fichaEs } from '@/app/evento/[id]/page'
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

describe('la ficha del evento: /evento/<id> ↔ /en/evento/<id>', () => {
  const ID = '12345678-1234-4234-8234-123456789012'
  const params = Promise.resolve({ id: ID })
  eventos.set(ID, {
    id: ID,
    title: 'Peña de Prueba',
    short_description: 'Una peña inventada para el test.',
    description: null,
    image_url: 'https://ejemplo.invalid/flyer.jpg',
  })

  it('idiomasAlternos de la ficha', () => {
    expect(idiomasAlternos(`/evento/${ID}`)).toEqual({
      'es-AR': `/evento/${ID}`,
      en: `/en/evento/${ID}`,
      'x-default': `/evento/${ID}`,
    })
  })

  it('/en/evento: canónica propia, languages y openGraph en_US con la imagen del evento', async () => {
    const meta = await fichaEn({ params })
    expect(meta.alternates?.canonical).toBe(`/en/evento/${ID}`)
    expect(meta.alternates?.languages).toEqual(idiomasAlternos(`/evento/${ID}`))
    const og = meta.openGraph as Record<string, unknown>
    expect(og.locale).toBe('en_US')
    expect(og.url).toBe(`https://www.quepintasalta.com.ar/en/evento/${ID}`)
    expect(og.images).toEqual([{ url: 'https://ejemplo.invalid/flyer.jpg', alt: 'Peña de Prueba' }])
  })

  it('el título y la descripción son los del evento, igual que en castellano (y la misma imagen)', async () => {
    const [en, es] = await Promise.all([fichaEn({ params }), fichaEs({ params })])
    expect(en.title).toBe(es.title)
    expect(en.description).toBe(es.description)
    expect((en.openGraph as Record<string, unknown>).images).toEqual((es.openGraph as Record<string, unknown>).images)
    expect(en.twitter).toEqual(es.twitter)
  })

  it('/evento: la canónica de siempre y languages hacia las dos versiones', async () => {
    const meta = await fichaEs({ params })
    expect(meta.alternates?.canonical).toBe(`/evento/${ID}`)
    expect(meta.alternates?.languages).toEqual(idiomasAlternos(`/evento/${ID}`))
    expect(read('app/evento/[id]/page.tsx')).toContain('languages: idiomasAlternos(`/evento/${id}`)')
  })

  it('evento inexistente: título en inglés en /en, sin canónica', async () => {
    const meta = await fichaEn({ params: Promise.resolve({ id: 'no-existe' }) })
    expect(meta).toEqual({ title: 'Event not found' })
  })

  it('la ficha en castellano no declara revalidate, dynamic ni generateStaticParams (nada que repetir en /en)', () => {
    for (const archivo of ['app/evento/[id]/page.tsx', 'app/en/evento/[id]/page.tsx']) {
      expect(read(archivo)).not.toMatch(/export (const (revalidate|dynamic)|(async )?function generateStaticParams)\b/)
    }
  })
})
