// B2: títulos sin la marca duplicada (auditoría B1: «… - Que pinta Salta |
// Que pinta Salta»). El `title` de cada página va sin marca porque la agrega
// la plantilla del layout; Open Graph y Twitter no pasan por la plantilla y
// la llevan a mano. Más: Open Graph completo en /cines, `noindex` en las
// páginas privadas y la descripción limpia de la ficha y el flyer.
// Sin red ni base.
import { describe, expect, it, vi } from 'vitest'

const getEventById = vi.fn()
vi.mock('@/lib/data', () => ({
  getEventById: (...a: unknown[]) => getEventById(...a),
  getCategories: async () => [],
  getVenues: async () => [],
  getInstagramAccounts: async () => [],
}))
const getFlyerById = vi.fn()
vi.mock('@/lib/instagram/data', () => ({ getFlyerById: (...a: unknown[]) => getFlyerById(...a) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }))
vi.mock('@/lib/actions/radar', () => ({ getRadarSettings: vi.fn(), obtenerSeguimientoDeEvento: vi.fn() }))
vi.mock('@/components/event-detail-page', () => ({ EventDetailPage: () => null }))
vi.mock('@/components/cines-view', () => ({ CinesView: () => null }))
vi.mock('@/components/radar-form', () => ({ RadarForm: () => null }))
vi.mock('@/app/favoritos/favoritos-list', () => ({ FavoritosList: () => null }))
vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))

import type { Metadata } from 'next'
import { generateMetadata as metadataDeFicha } from '@/app/evento/[id]/page'
import { generateMetadata as metadataDeFlyer } from '@/app/flyer/[id]/page'
import { metadata as metadataDeCines } from '@/app/cines/page'
import { metadata as metadataDeRadar } from '@/app/radar/page'
import { metadata as metadataDeBajaRadar } from '@/app/radar/baja/page'
import { metadata as metadataDeFavoritos } from '@/app/favoritos/page'

const ID = '12345678-1234-4234-8234-123456789abc'

/** «Que pinta Salta» / «Qué Pinta Salta», sin importar mayúsculas ni tildes. */
function tieneLaMarca(texto: unknown): boolean {
  return /que pinta salta/.test(
    String(texto)
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
  )
}

const params = { params: Promise.resolve({ id: ID }) }

async function metaFicha(over: Record<string, unknown> = {}): Promise<Metadata> {
  getEventById.mockResolvedValue({
    id: ID,
    title: 'David Robles, Los Aimo e invitada Elisa Villareal',
    short_description: null,
    description: null,
    image_url: null,
    ...over,
  })
  return metadataDeFicha(params as Parameters<typeof metadataDeFicha>[0])
}

async function metaFlyer(caption: string | null): Promise<Metadata> {
  getFlyerById.mockResolvedValue({
    id: ID,
    caption,
    venue_name: 'Casa Grande',
    storage_image_url: null,
    original_image_url: null,
    account: { display_name: 'Casa Grande Salta', default_venue_name: null },
  })
  return metadataDeFlyer(params as Parameters<typeof metadataDeFlyer>[0])
}

describe('tieneLaMarca (el detector de este test)', () => {
  it('reconoce las dos grafías', () => {
    expect(tieneLaMarca('X | Que pinta Salta')).toBe(true)
    expect(tieneLaMarca('X — Qué Pinta Salta')).toBe(true)
    expect(tieneLaMarca('Mis eventos')).toBe(false)
  })
})

