// 23-d: `assetLinksJson` (apps/web/lib/config/app-links.ts) y que la
// configuración real de la app (ANDROID_SHA256_FINGERPRINTS) siga vacía.
// Sin red, sin certificado real: toda huella de este archivo está inventada
// a propósito (32 pares hexadecimales de relleno, nunca una huella real de
// EAS).
import { describe, expect, it } from 'vitest'
import {
  ANDROID_PACKAGE,
  ANDROID_SHA256_FINGERPRINTS,
  assetLinksJson,
} from '@/lib/config/app-links'

/** Huella de prueba: 32 pares hex separados por ':' (00:01:02:...:1F). Inventada en este test. */
const FAKE_FINGERPRINT = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':')

describe('la configuración real de la app', () => {
  it(
    'ANDROID_SHA256_FINGERPRINTS sigue vacía: sin huella real de EAS todavía. ' +
      'El día que se complete (noche 8), este test se rompe a propósito — y hay que actualizarlo, no revertir el código.',
    () => {
      expect(ANDROID_SHA256_FINGERPRINTS).toEqual([])
    }
  )

  it("el paquete sigue siendo 'ar.com.quepintasalta.app' (decisión 1 de Mauro, para siempre una vez publicado)", () => {
    expect(ANDROID_PACKAGE).toBe('ar.com.quepintasalta.app')
  })
})

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
