// Tarea 36-c (R36, G3): `POST /api/radar/prueba`, la versión con Bearer del
// botón "Enviar Correo de Prueba" (solo para admin), para que la app pueda
// llamarla sin la sesión por cookies de la web.
//
// Mismo estilo que `trigger-test-email.test.ts`: Supabase y Resend con
// dobles, nunca manda un mail real. Acá el cliente de Supabase no sale de
// `@/lib/supabase/server` (eso es el camino de cookies) sino de
// `@supabase/supabase-js` directo, con la anon key y el Bearer del usuario
// en los headers — así que lo que se mockea es ese módulo.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase, type Row } from './fake-supabase'

const createClient = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
}))

// Evasión encontrada por el revisor/seguridad (R36): el detector de más
// abajo ("nunca la service role") es un grep de TEXTO sobre route.ts
// (`createAdminClient`, `SUPABASE_SERVICE_ROLE_KEY`). Si alguien mueve el uso
// de la service role a otro módulo con otro nombre — por ejemplo un helper
// `clienteConPermisosAmplios()` en `lib/supabase/server.ts` que adentro llama
// a `createAdminClient()` — ninguna de las dos cadenas aparece en route.ts y
// el grep pasa igual, aunque el endpoint ya use permisos de administrador.
// Reproducido a mano (temporalmente, sin commitear) agregando ese helper y
// usándolo en route.ts en vez del cliente con la anon key: el grep de texto
// de abajo seguía en verde.
//
// Esto intercepta el MÓDULO en vez del texto: `createAdminClient` real tira
// si alguien la llama (en vez de armar un cliente real con una clave de
// servicio inventada), así que cualquier camino de `route.ts` — directo o a
// través de un wrapper nuevo en `lib/supabase/server.ts` que use el mismo
// módulo — revienta en vez de pasar inadvertido. Como `route.ts` hoy NO
// importa nada de `lib/supabase/server` (usa `@supabase/supabase-js`
// directo con la anon key), este mock no cambia el comportamiento actual:
// solo asegura que, si alguien cablea ese import, el endpoint se rompe en
// vez de colar en silencio.
const { createAdminClient } = vi.hoisted(() => ({
  createAdminClient: vi.fn(() => {
    throw new Error('createAdminClient: /api/radar/prueba nunca tiene que armar un cliente con la service role')
  }),
}))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient }))

const send = vi.fn()
const ResendCtor = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
    constructor(key: string) {
      ResendCtor(key)
    }
  },
}))

import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/radar/prueba/route'

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const originalKey = process.env.RESEND_API_KEY

const ENDPOINT = 'https://qps.test/api/radar/prueba'
const TOKEN = 'token-de-sesion-de-prueba'
const UID = '22222222-2222-4222-8222-222222222222'
const EMAIL = 'usuario@ejemplo.test'
const CAT_ID = 'c0000000-0000-4000-8000-000000000001'
const EV_ID = 'e0000000-0000-4000-8000-000000000001'
// Fecha fija: jueves 2030-10-10 18:00 en Salta.
const AHORA = new Date('2030-10-10T21:00:00.000Z')
const EVENTO: Row = {
  id: EV_ID,
  title: 'Evento de Prueba',
  status: 'PUBLISHED',
  start_date: '2030-10-12T00:30:00.000Z', // 21:30 Salta
  end_date: null,
  is_free: false,
  price_min: 35000,
  category_id: CAT_ID,
  venue_id: 'b0000000-0000-4000-8000-000000000001',
  venue: { name: 'Venue de Prueba' },
  category: { name: 'Música' },
}

function req(headers: Record<string, string> = {}, method = 'POST') {
  return new NextRequest(ENDPOINT, { method, headers })
}

// Builder encadenable y "await-able" para las tablas de usuario (no filtra).
function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'order', 'in', 'or', 'limit']) c[m] = () => c
  c.maybeSingle = async () => result
  c.single = async () => result
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
  return c
}

/**
 * Cliente falso con la forma que arma el endpoint: `auth.getUser(token)` y
 * `from(...)`. `user` en `null` simula un token inválido o vencido.
 */
