import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { saltaAUtc } from '@/lib/recurrentes/fechas'

// `endDateUtc` (y `filaPena`/`filaMuseo`) no se exportan de generar.ts: se ejercitan acá
// a través de generarRecurrentes(), con una config de prueba inyectada por vi.mock (único
// punto donde la tarea permite escribir: este archivo de test).

const { PENA_FIXTURE } = vi.hoisted(() => ({
  PENA_FIXTURE: {
    tipo: 'pena' as const,
    venue: 'Venue de Prueba',
    titulo: 'Peña de Prueba',
    descripcion: 'Descripción de prueba',
    resumen: 'Resumen de prueba',
    dias: [0, 1, 2, 3, 4, 5, 6] as const,
    hora: '21:00',
    cierre: undefined as string | undefined,
    ticketUrl: null as string | null,
  },
}))

vi.mock('@/lib/recurrentes/config', () => ({
  CATEGORIA_PENAS: 'cat-penas-de-prueba',
  CATEGORIA_MUSEOS: 'cat-museos-de-prueba',
  HORIZONTE_PENAS_DIAS: 1,
  HORIZONTE_MUSEOS_DIAS: 1,
  PENAS: [PENA_FIXTURE],
  MUSEOS: [],
}))

const resolveVenueId = vi.fn()
const upsert = vi.fn()

vi.mock('@/lib/venues/resolve', () => ({
  resolveVenueId: (...args: unknown[]) => resolveVenueId(...args),
}))
vi.mock('@/lib/scraper/deduplicate', () => ({
  upsertEventWithDeduplication: (...args: unknown[]) => upsert(...args),
}))

import { generarRecurrentes } from '@/lib/recurrentes/generar'

type Row = Record<string, unknown>

/** Cliente falso mínimo: la búsqueda de imagen previa y la de días ya cargados devuelven vacío. */
const fakeSupabase = {
  from: (table: string) => {
    if (table !== 'events') throw new Error('tabla inesperada: ' + table)
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'not', 'gte', 'order', 'limit']) b[m] = () => b
    b.maybeSingle = () => Promise.resolve({ data: null, error: null }) // sin imagen previa
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(res, rej) // sin días ya cargados
    return b
  },
} as unknown as SupabaseClient

// Lunes 09:00 en Salta (12:00Z): ninguna hora de apertura usada abajo pasó todavía hoy.
const AHORA = new Date('2026-11-09T12:00:00Z')
const HOY = '2026-11-09'

let filas: Row[]

beforeEach(() => {
  resolveVenueId.mockReset()
  upsert.mockReset()
  resolveVenueId.mockResolvedValue('venue-id-de-prueba')
  filas = []
  upsert.mockImplementation(async (fila: Row) => {
    filas.push(fila)
    return { success: true, action: 'insert', eventId: 'ev-de-prueba' }
  })
  PENA_FIXTURE.hora = '21:00'
  PENA_FIXTURE.cierre = undefined
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('end_date de los recurrentes (QPS-10c: hora de cierre)', () => {
  it('sin "cierre" definido: end_date es null, como antes', async () => {
    PENA_FIXTURE.hora = '21:00'
    PENA_FIXTURE.cierre = undefined
    await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    expect(filas[0].end_date).toBeNull()
  })

  it('cierre el mismo día (10:00 -> 17:00): end_date es las 17:00 de Salta del mismo día', async () => {
    PENA_FIXTURE.hora = '10:00'
    PENA_FIXTURE.cierre = '17:00'
    await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    expect(filas[0].start_date).toBe(saltaAUtc(HOY, '10:00'))
    expect(filas[0].end_date).toBe(saltaAUtc(HOY, '17:00'))
  })

  it('cierre cruzando la medianoche (22:00 -> 02:00): end_date es el día siguiente', async () => {
    PENA_FIXTURE.hora = '22:00'
    PENA_FIXTURE.cierre = '02:00'
    await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    expect(filas[0].start_date).toBe(saltaAUtc(HOY, '22:00'))
    expect(filas[0].end_date).toBe(saltaAUtc('2026-11-10', '02:00'))
  })

  it('borde: cierre igual a la apertura es del día siguiente (no un evento de duración cero)', async () => {
    PENA_FIXTURE.hora = '21:00'
    PENA_FIXTURE.cierre = '21:00'
    await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    expect(filas[0].start_date).toBe(saltaAUtc(HOY, '21:00'))
    expect(filas[0].end_date).toBe(saltaAUtc('2026-11-10', '21:00'))
  })

  it('borde: cierre "00:00" es la medianoche del día siguiente', async () => {
    PENA_FIXTURE.hora = '21:00'
    PENA_FIXTURE.cierre = '00:00'
    await generarRecurrentes(fakeSupabase, { ahora: AHORA })
    expect(filas[0].start_date).toBe(saltaAUtc(HOY, '21:00'))
    expect(filas[0].end_date).toBe(saltaAUtc('2026-11-10', '00:00'))
  })
})
