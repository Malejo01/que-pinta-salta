// 23-d: GET /api/app-links con la configuración real (sin mockear nada), y el
// `rewrite` de /.well-known/assetlinks.json en next.config.mjs. El caso con
// una huella de prueba (200) está en app-links-route-mocked.test.ts, en un
// archivo separado porque ahí sí hace falta mockear '@/lib/config/app-links'
// (vi.mock se aplica a todo el archivo).
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/app-links/route'

describe('GET /api/app-links, con la configuración real', () => {
  it('ANDROID_SHA256_FINGERPRINTS está vacía hoy: 404 (nunca se sirve un archivo sin huellas)', async () => {
    const res = GET()
    expect(res.status).toBe(404)
    const body = await res.arrayBuffer()
    expect(body.byteLength).toBe(0)
  })
})

describe('el rewrite de /.well-known/assetlinks.json (next.config.mjs)', () => {
  it('rewrites() manda /.well-known/assetlinks.json a /api/app-links (no es una redirección: Android no la sigue)', async () => {
    const mod = (await import('../../next.config.mjs')) as {
      default: { rewrites: () => Promise<Array<{ source: string; destination: string }>> }
    }
    const rewrites = await mod.default.rewrites()

    expect(rewrites).toContainEqual({
      source: '/.well-known/assetlinks.json',
      destination: '/api/app-links',
    })
  })
})
