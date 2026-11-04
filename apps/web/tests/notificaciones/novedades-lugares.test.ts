// R-1 · Q5-6 dice que el aviso por evento nuevo de un LUGAR seguido ya existe
// (novedades, R41) y lo fijaba con un detector que lee el fuente
// (tests/lugares/seguir.test.ts). En tests/notificaciones/novedades.test.ts
// todas las fixtures tienen `user_followed_venues: []`: el camino «sigo un
// lugar» de `cargarNovedades` (lectura + cruce por usuario) no corría en
// ningún test. Acá sí, con un cliente falso que NO aplica filtros (cada
// fixture ya es lo que devolvería la base) y registra lo que se pidió.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cargarNovedades } from '@/lib/notificaciones/novedades'
import { saltaWallClockToDate, saltaWallClockToUtcISO } from '@qps/core/date-format'
import { PREFERENCIAS_POR_DEFECTO, type PreferenciasNotificacion } from '@qps/core/notificaciones/preferencias'

type Row = Record<string, unknown>
type Registro = { tabla: string; columnas?: string; llamadas: [string, unknown[]][] }

function clienteFalso(tablas: Record<string, Row[]>, errores: Record<string, string> = {}) {
  const registro: Registro[] = []
  const client = {
    from(tabla: string) {
      const r: Registro = { tabla, llamadas: [] }
      registro.push(r)
      const chain: Record<string, unknown> = {
        select: (c: string) => ((r.columnas = c), chain),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(errores[tabla] ? { data: null, error: { message: errores[tabla] } } : { data: tablas[tabla] ?? [], error: null }).then(res, rej),
      }
      for (const m of ['eq', 'in', 'gt', 'gte', 'lte', 'order', 'range']) chain[m] = (...a: unknown[]) => (r.llamadas.push([m, a]), chain)
      return chain
    },
  }
  return { client: client as unknown as SupabaseClient, registro }
}

const USUARIA = 'aaaaaaaa-0000-4000-8000-000000000001'
const OTRO = 'aaaaaaaa-0000-4000-8000-000000000002'
const TEATRO = 'bbbbbbbb-0000-4000-8000-000000000001'
const PLAZA = 'bbbbbbbb-0000-4000-8000-000000000002'
const AHORA = saltaWallClockToDate('2026-11-03T12:05:00')
// Las de siempre (silencio 23-09): a las 12:05 no hay silencio de por medio.
const SIN_SILENCIO: PreferenciasNotificacion = { ...PREFERENCIAS_POR_DEFECTO }

const evento = (id: string, venueId: string | null, creado = '2026-11-03T11:30:00'): Row => ({
  id,
  title: `Evento ${id}`,
  created_at: saltaWallClockToUtcISO(creado),
  start_date: saltaWallClockToUtcISO('2026-11-20T21:00:00'),
  end_date: null,
  status: 'PUBLISHED',
  category_id: null,
  venue_id: venueId,
})

const prefs = () =>
  new Map([
    [USUARIA, SIN_SILENCIO],
    [OTRO, SIN_SILENCIO],
  ])

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('cargarNovedades con lugares seguidos', () => {
  it('un evento nuevo en el lugar que sigue le llega a ella; a quien no lo sigue, no; un evento en otro lugar, a nadie', async () => {
    const { client, registro } = clienteFalso({
      job_runs: [{ started_at: saltaWallClockToUtcISO('2026-11-03T11:05:00'), details: {} }],
      user_followed_categories: [],
      user_followed_venues: [
        { user_id: USUARIA, venue_id: TEATRO },
        { user_id: OTRO, venue_id: PLAZA },
      ],
      user_followed_instagram_accounts: [],
      events: [evento('en-el-teatro', TEATRO), evento('en-otro-lugar', 'cccccccc-0000-4000-8000-000000000009'), evento('sin-lugar', null)],
    })
    const r = await cargarNovedades(client, { userIds: [USUARIA, OTRO], preferenciasPorUsuario: prefs(), ahora: AHORA })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.porUsuario.get(USUARIA)?.map((n) => n.eventId)).toEqual(['en-el-teatro'])
    expect(r.porUsuario.get(OTRO)).toEqual([])
    // Lo seguido se lee por lotes de usuarios, con las dos columnas justas.
    const seguidos = registro.find((x) => x.tabla === 'user_followed_venues')!
    expect(seguidos.columnas).toBe('user_id, venue_id')
    expect(seguidos.llamadas).toContainEqual(['in', ['user_id', [USUARIA, OTRO]]])
  })

  it('alguien que SOLO sigue lugares (ni categorías ni cuentas) igual recibe novedades: se lee events', async () => {
    const { client, registro } = clienteFalso({
      job_runs: [],
      user_followed_categories: [],
      user_followed_venues: [{ user_id: USUARIA, venue_id: TEATRO }],
      user_followed_instagram_accounts: [],
      events: [evento('en-el-teatro', TEATRO)],
    })
    const r = await cargarNovedades(client, { userIds: [USUARIA], preferenciasPorUsuario: prefs(), ahora: AHORA })
    expect(r.ok && r.porUsuario.get(USUARIA)?.map((n) => n.eventId)).toEqual(['en-el-teatro'])
    expect(registro.some((x) => x.tabla === 'events')).toBe(true)
  })

  it('un evento del lugar seguido creado antes de la última corrida no se repite', async () => {
    const { client } = clienteFalso({
      job_runs: [{ started_at: saltaWallClockToUtcISO('2026-11-03T11:05:00'), details: {} }],
      user_followed_categories: [],
      user_followed_venues: [{ user_id: USUARIA, venue_id: TEATRO }],
      user_followed_instagram_accounts: [],
      events: [evento('viejo', TEATRO, '2026-11-03T10:00:00')],
    })
    const r = await cargarNovedades(client, { userIds: [USUARIA], preferenciasPorUsuario: prefs(), ahora: AHORA })
    expect(r.ok && r.porUsuario.get(USUARIA)).toEqual([])
  })

  it('si falla la lectura de los lugares seguidos, corta con esa tabla (no manda novedades a medias)', async () => {
    const { client } = clienteFalso(
      { job_runs: [], user_followed_categories: [], user_followed_venues: [], user_followed_instagram_accounts: [], events: [evento('x', TEATRO)] },
      { user_followed_venues: 'conexión perdida' },
    )
    expect(await cargarNovedades(client, { userIds: [USUARIA], preferenciasPorUsuario: prefs(), ahora: AHORA })).toEqual({ ok: false, tabla: 'user_followed_venues' })
  })
})
