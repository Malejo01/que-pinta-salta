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

const PREFIJO_NUMERICO_RE = /^[0-9]+(?:\.[0-9]+)*/
const TOPE_VERSION = 20

/**
 * `QuePintaSaltaApp/<versión>`, donde `<versión>` es el prefijo numérico con
 * puntos (`PREFIJO_NUMERICO_RE`: uno o más dígitos, con grupos de dígitos
 * separados por puntos) del principio de `version`, recortado a 20
 * caracteres (`0` si no hay prefijo, por ejemplo con `''` o con algo que
 * empieza con letra). No es una lista negra de palabras: no puede serlo,
 * porque siempre se queda corta cuando `BOT_UA_RE` crece. En cambio, la
 * propiedad que garantiza es que la salida **nunca contiene una letra
 * después de la barra** — ni las que `BOT_UA_RE` ya tiene (`bot`, `preview`,
 * `monitor`, `java/`, `vercel`, `apify`) ni las que se agreguen mañana —, así
 * que ninguna versión puede hacer que `isBotOrPrefetch`
 * (`apps/web/lib/metricas/bots.ts`) marque la vista como bot y la descarte
 * en silencio. El sufijo no numérico (por ejemplo, el `-preview` de
 * `1.0.0-preview`) simplemente se tira: la parte útil de la versión se
 * conserva.
 */
export function userAgentApp(version: string): string {
  const prefijo = PREFIJO_NUMERICO_RE.exec(version)?.[0] ?? ''
  const saneada = prefijo.slice(0, TOPE_VERSION)
  return `QuePintaSaltaApp/${saneada || '0'}`
}
