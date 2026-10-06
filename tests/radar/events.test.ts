import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRadarEvents, RADAR_DAYS_AHEAD, type RadarFollows } from '@/lib/radar/events'
import { createFakeSupabase, type FakeTable, type Row } from './fake-supabase'

// Jueves 2030-10-10 21:00 UTC = 18:00 en Salta. El día de Salta empieza 03:00 UTC.
const NOW = new Date('2030-10-10T21:00:00.000Z')
const DESDE = '2030-10-10T03:00:00.000Z'
const HASTA = '2030-11-09T21:00:00.000Z'

const CAT = 'c0000000-0000-4000-8000-000000000001'
const VEN = 'b0000000-0000-4000-8000-000000000001'
const ACC = 'a0000000-0000-4000-8000-000000000001'
const uid = (n: number) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const none: RadarFollows = { categoryIds: [], venueIds: [], instagramAccountIds: [] }
const follow = (p: Partial<RadarFollows>): RadarFollows => ({ ...none, ...p })

function ev(n: number, extra: Row = {}): Row {
  return {
    id: uid(n),
    title: `Evento de Prueba ${n}`,
    status: 'PUBLISHED',
    start_date: '2030-10-15T23:00:00.000Z',
    end_date: null,
    category_id: CAT,
    venue_id: VEN,
    ...extra,
  }
}

function flyer(eventId: unknown, extra: Row = {}): Row {
  return {
    status: 'ACTIVE',
    ai_status: 'PROCESSED',
    account_id: ACC,
    published_at: '2030-10-01T00:00:00.000Z',
    ai_metadata: { event_id: eventId },
    ...extra,
  }
}

type Db = { events?: Row[]; flyers?: Row[]; eventsError?: string; flyersError?: string }
function setup(db: Db) {
  const tables: Record<string, FakeTable> = {
    events: { rows: db.events ?? [], error: db.eventsError ? { message: db.eventsError } : null },
    instagram_flyers: { rows: db.flyers ?? [], error: db.flyersError ? { message: db.flyersError } : null },
  }
  const fake = createFakeSupabase(tables)
  const run = (follows: RadarFollows) =>
    getRadarEvents(fake.client as unknown as Parameters<typeof getRadarEvents>[0], follows, NOW)
  return { fake, run }
}
const ids = (list: Array<{ id: string }>) => list.map((e) => e.id)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('getRadarEvents: argumentos de la ventana', () => {
  it('constante de 30 días', () => {
    expect(RADAR_DAYS_AHEAD).toBe(30)
  })

  it.each([
    ['categoría', follow({ categoryIds: [CAT] })],
    ['lugar', follow({ venueIds: [VEN] })],
  ])('consulta por %s: ventana, PUBLISHED, orden y select', async (_n, f) => {
    const { fake, run } = setup({ events: [ev(1)] })
    await run(f)
    const qs = fake.callsOf('events')
    expect(qs).toHaveLength(1)
    const q = qs[0]
    expect(fake.args(q, 'or')).toEqual([[`end_date.gte.${DESDE},and(end_date.is.null,start_date.gte.${DESDE})`]])
    expect(fake.args(q, 'lte')).toEqual([['start_date', HASTA]])
    expect(fake.args(q, 'eq')).toContainEqual(['status', 'PUBLISHED'])
    expect(fake.args(q, 'order')).toContainEqual(['start_date', { ascending: true }])
    expect(fake.args(q, 'select')[0][0]).toBe('*, venue:venues(*), category:categories(*)')
    expect(fake.args(q, 'limit')).toEqual([[10]])
  })

  it('categoría usa in(category_id) y lugar in(venue_id), sin mezclarlos en un .or', async () => {
    const { fake, run } = setup({ events: [ev(1)] })
    await run(follow({ categoryIds: [CAT], venueIds: [VEN] }))
    const qs = fake.callsOf('events')
    expect(qs).toHaveLength(2)
    expect(qs.map((q) => fake.args(q, 'in')[0])).toEqual([['category_id', [CAT]], ['venue_id', [VEN]]])
    for (const q of qs) expect(fake.args(q, 'or')).toHaveLength(1)
  })

  it('la consulta de eventos de flyers también lleva la ventana', async () => {
    const { fake, run } = setup({ events: [ev(1)], flyers: [flyer(uid(1))] })
    await run(follow({ instagramAccountIds: [ACC] }))
    const q = fake.callsOf('events')[0]
    expect(fake.args(q, 'or')).toEqual([[`end_date.gte.${DESDE},and(end_date.is.null,start_date.gte.${DESDE})`]])
    expect(fake.args(q, 'lte')).toEqual([['start_date', HASTA]])
    expect(fake.args(q, 'eq')).toContainEqual(['status', 'PUBLISHED'])
    expect(fake.args(q, 'in')).toEqual([['id', [uid(1)]]])
    expect(fake.args(q, 'limit')).toEqual([[10]])
  })

  it('sin now explícito usa la hora actual (fake timers)', async () => {
    const { fake } = setup({ events: [] })
    await getRadarEvents(fake.client as unknown as Parameters<typeof getRadarEvents>[0], follow({ venueIds: [VEN] }))
    expect(fake.args(fake.callsOf('events')[0], 'lte')).toEqual([['start_date', HASTA]])
  })
})

