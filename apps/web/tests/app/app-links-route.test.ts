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
//
// Evasión encontrada por el revisor/seguridad (R36): el único assert sobre
// `ANDROID_SHA256_FINGERPRINTS` comprobaba el FORMATO (32 pares hex), nunca
// el VALOR. Cualquier huella bien formada — 32 pares de "00", o la huella
// real con dos bytes cambiados a mano — pasaba igual. Reproducido a mano
// (temporalmente, sin commitear) cambiando los dos primeros bytes de la
// huella real por "00:00": el test seguía en verde. El caso de abajo fija
// el valor exacto (la huella pública del keystore de EAS del perfil
// `preview`, anotada en `ops/app-huellas.md`), pero afirma que está
// INCLUIDA en la lista — no que la lista tenga exactamente un elemento — así
// que sigue en verde el día que se publique en Play con App Signing y haya
// que SUMAR la huella de Play sin reemplazar esta (mismo comentario de
// `ops/app-huellas.md` y de `lib/config/app-links.ts`).
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/app-links/route'
import { ANDROID_PACKAGE, ANDROID_SHA256_FINGERPRINTS } from '@/lib/config/app-links'

/** 32 pares hexadecimales separados por ':' (mayúsculas o minúsculas). */
const SHA256_FINGERPRINT_RE = /^([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/

/**
 * Huella pública del keystore de EAS del perfil `preview` (ops/app-huellas.md,
 * generada el 15/10). El día que se publique en Play Store con App Signing,
 * Google firma con otra clave: hay que SUMAR la huella de Play a
 * `ANDROID_SHA256_FINGERPRINTS`, sin reemplazar esta — por eso el test de
 * abajo verifica que la lista la CONTENGA, no que sea la única.
 */
const HUELLA_PREVIEW_EAS = '30:6B:7A:9C:E0:20:70:CE:BE:C1:8D:50:7E:7C:E1:86:0C:BF:E8:0F:20:17:23:27:1A:27:0B:57:D7:88:43:C0'

describe('GET /api/app-links, con la configuración real', () => {
  it('ANDROID_SHA256_FINGERPRINTS tiene al menos una huella con el formato de 32 pares hexadecimales', () => {
    expect(ANDROID_SHA256_FINGERPRINTS.length).toBeGreaterThan(0)
    for (const huella of ANDROID_SHA256_FINGERPRINTS) {
      expect(huella).toMatch(SHA256_FINGERPRINT_RE)
    }
  })

  it('ANDROID_SHA256_FINGERPRINTS contiene la huella exacta del keystore de EAS del perfil preview (no solo "algo con el formato correcto")', () => {
    expect(ANDROID_SHA256_FINGERPRINTS).toContain(HUELLA_PREVIEW_EAS)
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
