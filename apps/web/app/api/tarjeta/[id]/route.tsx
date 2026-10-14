import { ImageResponse } from 'next/og'
import { createAdminClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/metricas'
import { PUBLIC_EVENT_ROW_SELECT } from '@/lib/events/public-select'
import { formatEventDate } from '@/lib/date-format'
import { capitalizeFirst, formatEventTimeDisplay } from '@/lib/event-display'
import type { Event } from '@/lib/types'

export const dynamic = 'force-dynamic'

const WIDTH = 1080
const HEIGHT = 1350

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
}

// Valores copiados de app/globals.css (no se importa CSS: Satori, detrás de
// `next/og`, no evalúa custom properties ni la función oklch()). Son el
// equivalente sRGB de los tokens --primary, --primary-foreground y
// --foreground de :root.
const BRAND_PRIMARY = '#a30419' // oklch(0.45 0.18 25)
const BRAND_PRIMARY_FOREGROUND = '#ffffff' // oklch(1 0 0)
const BRAND_FOREGROUND = '#0a0a0a' // oklch(0.145 0 0)

const MAX_TITLE_LENGTH = 72
const MAX_VENUE_LENGTH = 48

/** Corta `text` a `max` caracteres con "…" al final; no hace nada si ya entra. */
function truncate(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

// -----------------------------------------------------------------------
// Afiche: solo se baja si image_url es del propio Storage (el host de
// NEXT_PUBLIC_SUPABASE_URL). Nunca se pide una imagen a un host de
// terceros (misma familia que QPS-090, lib/images/external.ts).
// -----------------------------------------------------------------------

/** Formatos que Satori sabe dibujar hoy. WebP queda afuera (cambio d, 23-c):
 * 23-d lo midió con el ImageResponse real y Satori no lo decodifica, así que
 * sumarlo acá no alcanzaría — habría que convertirlo antes a PNG o JPEG. */
const POSTER_FORMATS = ['png', 'jpeg'] as const
type PosterFormat = (typeof POSTER_FORMATS)[number]

const POSTER_FETCH_TIMEOUT_MS = 5_000
const MAX_POSTER_BYTES = 5 * 1024 * 1024

function isOwnStorageHost(imageUrl: string): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return false
  try {
    const target = new URL(imageUrl)
    if (target.protocol !== 'https:') return false
    // Credenciales embebidas (https://usuario:clave@host-propio/...): se
    // rechazan por consistencia con safeTicketUrl (lib/metricas/url.ts), aunque
    // acá no habilitan salir a un tercero (el host sigue siendo el propio).
    if (target.username || target.password) return false
    return target.host === new URL(supabaseUrl).host
  } catch {
    return false
  }
}

/** PNG, JPEG o null, mirando los primeros bytes (magic bytes), no la extensión ni el Content-Type declarado. */
function detectPosterFormat(buffer: Buffer): PosterFormat | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg'
  }
  // WebP (RIFF....WEBP) y cualquier otro formato: no está en POSTER_FORMATS.
  return null
}

/** Lee `response` sin superar `maxBytes`; corta y cancela el stream apenas se excede. */
async function readWithLimit(response: Response, maxBytes: number): Promise<Buffer | null> {
  const body = response.body
  if (!body || typeof body.getReader !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer())
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
 * Descarga el afiche (solo del Storage propio, ya verificado por el
 * llamador) con timeout de 5s y tope de 5MB, y lo devuelve como `data:` URL
 * solo si el formato real (por los primeros bytes) está en POSTER_FORMATS.
 * Cualquier error, timeout, tope superado o formato no soportado: `null`,
 * sin lanzar — la tarjeta sale sin afiche y sin error (200).
 */
async function downloadPosterDataUrl(imageUrl: string): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), POSTER_FETCH_TIMEOUT_MS)

  try {
    let response: Response
    try {
      // redirect: 'manual': el llamador ya validó que imageUrl es del
      // Storage propio, pero ese chequeo cubre solo el primer salto. Sin
      // esto, fetch seguiría una redirección por su cuenta y terminaríamos
      // pidiéndole contenido a un host nunca validado (misma familia que
      // QPS-090, resuelta en lib/images/external.ts revalidando cada salto).
      // Acá no hace falta seguir ninguno: el Storage propio sirve el objeto
      // directo, así que una redirección es señal de que algo no es lo que
      // esperábamos y se rechaza.
      response = await fetch(imageUrl, { signal: controller.signal, redirect: 'manual' })
    } catch {
      return null
    }
    if (response.status >= 300 && response.status < 400) return null
    if (!response.ok) return null

    const buffer = await readWithLimit(response, MAX_POSTER_BYTES)
    if (!buffer) return null

    const format = detectPosterFormat(buffer)
    if (!format || !(POSTER_FORMATS as readonly string[]).includes(format)) return null

    const mime = format === 'png' ? 'image/png' : 'image/jpeg'
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function notFound() {
  return new Response(null, { status: 404 })
}

/**
 * Tarjeta de 1080x1350 para compartir un evento (botón "compartir" de la
 * app; R23, 23-c). No reemplaza el `og:image` de la ficha, que sigue
 * mandando el afiche original tal cual.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return notFound()

  const supabase = createAdminClient()

  const { data: eventRow } = await supabase
    .from('events')
    .select(PUBLIC_EVENT_ROW_SELECT)
    .eq('id', id)
    .eq('status', 'PUBLISHED')
    .maybeSingle()

  if (!eventRow) return notFound()
  const event = eventRow as unknown as Event

  let venueName: string | null = null
  if (event.venue_id) {
    const { data: venueRow } = await supabase
      .from('venues')
      .select('name')
      .eq('id', event.venue_id)
      .maybeSingle()
    venueName = venueRow?.name ?? null
  }

  let posterDataUrl: string | null = null
  if (event.image_url && isOwnStorageHost(event.image_url)) {
    posterDataUrl = await downloadPosterDataUrl(event.image_url)
  }

  const title = truncate(event.title, MAX_TITLE_LENGTH)
  const dateLabel = capitalizeFirst(formatEventDate(event.start_date, false))
  const timeLabel = formatEventTimeDisplay(event.start_date)
  const dateTimeLabel = timeLabel ? `${dateLabel} · ${timeLabel} hs` : `${dateLabel} · Sin hora`
  const venueLabel = truncate(venueName ?? 'Lugar por confirmar', MAX_VENUE_LENGTH)

  const content = (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: BRAND_PRIMARY,
        color: BRAND_PRIMARY_FOREGROUND,
        fontFamily: 'sans-serif',
      }}
    >
      {posterDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={posterDataUrl}
          alt=""
          width={WIDTH}
          height={HEIGHT}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}
      {posterDataUrl && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            background:
              `linear-gradient(to top, ${BRAND_FOREGROUND} 0%, rgba(10,10,10,0.75) 35%, rgba(10,10,10,0) 60%)`,
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          padding: '72px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: '0.02em',
            opacity: 0.85,
          }}
        >
          QUÉ PINTA SALTA
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.15,
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', fontSize: 36, fontWeight: 500 }}>{dateTimeLabel}</div>
        <div style={{ display: 'flex', fontSize: 36, fontWeight: 500, opacity: 0.9 }}>{venueLabel}</div>
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 400, opacity: 0.75, marginTop: 12 }}>
          quepintasalta.com.ar
        </div>
      </div>
    </div>
  )

  return new ImageResponse(content, {
    width: WIDTH,
    height: HEIGHT,
    headers: CACHE_HEADERS,
  })
}
