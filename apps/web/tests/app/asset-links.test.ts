// 23-d: `assetLinksJson` (apps/web/lib/config/app-links.ts). Sin red, sin
// certificado real: toda huella de este archivo está inventada a propósito
// (32 pares hexadecimales de relleno), nunca la huella real de EAS — esa ya
// está cargada en `ANDROID_SHA256_FINGERPRINTS` (36-d) y la cubren los tests
// de `app-links-route.test.ts` (que la constante tenga al menos una huella
// con el formato correcto, y que la ruta real responda 200). Lo que este
// archivo sigue probando, y el otro no, es que el 404 sigue existiendo como
// camino real: `assetLinksJson` da `null` con la lista vacía o con cualquier
// huella mal formada, de modo que la ruta nunca sirve un archivo con una
// huella inventada o a medio completar.
import { describe, expect, it } from 'vitest'
import { assetLinksJson } from '@/lib/config/app-links'

/** Huella de prueba: 32 pares hex separados por ':' (00:01:02:...:1F). Inventada en este test. */
const FAKE_FINGERPRINT = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':')

describe('assetLinksJson', () => {
  it('con la lista vacía, null (nunca se publica un archivo sin huellas)', () => {
    expect(assetLinksJson('ar.com.quepintasalta.app', [])).toBeNull()
  })

  it('con una huella de prueba bien formada, el JSON exacto que espera Android (Digital Asset Links)', () => {
    const result = assetLinksJson('ar.com.quepintasalta.app', [FAKE_FINGERPRINT])

    expect(result).toEqual([
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

  it('con varias huellas válidas, las lleva todas al mismo target', () => {
    const second = FAKE_FINGERPRINT.split(':').reverse().join(':')
    const result = assetLinksJson('ar.com.quepintasalta.app', [FAKE_FINGERPRINT, second])

    expect(result?.[0]?.target.sha256_cert_fingerprints).toEqual([FAKE_FINGERPRINT, second])
    expect(result).toHaveLength(1)
  })

  describe('huellas mal formadas: null, nunca un archivo a medio completar', () => {
    it('31 pares en vez de 32 (falta uno)', () => {
      const malformada = FAKE_FINGERPRINT.split(':').slice(0, 31).join(':')
      expect(assetLinksJson('ar.com.quepintasalta.app', [malformada])).toBeNull()
    })

    it('33 pares en vez de 32 (uno de más)', () => {
      const malformada = `${FAKE_FINGERPRINT}:AA`
      expect(assetLinksJson('ar.com.quepintasalta.app', [malformada])).toBeNull()
    })

    it('un carácter que no es hexadecimal', () => {
      const malformada = `GG:${FAKE_FINGERPRINT.slice(3)}`
      expect(assetLinksJson('ar.com.quepintasalta.app', [malformada])).toBeNull()
    })

    it('separada por guiones en vez de ":"', () => {
      const malformada = FAKE_FINGERPRINT.replaceAll(':', '-')
      expect(assetLinksJson('ar.com.quepintasalta.app', [malformada])).toBeNull()
    })

    it('vacía', () => {
      expect(assetLinksJson('ar.com.quepintasalta.app', [''])).toBeNull()
    })

    it('una huella válida y una malformada: alcanza con que una esté mal para que todo sea null', () => {
      expect(assetLinksJson('ar.com.quepintasalta.app', [FAKE_FINGERPRINT, 'no-es-una-huella'])).toBeNull()
    })
  })
})
