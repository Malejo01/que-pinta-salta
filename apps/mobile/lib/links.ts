/**
 * Links que abren la app (el esquema `quepintasalta://` y los App Links
 * `https://www.quepintasalta.com.ar/evento/<uuid>`, declarados en
 * `app.config.ts`). Puro: sin `URL` global ni ningún import — Hermes no
 * tiene el polyfill de `URL` cargado en este módulo (`react-native-url-polyfill`
 * es solo para `@supabase/supabase-js`, en 24-b), así que el parseo es con
 * expresiones regulares. El test de 24-c lo corre en Vitest, entorno `node`.
 */

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const UUID_RE = new RegExp(`^${UUID}$`)

// Esquema propio: quepintasalta://evento/<uuid>, con o sin barra final y con
// o sin query string. Nada de subrutas (.../algo) ni de otro host.
const LINK_ESQUEMA_RE = new RegExp(`^quepintasalta:\\/\\/evento\\/(${UUID})\\/?(?:\\?[^\\s]*)?$`, 'i')

// App Link: https://www.quepintasalta.com.ar/evento/<uuid>, con o sin
// ?o=... y con o sin barra final. http (sin "s"), sin "www." o cualquier
// otro host no matchean.
const LINK_HTTPS_RE = new RegExp(
  `^https:\\/\\/www\\.quepintasalta\\.com\\.ar\\/evento\\/(${UUID})\\/?(?:\\?[^\\s]*)?$`,
  'i'
)

/** `true` si `valor` es un uuid (cualquier versión, mayúsculas o minúsculas). */
export function esUuid(valor: string): boolean {
  return UUID_RE.test(valor)
}

/**
 * Extrae el id de evento de un link que abre la app. Acepta
 * `quepintasalta://evento/<uuid>` y `https://www.quepintasalta.com.ar/evento/<uuid>`
 * (con o sin `?o=...` y con o sin barra final). Cualquier otra cosa — otro
 * host, `http`, `quepintasalta.com.ar` sin `www`, un id que no es uuid,
 * subrutas — da `null`.
 *
 * El uuid se devuelve en minúsculas (normalizado): el link puede llegar con
 * cualquier combinación de mayúsculas/minúsculas en el hexadecimal, pero el
 * id que usa el resto de la app (y el que guarda Postgres) es siempre en
 * minúsculas.
 */
export function eventoIdDesdeLink(url: string): string | null {
  const texto = url.trim()
  const coincidencia = LINK_ESQUEMA_RE.exec(texto) ?? LINK_HTTPS_RE.exec(texto)
  if (!coincidencia) return null
  return coincidencia[1].toLowerCase()
}