function fakeClient(opts: {
  user?: { id: string; email: string } | null
  role?: string | null
  events?: Row[]
  flyers?: Row[]
  igIds?: string[]
} = {}) {
  const user = opts.user === undefined ? { id: UID, email: EMAIL } : opts.user
  const userTables: Record<string, { data: unknown; error: unknown }> = {
    profiles: { data: opts.role != null ? { role: opts.role } : null, error: null },
    user_radar_settings: { data: { email_frequency: 'weekly', email_target: EMAIL }, error: null },
    user_followed_categories: { data: [{ category_id: CAT_ID }], error: null },
    user_followed_venues: { data: [], error: null },
    user_followed_instagram_accounts: { data: (opts.igIds ?? []).map((id) => ({ instagram_account_id: id })), error: null },
  }
  const fake = createFakeSupabase({
    events: { rows: opts.events ?? [EVENTO] },
    instagram_flyers: { rows: opts.flyers ?? [] },
  })
  return {
    auth: {
      getUser: async () =>
        user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'token inválido' } },
    },
    from: (t: string) => {
      if (t === 'events' || t === 'instagram_flyers') return fake.client.from(t)
      if (!(t in userTables)) throw new Error('tabla inesperada: ' + t)
      return chain(userTables[t])
    },
  }
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.test'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-falsa-de-prueba'
  process.env.RESEND_API_KEY = 'clave-falsa'
  createClient.mockReset()
  createAdminClient.mockClear()
  send.mockReset()
  ResendCtor.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
  if (originalAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon
  if (originalKey === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = originalKey
  vi.restoreAllMocks()
})

describe('POST /api/radar/prueba: autenticación', () => {
  it('sin header Authorization: 401, sin crear el cliente de Supabase', async () => {
    const res = await POST(req())
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ success: false })
    expect(createClient).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('header sin "Bearer ": 401, sin crear el cliente', async () => {
    const res = await POST(req({ authorization: TOKEN }))
    expect(res.status).toBe(401)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('"Bearer" sin token: 401, sin crear el cliente', async () => {
    const res = await POST(req({ authorization: 'Bearer ' }))
    expect(res.status).toBe(401)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('token inválido (auth.getUser sin usuario): 401, Resend no se llama', async () => {
    createClient.mockReturnValue(fakeClient({ user: null }))
    const res = await POST(req({ authorization: `Bearer ${TOKEN}` }))
    expect(res.status).toBe(401)
    expect(send).not.toHaveBeenCalled()
  })
})

describe('POST /api/radar/prueba: autorización', () => {
  it.each(['USER', 'user', 'EDITOR', ''])('rol %j: 403 "Solo administradores." y Resend no se llama', async (role) => {
    createClient.mockReturnValue(fakeClient({ role }))
    const res = await POST(req({ authorization: `Bearer ${TOKEN}` }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ success: false, message: 'Solo administradores.' })
    expect(send).not.toHaveBeenCalled()
    expect(ResendCtor).not.toHaveBeenCalled()
  })

  it('sin fila de perfil: 403 y Resend no se llama', async () => {
    createClient.mockReturnValue(fakeClient({ role: null }))
    const res = await POST(req({ authorization: `Bearer ${TOKEN}` }))
    expect(res.status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })

  it('el cliente se arma con la anon key y el Bearer del usuario en los headers, nunca con la service role', async () => {
    createClient.mockReturnValue(fakeClient({ role: 'ADMIN' }))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AHORA)
    send.mockResolvedValue({ error: null })
    await POST(req({ authorization: `Bearer ${TOKEN}` }))
    vi.useRealTimers()

    expect(createClient).toHaveBeenCalledTimes(1)
    const [url, key, options] = createClient.mock.calls[0] as [
      string,
      string,
      { global?: { headers?: Record<string, string> } },
    ]
    expect(url).toBe('https://proyecto.supabase.test')
    expect(key).toBe('anon-falsa-de-prueba')
    expect(options?.global?.headers?.Authorization).toBe(`Bearer ${TOKEN}`)
  })
})

describe('POST /api/radar/prueba: mismos mensajes que la server action', () => {
  it('admin sin ninguna categoría/local/cuenta seguida (sin "settings"): mismo mensaje que triggerTestRadarEmail', async () => {
    // Pisamos la tabla de categorías seguidas para que quede vacía (sin seguir nada):
    // es el único de los tres "seguidos" que `fakeClient` deja no vacío por defecto.
    const client = fakeClient({ role: 'ADMIN' })
    const originalFrom = client.from
    client.from = (t: string) => {
      if (t === 'user_followed_categories') return chain({ data: [], error: null })
      return originalFrom(t)
    }
    createClient.mockReturnValue(client)

    const res = await POST(req({ authorization: `Bearer ${TOKEN}` }))
    const body = await res.json()
    expect(body).toEqual({
      success: false,
      message: 'Tenés que seguir al menos una categoría, un local o una cuenta de Instagram para recibir novedades.',
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('admin con seguidos pero sin eventos próximos: mismo mensaje que triggerTestRadarEmail', async () => {
    createClient.mockReturnValue(fakeClient({ role: 'ADMIN', events: [] }))
    const res = await POST(req({ authorization: `Bearer ${TOKEN}` }))
    const body = await res.json()
    expect(body).toEqual({ success: false, message: 'No hay eventos ni flyers próximos publicados que coincidan con tu Radar.' })
    expect(send).not.toHaveBeenCalled()
  })
})

describe('POST /api/radar/prueba: admin con eventos', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AHORA)
    send.mockResolvedValue({ error: null })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('un solo envío, al email del token y a ningún otro', async () => {
    createClient.mockReturnValue(fakeClient({ role: 'ADMIN' }))
    const res = await POST(req({ authorization: `Bearer ${TOKEN}` }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.count).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].to).toBe(EMAIL)
  })

  it('el destinatario nunca sale del cuerpo del request (lo manda el cliente, el endpoint lo ignora)', async () => {
    createClient.mockReturnValue(fakeClient({ role: 'ADMIN', user: { id: UID, email: EMAIL } }))
    const res = await POST(
      new NextRequest(ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ email_target: 'otro-destinatario@evil.test' }),
      }),
    )
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].to).toBe(EMAIL)
  })

  it('la respuesta no filtra detalles internos (ni de Supabase ni de Resend)', async () => {
    send.mockResolvedValue({ error: { message: 'detalle interno secreto de Resend' } })
    createClient.mockReturnValue(fakeClient({ role: 'ADMIN' }))
    const res = await POST(req({ authorization: `Bearer ${TOKEN}` }))
    const body = await res.json()
    expect(body).toEqual({ success: false, message: 'No pudimos enviar el correo de prueba. Intentá de nuevo.' })
    // El mensaje nunca repite el detalle crudo de Resend ni de Supabase (ids, stack, etc).
    expect(JSON.stringify(body)).not.toContain('secreto')
  })
})

