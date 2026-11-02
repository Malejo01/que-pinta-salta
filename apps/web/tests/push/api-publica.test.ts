// API pública de avisos sin sesión (R82 / Q4-2). Sin red ni base: se mockea
// '@/lib/supabase/server'. Cada test importa las rutas de nuevo
// (vi.resetModules) para empezar con los limitadores en memoria vacíos.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearLimitador, ipDeRequest } from '@/lib/push/limite'
import { esTokenExpoEstricto, validarPreferencias, validarRegistro } from '@/lib/push/validacion'
import { leerCuerpoJson } from '@/lib/push/cuerpo'

const createAdminClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
  createClient: vi.fn(),
}))

const TOKEN = 'ExponentPushToken[abcdEFGH1234secreto]'
const DEVICE = '0f8fad5b-d9cb-469f-a165-70867728950e'

type Llamada = { fn: string; args: Record<string, unknown> }

function crearAdmin(opts: { rpc?: { data: unknown; error: unknown }; fila?: unknown } = {}) {
  const llamadas: Llamada[] = []
  const filtros: Array<[string, unknown]> = []
  const cliente = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      llamadas.push({ fn, args })
      return opts.rpc ?? { data: true, error: null }
    }),
    from: vi.fn(() => {
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => {
          filtros.push([c, v])
          return q
        },
        maybeSingle: async () => ({
          data: opts.fila === undefined ? { user_id: null, avisos_equipo: true, avisos_patrocinados: false } : opts.fila,
          error: null,
        }),
      }
      return q
    }),
  }
  createAdminClient.mockReturnValue(cliente)
  return { cliente, llamadas, filtros }
}

function pedido(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '200.1.1.1', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function rutas() {
  vi.resetModules()
  const registrar = await import('@/app/api/push/registrar/route')
  const preferencias = await import('@/app/api/push/preferencias/route')
  return { registrar: registrar.POST, preferencias: preferencias.POST }
}

let errores: ReturnType<typeof vi.spyOn>
let logs: ReturnType<typeof vi.spyOn>
let avisos: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  createAdminClient.mockReset()
  errores = vi.spyOn(console, 'error').mockImplementation(() => {})
  logs = vi.spyOn(console, 'log').mockImplementation(() => {})
  avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  // Nunca el token ni el deviceId en ningún log.
  for (const espia of [errores, logs, avisos]) {
    const texto = JSON.stringify(espia.mock.calls)
    expect(texto).not.toContain('secreto')
    expect(texto).not.toContain(DEVICE)
  }
  vi.restoreAllMocks()
})

describe('validación', () => {
  it('acepta solo tokens de Expo estrictos', () => {
    expect(esTokenExpoEstricto(TOKEN)).toBe(true)
    for (const malo of [
      '',
      'ExponentPushToken[]',
      'ExponentPushToken[con espacio]',
      'ExpoPushToken[abc]',
      `ExponentPushToken[${'a'.repeat(190)}]`,
      'ExponentPushToken[a]b]',
      "ExponentPushToken[x'); drop table push_tokens;--]",
      123,
      null,
      ['ExponentPushToken[a]'],
    ]) {
      expect(esTokenExpoEstricto(malo), String(malo)).toBe(false)
    }
  })

  it('registro: plataforma, deviceId opcional pero uuid, idioma raro se ignora, extras se ignoran', () => {
    expect(validarRegistro({ token: TOKEN, plataforma: 'android' })).toEqual({
      ok: true,
      datos: { token: TOKEN, deviceId: null, plataforma: 'android', idioma: null },
    })
    expect(validarRegistro({ token: TOKEN, plataforma: 'ios', deviceId: DEVICE.toUpperCase(), idioma: 'es-AR', x: 1 })).toEqual({
      ok: true,
      datos: { token: TOKEN, deviceId: DEVICE, plataforma: 'ios', idioma: 'es-AR' },
    })
    expect(validarRegistro({ token: TOKEN, plataforma: 'android', idioma: '<script>' })).toMatchObject({ ok: true, datos: { idioma: null } })
    expect(validarRegistro({ token: TOKEN, plataforma: 'web' })).toEqual({ ok: false })
    expect(validarRegistro({ token: TOKEN, plataforma: 'android', deviceId: 'no-es-uuid' })).toEqual({ ok: false })
    expect(validarRegistro([TOKEN])).toEqual({ ok: false })
    expect(validarRegistro(null)).toEqual({ ok: false })
  })

  it('preferencias: exige deviceId y al menos un booleano', () => {
    expect(validarPreferencias({ token: TOKEN, deviceId: DEVICE, avisosEquipo: false })).toEqual({
      ok: true,
      datos: { token: TOKEN, deviceId: DEVICE, avisosEquipo: false, avisosPatrocinados: null },
    })
    expect(validarPreferencias({ token: TOKEN, deviceId: DEVICE })).toEqual({ ok: false })
    expect(validarPreferencias({ token: TOKEN, avisosEquipo: true })).toEqual({ ok: false })
    expect(validarPreferencias({ token: TOKEN, deviceId: DEVICE, avisosEquipo: 'true' })).toEqual({ ok: false })
    expect(validarPreferencias({ token: TOKEN, deviceId: DEVICE, avisosPatrocinados: 1 })).toEqual({ ok: false })
  })
})

