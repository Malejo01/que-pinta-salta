/**
 * `lib/home/transform.ts`: transformación de eventos, flyers de Instagram y
 * películas de cine al formato de la portada (`DisplayEvent`), y el cuerpo
 * del useMemo `displayData` (`buildDisplayData`). Fixtures inventadas y
 * evidentes; sin red ni base.
 */
import { describe, expect, it } from 'vitest'
import {
  formatDateInSalta,
  parseLocalDate,
  transformEvent,
  groupEventItems,
  transformFlyer,
  buildDisplayData,
} from '@/lib/home/transform'
import type { EventWithRelations } from '@/lib/home/types'
import type { Category, Venue, CinemaMovie } from '@/lib/types'
import type { FlyerWithAccount, InstagramAccount } from '@/lib/instagram-config'
import { saltaWallClockToDate } from '@/lib/date-format'
import { eventoEnAtajo } from '@qps/core/home/atajos'

const salta = (wallClock: string) => saltaWallClockToDate(wallClock)

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

function makeEvent(overrides: Partial<EventWithRelations> & { start_date: string }): EventWithRelations {
  const category = overrides.category ?? makeCategory('boliches', 'Boliches')
  const venue = overrides.venue !== undefined ? overrides.venue : makeVenue()
  return {
    id: overrides.id ?? 'event-de-prueba',
    title: overrides.title ?? 'Evento de Prueba',
    slug: overrides.slug ?? 'evento-de-prueba',
    description: overrides.description ?? null,
    short_description: overrides.short_description ?? null,
    category_id: category.id,
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
    created_by: overrides.created_by ?? null,
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-01-01T00:00:00Z',
    category,
    venue,
  }
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
      'cine-de-prueba': {
        name: 'Cine de Prueba',
        booking_url: 'https://cine-de-prueba.test',
        formats: [{ type: '2D', times: ['20:00'] }],
      },
    },
  }
}

describe('formatDateInSalta', () => {
  it('un instante de la tarde cae en el mismo día en Salta y en UTC', () => {
    expect(formatDateInSalta(new Date('2030-06-15T15:00:00Z'))).toBe('2030-06-15')
  })

  it('23:30 de Salta (02:30 UTC del día siguiente) no se corre al día siguiente', () => {
    // 23:30 del 9/10 en Salta (UTC-3) es 02:30 UTC del 10/10. Si se leyera el
    // día en UTC crudo, esto daría "2030-10-10" y sería el error clásico.
    expect(formatDateInSalta(new Date('2030-10-10T02:30:00Z'))).toBe('2030-10-09')
  })
})

describe('parseLocalDate', () => {
  it('arma una fecha local a partir de "YYYY-MM-DD", sin corrimiento de zona', () => {
    const date = parseLocalDate('2030-10-09')
    expect(date.getFullYear()).toBe(2030)
    expect(date.getMonth()).toBe(9) // octubre: índice 9
    expect(date.getDate()).toBe(9)
  })
})

