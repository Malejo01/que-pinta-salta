import { describe, expect, it, vi } from 'vitest'
import { MAX_MERGE_HOPS, findMergeRedirect, mergedIntoId, resolveMergeTarget } from '@/lib/events/merged'
import { createFakeEventsDb, type EventRow } from './fake-events-db'

const uid = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`
const ev = (n: number, over: EventRow = {}, mergedInto?: string): EventRow => ({
  id: uid(n),
  title: `Evento de Prueba ${n}`,
  status: 'PUBLISHED',
  ai_metadata: mergedInto ? { merged_into_event_id: mergedInto } : null,
  secret_field: `no-filtrar-${n}`,
  ...over,
})

describe('mergedIntoId', () => {
  it('devuelve el uuid si ai_metadata lo trae', () => {
    expect(mergedIntoId({ ai_metadata: { merged_into_event_id: uid(1) } })).toBe(uid(1))
  })
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['fila sin ai_metadata', {}],
    ['ai_metadata null', { ai_metadata: null }],
    ['ai_metadata string', { ai_metadata: 'x' }],
    ['ai_metadata array', { ai_metadata: [uid(1)] }],
    ['id vacío', { ai_metadata: { merged_into_event_id: '' } }],
    ['id no uuid', { ai_metadata: { merged_into_event_id: 'abc' } }],
    ['id numérico', { ai_metadata: { merged_into_event_id: 123 } }],
    ['id con inyección', { ai_metadata: { merged_into_event_id: `${uid(1)}"; drop table events;--` } }],
  ])('devuelve null: %s', (_n, row) => {
    expect(mergedIntoId(row as { ai_metadata?: unknown } | null | undefined)).toBeNull()
  })
})

describe('resolveMergeTarget', () => {
  it('evento no fusionado: es su propio destino, 0 saltos y sin consultas', async () => {
    const db = createFakeEventsDb([])
    const row = ev(1)
    const res = await resolveMergeTarget(db.client, row)
    expect(res).toEqual({ target: row, hops: 0 })
    expect(db.selects).toHaveLength(0)
  })

  it('un salto: devuelve el destino leyendo select(*) por id', async () => {
    const db = createFakeEventsDb([ev(2)])
    const res = await resolveMergeTarget(db.client, ev(1, { status: 'DRAFT' }, uid(2)))
    expect(res.hops).toBe(1)
    expect(res.target?.id).toBe(uid(2))
    expect(db.selects[0]).toEqual({ columns: '*', filters: [['id', uid(2)]] })
  })

  it('cadena de 2 saltos', async () => {
    const db = createFakeEventsDb([ev(2, { status: 'DRAFT' }, uid(3)), ev(3)])
    const res = await resolveMergeTarget(db.client, ev(1, { status: 'DRAFT' }, uid(2)))
    expect(res.hops).toBe(2)
    expect(res.target?.id).toBe(uid(3))
  })

  it('ciclo A -> B -> A: target null', async () => {
    const db = createFakeEventsDb([ev(1, {}, uid(2)), ev(2, {}, uid(1))])
    const res = await resolveMergeTarget(db.client, db.rows[0])
    expect(res.target).toBeNull()
  })

  it('autoreferencia: target null', async () => {
    const self = ev(1, {}, uid(1))
    const db = createFakeEventsDb([self])
    const res = await resolveMergeTarget(db.client, self)
    expect(res.target).toBeNull()
  })

  it('destino inexistente: target null', async () => {
    const db = createFakeEventsDb([])
    const res = await resolveMergeTarget(db.client, ev(1, {}, uid(99)))
    expect(res.target).toBeNull()
  })

  it('tope: una cadena de MAX_MERGE_HOPS saltos todavía resuelve', async () => {
    expect(MAX_MERGE_HOPS).toBe(5)
    // 1 -> 2 -> 3 -> 4 -> 5 -> 6 (5 saltos)
    const chain = [2, 3, 4, 5].map((n) => ev(n, {}, uid(n + 1)))
    const db = createFakeEventsDb([...chain, ev(6)])
    const res = await resolveMergeTarget(db.client, ev(1, {}, uid(2)))
    expect(res.target?.id).toBe(uid(6))
    expect(res.hops).toBe(5)
  })

  it('tope: una cadena de MAX_MERGE_HOPS + 1 saltos devuelve null', async () => {
    // 1 -> 2 -> ... -> 7 (6 saltos)
    const chain = [2, 3, 4, 5, 6].map((n) => ev(n, {}, uid(n + 1)))
    const db = createFakeEventsDb([...chain, ev(7)])
    const res = await resolveMergeTarget(db.client, ev(1, {}, uid(2)))
    expect(res.target).toBeNull()
    expect(res.hops).toBeLessThanOrEqual(MAX_MERGE_HOPS + 1)
  })
})

