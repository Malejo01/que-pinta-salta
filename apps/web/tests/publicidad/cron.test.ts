import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createAdminClient = vi.fn()
const withJobRun = vi.fn()
const registrarOcupacionDelDia = vi.fn()
const proponerCicloDelMes = vi.fn()
const medirBajas = vi.fn()
const generarReportes = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))
vi.mock('@/lib/job-runs', () => ({
  withJobRun: (...a: unknown[]) => withJobRun(...a),
  jobTriggerFrom: () => 'test',
}))
vi.mock('@/lib/publicidad/ocupacion', () => ({
  registrarOcupacionDelDia: (...a: unknown[]) => registrarOcupacionDelDia(...a),
}))
vi.mock('@/lib/publicidad/ciclo', () => ({
  proponerCicloDelMes: (...a: unknown[]) => proponerCicloDelMes(...a),
}))
vi.mock('@/lib/publicidad/bajas', () => ({
  medirBajas: (...a: unknown[]) => medirBajas(...a),
}))
vi.mock('@/lib/publicidad/reportes', () => ({
  generarReportes: (...a: unknown[]) => generarReportes(...a),
}))

import { GET } from '@/app/api/cron/publicidad/route'

const URL_RUTA = 'http://localhost.test/api/cron/publicidad'
const SECRETO = 'secreto-falso-de-prueba'
const entorno = process.env.CRON_SECRET
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

const pasos = [registrarOcupacionDelDia, proponerCicloDelMes, medirBajas, generarReportes]

beforeEach(() => {
  for (const m of [createAdminClient, withJobRun, ...pasos]) m.mockReset()
  process.env.CRON_SECRET = SECRETO
  vi.spyOn(console, 'error').mockImplementation(() => {})
  withJobRun.mockImplementation(async (_job: string, _trigger: string, fn: () => Promise<unknown>) => fn())
  createAdminClient.mockReturnValue({ admin: true })
  registrarOcupacionDelDia.mockResolvedValue({})
  proponerCicloDelMes.mockResolvedValue('ya-existia')
  medirBajas.mockResolvedValue({ medidas: 0, pausado: false, fallidas: 0 })
  generarReportes.mockResolvedValue({ creados: 0 })
})

