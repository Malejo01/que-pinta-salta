// Sin red ni base. mergeDuplicatePair/dismissDuplicatePair/restoreDuplicatePair
// (lib/admin/duplicate-actions.ts, QPS-061 / Ronda 19) usan SIEMPRE el cliente del
// usuario (createClient() de '@/lib/supabase/server'), nunca el de service role:
// sesión (auth.getUser), rol en `profiles`, y después rpc('merge_events', ...) o
// insert/delete sobre `duplicate_dismissals`. Se mockea next/cache (revalidatePath)
// y el módulo completo de lib/supabase/server (createClient + createAdminClient,
// esta última para poder comprobar que nunca se usa: si se llama, explota).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

const createClient = vi.fn()
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- la firma variádica es la que permite el spread de más abajo
const createAdminClient = vi.fn((..._args: unknown[]) => {
  throw new Error('duplicate-actions.ts no debería usar el cliente admin')
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))

import { dismissDuplicatePair, mergeDuplicatePair, restoreDuplicatePair } from '@/lib/admin/duplicate-actions'
import { findDuplicateCandidates, pairKey, type DuplicateCandidateEvent } from '@/lib/events/duplicate-candidates'

type Row = Record<string, unknown>
type RpcResult = { data: unknown; error: { code?: string; message: string } | null }

const ADMIN_USER = { id: 'admin-de-prueba' }
const USER_USER = { id: 'usuario-de-prueba' }

const uid = (n: number) => `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, '0')}`
const EVENT_A = uid(1)
const EVENT_B = uid(2)

/**
 * Cliente falso: auth.getUser() + profiles.role (sesión y rol), rpc() (merge_events)
 * y duplicate_dismissals en memoria (insert/delete, con el CHECK event_a < event_b
 * simulado por quien llama con el par ya ordenado, como hace orderPair() en el código
 * bajo prueba).
 */
function fakeSupabase(opts: {
  user?: { id: string } | null
  role?: string | null
  rpcResult?: RpcResult
  dismissedRows?: Array<{ event_a: string; event_b: string }>
  insertError?: { code?: string; message: string } | null
}) {
  const {
    user = ADMIN_USER,
    role = 'ADMIN',
    rpcResult = { data: { ok: true }, error: null },
    insertError = null,
  } = opts
  const dismissedRows: Array<{ event_a: string; event_b: string }> = (opts.dismissedRows ?? []).map((r) => ({ ...r }))
  const rpcCalls: Array<{ fn: string; args: unknown }> = []
  const inserts: Row[] = []
  const deletes: Array<{ event_a: string; event_b: string }> = []

  const client = {
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: async (fn: string, args: unknown): Promise<RpcResult> => {
      rpcCalls.push({ fn, args })
      return rpcResult
    },
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: role !== null ? { role } : null }),
            }),
          }),
        }
      }
      if (table === 'duplicate_dismissals') {
        let mode: 'insert' | 'delete' = 'insert'
        let payload: Row = {}
        const eqFilters: Array<[string, unknown]> = []
        const b: Record<string, unknown> = {}
        b.insert = (p: Row) => {
          mode = 'insert'
          payload = p
          return b
        }
        b.delete = () => {
          mode = 'delete'
          return b
        }
        b.eq = (col: string, val: unknown) => {
          eqFilters.push([col, val])
          return b
        }
        b.select = () => b
        b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          if (mode === 'insert') {
            inserts.push(payload)
            if (!insertError) {
              dismissedRows.push({ event_a: payload.event_a as string, event_b: payload.event_b as string })
            }
            return Promise.resolve({ error: insertError }).then(resolve, reject)
          }
          const matched = dismissedRows.filter((r) => eqFilters.every(([c, v]) => (r as Row)[c] === v))
          for (const m of matched) {
            const idx = dismissedRows.indexOf(m)
            if (idx >= 0) dismissedRows.splice(idx, 1)
          }
          deletes.push(...matched)
          return Promise.resolve({ data: matched, error: null }).then(resolve, reject)
        }
        return b
      }
      throw new Error('tabla inesperada en el cliente falso: ' + table)
    },
  }

  return { client, rpcCalls, inserts, deletes, dismissedRows }
}

function setup(opts: Parameters<typeof fakeSupabase>[0] = {}) {
  const db = fakeSupabase(opts)
  createClient.mockResolvedValue(db.client)
  return db
}