describe('findMergeRedirect', () => {
  it('lee solo ai_metadata del evento y devuelve solo el id del destino PUBLISHED', async () => {
    const db = createFakeEventsDb([
      ev(1, { status: 'DRAFT', title: 'Absorbido de Prueba' }, uid(2)),
      ev(2, { status: 'PUBLISHED', title: 'Destino de Prueba' }),
    ])
    const to = await findMergeRedirect(db.client, uid(1))
    expect(to).toBe(uid(2))
    expect(typeof to).toBe('string')
    expect(db.selects[0]).toEqual({ columns: 'ai_metadata', filters: [['id', uid(1)]] })
    for (const s of db.selects.slice(1)) expect(s.columns.replace(/\s/g, '')).toBe('id,status,ai_metadata')
  })

  it('cadena de 2 saltos hasta un PUBLISHED', async () => {
    const db = createFakeEventsDb([
      ev(1, { status: 'DRAFT' }, uid(2)),
      ev(2, { status: 'DRAFT' }, uid(3)),
      ev(3),
    ])
    expect(await findMergeRedirect(db.client, uid(1))).toBe(uid(3))
  })

  it.each(['DRAFT', 'PENDING', 'CANCELLED', 'PAST'])('destino %s: null', async (status) => {
    const db = createFakeEventsDb([ev(1, { status: 'DRAFT' }, uid(2)), ev(2, { status })])
    expect(await findMergeRedirect(db.client, uid(1))).toBeNull()
  })

  it('evento no fusionado: null', async () => {
    const db = createFakeEventsDb([ev(1, { status: 'DRAFT' })])
    expect(await findMergeRedirect(db.client, uid(1))).toBeNull()
  })

  it('evento inexistente: null', async () => {
    const db = createFakeEventsDb([])
    expect(await findMergeRedirect(db.client, uid(1))).toBeNull()
  })

  it('destino inexistente: null', async () => {
    const db = createFakeEventsDb([ev(1, { status: 'DRAFT' }, uid(9))])
    expect(await findMergeRedirect(db.client, uid(1))).toBeNull()
  })

  it('ciclo: null y termina', async () => {
    const db = createFakeEventsDb([ev(1, { status: 'DRAFT' }, uid(2)), ev(2, { status: 'DRAFT' }, uid(1))])
    expect(await findMergeRedirect(db.client, uid(1))).toBeNull()
  })

  it('más de MAX_MERGE_HOPS saltos: null', async () => {
    const chain = [1, 2, 3, 4, 5, 6].map((n) => ev(n, { status: 'DRAFT' }, uid(n + 1)))
    const db = createFakeEventsDb([...chain, ev(7)])
    expect(await findMergeRedirect(db.client, uid(1))).toBeNull()
  })

  it('no filtra campos de la fila destino', async () => {
    const db = createFakeEventsDb([ev(1, { status: 'DRAFT' }, uid(2)), ev(2)])
    const to = await findMergeRedirect(db.client, uid(1))
    expect(JSON.stringify(to)).not.toContain('no-filtrar')
  })

  it.each(['no-uuid', '', '123', `${uid(1)}"; drop table events;--`])(
    'id no uuid (%s): null sin consultar la base',
    async (bad) => {
      const db = createFakeEventsDb([ev(1, { status: 'DRAFT' }, uid(2)), ev(2)])
      const from = vi.fn(db.client.from)
      expect(await findMergeRedirect({ from }, bad)).toBeNull()
      expect(from).not.toHaveBeenCalled()
      expect(db.selects).toHaveLength(0)
    }
  )

  it('usa el cliente recibido', async () => {
    const db = createFakeEventsDb([ev(1, { status: 'DRAFT' }, uid(2)), ev(2)])
    const from = vi.fn(db.client.from)
    await findMergeRedirect({ from }, uid(1))
    expect(from).toHaveBeenCalledWith('events')
  })
})
