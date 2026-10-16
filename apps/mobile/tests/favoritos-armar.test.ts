// R29, tarea 29-a (F13): `packages/core/src/favoritos/armar.ts`. La usan la
// web (`apps/web/app/favoritos/page.tsx`) y la app (`apps/mobile/lib/favoritos.ts`):
// este archivo prueba la función pura con fixtures inventadas (sin red ni
// base, ningún id ni nombre real) y un detector de que la pantalla de
// Favoritos de la app vuelve a leer con `useFocusEffect` (no con un
// `useEffect` de una sola vez al montar — causa de que "Sushi Libre" no
// apareciera hasta recargar la app entera).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { armarFavoritos, idsDeFavoritos, type EventoFavorito } from '@qps/core/favoritos/armar'
import type { Category, CinemaMovie, Venue } from '@qps/core/types'
import type { FlyerWithAccount, InstagramAccount } from '@qps/core/instagram-config'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))

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

// Tipo de overrides propio (no `Partial<EventoFavorito>`): por cómo TS
// calcula la intersección de `Event` (con `category?: Category`, opcional
// pero sin `null`) con `{ category: Category | null }`, el tipo de la
// propiedad compartida termina siendo solo `Category` (pierde el `| null`
// que sí existe en runtime) — mismo caso que `venue` en
// `apps/web/tests/home/transform.test.ts`. Por eso `category` se tipa acá a
// mano, y el valor final se fuerza con `as unknown as EventoFavorito`.
interface EventoFavoritoOverrides {
  id: string
  start_date: string
  title?: string
  slug?: string
  description?: string | null
  short_description?: string | null
  category_id?: string | null
  venue?: Venue | null
  image_url?: string | null
  gallery_urls?: string[]
  end_date?: string | null
  is_recurring?: boolean
  recurrence_rule?: string | null
  price_min?: number
  price_max?: number | null
  is_free?: boolean
  ticket_url?: string | null
  age_restriction?: number
  tags?: string[]
  status?: string
  is_featured?: boolean
  view_count?: number
  created_at?: string
  updated_at?: string
  category?: Category | null
}

