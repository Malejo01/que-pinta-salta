/**
 * Copia a Storage los flyers que hoy se sirven en tamaño completo desde el
 * sitio del tercero (ticketeras, cines, peñas, museos) — Ronda 18-b. Mismo
 * bucket que los flyers de Instagram (`flyers_ig`, decisión 4 de Mauro), en
 * `externas/<sha1 de la URL>.<ext>`, con las mismas variantes WebP de 400 y
 * 800px que genera la ingesta de Instagram (`lib/instagram/process-apify-payload.ts`).
 *
 * SOLO SERVIDOR: importa `makeVariants` (`sharp`), igual que
 * `lib/images/backfill.ts`. No lo importa ningún `'use client'`.
 *
 * La extensión del archivo sale del `Content-Type` real de la respuesta, no
 * se fuerza a `.jpg`: para los formatos que no sean JPEG, `variantPath()`
 * (`lib/images/variants.ts`, sin tocar en esta tarea) devuelve `null` y no se
 * genera variante — el mismo comportamiento ya aceptado para los `.webp` de
 * peñas. `FlyerImage` no se rompe: si no hay variante, `flyerVariantUrl`
 * devuelve la URL del original sin tocarla.
 */

import { createHash } from 'node:crypto'
import net from 'node:net'
import { INSTAGRAM_ENGINE_CONFIG } from '@/lib/instagram-config'
import { STORAGE_CACHE_CONTROL, VARIANT_WIDTHS, variantPath } from '@/lib/images/variants'
import { makeVariants } from '@/lib/images/variants-server'

/** Carpeta del bucket `flyers_ig` donde viven las imágenes externas copiadas. */
export const EXTERNAL_IMAGES_FOLDER = 'externas'

/**
 * Subconjunto de la API de Storage que necesita `copyExternalImage`, ya
 * acotado a un bucket (equivalente a `supabase.storage.from(bucket)`). Mismo
 * patrón que `BackfillStorageClient` en `lib/images/backfill.ts`: una
 * interfaz mínima para poder testear con un fake en memoria, sin red ni
 * Supabase real.
 */
export interface ExternalImageStorageClient {
  list(
    path: string,
    options?: { search?: string; limit?: number }
  ): Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }>
  upload(
    path: string,
    body: Buffer,
    options: { contentType: string; cacheControl?: string; upsert?: boolean }
  ): Promise<{ data: unknown; error: { message: string } | null }>
  getPublicUrl(path: string): { data: { publicUrl: string } }
}

/**
 * Prefijo de ruta (sin host) de un objeto público del bucket de flyers
 * (Instagram o externas): sirve para reconocer, sin red, si una URL que ya
 * está en la base es una URL de nuestro propio Storage (y por lo tanto no
 * hay que copiarla de nuevo). Se compara contra `pathname`, nunca contra la
 * URL completa como texto — ver `isOwnStorageUrl`.
 */
const PUBLIC_BUCKET_PATH_PREFIX = `/storage/v1/object/public/${INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET}/`

/**
 * Hostname de nuestro proyecto de Supabase, en minúsculas, o `null` si
 * `NEXT_PUBLIC_SUPABASE_URL` no está definida o no es una URL válida (pasa
 * en varios tests, y en algún script sin `.env` cargado).
 */
