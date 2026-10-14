import { ANDROID_PACKAGE, ANDROID_SHA256_FINGERPRINTS, assetLinksJson } from '@/lib/config/app-links'

export const dynamic = 'force-static'

/**
 * `GET /api/app-links`, servida en `/.well-known/assetlinks.json` por el
 * `rewrite` de `next.config.mjs` (Android no sigue redirecciones para esto).
 * Sin huellas válidas, 404: así nunca se publica un archivo con una huella
 * inventada o a medio completar (R23, 23-c).
 */
export function GET() {
  const links = assetLinksJson(ANDROID_PACKAGE, ANDROID_SHA256_FINGERPRINTS)

  if (!links) {
    return new Response(null, { status: 404 })
  }

  return Response.json(links, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}
