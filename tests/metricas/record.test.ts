import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordMetric } from '@/lib/metricas'

const ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('recordMetric', () => {
  it('llama a la RPC con los argumentos', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    await recordMetric({ rpc }, ID, 'click', 'hero')
    expect(rpc).toHaveBeenCalledWith('record_event_metric', { p_event_id: ID, p_kind: 'click', p_origin: 'hero' })
  })
  it('no lanza si la RPC devuelve error', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'no existe' } })
    await expect(recordMetric({ rpc }, ID, 'view', 'directo')).resolves.toBeUndefined()
  })
  it('no lanza si la RPC rechaza', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('red caída'))
    await expect(recordMetric({ rpc }, ID, 'view', 'directo')).resolves.toBeUndefined()
  })
})