function ownSupabaseHost(): string | null {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!envUrl) return null
  try {
    return new URL(envUrl).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * `true` si `url` ya es una URL pública de nuestro bucket de flyers (de
 * Instagram o de `externas/`). Lo usan los llamadores (save-to-supabase,
 * cinema-scraper, generar.ts, run-scrape-job.ts, merge-events.ts) para no
 * volver a copiar — o, en el merge, no dejar pisar — una imagen que ya está
 * en Storage.
 *
 * Arreglo de seguridad (vuelta 1, 31-a): antes esto era un `url.includes()`
 * de texto libre sobre la URL completa, así que
 * `https://sitio-malo.com/storage/v1/object/public/flyers_ig/x.jpg` (o la
 * misma subcadena metida en el query string) daba `true`. `image_url` sale
 * del HTML de la ticketera — es texto de un tercero — y un `true` falso
 * tenía dos consecuencias: en `run-scrape-job.ts` se guardaba la URL cruda
 * sin pasar por `copyExternalImage` (sin ninguna de sus defensas), y en
 * `merge-events.ts` desactivaba la guarda que protege una imagen propia
 * legítima de ser pisada.
 *
 * Ahora se parsea con `new URL()` y se decide sobre `hostname` y `pathname`
 * exclusivamente, nunca sobre el texto entero: una subcadena en el query
 * string, el fragmento, o unas credenciales en la autoridad
 * (`usuario@host`) no alcanzan — sólo cuentan el host real y la ruta real.
 * `pathname` tiene que empezar con el prefijo del bucket (no `includes`).
 * `hostname` tiene que ser exactamente el de nuestro proyecto (comparación
 * estricta: `x.supabase.co.sitio-malo.com` no matchea `x.supabase.co`). Si
 * no hay `NEXT_PUBLIC_SUPABASE_URL` disponible para comparar, se exige al
 * menos que el host termine en `.supabase.co` (nunca se vuelve al
 * `includes()` de texto libre). Una URL que no parsea da `false`.
 */
export function isOwnStorageUrl(url: string | null | undefined): boolean {
  if (!url) return false

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (!parsed.pathname.startsWith(PUBLIC_BUCKET_PATH_PREFIX)) return false

  const hostname = parsed.hostname.toLowerCase()
  const ownHost = ownSupabaseHost()
  if (ownHost) return hostname === ownHost

  return hostname.endsWith('.supabase.co')
}

/** Extensiones de imagen soportadas, por `Content-Type` (sin parámetros, ya en minúsculas). */
const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function extensionForContentType(contentType: string): string | null {
  return CONTENT_TYPE_EXTENSIONS[contentType.toLowerCase()] ?? null
}

function sha1Hex(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

type UrlCheck = { ok: true } | { ok: false; reason: string }

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

function isIPv4Literal(host: string): boolean {
  const parts = host.split('.')
  if (parts.length !== 4) return false
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
}

/**
 * `0.0.0.0/8` (incluye la propia `0.0.0.0`, que en Linux y en contenedores
 * llega a la loopback), 127.0.0.0/8 (loopback), 10/8, 172.16/12, 192.168/16,
 * 169.254/16 (link-local).
 */
function isDisallowedIPv4(host: string): boolean {
  const [a, b] = host.split('.').map(Number)
  if (a === 0) return true
  if (a === 127) return true
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  return false
}

/**
 * Expande una dirección IPv6 válida (ya confirmada con `net.isIPv6`) a sus 8
 * grupos hexadecimales de 16 bits (de 4 dígitos, con ceros a la izquierda),
 * resolviendo la compresión `::` una sola vez — es lo único que permite la
 * sintaxis. Si la dirección termina en una IPv4 en notación punteada
 * (`::a.b.c.d`), se la convierte primero a sus 2 grupos hexadecimales
 * equivalentes: en este módulo el hostname siempre llega ya normalizado por
 * `URL` (que serializa cualquier IPv4 embebida en hexadecimal, nunca en
 * notación punteada: `::ffff:127.0.0.1` llega como `::ffff:7f00:1`), pero
 * esta conversión queda igual por si se llama con el texto crudo.
 *
 * Devuelve `null` si la dirección no se puede interpretar de forma
 * inequívoca (fallo cerrado: el llamador la trata como no permitida).
 */
function expandIPv6(host: string): string[] | null {
  if (!net.isIPv6(host)) return null

  let body = host

  const lastColon = body.lastIndexOf(':')
  const tail = lastColon === -1 ? '' : body.slice(lastColon + 1)
  if (tail.includes('.')) {
    const bytes = tail.split('.').map(Number)
    if (bytes.length !== 4 || bytes.some((b) => Number.isNaN(b) || b < 0 || b > 255)) return null
    const hi = ((bytes[0] << 8) | bytes[1]).toString(16)
    const lo = ((bytes[2] << 8) | bytes[3]).toString(16)
    body = `${body.slice(0, lastColon + 1)}${hi}:${lo}`
  }

  const parts = body.split('::')
  if (parts.length > 2) return null // más de un '::' no es una dirección válida

  const hasCompression = parts.length === 2
  const headGroups = parts[0] ? parts[0].split(':').filter(Boolean) : []
  const tailGroups = hasCompression && parts[1] ? parts[1].split(':').filter(Boolean) : []

  const knownGroups = headGroups.length + tailGroups.length
  if (!hasCompression && knownGroups !== 8) return null
  if (hasCompression && knownGroups >= 8) return null

  const missing = hasCompression ? 8 - knownGroups : 0
  const groups = [...headGroups, ...Array(missing).fill('0'), ...tailGroups]

  if (groups.length !== 8) return null
  if (groups.some((g) => Number.isNaN(Number.parseInt(g, 16)))) return null

  return groups.map((g) => g.padStart(4, '0'))
}

/**
 * `::` (todo ceros, equivalente de `0.0.0.0`), `::1` (loopback), `fc00::/7`
 * (unique local) y `fe80::/10` (link-local). Las formas con una IPv4 en los
 * últimos 32 bits — IPv4-mapeada (`::ffff:a.b.c.d`, prefijo de 80 bits en
 * cero + `ffff`) o IPv4-compatible, ya en desuso (`::a.b.c.d`, prefijo de 96
 * bits en cero) — se validan contra `isDisallowedIPv4` con la IPv4 que
 * exponen, sea pública o privada.
 *
 * A diferencia de la versión anterior, no se arma a partir del primer grupo
 * de texto antes de los `:` (eso dejaba pasar toda forma comprimida que no
 * fuera exactamente `::1`, incluido `::ffff:127.0.0.1` — que además llega
 * aquí ya reescrito por `URL` como `::ffff:7f00:1`, sin ningún punto): se
 * expande la dirección entera primero.
 */
function isDisallowedIPv6(host: string): boolean {
  const groups = expandIPv6(host.toLowerCase())
  if (!groups) return true // no se pudo interpretar: fallo cerrado

  const values = groups.map((g) => Number.parseInt(g, 16))

  const first5Zero = values.slice(0, 5).every((v) => v === 0)
  if (first5Zero && (values[5] === 0xffff || values[5] === 0)) {
    const hi = values[6]
    const lo = values[7]
    const embeddedIPv4 = `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`
    if (isDisallowedIPv4(embeddedIPv4)) return true
  }

  if (values.every((v) => v === 0)) return true // '::' (equivalente a 0.0.0.0)
  if (values.slice(0, 7).every((v) => v === 0) && values[7] === 1) return true // '::1'

  const first = values[0]
  if (first >= 0xfc00 && first <= 0xfdff) return true // fc00::/7
  if (first >= 0xfe80 && first <= 0xfebf) return true // fe80::/10

  return false
}

function isDisallowedIpLiteral(hostname: string): boolean {
  const host = stripBrackets(hostname)
  if (isIPv4Literal(host)) return isDisallowedIPv4(host)
  if (net.isIPv6(host)) return isDisallowedIPv6(host)
  if (host.includes(':')) return true // parece IPv6 pero no es válida: fallo cerrado
  return false
}

/**
 * Valida que una URL sea segura para descargar: sólo `https:`, sin hosts que
 * sean `localhost` o una IP literal privada/loopback/link-local (IPv4 e
 * IPv6, incluidas las formas comprimidas e IPv4-mapeadas). La validación es
 * puramente textual sobre el hostname de la URL: no resuelve DNS, así que un
 * dominio público que resuelva a una IP privada (DNS rebinding, p. ej.
 * `127.0.0.1.nip.io`) no queda cubierto acá — `fetch` no permite inyectar un
 * `lookup` propio sin agregar una dependencia, y es un cambio de más riesgo.
 * Queda anotado para el backlog de seguridad, no se arregla en esta tarea.
 */
export function validateExternalImageUrl(rawUrl: string): UrlCheck {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'URL inválida' }
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: `protocolo no permitido (${parsed.protocol})` }
  }

  const hostname = parsed.hostname.toLowerCase()
  if (hostname === 'localhost') {
    return { ok: false, reason: 'host localhost' }
  }

  if (isDisallowedIpLiteral(hostname)) {
    return { ok: false, reason: `IP privada, loopback o link-local (${hostname})` }
  }

  return { ok: true }
}

