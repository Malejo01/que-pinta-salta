/**
 * La vista de la ficha, con origen `app` (R43, tarea 43-e).
 *
 * `POST /api/metricas/vista` descarta lo que `isBotOrPrefetch`
 * (`apps/web/lib/metricas/bots.ts`) marca como bot, y `BOT_UA_RE` incluye
 * `okhttp`: el `fetch` de React Native en Android sale con
 * `User-Agent: okhttp/x.y.z` si no se le pasa otro. Por eso la app manda un
 * `User-Agent` propio (`userAgentApp`) — sin él, la vista se descartaría en
 * silencio, sin ningún error.
 *
 * Puro: sin React ni `fetch`. Lo usa `apps/mobile/lib/metricas.ts`.
 */
import { SITIO } from './links'

export const RUTA_VISTA = '/api/metricas/vista'

/** Link absoluto al endpoint de la vista. */
export function urlVista(): string {
  return SITIO + RUTA_VISTA
}

// Duplicado a propósito: el `isUuid` de `./links` es privado (no se exporta)
// y ese archivo no está entre los archivos permitidos de esta tarea. Misma
// regex.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(id: string): boolean {
  return UUID_RE.test(id)
}

/**
 * El body de la vista: solo `{ eventId, origin: 'app' }`, nunca usuario,
 * dispositivo ni versión (la versión va en el `User-Agent`, no acá).
 * `null` si `eventId` no es un uuid: quien llama no debe mandar ningún
 * `fetch` en ese caso.
 */
export function cuerpoVista(eventId: string): string | null {
  return isUuid(eventId) ? JSON.stringify({ eventId, origin: 'app' }) : null
}

const VERSION_SANEADA_RE = /[^0-9A-Za-z.-]/g
const TOPE_VERSION = 20

/**
 * `QuePintaSaltaApp/<versión>`, saneada a `[0-9A-Za-z.-]` y con un tope de
 * 20 caracteres (`0` si queda vacía). El saneado es lo único que separa "se
 * cuenta" de "se descarta en silencio": `BOT_UA_RE` matchea, entre otras,
 * `bot`, `preview`, `monitor`, `java/`, `vercel` y `apify` — una versión sin
 * sanear podría meter alguna de esas palabras en el `User-Agent` y perder
 * la vista sin ningún error.
 */
export function userAgentApp(version: string): string {
  const saneada = version.replace(VERSION_SANEADA_RE, '').slice(0, TOPE_VERSION)
  return `QuePintaSaltaApp/${saneada || '0'}`
}
