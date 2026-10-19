/**
 * `packages/core/src/favoritos/armar.ts` (R29, 29-a: F13). La usan
 * `apps/web/app/favoritos/page.tsx` y `apps/mobile/lib/favoritos.ts`: este
 * archivo prueba la función pura con fixtures inventadas (sin red ni base,
 * ningún id ni nombre real), y un detector de que las dos apps importan la
 * misma función de `@qps/core` en vez de reimplementarla cada una por su
 * lado (la "equivalencia web = app" depende de eso).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { armarFavoritos, idsDeFavoritos, type EventoFavorito } from '@qps/core/favoritos/armar'
import type { Category, CinemaMovie, Venue } from '@/lib/types'
import type { FlyerWithAccount, InstagramAccount } from '@/lib/instagram-config'
import { saltaWallClockToDate } from '@/lib/date-format'

const salta = (wallClock: string) => saltaWallClockToDate(wallClock)

// apps/web/tests/core -> apps/web/tests -> apps/web -> apps
const APPS_DIR = fileURLToPath(new URL('../../../', import.meta.url))

function makeCategory(slug: string, name: string): Category {
  return { id: `cat-${slug}`, slug, name, color: null, icon: null, created_at: null }
}

function makeVenue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: overrides.id ?? 'venue-de-prueba',
    name: overrides.name ?? 'Venue de Prueba',
    address: overrides.address ?? 'Avenida de Prueba 123',
    canonical_venue_id: overrides.canonical_venue_id ?? null,
    capacity: overrides.capacity ?? null,
    created_at: overrides.created_at ?? null,
    geocode_source: overrides.geocode_source ?? null,
    geocoded_at: overrides.geocoded_at ?? null,
    google_maps_url: overrides.google_maps_url ?? null,
    is_placeholder: overrides.is_placeholder ?? false,
    latitude: overrides.latitude ?? null,
    longitude: overrides.longitude ?? null,
    merged_at: overrides.merged_at ?? null,
    phone: overrides.phone ?? null,
    slug: overrides.slug ?? null,
    updated_at: overrides.updated_at ?? '2026-01-01T00:00:00Z',
  }
}

// Overrides propio (no `Partial<EventoFavorito>`): por cómo TS calcula la
// intersección de `Event` (con `category?: Category`, opcional pero sin
// `null`) con `{ category: Category | null }`, el tipo de la propiedad
// compartida termina siendo solo `Category` — mismo caso que `venue` en
// `apps/web/tests/home/transform.test.ts`. El valor final se fuerza con
// `as unknown as EventoFavorito`.
interface EventoFavoritoOverrides {
  id: string
  start_date: string
  status?: string
  category?: Category | null
  venue?: Venue | null
}

function makeEvento(overrides: EventoFavoritoOverrides): EventoFavorito {
  const venue = overrides.venue !== undefined ? overrides.venue : makeVenue()
  const categoria = overrides.category !== undefined ? overrides.category : makeCategory('teatro', 'Teatro')
  const evento = {
    id: overrides.id,
    title: `Evento de prueba ${overrides.id}`,
    slug: `evento-de-prueba-${overrides.id}`,
    description: null,
    short_description: null,
    category_id: categoria ? categoria.id : null,
    venue_id: venue?.id ?? null,
    image_url: null,
    gallery_urls: [],
    start_date: overrides.start_date,
    end_date: null,
    is_recurring: false,
    recurrence_rule: null,
    price_min: 0,
    price_max: null,
    is_free: false,
    ticket_url: null,
    age_restriction: 0,
    tags: [],
    status: overrides.status ?? 'PUBLISHED',
    is_featured: false,
    view_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    category: categoria,
    venue,
  }
  return evento as unknown as EventoFavorito
}

function makeAccount(overrides: Partial<InstagramAccount> = {}): InstagramAccount {
  return {
    id: overrides.id ?? 'acc-de-prueba',
    username: overrides.username ?? 'cuenta_de_prueba',
    display_name: overrides.display_name ?? 'Cuenta de Prueba',
    profile_pic_url: overrides.profile_pic_url ?? null,
    instagram_url: overrides.instagram_url ?? 'https://instagram.com/cuenta_de_prueba',
    is_active: overrides.is_active ?? true,
    notes: overrides.notes ?? null,
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-01-01T00:00:00Z',
    default_venue_name: overrides.default_venue_name ?? null,
    default_maps_url: overrides.default_maps_url ?? null,
    default_category: overrides.default_category ?? 'boliches',
  }
}

function makeFlyer(overrides: Partial<FlyerWithAccount> = {}): FlyerWithAccount {
  return {
    id: overrides.id ?? 'flyer-de-prueba',
    account_id: overrides.account_id ?? 'acc-de-prueba',
    ig_post_id: overrides.ig_post_id ?? 'post-de-prueba',
    ig_post_url: overrides.ig_post_url ?? 'https://instagram.com/p/post-de-prueba',
    ig_post_type: overrides.ig_post_type ?? 'IMAGE',
    caption: overrides.caption ?? 'Caption de prueba',
    published_at: overrides.published_at ?? '2030-10-01T21:00:00-03:00',
    original_image_url: overrides.original_image_url ?? null,
    storage_image_path: overrides.storage_image_path ?? null,
    storage_image_url: overrides.storage_image_url ?? null,
    status: overrides.status ?? 'ACTIVE',
    fetched_at: overrides.fetched_at ?? '2030-10-01T21:05:00Z',
    archived_at: overrides.archived_at ?? null,
    created_at: overrides.created_at ?? '2030-10-01T21:05:00Z',
    venue_name: overrides.venue_name ?? null,
    maps_url: overrides.maps_url ?? null,
    category: overrides.category ?? 'boliches',
    price_min: overrides.price_min ?? 0,
    is_free: overrides.is_free ?? false,
    account: overrides.account ?? makeAccount(),
  }
}

function makeMovie(overrides: Partial<CinemaMovie> = {}): CinemaMovie {
  return {
    id: overrides.id ?? 'movie-de-prueba',
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
    is_currently_showing: overrides.is_currently_showing ?? true,
    poster_url: overrides.poster_url ?? null,
    slug: overrides.slug ?? 'pelicula-de-prueba',
    title: overrides.title ?? 'Película de Prueba',
    updated_at: overrides.updated_at ?? '2026-01-01T00:00:00Z',
    showings: overrides.showings ?? {
      'cine-de-prueba': { name: 'Cine de Prueba', booking_url: 'https://cine-de-prueba.test', formats: [{ type: '2D', times: ['20:00'] }] },
    },
  }
}

const AHORA = salta('2030-10-10T15:00:00')

describe('idsDeFavoritos', () => {
  it('separa event_id/instagram_flyer_id/cinema_movie_id, sin repetidos y sin los null', () => {
    const resultado = idsDeFavoritos([
      { event_id: 'e1', instagram_flyer_id: null, cinema_movie_id: null },
      { event_id: 'e1', instagram_flyer_id: null, cinema_movie_id: null },
      { event_id: null, instagram_flyer_id: 'f1', cinema_movie_id: null },
      { event_id: null, instagram_flyer_id: null, cinema_movie_id: 'm1' },
    ])
    expect(resultado).toEqual({ eventIds: ['e1'], flyerIds: ['f1'], movieIds: ['m1'] })
  })
})

describe('armarFavoritos: eventos (regla de /favoritos)', () => {
  it('evento sin categoría: no se descarta, "Sin categorizar" (causa real de F13: "Odisea")', () => {
    const evento = makeEvento({ id: 'e1', start_date: salta('2030-10-11T21:00:00').toISOString(), category: null })
    const { porDia } = armarFavoritos({ eventos: [evento], flyers: [], peliculas: [] }, AHORA)
    expect(porDia[0].items[0].categoryName).toBe('Sin categorizar')
    expect(porDia[0].items[0].category).toBe('uncategorized')
  })

  it('evento con categoría: igual que transformEvent, sin cambios', () => {
    const categoria = makeCategory('cine', 'Cine')
    const evento = makeEvento({ id: 'e1', start_date: salta('2030-10-11T21:00:00').toISOString(), category: categoria })
    const { porDia } = armarFavoritos({ eventos: [evento], flyers: [], peliculas: [] }, AHORA)
    expect(porDia[0].items[0].category).toBe('cine')
    expect(porDia[0].items[0].categoryName).toBe('Cine')
  })

  it('evento vencido: se descarta', () => {
    const evento = makeEvento({ id: 'e1', start_date: salta('2030-01-01T21:00:00').toISOString() })
    const { porDia } = armarFavoritos({ eventos: [evento], flyers: [], peliculas: [] }, AHORA)
    expect(porDia).toEqual([])
  })

  it('evento no PUBLISHED: se descarta aunque esté vigente', () => {
    const evento = makeEvento({ id: 'e1', start_date: salta('2030-10-11T21:00:00').toISOString(), status: 'DRAFT' })
    const { porDia } = armarFavoritos({ eventos: [evento], flyers: [], peliculas: [] }, AHORA)
    expect(porDia).toEqual([])
  })

  it('agrupa por día, orden cronológico de los días', () => {
    const lejos = makeEvento({ id: 'e-lejos', start_date: salta('2030-10-20T21:00:00').toISOString() })
    const cerca = makeEvento({ id: 'e-cerca', start_date: salta('2030-10-12T21:00:00').toISOString() })
    const { porDia } = armarFavoritos({ eventos: [lejos, cerca], flyers: [], peliculas: [] }, AHORA)
    expect(porDia.map((g) => g.dia)).toEqual(['2030-10-12', '2030-10-20'])
  })
})

describe('armarFavoritos: flyers y películas van a "flexibles"', () => {
  it('flyer ACTIVE: entra, con transformFlyer', () => {
    const flyer = makeFlyer({ id: 'f1', category: 'boliches' })
    const { flexibles } = armarFavoritos(
      { eventos: [], flyers: [flyer], peliculas: [], categoryNameBySlug: new Map([['boliches', 'Boliches']]) },
      AHORA,
    )
    expect(flexibles.map((f) => f.id)).toEqual(['ig-f1'])
    expect(flexibles[0].categoryName).toBe('Boliches')
  })

  it('flyer ARCHIVED: se descarta', () => {
    const flyer = makeFlyer({ id: 'f1', status: 'ARCHIVED' })
    const { flexibles } = armarFavoritos({ eventos: [], flyers: [flyer], peliculas: [] }, AHORA)
    expect(flexibles).toEqual([])
  })

  it('película en cartel: entra, se proyecta "hoy"', () => {
    const movie = makeMovie({ id: 'm1', is_currently_showing: true })
    const { flexibles } = armarFavoritos({ eventos: [], flyers: [], peliculas: [movie] }, AHORA)
    expect(flexibles.map((f) => f.id)).toEqual(['movie-m1'])
    expect(flexibles[0].date).toBe('2030-10-10')
  })

  it('película que ya no está en cartel: se descarta', () => {
    const movie = makeMovie({ id: 'm1', is_currently_showing: false })
    const { flexibles } = armarFavoritos({ eventos: [], flyers: [], peliculas: [movie] }, AHORA)
    expect(flexibles).toEqual([])
  })
})

describe('armarFavoritos: caso combinado', () => {
  it('eventos, flyers y películas juntos: cada uno en su grupo, nada se pierde', () => {
    const evento = makeEvento({ id: 'e1', start_date: salta('2030-10-12T21:00:00').toISOString() })
    const flyer = makeFlyer({ id: 'f1' })
    const movie = makeMovie({ id: 'm1' })
    const { flexibles, porDia } = armarFavoritos({ eventos: [evento], flyers: [flyer], peliculas: [movie] }, AHORA)
    expect(porDia.flatMap((g) => g.items).map((i) => i.id)).toEqual(['e1'])
    expect(flexibles.map((i) => i.id).sort()).toEqual(['ig-f1', 'movie-m1'])
  })
})

// ---------------------------------------------------------------------------
// Sin copias: la web y la app importan la misma función de core, no una
// reimplementación propia por su lado.
// ---------------------------------------------------------------------------
describe('sin copias: web y app usan @qps/core/favoritos/armar, no una reimplementación', () => {
  const importDesdeCore = /from\s*['"]@qps\/core\/favoritos\/armar['"]/

  it('apps/web/app/favoritos/page.tsx importa armarFavoritos/idsDeFavoritos de @qps/core/favoritos/armar', () => {
    const src = readFileSync(`${APPS_DIR}/web/app/favoritos/page.tsx`, 'utf8')
    expect(src).toMatch(importDesdeCore)
    expect(src).toMatch(/\barmarFavoritos\s*\(/)
  })

  it('apps/mobile/lib/favoritos.ts importa armarFavoritos/idsDeFavoritos de @qps/core/favoritos/armar', () => {
    const src = readFileSync(`${APPS_DIR}/mobile/lib/favoritos.ts`, 'utf8')
    expect(src).toMatch(importDesdeCore)
    expect(src).toMatch(/\barmarFavoritos\s*\(/)
  })
})