describe('otros métodos', () => {
  it('GET: 405', async () => {
    const res = await GET(req({}, 'GET'))
    expect(res.status).toBe(405)
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('detector (módulo, no texto): POST nunca dispara createAdminClient, en ninguno de sus caminos', () => {
  it('401 (sin token): createAdminClient no se llama', async () => {
    const res = await POST(req())
    expect(res.status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('403 (rol no admin): createAdminClient no se llama', async () => {
    createClient.mockReturnValue(fakeClient({ role: 'USER' }))
    const res = await POST(req({ authorization: `Bearer ${TOKEN}` }))
    expect(res.status).toBe(403)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('200 (admin con eventos): createAdminClient no se llama', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AHORA)
    send.mockResolvedValue({ error: null })
    createClient.mockReturnValue(fakeClient({ role: 'ADMIN' }))
    const res = await POST(req({ authorization: `Bearer ${TOKEN}` }))
    vi.useRealTimers()
    expect(res.status).toBe(200)
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})

describe('detector: el endpoint nunca usa la service role', () => {
  const ROUTE_PATH = fileURLToPath(new URL('../../app/api/radar/prueba/route.ts', import.meta.url))
  const content = readFileSync(ROUTE_PATH, 'utf8')

  it('el archivo existe y no está vacío', () => {
    expect(content.trim().length).toBeGreaterThan(0)
  })

  it('no importa createAdminClient', () => {
    expect(content).not.toMatch(/createAdminClient/)
  })

  it('no menciona SUPABASE_SERVICE_ROLE_KEY', () => {
    expect(content).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
  })
})