beforeEach(() => {
  createClient.mockReset()
  createAdminClient.mockClear()
  revalidatePath.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('mergeDuplicatePair', () => {
  it('sin sesión: error, no llama a la rpc', async () => {
    const db = setup({ user: null })
    const res = await mergeDuplicatePair(EVENT_A, EVENT_B)
    expect(res).toEqual({ error: 'No autenticado' })
    expect(db.rpcCalls).toHaveLength(0)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('autenticado sin rol ADMIN: error, no llama a la rpc', async () => {
    const db = setup({ user: USER_USER, role: 'USER' })
    const res = await mergeDuplicatePair(EVENT_A, EVENT_B)
    expect(res).toEqual({ error: 'No tienes permisos de administrador' })
    expect(db.rpcCalls).toHaveLength(0)
  })

  it('uuid inválido: error, ni siquiera consulta la sesión', async () => {
    const res = await mergeDuplicatePair('no-es-uuid', EVENT_B)
    expect(res).toEqual({ error: 'Los ids de los eventos a fusionar no son válidos' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('mismo id para keep y drop: error', async () => {
    const res = await mergeDuplicatePair(EVENT_A, EVENT_A)
    expect(res).toEqual({ error: 'Los ids de los eventos a fusionar no son válidos' })
  })

  it('admin: llama rpc("merge_events", {keep_id, drop_id}) con el cliente del usuario y revalida las 4 rutas', async () => {
    const db = setup({})
    const res = await mergeDuplicatePair(EVENT_A, EVENT_B)
    expect(res).toEqual({ success: true, result: { ok: true } })
    expect(db.rpcCalls).toEqual([{ fn: 'merge_events', args: { keep_id: EVENT_A, drop_id: EVENT_B } }])
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledTimes(4)
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith(`/evento/${EVENT_A}`)
    expect(revalidatePath).toHaveBeenCalledWith(`/evento/${EVENT_B}`)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/duplicados')
  })

  it('error P0001 de la rpc: se muestra tal cual', async () => {
    setup({
      rpcResult: {
        data: null,
        error: { code: 'P0001', message: 'El evento que queda ya fue fusionado hacia otro evento' },
      },
    })
    const res = await mergeDuplicatePair(EVENT_A, EVENT_B)
    expect(res).toEqual({ error: 'El evento que queda ya fue fusionado hacia otro evento' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('error inesperado de la base: mensaje genérico, nunca el texto crudo', async () => {
    setup({
      rpcResult: { data: null, error: { code: 'XX000', message: 'detalle interno de postgres que no debería salir' } },
    })
    const res = await mergeDuplicatePair(EVENT_A, EVENT_B)
    expect(res).toEqual({ error: 'No se pudo fusionar el evento. Intentá de nuevo' })
    expect(JSON.stringify(res)).not.toContain('detalle interno')
  })
})

describe('dismissDuplicatePair', () => {
  it('sin sesión: error, no inserta', async () => {
    const db = setup({ user: null })
    const res = await dismissDuplicatePair(EVENT_A, EVENT_B)
    expect(res).toEqual({ error: 'No autenticado' })
    expect(db.inserts).toHaveLength(0)
  })

  it('autenticado sin rol ADMIN: error, no inserta', async () => {
    const db = setup({ user: USER_USER, role: 'USER' })
    const res = await dismissDuplicatePair(EVENT_A, EVENT_B)
    expect(res).toEqual({ error: 'No tienes permisos de administrador' })
    expect(db.inserts).toHaveLength(0)
  })

  it('uuid inválido: error, no inserta', async () => {
    const res = await dismissDuplicatePair('no-es-uuid', EVENT_B)
    expect(res).toEqual({ error: 'Los ids del par no son válidos' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('admin: ordena el par antes de insertar (event_a < event_b) y revalida solo /admin/duplicados', async () => {
    // Se pasa (B, A) a propósito: tiene que quedar (A, B) en la base por el CHECK event_a < event_b.
    const db = setup({})
    const res = await dismissDuplicatePair(EVENT_B, EVENT_A)
    expect(res).toEqual({ success: true })
    expect(db.inserts).toEqual([{ event_a: EVENT_A, event_b: EVENT_B }])
    expect(revalidatePath).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/duplicados')
  })

  it('PK duplicada (23505, el par ya estaba marcado): se trata como éxito', async () => {
    setup({ insertError: { code: '23505', message: 'duplicate key value violates unique constraint' } })
    const res = await dismissDuplicatePair(EVENT_A, EVENT_B)
    expect(res).toEqual({ success: true })
  })

  it('otro error de inserción: falla con mensaje genérico', async () => {
    setup({ insertError: { code: '23503', message: 'foreign key violation' } })
    const res = await dismissDuplicatePair(EVENT_A, EVENT_B)
    expect(res).toEqual({ error: 'No se pudo marcar el par como distinto. Intentá de nuevo' })
  })
})

describe('restoreDuplicatePair ("Volver a revisar")', () => {
  it('sin sesión: error, no borra', async () => {
    const db = setup({ user: null, dismissedRows: [{ event_a: EVENT_A, event_b: EVENT_B }] })
    const res = await restoreDuplicatePair(EVENT_A, EVENT_B)
    expect(res).toEqual({ error: 'No autenticado' })
    expect(db.deletes).toHaveLength(0)
  })

  it('autenticado sin rol ADMIN: error, no borra', async () => {
    const db = setup({ user: USER_USER, role: 'USER', dismissedRows: [{ event_a: EVENT_A, event_b: EVENT_B }] })
    const res = await restoreDuplicatePair(EVENT_A, EVENT_B)
    expect(res).toEqual({ error: 'No tienes permisos de administrador' })
    expect(db.deletes).toHaveLength(0)
  })

  it('uuid inválido: error, no borra', async () => {
    const res = await restoreDuplicatePair('no-es-uuid', EVENT_B)
    expect(res).toEqual({ error: 'Los ids del par no son válidos' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('admin: ordena el par aunque llegue (b, a) y revalida solo /admin/duplicados', async () => {
    const db = setup({ dismissedRows: [{ event_a: EVENT_A, event_b: EVENT_B }] })
    const res = await restoreDuplicatePair(EVENT_B, EVENT_A)
    expect(res).toEqual({ success: true })
    expect(db.deletes).toEqual([{ event_a: EVENT_A, event_b: EVENT_B }])
    expect(db.dismissedRows).toHaveLength(0)
    expect(revalidatePath).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/duplicados')
  })

  it('0 filas borradas (el par ya no estaba marcado): aviso, no error', async () => {
    const db = setup({ dismissedRows: [] })
    const res = await restoreDuplicatePair(EVENT_A, EVENT_B)
    expect(res).toEqual({ success: true, warning: 'Ese par ya no estaba marcado' })
    expect(db.deletes).toHaveLength(0)
  })
})

describe('ida y vuelta: dismiss + restore contra findDuplicateCandidates', () => {
  it('marcar un par lo saca de la lista; "Volver a revisar" lo vuelve a traer', async () => {
    const a: DuplicateCandidateEvent = {
      id: EVENT_A,
      title: 'Show de Prueba A',
      start_date: '2026-12-01T20:00:00Z',
      status: 'PUBLISHED',
      venue_id: 'venue-de-prueba',
    }
    const b: DuplicateCandidateEvent = {
      id: EVENT_B,
      title: 'Show de Prueba B',
      start_date: '2026-12-01T21:00:00Z',
      status: 'PUBLISHED',
      venue_id: 'venue-de-prueba',
    }

    const db = setup({})
    const dismissedSetFromDb = () => new Set(db.dismissedRows.map((r) => pairKey(r.event_a, r.event_b)))

    // Al principio nada está descartado: el par aparece.
    expect(findDuplicateCandidates([a, b], { dismissed: dismissedSetFromDb() })).toHaveLength(1)

    expect(await dismissDuplicatePair(EVENT_A, EVENT_B)).toEqual({ success: true })
    expect(findDuplicateCandidates([a, b], { dismissed: dismissedSetFromDb() })).toHaveLength(0)

    // Orden invertido a propósito: restoreDuplicatePair tiene que ordenar igual que dismiss.
    expect(await restoreDuplicatePair(EVENT_B, EVENT_A)).toEqual({ success: true })
    expect(findDuplicateCandidates([a, b], { dismissed: dismissedSetFromDb() })).toHaveLength(1)
  })
})
