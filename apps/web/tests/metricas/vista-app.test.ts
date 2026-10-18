// La vista de la ficha con origen `app` (R43, tarea 43-e; plan, decisión
// 10): el endpoint no cambia (`apps/web/app/api/metricas/vista/route.ts`),
// así que lo que hace falta probar es que `userAgentApp`/`cuerpoVista`
// (`@qps/core/metricas/vista-app`) producen justo lo que ese endpoint
// necesita para contar la vista: un `User-Agent` que no matchee `BOT_UA_RE`
// (que incluye `okhttp`, el que pone el `fetch` de React Native sin un
// `User-Agent` propio) y un body de menos de 1024 bytes. Mismo patrón que
// `tests/metricas/vista.test.ts`: `createAdminClient` con un doble de `rpc`.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAdminClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/metricas/vista/route'
import { isBotOrPrefetch } from '@/lib/metricas/bots'
import { cuerpoVista, userAgentApp } from '@qps/core/metricas/vista-app'

const ID = '11111111-1111-4111-8111-111111111111'

let rpc: ReturnType<typeof vi.fn>

function post(body: string, userAgent: string) {
  return POST(
    new NextRequest('http://localhost.test/api/metricas/vista', {
      method: 'POST',
      body,
      headers: { 'user-agent': userAgent, 'content-type': 'application/json' },
    })
  )
}

beforeEach(() => {
  rpc = vi.fn().mockResolvedValue({ error: null })
  createAdminClient.mockReset()
  createAdminClient.mockReturnValue({ rpc })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('la vista de la app: userAgentApp + cuerpoVista contra el endpoint real', () => {
  it('un POST con userAgentApp(\'1.0.0\') y cuerpoVista(ID) cuenta la vista con p_origin: "app"', async () => {
    const body = cuerpoVista(ID)
    expect(body).not.toBeNull()

    const res = await post(body as string, userAgentApp('1.0.0'))

    expect(res.status).toBe(204)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('record_event_metric', { p_event_id: ID, p_kind: 'view', p_origin: 'app' })
  })

  it('el mismo POST con User-Agent: okhttp/4.12.0 NO cuenta: el User-Agent propio hace falta', async () => {
    const body = cuerpoVista(ID)
    expect(body).not.toBeNull()

    const res = await post(body as string, 'okhttp/4.12.0')

    expect(res.status).toBe(204)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('cuerpoVista: menos de 1024 bytes', () => {
  it('mide menos de 1024 bytes', () => {
    const body = cuerpoVista(ID) as string
    expect(new TextEncoder().encode(body).length).toBeLessThan(1024)
  })

  it('un id que no es uuid da null (ningún fetch)', () => {
    expect(cuerpoVista('no-es-un-uuid')).toBeNull()
  })
})

describe('isBotOrPrefetch da false para userAgentApp con versiones raras', () => {
  const headers = (ua: string) => new Headers({ 'user-agent': ua })

  it.each([
    ['vacía', ''],
    ['con paréntesis y espacio', '1.0.0 (beta)'],
    ['50 caracteres', 'x'.repeat(50)],
  ])('versión %s', (_n, version) => {
    const ua = userAgentApp(version)
    expect(isBotOrPrefetch(headers(ua), 'POST')).toBe(false)
  })
})
