// Datos de "Compartir" (R42, 42-b), puros: sin React Native. El texto que
// hoy arma `compartir()` en `components/BotonCompartir.tsx` (R29, 29-b),
// movido acá SIN cambiarlo (mismo detector, `tests/compartir-ficha.test.ts`:
// el nombre `mensajeCompartirEvento` es la tercera forma válida), y los datos
// de la tarjeta 4:5 que dibuja `TarjetaCompartir` (42-d), copiados de la
// tarjeta de la web (`apps/web/app/api/tarjeta/[id]/route.tsx`) para que las
// dos se vean iguales.
import { capitalizeFirst, formatEventTimeDisplay } from '@qps/core/event-display'
import { formatEventDate } from '@qps/core/date-format'
import { urlEvento } from '@qps/core/metricas/links'

export interface DatosMensajeCompartirEvento {
  eventId: string
  titulo: string
  fecha: string
  hora?: string | null
  lugar: string
}

/**
 * El texto de "Compartir" de un evento puntual: mismo armado que tenía
 * `compartir()` en `BotonCompartir.tsx` (R29, 29-b), sin cambiarlo. El link
 * lleva siempre `urlEvento(eventId, 'app')` (nunca un dato de la sesión);
 * `null` si `eventId` no es un uuid (`urlEvento` da `null`).
 */
export function mensajeCompartirEvento({ eventId, titulo, fecha, hora, lugar }: DatosMensajeCompartirEvento): string | null {
  const url = urlEvento(eventId, 'app')
  if (!url) return null
  return `${titulo}\n${fecha}${hora ? ` · ${hora} hs` : ''} · ${lugar}\n${url}`
}

// ---------------------------------------------------------------------------
// Tarjeta para "Compartir imagen" (42-d la dibuja; esto solo arma los textos)
// ---------------------------------------------------------------------------

export const MAX_TITULO_TARJETA = 72
export const MAX_LUGAR_TARJETA = 48
export const MARCA_TARJETA = 'QUÉ PINTA SALTA'

/**
 * Corta `text` a `max` caracteres con "…" al final; no hace nada si ya
 * entra. Copia literal de `truncate` en
 * `apps/web/app/api/tarjeta/[id]/route.tsx`: la app no puede importar de
 * `apps/web`, así que la regla vive duplicada acá a propósito, para que las
 * dos tarjetas corten el texto exactamente igual.
 */
function truncate(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

export interface EventoParaTarjetaCompartir {
  id: string
  title: string
  start_date: string
  image_url: string | null
  venue?: { name: string } | null
}

export interface DatosTarjetaCompartir {
  titulo: string
  fechaHora: string
  lugar: string
  marca: string
  /** `www.quepintasalta.com.ar/evento/<id>`, sin `https://` y sin `?o=`: nadie lo tipea con el origen. */
  linkVisible: string
  /** Tal cual llega; la valida `Afiche` con `fuentesDeImagen`, no esta función. */
  imagenUrl: string | null
}

/**
 * Los datos de texto de la tarjeta 4:5 de "Compartir imagen", con las mismas
 * reglas que la tarjeta de la web (`apps/web/app/api/tarjeta/[id]/route.tsx`):
 * título a 72 caracteres, fecha/hora con "Sin hora" si no hay hora explícita,
 * lugar a 48 caracteres y el link visible sin esquema ni origen.
 *
 * `null` si `evento.id` no es un uuid (vía `urlEvento`) o si `start_date` no
 * es una fecha válida: `formatEventDate`/`formatEventTimeDisplay` tiran
 * `RangeError` con una fecha inválida (usan `Intl.DateTimeFormat().format()`),
 * y esta función se llama en el render de la ficha.
 */
export function datosTarjetaCompartir(evento: EventoParaTarjetaCompartir): DatosTarjetaCompartir | null {
  const urlSinOrigen = urlEvento(evento.id)
  if (!urlSinOrigen) return null
  if (Number.isNaN(new Date(evento.start_date).getTime())) return null

  const titulo = truncate(evento.title, MAX_TITULO_TARJETA)
  const dateLabel = capitalizeFirst(formatEventDate(evento.start_date, false))
  const timeLabel = formatEventTimeDisplay(evento.start_date)
  const fechaHora = timeLabel ? `${dateLabel} · ${timeLabel} hs` : `${dateLabel} · Sin hora`
  const lugar = truncate(evento.venue?.name ?? 'Lugar por confirmar', MAX_LUGAR_TARJETA)
  const linkVisible = urlSinOrigen.replace(/^https:\/\//, '')

  return {
    titulo,
    fechaHora,
    lugar,
    marca: MARCA_TARJETA,
    linkVisible,
    imagenUrl: evento.image_url,
  }
}