const DOWNLOAD_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 5

interface DownloadedImage {
  buffer: Buffer
  contentType: string
}

/**
 * Lee el cuerpo de `response` sin superar `maxBytes`. Si hay un lector de
 * stream (`response.body.getReader()`, lo normal en runtimes modernos),
 * acumula de a trozos y corta — cancelando el stream — apenas se supera el
 * tope, sin esperar a que termine de llegar un cuerpo enorme. Si no hay
 * stream disponible, cae a `arrayBuffer()` íntegro y aplica el tope después
 * (mismo comportamiento que había antes para ese caso).
 *
 * Deja propagar cualquier error de la lectura (en particular el `abort()`
 * del timeout, que el llamador debe poder cortar también mientras lee el
 * cuerpo, no sólo mientras esperan los encabezados).
 */
async function readBodyWithLimit(response: Response, maxBytes: number): Promise<Buffer | null> {
  const body = response.body
  if (!body || typeof body.getReader !== 'function') {
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    return buffer.length > maxBytes ? null : buffer
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    total += value.length
    if (total > maxBytes) {
      try {
        await reader.cancel()
      } catch {
        // No importa si el cancel falla: igual se rechaza la descarga.
      }
      return null
    }
    chunks.push(value)
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
}

/**
 * Descarga `url` con las reglas de seguridad de la tarea: timeout de 10s,
 * tamaño máximo igual al de la ingesta de Instagram, sólo `Content-Type`
 * `image/*`, y redirecciones seguidas a mano (hasta `MAX_REDIRECTS`) para
 * poder validar también el destino de cada salto, no sólo la URL de partida.
 * Devuelve `null` si algo falla, con el motivo logueado.
 *
 * El timeout cubre toda la operación, incluida la lectura del cuerpo: el
 * `clearTimeout` se hace después de terminar de leer (o de rechazar) el
 * cuerpo, no apenas llegan los encabezados — un origen que contesta rápido
 * pero manda el cuerpo gota a gota no puede colgar la descarga.
 */
async function downloadImageSafely(url: string): Promise<DownloadedImage | null> {
  let currentUrl = url

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = validateExternalImageUrl(currentUrl)
    if (!check.ok) {
      console.warn(`[external-images] Rechazada (${check.reason}): ${currentUrl}`)
      return null
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

    try {
      let response: Response
      try {
        response = await fetch(currentUrl, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QuePintaSalta/1.0)' },
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn(`[external-images] Error de red descargando ${currentUrl}: ${message}`)
        return null
      }

      // Redirección: se sigue a mano (hasta MAX_REDIRECTS) para poder validar
      // también el destino, no sólo la URL de partida.
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) {
          console.warn(`[external-images] Redirección sin Location: ${currentUrl}`)
          return null
        }
        try {
          currentUrl = new URL(location, currentUrl).toString()
        } catch {
          console.warn(`[external-images] Location de redirección inválida: ${location}`)
          return null
        }
        continue
      }

      if (!response.ok) {
        console.warn(`[external-images] HTTP ${response.status} descargando ${currentUrl}`)
        return null
      }

      const rawContentType = response.headers.get('content-type') || ''
      const contentType = rawContentType.split(';')[0].trim().toLowerCase()
      if (!contentType.startsWith('image/')) {
        console.warn(`[external-images] Content-Type no es imagen (${rawContentType || '(vacío)'}): ${currentUrl}`)
        return null
      }

      const contentLengthHeader = response.headers.get('content-length')
      if (contentLengthHeader && Number(contentLengthHeader) > INSTAGRAM_ENGINE_CONFIG.MAX_IMAGE_SIZE) {
        console.warn(`[external-images] Content-Length excede el máximo: ${currentUrl}`)
        return null
      }

      let buffer: Buffer | null
      try {
        buffer = await readBodyWithLimit(response, INSTAGRAM_ENGINE_CONFIG.MAX_IMAGE_SIZE)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn(`[external-images] Error leyendo el cuerpo de ${currentUrl}: ${message}`)
        return null
      }

      if (!buffer) {
        console.warn(
          `[external-images] Imagen excede ${INSTAGRAM_ENGINE_CONFIG.MAX_IMAGE_SIZE / 1024 / 1024}MB: ${currentUrl}`
        )
        return null
      }

      return { buffer, contentType }
    } finally {
      clearTimeout(timeout)
    }
  }

  console.warn(`[external-images] Demasiadas redirecciones (> ${MAX_REDIRECTS}): ${url}`)
  return null
}

