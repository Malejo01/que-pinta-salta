// 23-d: GET /api/app-links con una huella de prueba (mockeando
// '@/lib/config/app-links'): 200, application/json, y el cuerpo exacto que
// pide Android. Separado de app-links-route.test.ts porque vi.mock se aplica
// a todo el archivo (no se puede mezclar con el caso de la configuración real
// en el mismo archivo).
import { describe, expect, it, vi } from 'vitest'

const { FAKE_FINGERPRINT } = vi.hoisted(() => ({
  FAKE_FINGERPRINT: Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':'),
}))

vi.mock('@/lib/config/app-links', async () => {
  const actual = await vi.importActual<typeof import('@/lib/config/app-links')>('@/lib/config/app-links')
  return {
    ...actual,
    ANDROID_SHA256_FINGERPRINTS: [FAKE_FINGERPRINT],
  }
})

import { GET } from '@/app/api/app-links/route'
import { ANDROID_PACKAGE, assetLinksJson } from '@/lib/config/app-links'

describe('GET /api/app-links, con una huella de prueba', () => {
  it('200, application/json, y el cuerpo exacto de Digital Asset Links', async () => {
    const res = GET()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')

    const body = await res.json()
    expect(body).toEqual(assetLinksJson(ANDROID_PACKAGE, [FAKE_FINGERPRINT]))
    expect(body).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'ar.com.quepintasalta.app',
          sha256_cert_fingerprints: [FAKE_FINGERPRINT],
        },
      },
    ])
  })
})
