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

  // Agujero de la pasada del revisor (R43, 43-r2), cerrado en 43-e2:
  // `userAgentApp` (`packages/core/src/metricas/vista-app.ts`) ya no sanea
  // caracteres — se queda con el prefijo numérico con puntos
  // (`/^[0-9]+(?:\.[0-9]+)*/`) del principio de `version` y tira el resto.
  // "java/2.0" empieza con "j", no con un dígito, así que no hay prefijo y
  // el resultado es el fallback "0" (antes, con el saneado por caracteres,
  // daba "java2.0": no matcheaba BOT_UA_RE solo porque la barra desaparecía,
  // no porque la palabra "java" fuera inofensiva).
  it('versión que no empieza con un número ("java/2.0"): no hay prefijo numérico, da el fallback "0"', () => {
    const ua = userAgentApp('java/2.0')
    expect(ua).toBe('QuePintaSaltaApp/0')
    expect(isBotOrPrefetch(headers(ua), 'POST')).toBe(false)
  })

  // Estos dos documentaban (con `it.fails`) un defecto real que encontramos
  // en 43-r2: `VERSION_SANEADA_RE` (versión vieja de
  // `packages/core/src/metricas/vista-app.ts`) solo sacaba caracteres que no
  // fueran `[0-9A-Za-z.-]` — no sacaba palabras. "vercel" y "preview" son
  // *solo letras*, así que el saneado por caracteres las dejaba pasar
  // intactas y `BOT_UA_RE` las marcaba como bot: la vista se descartaba en
  // silencio. 43-e2 arregló `userAgentApp` (se queda solo con el prefijo
  // numérico, sin ninguna letra) y estos dos casos pasaron a ser correctos:
  // ya no son `it.fails`, son `it` normales.
  it('"1.0.0-vercel": se queda con el prefijo numérico ("1.0.0") y no queda marcado como bot', () => {
    const ua = userAgentApp('1.0.0-vercel')
    expect(ua).toBe('QuePintaSaltaApp/1.0.0')
    expect(isBotOrPrefetch(headers(ua), 'POST')).toBe(false)
  })

  it('"1.0.0-preview": se queda con el prefijo numérico ("1.0.0") y no queda marcado como bot', () => {
    const ua = userAgentApp('1.0.0-preview')
    expect(ua).toBe('QuePintaSaltaApp/1.0.0')
    expect(isBotOrPrefetch(headers(ua), 'POST')).toBe(false)
  })

  // La aserción que de verdad protege (43-e2): en vez de probar palabra por
  // palabra de BOT_UA_RE (una lista que se queda corta en cuanto
  // `apps/web/lib/metricas/bots.ts` agrega una palabra nueva), probamos la
  // propiedad que el arreglo garantiza — el User-Agent que sale de
  // `userAgentApp` nunca tiene una letra después de "QuePintaSaltaApp/" —
  // para una batería de versiones hostiles: las cinco palabras prohibidas
  // que son solo letras (bot, preview, monitor, vercel, apify; "java/" ya
  // tiene su propio caso arriba, porque además lleva una barra), una versión
  // larguísima, una con espacios, una vacía y una con caracteres raros. Si
  // el día de mañana alguien reintroduce una lista negra de palabras (en vez
  // del prefijo numérico), este test sigue en rojo aunque la lista esté
  // actualizada, porque no depende de qué palabras tiene BOT_UA_RE: no hay
  // forma de "simplificarlo" sin perder la garantía real. No lo conviertan
  // en una lista de palabras conocidas.
  it.each([
    ['1.0.0-bot', '1.0.0-bot'],
    ['1.0.0-preview', '1.0.0-preview'],
    ['1.0.0-monitor', '1.0.0-monitor'],
    ['1.0.0-vercel', '1.0.0-vercel'],
    ['1.0.0-apify', '1.0.0-apify'],
    ['versión larguísima', `1.0.${'9'.repeat(200)}`],
    ['con espacios', '1.0.0 (beta build)'],
    ['vacía', ''],
    ['con caracteres raros', '1.0.0-#$%^&*()ñ'],
  ])('versión hostil (%s): el User-Agent no tiene ninguna letra después de la barra y no queda marcado como bot', (_n, version) => {
    const ua = userAgentApp(version)
    const resto = ua.slice('QuePintaSaltaApp/'.length)
    expect(resto).not.toMatch(/[A-Za-z]/)
    expect(isBotOrPrefetch(headers(ua), 'POST')).toBe(false)
  })
})
