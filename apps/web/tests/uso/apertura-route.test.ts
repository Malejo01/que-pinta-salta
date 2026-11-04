// R-1 · `POST /api/app/apertura` (Q5-13) de punta a punta, con la base de
// mentira: hasta hoy solo había un detector que leía el orden de las guardas
// en el fuente (tests/uso/panel.test.ts). Acá se le pegan pedidos de verdad
// (`Request`) y se mira qué llega a la RPC. Cada test importa la ruta de nuevo
// (vi.resetModules) para empezar con los limitadores en memoria vacíos.
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { userAgentApp } from '@qps/core/metricas/vista-app'

const createAdminClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
  createClient: vi.fn(),
}))

const ID = '0123456789abcdef0123456789abcdef'
// El mismo User-Agent que arma la app (apps/mobile/lib/apertura.ts usa userAgentApp de core).
const UA_APP = userAgentApp('1.0.9')
// Martes 3/11/2026 23:30 de Salta = miércoles 4/11 02:30 UTC.
const AHORA = new Date('2026-11-04T02:30:00Z')

type Llamada = { fn: string; args: Record<string, unknown> }

function crearAdmin(resultado: { error: unknown } | 'tira' = { error: null }) {
  const llamadas: Llamada[] = []
  const cliente = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      llamadas.push({ fn, args })
      if (resultado === 'tira') throw new Error('se cayó la red con ' + JSON.stringify(args))
      return { data: null, ...resultado }
    }),
    from: vi.fn(() => {
      throw new Error('la ruta no debería usar from()')
    }),
  }
  createAdminClient.mockReturnValue(cliente)
  return { cliente, llamadas }
}

function pedido(cuerpo: unknown, opciones: { ua?: string | null; tipo?: string; ip?: string; crudo?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': opciones.tipo ?? 'application/json', 'x-forwarded-for': opciones.ip ?? '200.1.1.1' }
  const ua = opciones.ua === undefined ? UA_APP : opciones.ua
  if (ua !== null) headers['user-agent'] = ua
  return new Request('http://localhost:3000/api/app/apertura', {
    method: 'POST',
    headers,
    body: opciones.crudo ?? JSON.stringify(cuerpo),
  })
}

async function ruta() {
  vi.resetModules()
  return (await import('@/app/api/app/apertura/route')).POST
}

let errores: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  createAdminClient.mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  errores = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('POST /api/app/apertura: lo que llega a la base', () => {
  it('una apertura válida: 200 {ok:true}, sin caché, y la RPC recibe solo el día de Salta y los dos hashes', async () => {
    const { llamadas } = crearAdmin()
    const POST = await ruta()
    const r = await POST(pedido({ idMetricas: ID, plataforma: 'android', version: '1.0.9', conCuenta: true }))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0]!.fn).toBe('registrar_apertura_app')
    expect(llamadas[0]!.args).toEqual({
      p_day: '2026-11-03',
      p_hash_dia: createHash('sha256').update(`${ID}:2026-11-03`).digest('hex'),
      p_hash_semana: createHash('sha256').update(`${ID}:2026-W45`).digest('hex'),
      p_plataforma: 'android',
      p_version: '1.0.9',
      p_con_cuenta: true,
    })
    // El id crudo nunca sale del handler.
    expect(JSON.stringify(llamadas)).not.toContain(ID)
  })

  it('el cuerpo que manda la app sin versión (version: null, UA «QuePintaSaltaApp/0»): p_version null y p_con_cuenta como venga', async () => {
    const { llamadas } = crearAdmin()
    const POST = await ruta()
    const r = await POST(pedido({ idMetricas: ID, plataforma: 'android', version: null, conCuenta: false }, { ua: userAgentApp('') }))
    expect(r.status).toBe(200)
    expect(llamadas[0]!.args).toMatchObject({ p_version: null, p_con_cuenta: false })
  })

  it('sin versión ni conCuenta: p_version null (la función no tiene defaults) y p_con_cuenta false', async () => {
    const { llamadas } = crearAdmin()
    const POST = await ruta()
    const r = await POST(pedido({ idMetricas: ID, plataforma: 'ios' }))
    expect(r.status).toBe(200)
    expect(llamadas[0]!.args).toMatchObject({ p_plataforma: 'ios', p_version: null, p_con_cuenta: false })
    expect(Object.keys(llamadas[0]!.args)).toContain('p_version')
  })
})