function makeEvento(overrides: EventoFavoritoOverrides): EventoFavorito {
  const venue = overrides.venue !== undefined ? overrides.venue : makeVenue()
  const categoria = overrides.category !== undefined ? overrides.category : makeCategory('teatro', 'Teatro')
  const evento = {
    id: overrides.id,
    title: overrides.title ?? `Evento de prueba ${overrides.id}`,
    slug: overrides.slug ?? `evento-de-prueba-${overrides.id}`,
    description: overrides.description ?? null,
    short_description: overrides.short_description ?? null,
    category_id: overrides.category_id ?? (categoria ? categoria.id : null),
    venue_id: venue?.id ?? null,
    image_url: overrides.image_url ?? null,
    gallery_urls: overrides.gallery_urls ?? [],
    start_date: overrides.start_date,
    end_date: overrides.end_date ?? null,
    is_recurring: overrides.is_recurring ?? false,
    recurrence_rule: overrides.recurrence_rule ?? null,
    price_min: overrides.price_min ?? 0,
    price_max: overrides.price_max ?? null,
    is_free: overrides.is_free ?? false,
    ticket_url: overrides.ticket_url ?? null,
    age_restriction: overrides.age_restriction ?? 0,
    tags: overrides.tags ?? [],
    status: overrides.status ?? 'PUBLISHED',
    is_featured: overrides.is_featured ?? false,
    view_count: overrides.view_count ?? 0,
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-01-01T00:00:00Z',
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

const AHORA = new Date('2030-10-10T15:00:00-03:00')

describe('idsDeFavoritos', () => {
  it('separa los tres tipos de id, sin repetidos y sin los null', () => {
    const resultado = idsDeFavoritos([
      { event_id: 'e1', instagram_flyer_id: null, cinema_movie_id: null },
      { event_id: 'e1', instagram_flyer_id: null, cinema_movie_id: null }, // repetido
      { event_id: null, instagram_flyer_id: 'f1', cinema_movie_id: null },
      { event_id: null, instagram_flyer_id: null, cinema_movie_id: 'm1' },
      { event_id: null, instagram_flyer_id: null, cinema_movie_id: null },
    ])
    expect(resultado).toEqual({ eventIds: ['e1'], flyerIds: ['f1'], movieIds: ['m1'] })
  })

  it('sin filas: los tres arrays vacíos', () => {
    expect(idsDeFavoritos([])).toEqual({ eventIds: [], flyerIds: [], movieIds: [] })
  })

  it('descarta valores que no son string (dato corrupto), sin explotar', () => {
    const filas = [{ event_id: 123 as unknown as string, instagram_flyer_id: null, cinema_movie_id: null }]
    expect(idsDeFavoritos(filas)).toEqual({ eventIds: [], flyerIds: [], movieIds: [] })
  })
})

describe('armarFavoritos: eventos', () => {
  it('evento PUBLISHED y vigente, con categoría: el mismo resultado que transformEvent (nada cambia para los eventos con categoría)', () => {
    const categoria = makeCategory('teatro', 'Teatro')
    const evento = makeEvento({ id: 'e1', start_date: '2030-10-11T21:00:00-03:00', category: categoria })
    const { porDia } = armarFavoritos({ eventos: [evento], flyers: [], peliculas: [] }, AHORA)
    expect(porDia).toHaveLength(1)
    expect(porDia[0].items[0].category).toBe('teatro')
    expect(porDia[0].items[0].categoryName).toBe('Teatro')
  })

  it('evento sin categoría: no se descarta, aparece como "Sin categorizar" (causa de F13: "Odisea")', () => {
    const evento = makeEvento({ id: 'e1', start_date: '2030-10-11T21:00:00-03:00', category: null })
    const { porDia } = armarFavoritos({ eventos: [evento], flyers: [], peliculas: [] }, AHORA)
    expect(porDia).toHaveLength(1)
    expect(porDia[0].items[0].category).toBe('uncategorized')
    expect(porDia[0].items[0].categoryName).toBe('Sin categorizar')
  })

  it('evento no vigente (venció): se descarta', () => {
    const evento = makeEvento({ id: 'e1', start_date: '2030-01-01T21:00:00-03:00' })
    const { porDia, flexibles } = armarFavoritos({ eventos: [evento], flyers: [], peliculas: [] }, AHORA)
    expect(porDia).toEqual([])
    expect(flexibles).toEqual([])
  })

  it('evento con status distinto de PUBLISHED: se descarta aunque esté vigente', () => {
    const evento = makeEvento({ id: 'e1', start_date: '2030-10-11T21:00:00-03:00', status: 'DRAFT' })
    const { porDia } = armarFavoritos({ eventos: [evento], flyers: [], peliculas: [] }, AHORA)
    expect(porDia).toEqual([])
  })

  it('agrupa por día y ordena los días cronológicamente', () => {
    const masTarde = makeEvento({ id: 'e-mas-tarde', start_date: '2030-10-20T21:00:00-03:00' })
    const masCerca = makeEvento({ id: 'e-mas-cerca', start_date: '2030-10-12T21:00:00-03:00' })
    const { porDia } = armarFavoritos({ eventos: [masTarde, masCerca], flyers: [], peliculas: [] }, AHORA)
    expect(porDia.map((g) => g.dia)).toEqual(['2030-10-12', '2030-10-20'])
  })

  it('dentro de un mismo día, ordena por startDateTime y después por id (orden estable, no depende del orden de llegada)', () => {
    const tarde = makeEvento({ id: 'z-evento-tarde', start_date: '2030-10-12T22:00:00-03:00' })
    const temprano = makeEvento({ id: 'a-evento-temprano', start_date: '2030-10-12T19:00:00-03:00' })
    // A propósito en orden inverso: el resultado tiene que ordenar igual.
    const { porDia } = armarFavoritos({ eventos: [tarde, temprano], flyers: [], peliculas: [] }, AHORA)
    expect(porDia[0].items.map((i) => i.id)).toEqual(['a-evento-temprano', 'z-evento-tarde'])
  })
})

describe('armarFavoritos: flyers de Instagram', () => {
  it('un flyer ACTIVE va a "flexibles", con transformFlyer (categoryName del mapa)', () => {
    const flyer = makeFlyer({ id: 'f1', category: 'boliches' })
    const { flexibles } = armarFavoritos(
      { eventos: [], flyers: [flyer], peliculas: [], categoryNameBySlug: new Map([['boliches', 'Boliches']]) },
      AHORA,
    )
    expect(flexibles).toHaveLength(1)
    expect(flexibles[0].id).toBe('ig-f1')
    expect(flexibles[0].categoryName).toBe('Boliches')
    expect(flexibles[0].isInstagramFlyer).toBe(true)
  })

  it('un flyer ARCHIVED (no ACTIVE) se descarta', () => {
    const flyer = makeFlyer({ id: 'f1', status: 'ARCHIVED' })
    const { flexibles } = armarFavoritos({ eventos: [], flyers: [flyer], peliculas: [] }, AHORA)
    expect(flexibles).toEqual([])
  })

  it('sin categoryNameBySlug: no explota, cae al slug (mismo comportamiento que transformFlyer)', () => {
    const flyer = makeFlyer({ id: 'f1', category: 'boliches' })
    const { flexibles } = armarFavoritos({ eventos: [], flyers: [flyer], peliculas: [] }, AHORA)
    expect(flexibles[0].categoryName).toBe('boliches')
  })
})

describe('armarFavoritos: películas', () => {
  it('una película en cartel (is_currently_showing) va a "flexibles"', () => {
    const movie = makeMovie({ id: 'm1', is_currently_showing: true })
    const { flexibles } = armarFavoritos({ eventos: [], flyers: [], peliculas: [movie] }, AHORA)
    expect(flexibles).toHaveLength(1)
    expect(flexibles[0].id).toBe('movie-m1')
    expect(flexibles[0].isCinemaMovie).toBe(true)
  })

  it('una película que ya no está en cartel se descarta', () => {
    const movie = makeMovie({ id: 'm1', is_currently_showing: false })
    const { flexibles } = armarFavoritos({ eventos: [], flyers: [], peliculas: [movie] }, AHORA)
    expect(flexibles).toEqual([])
  })

  it('la fecha de la película se proyecta "hoy" (en Salta, según `ahora`)', () => {
    const movie = makeMovie({ id: 'm1' })
    const { flexibles } = armarFavoritos({ eventos: [], flyers: [], peliculas: [movie] }, AHORA)
    expect(flexibles[0].date).toBe('2030-10-10')
  })
})

describe('armarFavoritos: "flexibles" junta flyers y películas, con el mismo orden estable', () => {
  it('ordena flyers y películas mezclados por fecha, startDateTime e id', () => {
    const flyerTarde = makeFlyer({ id: 'flyer-b', published_at: '2030-10-15T21:00:00-03:00' })
    const movieTemprano = makeMovie({ id: 'movie-a', created_at: '2030-10-05T10:00:00-03:00' })
    const { flexibles } = armarFavoritos({ eventos: [], flyers: [flyerTarde], peliculas: [movieTemprano] }, AHORA)
    // La película se proyecta "hoy" (2030-10-10) y el flyer queda en su
    // propia fecha (2030-10-15): por fecha, la película va primero.
    expect(flexibles.map((f) => f.id)).toEqual(['movie-movie-a', 'ig-flyer-b'])
  })
})

describe('armarFavoritos: caso combinado (equivalencia con el escenario real de F13)', () => {
  it('eventos, flyers y películas juntos: todo entra, cada uno en su grupo', () => {
    const evento = makeEvento({ id: 'e1', start_date: '2030-10-12T21:00:00-03:00' })
    const flyer = makeFlyer({ id: 'f1' })
    const movie = makeMovie({ id: 'm1' })
    const { flexibles, porDia } = armarFavoritos({ eventos: [evento], flyers: [flyer], peliculas: [movie] }, AHORA)
    expect(porDia.flatMap((g) => g.items).map((i) => i.id)).toEqual(['e1'])
    expect(flexibles.map((i) => i.id).sort()).toEqual(['ig-f1', 'movie-m1'])
  })
})

// ---------------------------------------------------------------------------
// Sin copias: la web y la app importan la misma función de core, no una
// reimplementación propia (lo que haría que la equivalencia dependiera de
// mantener dos lógicas iguales a mano).
// ---------------------------------------------------------------------------
describe('sin copias: web y app usan @qps/core/favoritos/armar, no una reimplementación', () => {
  // La web usa comillas dobles y la app comillas simples (convención de cada
  // proyecto): el chequeo acepta cualquiera de las dos, no un string literal.
  const importDesdeCore = /from\s*['"]@qps\/core\/favoritos\/armar['"]/

  it('apps/mobile/lib/favoritos.ts importa armarFavoritos/idsDeFavoritos de @qps/core/favoritos/armar', () => {
    const src = readFileSync(`${MOBILE_ROOT}/lib/favoritos.ts`, 'utf8')
    expect(src).toMatch(importDesdeCore)
    expect(src).toMatch(/\barmarFavoritos\s*\(/)
  })

  it('apps/web/app/favoritos/page.tsx importa armarFavoritos/idsDeFavoritos de @qps/core/favoritos/armar', () => {
    const src = readFileSync(fileURLToPath(new URL('../../web/app/favoritos/page.tsx', import.meta.url)), 'utf8')
    expect(src).toMatch(importDesdeCore)
    expect(src).toMatch(/\barmarFavoritos\s*\(/)
  })
})

// ---------------------------------------------------------------------------
// Detector: app/(tabs)/favoritos.tsx vuelve a leer con useFocusEffect (no
// con un useEffect de una sola vez al montar), y sin disparar dos lecturas
// al montar (un único punto que llama a `cargar()`).
// ---------------------------------------------------------------------------
describe('app/(tabs)/favoritos.tsx: recarga con useFocusEffect al tomar foco', () => {
  const src = readFileSync(`${MOBILE_ROOT}/app/(tabs)/favoritos.tsx`, 'utf8')

  it('importa useFocusEffect de expo-router', () => {
    expect(src).toMatch(/import\s*\{[^}]*\buseFocusEffect\b[^}]*\}\s*from\s*['"]expo-router['"]/)
  })

  it('llama a useFocusEffect(...) envolviendo un useCallback (para no reconstruir la función en cada foco)', () => {
    expect(src).toMatch(/useFocusEffect\s*\(\s*useCallback\s*\(/)
  })

  it('un único punto dispara cargar(): no hay, además, un useEffect que también la llame al montar', () => {
    const llamadasACargar = src.match(/\bcargar\s*\(\s*\)/g) ?? []
    // La propia definición de `cargar` no cuenta (es la declaración, no un
    // llamado): se espera exactamente un llamado real, dentro de useFocusEffect.
    expect(llamadasACargar.length).toBe(1)

    const tieneUseEffectPropio = /\buseEffect\s*\(/.test(src)
    expect(tieneUseEffectPropio).toBe(false)
  })
})
