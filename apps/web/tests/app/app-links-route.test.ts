// 23-d: GET /api/app-links con la configuración real (sin mockear nada), y el
// `rewrite` de /.well-known/assetlinks.json en next.config.mjs. El caso con
// una huella de prueba (200, pero con una huella inventada y mockeando el
// módulo) está en app-links-route-mocked.test.ts, en un archivo separado
// porque ahí sí hace falta mockear '@/lib/config/app-links' (vi.mock se
// aplica a todo el archivo).
//
// 36-d: ANDROID_SHA256_FINGERPRINTS ya tiene la huella real del keystore de
// EAS del perfil `preview` (ops/app-huellas.md), así que la ruta real
// responde 200. Los asserts leen `ANDROID_SHA256_FINGERPRINTS` y
// `ANDROID_PACKAGE` de la constante real (no una copia del valor en el
// test): si alguien vacía la lista o pega mal la huella, este test tiene que
// fallar.
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/app-links/route'
import { ANDROID_PACKAGE, ANDROID_SHA256_FINGERPRINTS } from '@/lib/config/app-links'

/** 32 pares hexadecimales separados por ':' (mayúsculas o minúsculas). */
const SHA256_FINGERPRINT_RE = /^([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/

describe('GET /api/app-links, con la configuración real', () => {
  it('ANDROID_SHA256_FINGERPRINTS tiene al menos una huella con el formato de 32 pares hexadecimales', () => {
    expect(ANDROID_SHA256_FINGERPRINTS.length).toBeGreaterThan(0)
    for (const huella of ANDROID_SHA256_FINGERPRINTS) {
      expect(huella).toMatch(SHA256_FINGERPRINT_RE)
    }
  })

  it('200, con el package_name, la huella exacta y la relation que pide Android', async () => {
    expect(ANDROID_PACKAGE).toBe('ar.com.quepintasalta.app')

    const res = GET()
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: ANDROID_PACKAGE,
          sha256_cert_fingerprints: ANDROID_SHA256_FINGERPRINTS,
        },
      },
    ])
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