describe('límite de tasa en memoria', () => {
  it('permite hasta max, bloquea el siguiente y libera al pasar la ventana', () => {
    const l = crearLimitador({ max: 2, ventanaMs: 1000 })
    expect(l.permitir('a', 0)).toEqual({ ok: true })
    expect(l.permitir('a', 10)).toEqual({ ok: true })
    expect(l.permitir('a', 20)).toEqual({ ok: false, reintentarEnS: 1 })
    expect(l.permitir('b', 20)).toEqual({ ok: true })
    expect(l.permitir('a', 1000)).toEqual({ ok: true })
  })

  it('no crece sin límite de claves', () => {
    const l = crearLimitador({ max: 1, ventanaMs: 60_000, maxClaves: 3 })
    for (let i = 0; i < 50; i++) l.permitir(`k${i}`, i)
    expect(l.tamanio()).toBe(3)
  })

  it('la IP sale del primer x-forwarded-for', () => {
    expect(ipDeRequest(new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4')
    expect(ipDeRequest(new Headers())).toBe('desconocida')
  })
})

describe('lectura del cuerpo', () => {
  it('415 sin JSON exacto (text/plain;charset=application/json no pasa)', async () => {
    const r = new Request('http://x/', { method: 'POST', headers: { 'content-type': 'text/plain;charset=application/json' }, body: '{}' })
    expect(await leerCuerpoJson(r)).toEqual({ ok: false, status: 415 })
  })
  it('413 por tamaño real aunque no declare Content-Length', async () => {
    const r = new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ a: 'x'.repeat(5000) }) })
    expect(await leerCuerpoJson(r)).toEqual({ ok: false, status: 413 })
  })
  it('400 con JSON roto', async () => {
    const r = new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })
    expect(await leerCuerpoJson(r)).toEqual({ ok: false, status: 400 })
  })
})

