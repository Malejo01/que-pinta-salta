import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Cliente falso que NO aplica filtros: devuelve filas "vencidas" mezcladas, como podría
// hacerlo un prefiltro que es superconjunto. Registra los argumentos.
const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  calls: [] as Array<{ method: string; args: unknown[] }>,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => {
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'not', 'or', 'order', 'limit', 'in', 'ilike']) {
        c[m] = (...args: unknown[]) => {
          state.calls.push({ method: m, args })
          return c
        }
      }
      c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve({ data: state.rows, error: null }).then(res, rej)
      return c
    },
  }),
}))

import { getEvents, getFeaturedEvents } from '@/lib/data'

// 2030-10-10 18:00 en Salta.
const NOW = new Date('2030-10-10T21:00:00.000Z')
const row = (id: string, startIso: string, end: string | null = null) => ({
  id,
  start_date: startIso,
  end_date: end,
})
const ids = (l: Array<{ id: string }>) => l.map((e) => e.id)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  state.calls.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('getFeaturedEvents', () => {
  const vencidos = Array.from({ length: 6 }, (_, i) => row(`vencido-${i}`, `2030-10-10T1${i}:00:00.000Z`)) // 10-15Z + 4 h < 21Z
  const vigentes = Array.from({ length: 8 }, (_, i) => row(`vigente-${i}`, `2030-10-1${i + 1}T23:00:00.000Z`))

  it('pide 12 al prefiltro y devuelve 6 vigentes aunque vengan vencidos', async () => {
    state.rows = [...vencidos, ...vigentes]
    const r = await getFeaturedEvents()
    expect(state.calls.filter((c) => c.method === 'limit').map((c) => c.args)).toEqual([[12]])
    expect(r).toHaveLength(6)
    expect(ids(r)).toEqual(vigentes.slice(0, 6).map((e) => e.id))
  })

  it('con menos de 6 vigentes devuelve solo esos', async () => {
    state.rows = [...vencidos, ...vigentes.slice(0, 2)]
    expect(ids(await getFeaturedEvents())).toEqual(['vigente-0', 'vigente-1'])
  })

  it('usa el prefiltro de vigencia (.or con end_date y start_date)', async () => {
    state.rows = []
    await getFeaturedEvents()
    const or = state.calls.find((c) => c.method === 'or')!.args[0] as string
    expect(or).toContain('end_date.gte.2030-10-10T21:00:00.000Z')
    expect(or).toContain('start_date.gte.')
  })
})

describe('getEvents', () => {
  const museo = row('museo', '2030-10-10T13:00:00.000Z') // 10:00 Salta, fin 14:00
  const hoy = row('sin-hora-hoy', '2030-10-10T03:00:00.000Z')
  const muestra = row('muestra', '2030-09-01T22:00:00.000Z', '2030-10-25T23:00:00.000Z')

  it('por defecto filtra con isVigente: el museo de las 10:00 no aparece a las 18:00', async () => {
    state.rows = [museo, hoy, muestra]
    expect(ids(await getEvents())).toEqual(['sin-hora-hoy', 'muestra'])
  })

  it('con includeStartedToday devuelve las filas del prefiltro sin filtro exacto (la home filtra en el cliente)', async () => {
    state.rows = [museo, hoy, muestra]
    expect(ids(await getEvents({ includeStartedToday: true }))).toEqual(['museo', 'sin-hora-hoy', 'muestra'])
  })

  it('el prefiltro de la home incluye lo de hoy que ya empezó (modo includeToday)', async () => {
    state.rows = []
    await getEvents({ includeStartedToday: true })
    const or = state.calls.find((c) => c.method === 'or')!.args[0] as string
    expect(or).toContain('start_date.gte.2030-10-10T03:00:00.000Z')
    expect(or).not.toContain('start_date.eq.')
  })

  it('el prefiltro por defecto es el casi exacto (now - 4 h y sin hora de hoy)', async () => {
    state.rows = []
    await getEvents()
    const or = state.calls.find((c) => c.method === 'or')!.args[0] as string
    expect(or).toContain('start_date.gte.2030-10-10T17:00:00.000Z')
    expect(or).toContain('start_date.eq.2030-10-10T03:00:00.000Z')
  })
})
