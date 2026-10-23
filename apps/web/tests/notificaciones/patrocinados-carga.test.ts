/**
 * `lib/notificaciones/patrocinados.ts` (D2/Ronda 51, tarea 51-b):
 * `cargarCampaniaVigente`. Sin red ni base: el cliente de Supabase es un
 * doble a mano, sin filtros de verdad (cada fixture ya viene pre-filtrada a
 * lo que la base real devolvería con `starts_at <= ahora` y `ends_at >
 * ahora`), igual criterio que `tests/notificaciones/novedades.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { saltaWallClockToDate, saltaWallClockToUtcISO } from '@qps/core/date-format'
import { cargarCampaniaVigente } from '@/lib/notificaciones/patrocinados'

type Row = Record<string, unknown>

const ahora = saltaWallClockToDate('2030-10-20T20:00:00')
const hastaISO = (wallClock: string) => saltaWallClockToUtcISO(wallClock)

const EVENT_ID = '30000000-0000-4000-8000-000000000001'

function campaniaRow(overrides: Row = {}): Row {
  return {
    id: '30000000-0000-4000-8000-000000000002',
    title: 'Campaña de Prueba',
    body: 'Cuerpo de prueba',
    event_id: EVENT_ID,
    starts_at: hastaISO('2030-10-19T00:00:00'),
    ends_at: hastaISO('2030-10-25T00:00:00'),
    sent_at: null,
    event: { status: 'PUBLISHED' },
    ...overrides,
  }
}

/** Doble sin filtros de verdad: la fixture ya viene como si `.lte()`/`.gt()` ya se hubieran aplicado. */
function clienteFalso(filas: Row[], error: string | null = null) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    lte: () => chain,
    gt: () => chain,
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      const resultado = error ? { data: null, error: { message: error } } : { data: filas, error: null }
      return Promise.resolve(resultado).then(res, rej)
    },
  }
  return { from: () => chain } as unknown as SupabaseClient
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('cargarCampaniaVigente', () => {
  it('0 filas vigentes: campania null, descartada false', async () => {
    const resultado = await cargarCampaniaVigente(clienteFalso([]), ahora)
    expect(resultado).toEqual({ ok: true, campania: null, descartada: false })
  })

  it('1 fila vigente, evento PUBLISHED: devuelve la campaña usable', async () => {
    const resultado = await cargarCampaniaVigente(clienteFalso([campaniaRow()]), ahora)
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.descartada).toBe(false)
    expect(resultado.campania).toEqual({
      id: '30000000-0000-4000-8000-000000000002',
      titulo: 'Campaña de Prueba',
      cuerpo: 'Cuerpo de prueba',
      eventId: EVENT_ID,
      sentAt: null,
    })
  })

  it('2 filas vigentes (no debería pasar nunca, validarCampania lo evita al guardar): elige una de forma determinista, vía campaniaVigente de core', async () => {
    const primera = campaniaRow({
      id: '30000000-0000-4000-8000-000000000010',
      starts_at: hastaISO('2030-10-18T00:00:00'),
      ends_at: hastaISO('2030-10-21T00:00:00'),
    })
    const segunda = campaniaRow({
      id: '30000000-0000-4000-8000-000000000020',
      starts_at: hastaISO('2030-10-19T00:00:00'),
      ends_at: hastaISO('2030-10-22T00:00:00'),
    })

    const resultado = await cargarCampaniaVigente(clienteFalso([segunda, primera]), ahora)
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    // campaniaVigente (core) elige la de startsAt más temprano: la "primera".
    expect(resultado.campania?.id).toBe('30000000-0000-4000-8000-000000000010')
  })

  it('el evento NO está PUBLISHED: se descarta (campania null, descartada true)', async () => {
    const resultado = await cargarCampaniaVigente(clienteFalso([campaniaRow({ event: { status: 'DRAFT' } })]), ahora)
    expect(resultado).toEqual({ ok: true, campania: null, descartada: true })
  })

  it('sin event_id: se descarta igual que con el evento sin publicar', async () => {
    const resultado = await cargarCampaniaVigente(clienteFalso([campaniaRow({ event_id: null, event: null })]), ahora)
    expect(resultado).toEqual({ ok: true, campania: null, descartada: true })
  })

  it('error de lectura: ok false, con el nombre de la tabla, y lo loguea (solo tabla + mensaje)', async () => {
    const resultado = await cargarCampaniaVigente(clienteFalso([], 'conexión perdida'), ahora)
    expect(resultado).toEqual({ ok: false, tabla: 'sponsored_campaigns' })
    expect(console.error).toHaveBeenCalled()
    const [, mensaje] = (console.error as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string]
    expect(mensaje).toBe('conexión perdida')
  })

  it('nunca loguea el título ni el cuerpo de la campaña', async () => {
    await cargarCampaniaVigente(clienteFalso([], 'conexión perdida'), ahora)
    const logueado = (console.error as ReturnType<typeof vi.fn>).mock.calls.flat().map((a) => JSON.stringify(a))
    expect(logueado.some((t) => t.includes('Campaña de Prueba'))).toBe(false)
  })
})
