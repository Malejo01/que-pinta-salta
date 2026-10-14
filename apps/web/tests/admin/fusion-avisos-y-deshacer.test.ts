// Hotfix 13/10:
// - pairWarnings: avisos de "Posibles duplicados" antes de fusionar (lugares
//   distintos, lugar leído por la IA distinto, días distintos).
// - unmergeEvent: "Deshacer fusión" llama a unmerge_event() con el cliente
//   del usuario (no el de service role) y traduce los errores.
// Sin red ni base.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

type RpcResult = { data: unknown; error: { code?: string; message: string } | null }
const state = vi.hoisted(() => ({
  role: 'ADMIN' as string | null,
  rpc: { data: null, error: null } as { data: unknown; error: { code?: string; message: string } | null },
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-de-prueba' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: state.role } }) }) }) }),
    rpc: async (fn: string, args: unknown) => {
      state.rpcCalls.push({ fn, args })
      return state.rpc
    },
  }),
  createAdminClient: () => {
    throw new Error('unmergeEvent no debería usar el cliente admin')
  },
}))

import { unmergeEvent } from '@/lib/admin/duplicate-actions'
import { pairWarnings, aiVenueName, type DuplicateCandidateEvent } from '@/lib/events/duplicate-candidates'
import { saltaWallClockToUtcISO } from '@/lib/date-format'

const uid = (n: number) => `ffffffff-ffff-4fff-8fff-${String(n).padStart(12, '0')}`

function ev(over: Partial<DuplicateCandidateEvent>): DuplicateCandidateEvent {
  return {
    id: uid(1),
    title: 'Halloween 2026',
    start_date: saltaWallClockToUtcISO('2026-10-30T20:00:00'),
    status: 'PUBLISHED',
    venue_id: 'venue-convenciones',
    venue: { name: 'Centro de Convenciones Salta' },
    ai_metadata: null,
    ...over,
  }
}

describe('pairWarnings', () => {
  it('mismo lugar, mismo día, sin lectura de la IA: sin avisos', () => {
    expect(pairWarnings(ev({}), ev({ id: uid(2), start_date: saltaWallClockToUtcISO('2026-10-30T23:00:00') }))).toEqual([])
  })

  it('el caso del Halloween: mismo venue_id, pero el flyer de uno decía otro lugar y otro día', () => {
    const convenciones = ev({ ai_metadata: { extracted_data: { venue_name: 'Centro de Convenciones de Salta' } } })
    const liveFresh = ev({
      id: uid(2),
      status: 'DRAFT',
      start_date: saltaWallClockToUtcISO('2026-10-31T00:00:00'),
      ai_metadata: { extracted_data: { venue_name: 'San Lorenzo Chico' } },
    })
    const w = pairWarnings(convenciones, liveFresh)
    expect(w.map((x) => x.kind)).toEqual(['venue_ai', 'day'])
    expect(w[0].text).toBe('Lugares distintos según el flyer: Centro de Convenciones de Salta vs San Lorenzo Chico')
    expect(w[1].text).toBe('Días distintos: 30/10 vs 31/10')
  })

  it('lecturas de la IA equivalentes (una contiene a la otra, sin tildes ni "de"/"Salta") no avisan', () => {
    const a = ev({ ai_metadata: { extracted_data: { venue_name: 'Centro de Convenciones Salta' } } })
    const b = ev({ id: uid(2), ai_metadata: { extracted_data: { venue_name: 'CENTRO DE CONVENCIONES' } } })
    expect(pairWarnings(a, b)).toEqual([])
  })

  it('dos venue_id distintos (hoy no forman par, pero si algún día) avisan con los nombres', () => {
    const w = pairWarnings(ev({}), ev({ id: uid(2), venue_id: 'venue-live', venue: { name: 'Live Fresh' } }))
    expect(w).toEqual([{ kind: 'venue', text: 'Lugares distintos: Centro de Convenciones Salta vs Live Fresh' }])
  })

  it('aiVenueName ignora metadatos raros', () => {
    expect(aiVenueName({ ai_metadata: null })).toBeNull()
    expect(aiVenueName({ ai_metadata: [] })).toBeNull()
    expect(aiVenueName({ ai_metadata: { extracted_data: { venue_name: '  ' } } })).toBeNull()
    expect(aiVenueName({ ai_metadata: { extracted_data: { venue_name: ' Coco Club ' } } })).toBe('Coco Club')
  })
})

describe('unmergeEvent', () => {
  beforeEach(() => {
    state.role = 'ADMIN'
    state.rpc = { data: null, error: null }
    state.rpcCalls = []
    revalidatePath.mockClear()
  })

  it('llama a unmerge_event con el drop_id y arma el aviso', async () => {
    state.rpc = {
      data: { keep_id: uid(9), audit_found: false, previous_status: null, flyers_restored: 1, ticket_sources_removed: 0, favorites_moved: null },
      error: null,
    } satisfies RpcResult
    const res = await unmergeEvent(uid(2))
    expect(state.rpcCalls).toEqual([{ fn: 'unmerge_event', args: { drop_id: uid(2) } }])
    expect(res).toMatchObject({ success: true })
    expect('message' in res && res.message).toContain('fusión vieja sin registro')
    expect(revalidatePath).toHaveBeenCalledWith(`/evento/${uid(9)}`)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/revision')
  })

  it('los P0001 se muestran tal cual; el resto, genérico', async () => {
    state.rpc = { data: null, error: { code: 'P0001', message: 'Solo se deshace la fusión de un evento en borrador' } }
    expect(await unmergeEvent(uid(2))).toEqual({ error: 'Solo se deshace la fusión de un evento en borrador' })
    state.rpc = { data: null, error: { code: 'XX000', message: 'detalle interno de postgres' } }
    expect(await unmergeEvent(uid(2))).toEqual({ error: 'No se pudo deshacer la fusión. Intentá de nuevo' })
    state.rpc = { data: null, error: { code: '42501', message: 'No autorizado' } }
    expect(await unmergeEvent(uid(2))).toEqual({ error: 'No tenés permisos para deshacer fusiones' })
  })

  it('id inválido o sin rol admin: no llama a la base', async () => {
    expect(await unmergeEvent('no-es-uuid')).toEqual({ error: 'El id del evento no es válido' })
    state.role = 'USER'
    expect(await unmergeEvent(uid(2))).toEqual({ error: 'No tienes permisos de administrador' })
    expect(state.rpcCalls).toEqual([])
  })
})