describe('POST /api/app/apertura: las guardas cortan antes de la base', () => {
  it.each([
    ['sin User-Agent', null],
    ['un navegador', 'Mozilla/5.0 (Linux; Android 14)'],
    ['la app en el medio del UA (no al principio)', 'Mozilla/5.0 QuePintaSaltaApp/1.0.9'],
  ])('%s: 400 y la base ni se crea', async (_n, ua) => {
    crearAdmin()
    const POST = await ruta()
    const r = await POST(pedido({ idMetricas: ID, plataforma: 'android' }, { ua }))
    expect(r.status).toBe(400)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('Content-Type que no es JSON: 415', async () => {
    crearAdmin()
    const POST = await ruta()
    const r = await POST(pedido({ idMetricas: ID, plataforma: 'android' }, { tipo: 'text/plain' }))
    expect(r.status).toBe(415)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('cuerpo de más de 512 bytes: 413', async () => {
    crearAdmin()
    const POST = await ruta()
    const r = await POST(pedido({ idMetricas: ID, plataforma: 'android', relleno: 'x'.repeat(600) }))
    expect(r.status).toBe(413)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('JSON roto: 400', async () => {
    crearAdmin()
    const POST = await ruta()
    const r = await POST(pedido(null, { crudo: '{"idMetricas":' }))
    expect(r.status).toBe(400)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it.each([
    ['un device_id con guiones', { idMetricas: '12345678-1234-4234-8234-123456789012', plataforma: 'android' }],
    ['plataforma web', { idMetricas: ID, plataforma: 'web' }],
    ['un campo de más (un email)', { idMetricas: ID, plataforma: 'android', email: 'persona@example.com' }],
  ])('formato inválido (%s): 400 genérico, sin decir qué campo', async (_n, cuerpo) => {
    crearAdmin()
    const POST = await ruta()
    const r = await POST(pedido(cuerpo))
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: 'Pedido inválido' })
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})

describe('POST /api/app/apertura: límites', () => {
  it('el mismo id: 12 por hora; el 13.º es 429 con Retry-After y no llega a la base', async () => {
    const { llamadas } = crearAdmin()
    const POST = await ruta()
    for (let i = 0; i < 12; i++) {
      expect((await POST(pedido({ idMetricas: ID, plataforma: 'android' }, { ip: `10.0.0.${i}` }))).status).toBe(200)
    }
    const r = await POST(pedido({ idMetricas: ID, plataforma: 'android' }, { ip: '10.0.0.99' }))
    expect(r.status).toBe(429)
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(llamadas).toHaveLength(12)
    // Otro id, desde otra IP, sigue pasando.
    expect((await POST(pedido({ idMetricas: 'f'.repeat(32), plataforma: 'android' }, { ip: '10.0.1.1' }))).status).toBe(200)
  })

  it('la misma IP: 120 por hora (con ids distintos); el 121.º es 429', async () => {
    const { llamadas } = crearAdmin()
    const POST = await ruta()
    for (let i = 0; i < 120; i++) {
      const id = i.toString(16).padStart(32, '0')
      expect((await POST(pedido({ idMetricas: id, plataforma: 'android' }))).status).toBe(200)
    }
    const r = await POST(pedido({ idMetricas: 'a'.repeat(32), plataforma: 'android' }))
    expect(r.status).toBe(429)
    expect(llamadas).toHaveLength(120)
  })

  it('a la hora se libera', async () => {
    crearAdmin()
    const POST = await ruta()
    for (let i = 0; i < 12; i++) await POST(pedido({ idMetricas: ID, plataforma: 'android' }, { ip: `10.0.0.${i}` }))
    expect((await POST(pedido({ idMetricas: ID, plataforma: 'android' }, { ip: '10.0.2.1' }))).status).toBe(429)
    vi.setSystemTime(new Date(AHORA.getTime() + 60 * 60 * 1000 + 1))
    expect((await POST(pedido({ idMetricas: ID, plataforma: 'android' }, { ip: '10.0.2.2' }))).status).toBe(200)
  })
})

describe('POST /api/app/apertura: errores de la base', () => {
  it('la RPC devuelve error: 500 genérico y se loguea solo el código', async () => {
    crearAdmin({ error: { code: '42501', message: `permiso denegado para ${ID}` } })
    const POST = await ruta()
    const r = await POST(pedido({ idMetricas: ID, plataforma: 'android' }))
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'No se pudo completar' })
    expect(errores).toHaveBeenCalledWith('[app/apertura] la RPC falló', { code: '42501' })
    expect(JSON.stringify(errores.mock.calls)).not.toContain(ID)
  })

  it('la RPC tira: 500 y el log no lleva el error (que podría traer el cuerpo)', async () => {
    crearAdmin('tira')
    const POST = await ruta()
    const r = await POST(pedido({ idMetricas: ID, plataforma: 'android' }))
    expect(r.status).toBe(500)
    expect(errores).toHaveBeenCalledWith('[app/apertura] error inesperado')
    expect(JSON.stringify(errores.mock.calls)).not.toContain(ID)
  })

  it('createAdminClient tira (falta la service key): 500, no explota', async () => {
    createAdminClient.mockImplementation(() => {
      throw new Error('falta SUPABASE_SERVICE_ROLE_KEY')
    })
    const POST = await ruta()
    const r = await POST(pedido({ idMetricas: ID, plataforma: 'android' }))
    expect(r.status).toBe(500)
  })
})