describe('getRadarEvents: resultado de la ventana (filtros en memoria)', () => {
  it('evento de hoy sin hora (00:00 Salta, sin end_date): entra aunque sean las 18:00', async () => {
    const { run } = setup({ events: [ev(1, { start_date: '2030-10-10T03:00:00.000Z' })] })
    expect(ids(await run(follow({ venueIds: [VEN] })))).toEqual([uid(1)])
  })

  it('muestra en curso (empezó hace 20 días, termina en 10): entra', async () => {
    const { run } = setup({
      events: [ev(1, { start_date: '2030-09-20T15:00:00.000Z', end_date: '2030-10-20T15:00:00.000Z' })],
    })
    expect(ids(await run(follow({ venueIds: [VEN] })))).toEqual([uid(1)])
  })

  it('muestra ya terminada (end_date ayer): no entra', async () => {
    const { run } = setup({
      events: [ev(1, { start_date: '2030-09-20T15:00:00.000Z', end_date: '2030-10-09T23:00:00.000Z' })],
    })
    expect(await run(follow({ venueIds: [VEN] }))).toEqual([])
  })

  it('evento de ayer sin end_date: no entra', async () => {
    const { run } = setup({ events: [ev(1, { start_date: '2030-10-09T23:00:00.000Z' })] })
    expect(await run(follow({ venueIds: [VEN] }))).toEqual([])
  })

  it('evento a 31 días: no entra; a 29 días sí', async () => {
    const { run } = setup({
      events: [
        ev(1, { start_date: '2030-11-10T21:00:00.000Z' }),
        ev(2, { start_date: '2030-11-08T21:00:00.000Z' }),
      ],
    })
    expect(ids(await run(follow({ venueIds: [VEN] })))).toEqual([uid(2)])
  })

  it('evento a exactamente 30 días entra, un segundo después no', async () => {
    const { run } = setup({
      events: [
        ev(1, { start_date: '2030-11-09T21:00:00.000Z' }),
        ev(2, { start_date: '2030-11-09T21:00:01.000Z' }),
      ],
    })
    expect(ids(await run(follow({ venueIds: [VEN] })))).toEqual([uid(1)])
  })

  it('evento no PUBLISHED: no entra', async () => {
    const { run } = setup({ events: [ev(1, { status: 'DRAFT' }), ev(2, { status: 'PENDING_REVIEW' })] })
    expect(await run(follow({ venueIds: [VEN] }))).toEqual([])
  })

  it('el mismo evento por lugar seguido y por flyer de cuenta seguida: aparece una vez', async () => {
    const { run } = setup({ events: [ev(1)], flyers: [flyer(uid(1))] })
    const r = await run(follow({ venueIds: [VEN], instagramAccountIds: [ACC] }))
    expect(ids(r)).toEqual([uid(1)])
  })

  it('el mismo evento por categoría y por lugar: una vez', async () => {
    const { run } = setup({ events: [ev(1)] })
    expect(ids(await run(follow({ categoryIds: [CAT], venueIds: [VEN] })))).toEqual([uid(1)])
  })

  it('solo trae lo que el usuario sigue', async () => {
    const { run } = setup({
      events: [ev(1), ev(2, { category_id: 'otra', venue_id: 'otro' })],
    })
    expect(ids(await run(follow({ categoryIds: [CAT] })))).toEqual([uid(1)])
  })
})

