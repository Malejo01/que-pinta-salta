import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createAdminClient = vi.fn()
const withJobRun = vi.fn()
const generarRecurrentes = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))
vi.mock('@/lib/job-runs', () => ({
  withJobRun: (...a: unknown[]) => withJobRun(...a),
  jobTriggerFrom: () => 'test',
}))
vi.mock('@/lib/recurrentes/generar', () => ({
  generarRecurrentes: (...a: unknown[]) => generarRecurrentes(...a),
}))

import { GET } from '@/app/api/cron/recurrentes/route'

const URL_RUTA = 'http://localhost.test/api/cron/recurrentes'
const SECRETO = 'secreto-falso-de-prueba'
const entorno = process.env.CRON_SECRET

beforeEach(() => {
  createAdminClient.mockReset()
  withJobRun.mockReset()
  generarRecurrentes.mockReset()
  process.env.CRON_SECRET = SECRETO
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  if (entorno === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = entorno
})

function nada() {
  expect(withJobRun).not.toHaveBeenCalled()
  expect(createAdminClient).not.toHaveBeenCalled()
  expect(generarRecurrentes).not.toHaveBeenCalled()
}

describe('GET /api/cron/recurrentes: autenticación', () => {
  it('sin header: 401 y no toca la base', async () => {
    const res = await GET(new Request(URL_RUTA))
    expect(res.status).toBe(401)
    nada()
  })
  it('Bearer incorrecto: 401', async () => {
    const res = await GET(new Request(URL_RUTA, { headers: { authorization: 'Bearer otro-secreto' } }))
    expect(res.status).toBe(401)
    nada()
  })
  it('esquema distinto de Bearer: 401', async () => {
    const res = await GET(new Request(URL_RUTA, { headers: { authorization: `Basic ${SECRETO}` } }))
    expect(res.status).toBe(401)
    nada()
  })
  it('secreto por query string no se acepta', async () => {
    const res = await GET(new Request(`${URL_RUTA}?secret=${SECRETO}`))
    expect(res.status).toBe(401)
    nada()
  })
  it('falla cerrado: CRON_SECRET sin definir rechaza incluso "Bearer "', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(new Request(URL_RUTA, { headers: { authorization: 'Bearer ' } }))
    expect(res.status).toBe(401)
    nada()
  })
  it('falla cerrado: CRON_SECRET vacío', async () => {
    process.env.CRON_SECRET = '   '
    const res = await GET(new Request(URL_RUTA, { headers: { authorization: 'Bearer ' } }))
    expect(res.status).toBe(401)
    nada()
  })
})

describe('GET /api/cron/recurrentes: con Bearer correcto', () => {
  const headers = { authorization: `Bearer ${SECRETO}` }
  const correr = (resultado: unknown) => {
    withJobRun.mockImplementation(async (_job: string, _trigger: string, fn: () => Promise<unknown>) => fn())
    createAdminClient.mockReturnValue({})
    generarRecurrentes.mockResolvedValue(resultado)
    return GET(new Request(URL_RUTA, { headers }))
  }

  it('registra la corrida como "recurrentes" y devuelve SUCCESS', async () => {
    const res = await correr({
      items: [{ titulo: 'Item de Prueba', tipo: 'pena', insertadas: 3, yaExistian: 0 }],
      insertadas: 3,
      conError: 0,
    })
    expect(res.status).toBe(200)
    expect(withJobRun.mock.calls[0][0]).toBe('recurrentes')
    const body = await res.json()
    expect(body).toMatchObject({ status: 'SUCCESS', insertadas: 3, conError: 0 })
  })

  it('algunos ítems con error: PARTIAL', async () => {
    const res = await correr({
      items: [
        { titulo: 'Ok de Prueba', tipo: 'pena', insertadas: 2, yaExistian: 0 },
        { titulo: 'Roto de Prueba', tipo: 'museo', insertadas: 0, yaExistian: 0, error: 'no resuelve' },
      ],
      insertadas: 2,
      conError: 1,
    })
    expect((await res.json()).status).toBe('PARTIAL')
  })

  it('todos los ítems con error: FAILED', async () => {
    const res = await correr({
      items: [{ titulo: 'Roto de Prueba', tipo: 'museo', insertadas: 0, yaExistian: 0, error: 'x' }],
      insertadas: 0,
      conError: 1,
    })
    expect((await res.json()).status).toBe('FAILED')
  })

  it('toOutcome (4.º argumento de withJobRun) informa conteos y errores', async () => {
    await correr({
      items: [
        { titulo: 'Ok de Prueba', tipo: 'pena', insertadas: 2, yaExistian: 1 },
        { titulo: 'Roto de Prueba', tipo: 'museo', insertadas: 0, yaExistian: 0, error: 'no resuelve' },
      ],
      insertadas: 2,
      conError: 1,
    })
    const toOutcome = withJobRun.mock.calls[0][3] as (r: unknown) => any
    const outcome = toOutcome(await generarRecurrentes.mock.results[0].value)
    expect(outcome).toMatchObject({
      status: 'PARTIAL',
      itemsProcessed: 2,
      itemsFailed: 1,
      errors: ['Roto de Prueba: no resuelve'],
    })
    expect(outcome.details['Ok de Prueba']).toEqual({ insertadas: 2, yaExistian: 1 })
  })
})