describe('ficha /evento/[id]', () => {
  it('title sin la marca; openGraph y twitter con la marca una sola vez', async () => {
    const meta = await metaFicha()
    expect(meta.title).toBe('David Robles, Los Aimo e invitada Elisa Villareal')
    expect(tieneLaMarca(meta.title)).toBe(false)
    expect(meta.openGraph?.title).toBe('David Robles, Los Aimo e invitada Elisa Villareal | Que pinta Salta')
    expect((meta.twitter as { title?: string } | undefined)?.title).toBe(meta.openGraph?.title)
  })

  it('openGraph con siteName y locale (el bloque de la página reemplaza al del layout)', async () => {
    expect((await metaFicha()).openGraph).toMatchObject({ siteName: 'Que pinta Salta', locale: 'es_AR' })
  })

  it('descripción sin emojis ni saltos, y de 160 como mucho', async () => {
    const caption = `🎶🔥 ¡UNA NOCHE CON ARTISTAS IMPERDIBLES EN CASA GRANDE! 🔥🎶\n\n${'Vení a disfrutar. '.repeat(20)}`
    const meta = await metaFicha({ description: caption })
    const d = meta.description!
    expect(d.startsWith('¡UNA NOCHE CON ARTISTAS IMPERDIBLES EN CASA GRANDE! Vení')).toBe(true)
    expect(d).not.toMatch(/\p{Extended_Pictographic}|\n/u)
    expect(d.length).toBeLessThanOrEqual(160)
    expect(d.endsWith('…')).toBe(true)
    expect(meta.openGraph?.description).toBe(d)
  })

  it('prefiere short_description; si queda vacía (solo emojis), usa description', async () => {
    expect((await metaFicha({ short_description: 'Corta', description: 'Larga' })).description).toBe('Corta')
    expect((await metaFicha({ short_description: '🔥🔥', description: 'Larga' })).description).toBe('Larga')
  })

  it('sin texto, el respaldo en voseo', async () => {
    expect((await metaFicha()).description).toBe(
      'Descubrí el evento David Robles, Los Aimo e invitada Elisa Villareal en Salta Capital.'
    )
  })
})

describe('flyer /flyer/[id]', () => {
  it('title sin la marca; openGraph con la marca', async () => {
    const meta = await metaFlyer(null)
    expect(meta.title).toBe('Flyer de Casa Grande')
    expect(tieneLaMarca(meta.title)).toBe(false)
    expect(meta.openGraph?.title).toBe('Flyer de Casa Grande | Que pinta Salta')
    expect(meta.description).toBe('Flyer y novedades de Casa Grande Salta en Salta.')
    expect(meta.openGraph).toMatchObject({ siteName: 'Que pinta Salta', locale: 'es_AR' })
  })

  it('el caption, limpio', async () => {
    const meta = await metaFlyer('🍻 HOY 🍻\nDJ invitado')
    expect(meta.description).toBe('HOY DJ invitado')
  })
})

describe('/cines', () => {
  it('title sin la marca; openGraph y twitter con la marca', () => {
    expect(tieneLaMarca(metadataDeCines.title)).toBe(false)
    expect(tieneLaMarca(metadataDeCines.openGraph?.title)).toBe(true)
    expect(tieneLaMarca((metadataDeCines.twitter as { title?: string }).title)).toBe(true)
  })

  it('openGraph completo: url, imagen por defecto 1200×630, descripción y tipo', () => {
    const og = metadataDeCines.openGraph as Record<string, unknown>
    expect(og.url).toBe('/cines')
    expect(og.type).toBe('website')
    expect(typeof og.description).toBe('string')
    expect(og.images).toEqual([expect.objectContaining({ url: '/og-image.png', width: 1200, height: 630 })])
    expect((metadataDeCines.twitter as { images?: unknown }).images).toEqual(['/og-image.png'])
  })
})

describe('páginas privadas: /radar y /favoritos', () => {
  it.each([
    ['/radar', metadataDeRadar],
    ['/favoritos', metadataDeFavoritos],
  ])('%s: title sin la marca y noindex, follow', (_ruta, meta) => {
    expect(tieneLaMarca(meta.title)).toBe(false)
    expect(meta.robots).toEqual({ index: false, follow: true })
  })

  it('/radar/baja: title sin la marca (ya era noindex)', () => {
    expect(tieneLaMarca(metadataDeBajaRadar.title)).toBe(false)
    expect((metadataDeBajaRadar.robots as { index?: boolean }).index).toBe(false)
  })
})