describe('getRadarEvents: flyers', () => {
  const igFollow = follow({ instagramAccountIds: [ACC] })

  it('consulta ACTIVE, PROCESSED, in(account_id), published_at desc, limit 30, select ai_metadata', async () => {
    const { fake, run } = setup({ events: [ev(1)], flyers: [flyer(uid(1))] })
    await run(igFollow)
    const q = fake.callsOf('instagram_flyers')[0]
    expect(fake.args(q, 'select')).toEqual([['ai_metadata']])
    expect(fake.args(q, 'eq')).toEqual(expect.arrayContaining([['status', 'ACTIVE'], ['ai_status', 'PROCESSED']]))
    expect(fake.args(q, 'in')).toEqual([['account_id', [ACC]]])
    expect(fake.args(q, 'order')).toEqual([['published_at', { ascending: false }]])
    expect(fake.args(q, 'limit')).toEqual([[30]])
  })

  it('flyer de otra cuenta, inactivo o no procesado no aporta eventos', async () => {
    const { fake, run } = setup({
      events: [ev(1), ev(2), ev(3)],
      flyers: [
        flyer(uid(1), { account_id: 'otra' }),
        flyer(uid(2), { status: 'ARCHIVED' }),
        flyer(uid(3), { ai_status: 'PENDING' }),
      ],
    })
    expect(await run(igFollow)).toEqual([])
    expect(fake.callsOf('events')).toHaveLength(0)
  })

  it('solo los event_id con forma de uuid pasan a in(id)', async () => {
    const { fake, run } = setup({
      events: [ev(1)],
      flyers: [
        flyer(uid(1)),
        flyer('no-es-uuid'),
        flyer("e0000000-0000-4000-8000-000000000002') or (1=1"),
        flyer(12345),
        flyer(null),
        flyer(undefined),
        flyer({ x: 1 }),
        { ...flyer(null), ai_metadata: null },
      ],
    })
    await run(igFollow)
    expect(fake.args(fake.callsOf('events')[0], 'in')).toEqual([['id', [uid(1)]]])
  })

  it('si ningún flyer tiene event_id válido no consulta events', async () => {
    const { fake, run } = setup({ events: [ev(1)], flyers: [flyer(null), flyer('basura')] })
    expect(await run(igFollow)).toEqual([])
    expect(fake.callsOf('events')).toHaveLength(0)
    expect(fake.callsOf('instagram_flyers')).toHaveLength(1)
  })

  it('un flyer cuyo evento ya pasó no aparece (el flyer no es un ítem)', async () => {
    const { run } = setup({
      events: [ev(1, { start_date: '2030-10-01T23:00:00.000Z' })],
      flyers: [flyer(uid(1))],
    })
    expect(await run(igFollow)).toEqual([])
  })

  it('sin cuentas seguidas no consulta instagram_flyers', async () => {
    const { fake, run } = setup({ events: [ev(1)], flyers: [flyer(uid(1))] })
    await run(follow({ venueIds: [VEN] }))
    expect(fake.callsOf('instagram_flyers')).toHaveLength(0)
  })

  it('sin nada seguido no consulta ninguna tabla y devuelve []', async () => {
    const { fake, run } = setup({ events: [ev(1)] })
    expect(await run(none)).toEqual([])
    expect(fake.queries).toHaveLength(0)
  })

  it('ningún ítem viene de un flyer crudo', async () => {
    const { run } = setup({
      events: [ev(1)],
      flyers: [flyer(uid(1), { caption: 'Flyer de @cuenta_de_prueba', ig_post_id: 'ig-1' })],
    })
    const r = await run(follow({ venueIds: [VEN], instagramAccountIds: [ACC] }))
    expect(r).toHaveLength(1)
    for (const item of r) {
      expect(item).not.toHaveProperty('isInstagramFlyer')
      expect(item).not.toHaveProperty('flyerId')
      expect(JSON.stringify(item)).not.toContain('Flyer de @')
      expect(item.id).toBe(uid(1))
    }
  })
})

describe('getRadarEvents: orden, recorte y errores', () => {
  it('ordena por start_date ascendente la unión de caminos', async () => {
    const { run } = setup({
      events: [
        ev(1, { start_date: '2030-10-20T23:00:00.000Z', category_id: CAT, venue_id: 'x' }),
        ev(2, { start_date: '2030-10-12T23:00:00.000Z', category_id: 'x', venue_id: 'x' }),
        ev(3, { start_date: '2030-10-16T23:00:00.000Z', category_id: 'x', venue_id: VEN }),
        ev(4, { start_date: '2030-10-11T23:00:00.000Z', category_id: CAT, venue_id: 'x' }),
      ],
      flyers: [flyer(uid(2))],
    })
    const r = await run(follow({ categoryIds: [CAT], venueIds: [VEN], instagramAccountIds: [ACC] }))
    expect(ids(r)).toEqual([uid(4), uid(2), uid(3), uid(1)])
  })

  it('recorta a 12 y se queda con los más próximos', async () => {
    const events = Array.from({ length: 30 }, (_, i) =>
      ev(i + 1, {
        start_date: new Date(Date.UTC(2030, 9, 11, 23) + i * 3_600_000).toISOString(),
        category_id: i % 2 ? CAT : 'x',
        venue_id: i % 2 ? 'x' : VEN,
      }),
    )
    const { run } = setup({ events })
    const r = await run(follow({ categoryIds: [CAT], venueIds: [VEN] }))
    expect(r).toHaveLength(12)
    // Cada camino aporta 10 (limit 10): los 12 primeros de la unión ordenada.
    expect(ids(r)).toEqual(Array.from({ length: 12 }, (_, i) => uid(i + 1)))
  })

  it('error en eventos: no lanza, devuelve lo que sí llegó y loguea con prefijo [Radar]', async () => {
    const { fake, run } = setup({ events: [], eventsError: 'falla de prueba', flyers: [flyer(uid(1))] })
    await expect(run(follow({ venueIds: [VEN], instagramAccountIds: [ACC] }))).resolves.toEqual([])
    expect(fake.callsOf('events').length).toBeGreaterThan(0)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[Radar]'), 'falla de prueba')
  })

  it('error en flyers: no lanza, el resto de las consultas sigue', async () => {
    const { run } = setup({ events: [ev(1)], flyersError: 'flyers caídos' })
    const r = await run(follow({ venueIds: [VEN], instagramAccountIds: [ACC] }))
    expect(ids(r)).toEqual([uid(1)])
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[Radar]'), 'flyers caídos')
  })
})