describe('POST /api/push/registrar', () => {
  it('sin deviceId: el servidor genera uno, llama a la RPC y devuelve los interruptores', async () => {
    const { llamadas, filtros } = crearAdmin()
    const { registrar } = await rutas()
    const res = await registrar(pedido('/api/push/registrar', { token: TOKEN, plataforma: 'android', idioma: 'es' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    const cuerpo = await res.json()
    expect(cuerpo).toMatchObject({ ok: true, registrado: true, avisosEquipo: true, avisosPatrocinados: false })
    expect(cuerpo.deviceId).toMatch(/^[0-9a-f-]{36}$/)
    expect(llamadas).toEqual([
      { fn: 'register_anon_push_token', args: { p_token: TOKEN, p_device_id: cuerpo.deviceId, p_platform: 'android', p_idioma: 'es' } },
    ])
    // Los interruptores se leen filtrando por token Y deviceId.
    expect(filtros).toEqual([
      ['token', TOKEN],
      ['device_id', cuerpo.deviceId],
    ])
  })

  it('con deviceId: lo usa tal cual', async () => {
    const { llamadas } = crearAdmin()
    const { registrar } = await rutas()
    const res = await registrar(pedido('/api/push/registrar', { token: TOKEN, plataforma: 'ios', deviceId: DEVICE }))
    expect((await res.json()).deviceId).toBe(DEVICE)
    expect(llamadas[0].args.p_device_id).toBe(DEVICE)
  })

  it('R-4: fila con cuenta (user_id): no devuelve los interruptores (mandan las preferencias de la cuenta)', async () => {
    crearAdmin({ fila: { user_id: 'u-1', avisos_equipo: true, avisos_patrocinados: false } })
    const { registrar } = await rutas()
    const cuerpo = await (await registrar(pedido('/api/push/registrar', { token: TOKEN, plataforma: 'android', deviceId: DEVICE }))).json()
    expect(cuerpo).toEqual({ ok: true, registrado: true, deviceId: DEVICE })
  })

  it('token de otro dispositivo: 200 registrado:false, sin deviceId ni interruptores', async () => {
    crearAdmin({ rpc: { data: false, error: null } })
    const { registrar } = await rutas()
    const res = await registrar(pedido('/api/push/registrar', { token: TOKEN, plataforma: 'ios', deviceId: DEVICE }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, registrado: false })
  })

  it('400 genérico sin tocar la base', async () => {
    crearAdmin()
    const { registrar } = await rutas()
    const res = await registrar(pedido('/api/push/registrar', { token: 'hola', plataforma: 'android' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Pedido inválido' })
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('415 y 413 sin tocar la base', async () => {
    crearAdmin()
    const { registrar } = await rutas()
    const r415 = await registrar(pedido('/api/push/registrar', '{}', { 'content-type': 'text/plain' }))
    expect(r415.status).toBe(415)
    const r413 = await registrar(pedido('/api/push/registrar', { token: TOKEN, plataforma: 'android', relleno: 'x'.repeat(3000) }))
    expect(r413.status).toBe(413)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('429 con Retry-After al pasar el límite por dispositivo', async () => {
    crearAdmin()
    const { registrar } = await rutas()
    let ultimo: Response | null = null
    for (let i = 0; i < 21; i++) {
      ultimo = await registrar(pedido('/api/push/registrar', { token: TOKEN, plataforma: 'android', deviceId: DEVICE }))
    }
    expect(ultimo!.status).toBe(429)
    expect(Number(ultimo!.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('429 al pasar el límite por IP, aunque roten token y deviceId', async () => {
    crearAdmin()
    const { registrar } = await rutas()
    const estados: number[] = []
    for (let i = 0; i < 61; i++) {
      const res = await registrar(pedido('/api/push/registrar', { token: `ExponentPushToken[t${i}]`, plataforma: 'android' }))
      estados.push(res.status)
    }
    expect(estados.slice(0, 60).every((s) => s === 200)).toBe(true)
    expect(estados[60]).toBe(429)
  })

  it('500 genérico si la RPC falla, logueando solo el código', async () => {
    crearAdmin({ rpc: { data: null, error: { code: 'P0001', message: `algo con ${TOKEN}` } } })
    const { registrar } = await rutas()
    const res = await registrar(pedido('/api/push/registrar', { token: TOKEN, plataforma: 'android', deviceId: DEVICE }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'No se pudo completar' })
    expect(errores).toHaveBeenCalledWith('[push/registrar] la RPC falló', { code: 'P0001' })
  })
})

describe('POST /api/push/preferencias', () => {
  it('llama a set_push_preferences solo con lo que vino', async () => {
    const { llamadas } = crearAdmin()
    const { preferencias } = await rutas()
    const res = await preferencias(pedido('/api/push/preferencias', { token: TOKEN, deviceId: DEVICE, avisosPatrocinados: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(llamadas).toEqual([
      {
        fn: 'set_push_preferences',
        args: { p_token: TOKEN, p_device_id: DEVICE, p_avisos_equipo: undefined, p_avisos_patrocinados: true },
      },
    ])
  })

  it('responde igual si la fila no coincide (no sirve para enumerar)', async () => {
    crearAdmin({ rpc: { data: true, error: null } })
    const a = await (await rutas()).preferencias(pedido('/api/push/preferencias', { token: TOKEN, deviceId: DEVICE, avisosEquipo: false }))
    crearAdmin({ rpc: { data: false, error: null } })
    const b = await (await rutas()).preferencias(pedido('/api/push/preferencias', { token: TOKEN, deviceId: DEVICE, avisosEquipo: false }))
    expect(a.status).toBe(b.status)
    expect(await a.json()).toEqual(await b.json())
  })

  it('400 sin deviceId, sin tocar la base', async () => {
    crearAdmin()
    const { preferencias } = await rutas()
    const res = await preferencias(pedido('/api/push/preferencias', { token: TOKEN, avisosEquipo: true }))
    expect(res.status).toBe(400)
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})

describe('forma de las rutas', () => {
  it.each(['registrar', 'preferencias'])('%s exporta solo POST (sin OPTIONS ni CORS)', (nombre) => {
    const codigo = readFileSync(resolve(__dirname, `../../app/api/push/${nombre}/route.ts`), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const metodos = [...codigo.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1])
    expect(metodos).toEqual(['POST'])
    expect(codigo).not.toMatch(/Access-Control/i)
    // Nunca se loguea el message de un error de la base ni el cuerpo.
    expect(codigo).not.toMatch(/console\.\w+\([^)]*(message|token|deviceId|cuerpo)/)
  })
})
