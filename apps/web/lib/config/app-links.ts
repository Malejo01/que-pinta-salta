/**
 * Preparación de Digital Asset Links para la app de Android (R23, 23-c).
 * Sin imports de servidor ni de Next: lo puede usar también un route handler
 * de borde y, el día de mañana, la propia app.
 *
 * El nombre de paquete es para siempre (una vez subido a Play no se puede
 * cambiar): decisión 1 de Mauro, ver ops/rondas/23-base-app/plan.md.
 */
export const ANDROID_PACKAGE = 'ar.com.quepintasalta.app'

/**
 * Huellas SHA-256 del certificado de firma de la app, listas para publicar
 * en `/.well-known/assetlinks.json`. Vacío hasta que exista un certificado
 * real: con la lista vacía, `assetLinksJson` devuelve `null` y la ruta
 * responde 404 — nunca se sirve un archivo con una huella inventada.
 *
 * [COMPLETAR: huella SHA-256 del certificado de firma de la app; sale de EAS en la noche 8. No inventar.]
 */
export const ANDROID_SHA256_FINGERPRINTS: string[] = []

/** 32 pares hexadecimales separados por ':' (mayúsculas o minúsculas). */
const SHA256_FINGERPRINT_RE = /^([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/

export interface AssetLinksEntry {
  relation: string[]
  target: {
    namespace: 'android_app'
    package_name: string
    sha256_cert_fingerprints: string[]
  }
}

/**
 * Arma el JSON de Digital Asset Links para `packageName`. `null` si no hay
 * ninguna huella válida (lista vacía, o alguna que no tenga el formato de 32
 * pares hexadecimales separados por `:`): es la señal para que la ruta
 * responda 404 en vez de servir un archivo a medio completar.
 */
export function assetLinksJson(
  packageName: string,
  fingerprints: string[]
): AssetLinksEntry[] | null {
  if (fingerprints.length === 0) return null
  if (!fingerprints.every((fp) => SHA256_FINGERPRINT_RE.test(fp))) return null

  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]
}