afterEach(() => {
  vi.restoreAllMocks()
  if (entorno === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = entorno
})

function nada() {
  expect(withJobRun).not.toHaveBeenCalled()
  expect(createAdminClient).not.toHaveBeenCalled()
  for (const p of pasos) expect(p).not.toHaveBeenCalled()
}

const headers = { authorization: `Bearer ${SECRETO}` }
const correr = () => GET(new Request(URL_RUTA, { headers }))

describe('GET /api/cron/publicidad: autenticación', () => {
  it('sin header: 401 y no toca la base', async () => {
    expect((await GET(new Request(URL_RUTA))).status).toBe(401)
    nada()
  })
  it('con otro secreto: 401', async () => {
    expect((await GET(new Request(URL_RUTA, { headers: { authorization: 'Bearer otro-secreto' } }))).status).toBe(401)
    nada()
  })
  it('el secreto por query string no se acepta', async () => {
    expect((await GET(new Request(`${URL_RUTA}?secret=${SECRETO}`))).status).toBe(401)
    nada()
  })
  it('falla cerrado: sin CRON_SECRET rechaza incluso "Bearer "', async () => {
    delete process.env.CRON_SECRET
    expect((await GET(new Request(URL_RUTA, { headers: { authorization: 'Bearer ' } }))).status).toBe(401)
    nada()
  })
})

describe('GET /api/cron/publicidad: con el secreto', () => {
  it('registra la corrida como "publicidad" y corre los cuatro pasos, con el cliente admin, la hora y el fetch', async () => {
    const res = await correr()
    expect(res.status).toBe(200)
    expect(withJobRun.mock.calls[0][0]).toBe('publicidad')
    for (const p of pasos) expect(p).toHaveBeenCalledTimes(1)
    expect(registrarOcupacionDelDia.mock.calls[0][0]).toEqual({ admin: true })
    expect(registrarOcupacionDelDia.mock.calls[0][1]).toBeInstanceOf(Date)
    expect(proponerCicloDelMes.mock.calls[0][1]).toMatchObject({ fetch })
    expect(proponerCicloDelMes.mock.calls[0][1].ahora).toBeInstanceOf(Date)
    expect(medirBajas.mock.calls[0][1]).toBeInstanceOf(Date)
    expect(generarReportes.mock.calls[0][1]).toBeInstanceOf(Date)
    expect(await res.json()).toMatchObject({ status: 'SUCCESS', ocupacion: 'ok', ciclo: 'ya-existia', bajasMedidas: 0, pausado: false, reportes: 0 })
  })

  it('los pasos corren en orden: ocupación, ciclo, bajas, reportes', async () => {
    await correr()
    const orden = pasos.map((p) => p.mock.invocationCallOrder[0])
    expect(orden).toEqual([...orden].sort((a, b) => a - b))
  })

  it('si un paso lanza, los otros corren igual y queda PARTIAL', async () => {
    proponerCicloDelMes.mockRejectedValue(new Error('ciclo: boom'))
    medirBajas.mockResolvedValue({ medidas: 2, pausado: true, fallidas: 0 })
    generarReportes.mockResolvedValue({ creados: 3 })
    const res = await correr()
    for (const p of pasos) expect(p).toHaveBeenCalledTimes(1)
    expect(await res.json()).toMatchObject({ status: 'PARTIAL', ciclo: 'error', bajasMedidas: 2, pausado: true, reportes: 3 })
  })

  it.each([
    ['la ocupación', registrarOcupacionDelDia],
    ['las bajas', medirBajas],
    ['los reportes', generarReportes],
  ])('si falla %s: PARTIAL y los demás corren', async (_n, paso) => {
    paso.mockRejectedValue(new Error('x'))
    const res = await correr()
    for (const p of pasos) expect(p).toHaveBeenCalledTimes(1)
    expect((await res.json()).status).toBe('PARTIAL')
  })

  it('si fallan los cuatro: FAILED', async () => {
    for (const p of pasos) p.mockRejectedValue(new Error('x'))
    expect((await (await correr()).json()).status).toBe('FAILED')
  })

  it('sin tipo de cambio: PARTIAL (se reintenta mañana)', async () => {
    proponerCicloDelMes.mockResolvedValue('sin-tipo-de-cambio')
    expect(await (await correr()).json()).toMatchObject({ status: 'PARTIAL', ciclo: 'sin-tipo-de-cambio' })
  })

  it('campañas de bajas con error: PARTIAL', async () => {
    medirBajas.mockResolvedValue({ medidas: 1, pausado: false, fallidas: 1 })
    expect((await (await correr()).json()).status).toBe('PARTIAL')
  })

  it('el ciclo creado se informa como "creado"', async () => {
    proponerCicloDelMes.mockResolvedValue('creado')
    expect(await (await correr()).json()).toMatchObject({ status: 'SUCCESS', ciclo: 'creado' })
  })

  it('la respuesta y los details no traen uuids ni el texto crudo del error; el detalle va a errors', async () => {
    const crudo = 'duplicate key value violates unique constraint 11111111-2222-4333-8444-555555555555 secreto-de-la-base'
    proponerCicloDelMes.mockRejectedValue(new Error(crudo))
    const res = await correr()
    const cuerpo = JSON.stringify(await res.clone().json())
    expect(cuerpo).not.toMatch(UUID)
    expect(cuerpo).not.toContain('secreto-de-la-base')
    expect(cuerpo).not.toContain('duplicate key')

    const toOutcome = withJobRun.mock.calls[0][3] as (r: unknown) => { details: Record<string, unknown>; errors: string[]; itemsFailed: number }
    const resultado = await (withJobRun.mock.results[0].value as Promise<unknown>)
    const outcome = toOutcome(resultado)
    expect(Object.keys(outcome.details).sort()).toEqual(['bajasMedidas', 'ciclo', 'ocupacion', 'pausado', 'reportes'])
    expect(JSON.stringify(outcome.details)).not.toMatch(UUID)
    expect(outcome.itemsFailed).toBe(1)
    expect(outcome.errors.join(' ')).toContain('ciclo')
  })
})
