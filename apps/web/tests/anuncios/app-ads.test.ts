// 52-a: GET /app-ads.txt (AdMob, support.google.com/admob/answer/9363762).
// `ADMOB_PUBLISHER_ID` se lee al llamar GET() (no al importar el módulo), así
// que alcanza con vi.stubEnv sin resetModules ni import dinámico — pero se
// usa import dinámico igual, por las dudas de que el entorno real cachee el
// módulo entre archivos de test.
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
})

async function getRoute() {
  const mod = await import('@/app/app-ads.txt/route')
  return mod.GET
}

const ID_VALIDO = 'pub-1234567890123456'

describe('GET /app-ads.txt', () => {
  it('con un ID válido (pub- + 16 dígitos): 200, text/plain y exactamente la línea esperada', async () => {
    vi.stubEnv('ADMOB_PUBLISHER_ID', ID_VALIDO)
    const GET = await getRoute()
    const res = GET()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/plain')

    const body = await res.text()
    expect(body).toBe(`google.com, ${ID_VALIDO}, DIRECT, f08c47fec0942fa0\n`)
  })

  it('sin la variable: 404', async () => {
    vi.stubEnv('ADMOB_PUBLISHER_ID', '')
    const GET = await getRoute()
    const res = GET()

    expect(res.status).toBe(404)
  })

  it('con la variable vacía ("   "): 404', async () => {
    vi.stubEnv('ADMOB_PUBLISHER_ID', '   ')
    const GET = await getRoute()
    const res = GET()

    expect(res.status).toBe(404)
  })

  it('con el prefijo equivocado (ca-app-pub-...): 404', async () => {
    vi.stubEnv('ADMOB_PUBLISHER_ID', 'ca-app-pub-1234567890123456')
    const GET = await getRoute()
    const res = GET()

    expect(res.status).toBe(404)
  })

  it('con 15 dígitos (uno de menos): 404', async () => {
    vi.stubEnv('ADMOB_PUBLISHER_ID', 'pub-123456789012345')
    const GET = await getRoute()
    const res = GET()

    expect(res.status).toBe(404)
  })

  it('con 17 dígitos (uno de más): 404', async () => {
    vi.stubEnv('ADMOB_PUBLISHER_ID', 'pub-12345678901234567')
    const GET = await getRoute()
    const res = GET()

    expect(res.status).toBe(404)
  })

  it('tiene Cache-Control público de un día', async () => {
    vi.stubEnv('ADMOB_PUBLISHER_ID', ID_VALIDO)
    const GET = await getRoute()
    const res = GET()

    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400')
  })
})