/**
 * Busca, sin descargar nada, si ya hay un objeto subido para esta URL
 * (cualquier extensión: el nombre es `<sha1>.<ext>`). Es lo que hace a
 * `copyExternalImage` idempotente — y, en el backfill (`scripts/imagenes-externas.ts`),
 * evita volver a pedir la misma imagen externa cuando varias filas comparten
 * la misma URL.
 */
async function findExistingPath(
  storage: ExternalImageStorageClient,
  hash: string
): Promise<string | null> {
  const { data, error } = await storage.list(EXTERNAL_IMAGES_FOLDER, { search: hash })
  if (error) {
    console.warn(`[external-images] No se pudo listar "${EXTERNAL_IMAGES_FOLDER}": ${error.message}`)
    return null
  }
  const match = (data ?? []).find((item) => item.name.startsWith(hash))
  return match ? `${EXTERNAL_IMAGES_FOLDER}/${match.name}` : null
}

function publicUrlFor(storage: ExternalImageStorageClient, path: string): string {
  return storage.getPublicUrl(path).data.publicUrl
}

/**
 * Copia `url` (una imagen externa: ticketera, cine, peña, museo) al bucket
 * `flyers_ig`, en `externas/<sha1 de la URL>.<ext>`, con sus variantes WebP
 * de 400 y 800px. Devuelve la URL pública en Storage, o `null` si algo
 * falla — el llamador guarda la URL original, como hoy.
 *
 * Idempotente: si ya hay un objeto subido para esta URL (mismo hash, sin
 * importar la extensión), no se descarga ni se sube de nuevo; se devuelve
 * directamente su URL pública.
 */