describe('transformEvent', () => {
  it('evento gratis: price "gratis" sin importar price_min', () => {
    const event = makeEvent({ start_date: salta('2030-10-10T21:00:00').toISOString(), is_free: true, price_min: 500 })
    expect(transformEvent(event).price).toBe('gratis')
  })

  it('no gratis con price_min 0: price "confirmar"', () => {
    const event = makeEvent({ start_date: salta('2030-10-10T21:00:00').toISOString(), is_free: false, price_min: 0 })
    expect(transformEvent(event).price).toBe('confirmar')
  })

  it('no gratis con price_min > 0: el número tal cual', () => {
    const event = makeEvent({ start_date: salta('2030-10-10T21:00:00').toISOString(), is_free: false, price_min: 15000 })
    expect(transformEvent(event).price).toBe(15000)
  })

  it('copia el status del evento (lo usa el modal de Buscar para el gate de asistencia)', () => {
    const base = { start_date: salta('2030-10-10T21:00:00').toISOString() }
    expect(transformEvent(makeEvent({ ...base, status: 'PUBLISHED' })).status).toBe('PUBLISHED')
    expect(transformEvent(makeEvent({ ...base, status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('vibe "adultos" solo con age_restriction >= 18; 17 y 0 no suman chip', () => {
    const base = { start_date: salta('2030-10-10T21:00:00').toISOString() }
    expect(transformEvent(makeEvent({ ...base, age_restriction: 18 })).vibe).toBe('adultos')
    expect(transformEvent(makeEvent({ ...base, age_restriction: 17 })).vibe).toBeNull()
    expect(transformEvent(makeEvent({ ...base, age_restriction: 0 })).vibe).toBeNull()
  })

  it('sin venue: "Lugar por confirmar" y dirección vacía', () => {
    const base = makeEvent({ start_date: salta('2030-10-10T21:00:00').toISOString() })
    // `EventWithRelations['venue']` se escribe como `Venue | null` en
    // lib/home/types.ts, pero por cómo TS calcula la intersección con el
    // `venue?: Venue` (opcional, sin null) de `Event`, el tipo resultante de
    // la clave compartida termina siendo solo `Venue` (ver reporte de 16-c):
    // hay que forzarlo con `unknown` para simular el dato real (left join sin
    // venue), que sí puede ser null en runtime.
    const sinVenue = { ...base, venue: null } as unknown as EventWithRelations
    const display = transformEvent(sinVenue)
    expect(display.venue).toBe('Lugar por confirmar')
    expect(display.address).toBe('')
  })

  it('descripción: usa description; si no hay, cae a short_description; si no hay ninguna, string vacío', () => {
    const base = { start_date: salta('2030-10-10T21:00:00').toISOString() }
    expect(
      transformEvent(makeEvent({ ...base, description: 'Larga de prueba', short_description: 'Corta de prueba' })).description,
    ).toBe('Larga de prueba')
    expect(
      transformEvent(makeEvent({ ...base, description: null, short_description: 'Corta de prueba' })).description,
    ).toBe('Corta de prueba')
    expect(transformEvent(makeEvent({ ...base, description: null, short_description: null })).description).toBe('')
  })

  it('sin image_url: usa el placeholder', () => {
    const event = makeEvent({ start_date: salta('2030-10-10T21:00:00').toISOString(), image_url: null })
    expect(transformEvent(event).image).toBe('/placeholder.svg?height=600&width=400')
  })

  it('sin ticket_url: undefined (no string vacío ni null)', () => {
    const event = makeEvent({ start_date: salta('2030-10-10T21:00:00').toISOString(), ticket_url: null })
    expect(transformEvent(event).ticketUrl).toBeUndefined()
  })

  it('hora: medianoche de Salta ("sin hora") no muestra hora; una hora explícita sí', () => {
    const sinHora = makeEvent({ start_date: salta('2030-10-10T00:00:00').toISOString() })
    const conHora = makeEvent({ start_date: salta('2030-10-10T21:30:00').toISOString() })
    expect(transformEvent(sinHora).time).toBe('')
    expect(transformEvent(conHora).time).toBe('21:30')
  })
})

describe('groupEventItems', () => {
  it('dos funciones del mismo título y lugar en días distintos: un DisplayEvent con 2 occurrences, con la fecha más temprana al frente', () => {
    const tarde = makeEvent({
      id: 'funcion-tardia',
      title: 'Peña de Prueba',
      venue: makeVenue({ name: 'Peña de Prueba' }),
      start_date: salta('2030-11-10T21:00:00').toISOString(),
    })
    const temprana = makeEvent({
      id: 'funcion-temprana',
      title: 'Peña de Prueba',
      venue: makeVenue({ name: 'Peña de Prueba' }),
      start_date: salta('2030-11-05T21:00:00').toISOString(),
    })

    // Insertadas en orden inverso a propósito: el agrupado tiene que ordenar
    // las ocurrencias igual, sin depender del orden de entrada.
    const [grouped] = groupEventItems([tarde, temprana])

    expect(groupEventItems([tarde, temprana])).toHaveLength(1)
    expect(grouped.id).toBe('funcion-temprana')
    expect(grouped.date).toBe('2030-11-05')
    expect(grouped.occurrences).toHaveLength(2)
    expect(grouped.occurrences?.map((o) => o.date)).toEqual(['2030-11-05', '2030-11-10'])
  })

  it('mismo título en lugares distintos: dos DisplayEvent separados', () => {
    const enVenueA = makeEvent({
      id: 'show-venue-a',
      title: 'Show de Prueba',
      venue: makeVenue({ name: 'Venue de Prueba' }),
      start_date: salta('2030-11-10T21:00:00').toISOString(),
    })
    const enVenueB = makeEvent({
      id: 'show-venue-b',
      title: 'Show de Prueba',
      venue: makeVenue({ name: 'Otro Venue de Prueba' }),
      start_date: salta('2030-11-10T21:00:00').toISOString(),
    })

    const result = groupEventItems([enVenueA, enVenueB])
    expect(result).toHaveLength(2)
    expect(result.map((e) => e.id).sort()).toEqual(['show-venue-a', 'show-venue-b'])
  })

  it('un elemento sin categoría se descarta (guarda de datos incompletos)', () => {
    const sinCategoria = makeEvent({ start_date: salta('2030-11-10T21:00:00').toISOString() })
    // Simula una fila malformada (categoría nula) que no debería pasar el tipo
    // en producción, pero el filtro de groupEventItems la protege igual.
    ;(sinCategoria as unknown as { category: null }).category = null
    expect(groupEventItems([sinCategoria])).toHaveLength(0)
  })
})

describe('transformFlyer', () => {
  it('categoría sin nombre conocido: no rompe, cae al slug', () => {
    const flyer = makeFlyer({ category: 'categoria-desconocida' })
    const display = transformFlyer(flyer, new Map([['boliches', 'Boliches']]))
    expect(display.categoryName).toBe('categoria-desconocida')
    expect(display.category).toBe('categoria-desconocida')
  })

  it('categoría conocida: usa el nombre del mapa', () => {
    const flyer = makeFlyer({ category: 'boliches' })
    const display = transformFlyer(flyer, new Map([['boliches', 'Boliches']]))
    expect(display.categoryName).toBe('Boliches')
  })

  it('venue: usa venue_name; si no, default_venue_name de la cuenta; si no, el nombre de la cuenta', () => {
    const conVenueName = makeFlyer({ venue_name: 'Venue de Prueba' })
    expect(transformFlyer(conVenueName, new Map()).venue).toBe('Venue de Prueba')

    const conDefaultVenue = makeFlyer({
      venue_name: null,
      account: makeAccount({ default_venue_name: 'Default de Prueba' }),
    })
    expect(transformFlyer(conDefaultVenue, new Map()).venue).toBe('Default de Prueba')

    const sinVenue = makeFlyer({
      venue_name: null,
      account: makeAccount({ default_venue_name: null, display_name: 'Cuenta de Prueba' }),
    })
    expect(transformFlyer(sinVenue, new Map()).venue).toBe('Cuenta de Prueba')
  })

  it('precio: gratis, confirmar (price_min 0) y numérico, igual que transformEvent', () => {
    expect(transformFlyer(makeFlyer({ is_free: true, price_min: 300 }), new Map()).price).toBe('gratis')
    expect(transformFlyer(makeFlyer({ is_free: false, price_min: 0 }), new Map()).price).toBe('confirmar')
    expect(transformFlyer(makeFlyer({ is_free: false, price_min: 8000 }), new Map()).price).toBe(8000)
  })
})

describe('buildDisplayData', () => {
  const now = salta('2030-10-10T15:00:00')
  const saltaTodayStr = '2030-10-10'

  it('"all" solo trae eventos vigentes (isVigente); uno vencido queda afuera', () => {
    const vigente = makeEvent({
      id: 'evento-vigente',
      start_date: salta('2030-10-11T21:00:00').toISOString(), // mañana, futuro
    })
    const vencido = makeEvent({
      id: 'evento-vencido',
      start_date: salta('2030-10-01T21:00:00').toISOString(), // hace más de una semana
    })

    const data = buildDisplayData([vigente, vencido], [], [], new Map(), now)
    const ids = data.all.map((e) => e.id)
    expect(ids).toContain('evento-vigente')
    expect(ids).not.toContain('evento-vencido')
  })

  it('"today": un museo sin end_date también deja de aparecer 4 h después de abrir, igual que en "all" (QPS-128, decisión de Mauro)', () => {
    // QPS-128: antes, "today" tenía una regla aparte por categoría que dejaba
    // a los museos (categoría de larga duración) todo el día, aunque ya
    // hubiera vencido su estimado de 4 h. Mauro decidió una única regla de
    // vigencia (isVigente) para "all" y "today": sin end_date, el museo
    // también vence a las 4 h en "Hoy".
    const museo = makeEvent({
      id: 'museo-de-prueba',
      title: 'Museo de Prueba',
      category: makeCategory('museos', 'Museos'),
      start_date: salta('2030-10-10T10:00:00').toISOString(), // abrió a las 10, now=15:00 -> venció el estimado de 4h (14:00)
    })

    const data = buildDisplayData([museo], [], [], new Map(), now)
    expect(data.all.map((e) => e.id)).not.toContain('museo-de-prueba')
    expect(data.today.map((e) => e.id)).not.toContain('museo-de-prueba')
  })

  it('"today" no trae eventos reales de otro día', () => {
    const deAyer = makeEvent({
      id: 'evento-de-ayer',
      start_date: salta('2030-10-09T21:00:00').toISOString(),
    })
    const deManana = makeEvent({
      id: 'evento-de-manana',
      start_date: salta('2030-10-11T21:00:00').toISOString(),
    })

    const data = buildDisplayData([deAyer, deManana], [], [], new Map(), now)
    expect(data.today.map((e) => e.id)).not.toContain('evento-de-ayer')
    expect(data.today.map((e) => e.id)).not.toContain('evento-de-manana')
  })

  it('devuelve saltaTodayStr calculado con la misma now', () => {
    const data = buildDisplayData([], [], [], new Map(), now)
    expect(data.saltaTodayStr).toBe(saltaTodayStr)
  })

  it('Comportamiento actual: flyers y películas van a "all" y a "today" sin filtrarlos por fecha (solo los eventos reales se filtran)', () => {
    const flyerDeOtroDia = makeFlyer({
      id: 'flyer-de-otro-dia',
      published_at: salta('2030-09-01T21:00:00').toISOString(), // muy lejos de "hoy"
    })
    const pelicula = makeMovie({ id: 'pelicula-de-prueba' })

    const data = buildDisplayData([], [flyerDeOtroDia], [pelicula], new Map(), now)

    // Confirmado por 16-b: no hay filtro de fecha para flyers ni películas,
    // así que aparecen en "today" aunque su fecha no sea la de hoy.
    expect(data.all.map((e) => e.id)).toEqual(['ig-flyer-de-otro-dia', 'movie-pelicula-de-prueba'])
    expect(data.today.map((e) => e.id)).toEqual(['ig-flyer-de-otro-dia', 'movie-pelicula-de-prueba'])
  })

  // QPS-128: los bordes de vigencia que pidió Mauro, sobre "today".
  it('evento que empieza a las 20:00 sin hora de fin: aparece en "Hoy" a las 21:00; ya no a las 00:01 del día siguiente (fin estimado 4 h)', () => {
    const evento = makeEvent({
      id: 'boliche-sin-fin',
      start_date: salta('2030-10-10T20:00:00').toISOString(),
      end_date: null,
    })

    const alas21 = buildDisplayData([evento], [], [], new Map(), salta('2030-10-10T21:00:00'))
    expect(alas21.today.map((e) => e.id)).toContain('boliche-sin-fin')

    const alas0001 = buildDisplayData([evento], [], [], new Map(), salta('2030-10-11T00:01:00'))
    expect(alas0001.today.map((e) => e.id)).not.toContain('boliche-sin-fin')
  })

  it('evento sin hora (00:00 de Salta) de hoy: aparece en "Hoy" durante todo el día', () => {
    const evento = makeEvent({
      id: 'sin-hora-todo-el-dia',
      start_date: salta('2030-10-10T00:00:00').toISOString(),
      end_date: null,
    })

    for (const hora of ['2030-10-10T00:00:00', '2030-10-10T12:00:00', '2030-10-10T23:59:59']) {
      const data = buildDisplayData([evento], [], [], new Map(), salta(hora))
      expect(data.today.map((e) => e.id), hora).toContain('sin-hora-todo-el-dia')
    }
  })

  it('evento que terminó hace 1 minuto no aparece; uno que termina en 1 minuto, sí', () => {
    const ahora = salta('2030-10-10T18:00:00')
    const terminoHaceUnMinuto = makeEvent({
      id: 'termino-hace-1-min',
      start_date: salta('2030-10-10T10:00:00').toISOString(),
      end_date: new Date(ahora.getTime() - 60_000).toISOString(),
    })
    const terminaEnUnMinuto = makeEvent({
      id: 'termina-en-1-min',
      start_date: salta('2030-10-10T10:00:00').toISOString(),
      end_date: new Date(ahora.getTime() + 60_000).toISOString(),
    })

    const data = buildDisplayData([terminoHaceUnMinuto, terminaEnUnMinuto], [], [], new Map(), ahora)
    const ids = data.today.map((e) => e.id)
    expect(ids).not.toContain('termino-hace-1-min')
    expect(ids).toContain('termina-en-1-min')
  })

  it('museo con end_date (el cierre de recurrentes): aparece hasta el cierre, no después', () => {
    const museo = makeEvent({
      id: 'museo-con-cierre',
      category: makeCategory('museos', 'Museos'),
      start_date: salta('2030-10-10T10:00:00').toISOString(),
      end_date: salta('2030-10-10T20:00:00').toISOString(),
    })

    const antesDelCierre = buildDisplayData([museo], [], [], new Map(), salta('2030-10-10T19:59:00'))
    expect(antesDelCierre.today.map((e) => e.id)).toContain('museo-con-cierre')

    const despuesDelCierre = buildDisplayData([museo], [], [], new Map(), salta('2030-10-10T20:01:00'))
    expect(despuesDelCierre.today.map((e) => e.id)).not.toContain('museo-con-cierre')
  })

  it('un evento de mañana, aunque siga vigente (todavía no empezó), nunca aparece en "Hoy"', () => {
    const deManana = makeEvent({
      id: 'de-manana-vigente',
      start_date: salta('2030-10-11T21:00:00').toISOString(),
    })
    // Confirma que el motivo de la exclusión es el día, no la vigencia: a esta
    // hora el evento de mañana todavía está vigente (no empezó).
    expect(
      eventoEnAtajo(
        { start_date: deManana.start_date, end_date: deManana.end_date, category: deManana.category.slug },
        'hoy',
        now,
      ),
    ).toBe(false)

    const data = buildDisplayData([deManana], [], [], new Map(), now)
    expect(data.today.map((e) => e.id)).not.toContain('de-manana-vigente')
  })

  it('"Hoy" de la portada y el atajo "hoy" de la app (home/atajos) dan el mismo resultado para el mismo conjunto de eventos (razón de QPS-128)', () => {
    const ahora = salta('2030-10-10T14:30:00')

    const boliche20 = makeEvent({
      id: 'boliche-20',
      title: 'Show De Boliche',
      venue: makeVenue({ name: 'Boliche De Prueba' }),
      start_date: salta('2030-10-10T20:00:00').toISOString(),
      end_date: null,
    })
    const sinHora = makeEvent({
      id: 'sin-hora',
      title: 'Evento Sin Hora',
      venue: makeVenue({ name: 'Venue Sin Hora' }),
      start_date: salta('2030-10-10T00:00:00').toISOString(),
      end_date: null,
    })
    const museoConEnd = makeEvent({
      id: 'museo-con-end',
      title: 'Museo Con Cierre',
      venue: makeVenue({ name: 'Venue Museo Con Cierre' }),
      category: makeCategory('museos', 'Museos'),
      start_date: salta('2030-10-10T10:00:00').toISOString(),
      end_date: salta('2030-10-10T20:00:00').toISOString(),
    })
    const museoSinEnd = makeEvent({
      id: 'museo-sin-end',
      title: 'Museo Sin Cierre',
      venue: makeVenue({ name: 'Venue Museo Sin Cierre' }),
      category: makeCategory('museos', 'Museos'),
      start_date: salta('2030-10-10T10:00:00').toISOString(),
      end_date: null,
    })
    const terminaEn1Min = makeEvent({
      id: 'termina-en-1-min',
      title: 'Termina En Un Minuto',
      venue: makeVenue({ name: 'Venue Termina En Un Minuto' }),
      start_date: salta('2030-10-10T10:00:00').toISOString(),
      end_date: new Date(ahora.getTime() + 60_000).toISOString(),
    })
    const terminoHace1Min = makeEvent({
      id: 'termino-hace-1-min',
      title: 'Termino Hace Un Minuto',
      venue: makeVenue({ name: 'Venue Termino Hace Un Minuto' }),
      start_date: salta('2030-10-10T10:00:00').toISOString(),
      end_date: new Date(ahora.getTime() - 60_000).toISOString(),
    })
    const deAyer = makeEvent({
      id: 'de-ayer',
      title: 'Evento De Ayer',
      venue: makeVenue({ name: 'Venue De Ayer' }),
      start_date: salta('2030-10-09T21:00:00').toISOString(),
    })
    const deManana = makeEvent({
      id: 'de-manana',
      title: 'Evento De Manana',
      venue: makeVenue({ name: 'Venue De Manana' }),
      start_date: salta('2030-10-11T21:00:00').toISOString(),
    })

    const eventos = [
      boliche20,
      sinHora,
      museoConEnd,
      museoSinEnd,
      terminaEn1Min,
      terminoHace1Min,
      deAyer,
      deManana,
    ]

    const data = buildDisplayData(eventos, [], [], new Map(), ahora)
    const idsPortada = new Set(data.today.map((e) => e.id))

    const idsAtajo = new Set(
      eventos
        .filter((evento) =>
          eventoEnAtajo(
            { start_date: evento.start_date, end_date: evento.end_date, category: evento.category.slug },
            'hoy',
            ahora,
          ),
        )
        .map((evento) => evento.id),
    )

    expect(idsPortada).toEqual(idsAtajo)
    expect(idsPortada).toEqual(new Set(['boliche-20', 'sin-hora', 'museo-con-end', 'termina-en-1-min']))
  })
})
