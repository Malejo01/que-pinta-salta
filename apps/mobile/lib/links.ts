/**
 * Links que abren la app (el esquema `quepintasalta://` y los App Links
 * `https://www.quepintasalta.com.ar/evento/<uuid>`, declarados en
 * `app.config.ts`). `eventoIdDesdeLink`/`esUuid` son puras: sin `URL`
 * global — Hermes no tiene el polyfill de `URL` cargado en este módulo
 * (`react-native-url-polyfill` es solo para `@supabase/supabase-js`, en
 * 24-b), así que el parseo es con expresiones regulares. El test de 24-c lo
 * corre en Vitest, entorno `node`.
 *
 * `urlSitio` (R29, integración 29-h/F6) es la excepción: no parsea nada, solo
 * concatena, así que no necesita el polyfill de `URL`; importa `SITIO` de
 * `@qps/core/metricas/links` (la misma constante que usan `urlGo` y
 * `urlComoLlegar`) para no escribir el dominio a mano.
 */
import { SITIO } from '@qps/core/metricas/links'
import { RUTA_TERMINOS, TERMINOS_PUBLICADOS } from './legales'

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

// Lista cerrada de rutas propias que `urlSitio` puede abrir: "¿Olvidaste tu
// contraseña?" del login (R29-e la dejó armada en la web: `/auth/recuperar`)
// y los dos legales de QPS-237 (ronda 49), `/privacidad` y `/terminos`.
// Cualquier otra ruta, relativa o no, da `null`. `/terminos` además pasa por
// la guarda explícita de abajo: estar en esta lista no alcanza para abrirla
// mientras `TERMINOS_PUBLICADOS` sea `false`.
const RUTAS_SITIO_PERMITIDAS = ['/auth/recuperar', '/privacidad', RUTA_TERMINOS] as const

/**
 * Link absoluto a una ruta propia del sitio (`SITIO` de
 * `@qps/core/metricas/links`), solo si `ruta` está en la lista cerrada de
 * arriba. Mismo patrón que `urlGo`/`urlComoLlegar` (core) y
 * `urlCompraCineSegura` (`lib/datos/cines.ts`): valida y devuelve `null` si
 * no pasa; quien la usa hace `Linking.openURL(...).catch(() => {})`.
 *
 * Guarda aparte para `/terminos` (QPS-237): aunque esté en la lista cerrada
 * de arriba (para que esa lista siga siendo la única fuente de rutas),
 * mientras `TERMINOS_PUBLICADOS` sea `false` (`/terminos` vive en el #74,
 * sin mergear) esta función la rechaza igual — así ningún componente puede
 * abrir un 404 por error, aunque la pida.
 */
export function urlSitio(ruta: string): string | null {
  if (ruta === RUTA_TERMINOS && !TERMINOS_PUBLICADOS) return null
  return (RUTAS_SITIO_PERMITIDAS as readonly string[]).includes(ruta) ? `${SITIO}${ruta}` : null
}