export async function copyExternalImage(
  url: string,
  storage: ExternalImageStorageClient
): Promise<string | null> {
  const hash = sha1Hex(url)

  const existingPath = await findExistingPath(storage, hash)
  if (existingPath) {
    return publicUrlFor(storage, existingPath)
  }

  const downloaded = await downloadImageSafely(url)
  if (!downloaded) return null

  const { buffer, contentType } = downloaded
  const ext = extensionForContentType(contentType)
  if (!ext) {
    console.warn(`[external-images] Content-Type de imagen no soportado (${contentType}): ${url}`)
    return null
  }

  const storagePath = `${EXTERNAL_IMAGES_FOLDER}/${hash}.${ext}`

  const { error: uploadError } = await storage.upload(storagePath, buffer, {
    contentType,
    cacheControl: STORAGE_CACHE_CONTROL,
    upsert: false,
  })

  if (uploadError) {
    console.error(`[external-images] Error subiendo ${storagePath}: ${uploadError.message}`)
    return null
  }

  // Variantes 400/800px (QPS-004 §5). Si la extensión no es `.jpg`,
  // variantPath() devuelve null para los dos anchos y no se sube nada: no es
  // una falla, FlyerImage simplemente no pide variante para este original.
  try {
    const variants = await makeVariants(buffer)
    for (const width of VARIANT_WIDTHS) {
      const variantStoragePath = variantPath(storagePath, width)
      if (!variantStoragePath) continue

      const { error: variantError } = await storage.upload(variantStoragePath, variants[width], {
        contentType: 'image/webp',
        cacheControl: STORAGE_CACHE_CONTROL,
        upsert: false,
      })

      if (variantError) {
        console.error(
          `[external-images] Error subiendo variante ${width}px (${variantStoragePath}): ${variantError.message}`
        )
      }
    }
  } catch (variantErr) {
    console.error(`[external-images] Excepción generando variantes de ${storagePath}:`, variantErr)
  }

  return publicUrlFor(storage, storagePath)
}
