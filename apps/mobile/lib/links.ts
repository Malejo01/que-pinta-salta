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
 *
 * `urlMapaLugar`/`urlMapaDelEvento`/`tienePinEnElMapa` (A4, nube Q1: "Ver en
 * el mapa" en la ficha) tampoco parsean con `URL`: validan con `esUuid` y
 * una regex de día, y concatenan. La regla de "tiene pin" NO se reescribe
 * acá: es `aCoordenada` (`@qps/core/mapa/pines`) + `coordenadasEnSalta`
 * (`@qps/core/mapa/zona`), las dos exportadas, las mismas que usan
 * `armarPinesDelMapa` y `VerEnElMapa` de la web.
 */
import { formatSaltaDayKey } from '@qps/core/date-format'
import { aCoordenada } from '@qps/core/mapa/pines'
import { coordenadasEnSalta } from '@qps/core/mapa/zona'
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
// si `TERMINOS_PUBLICADOS` es `false`.
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
 * si `TERMINOS_PUBLICADOS` es `false` (hoy está en `true`: `/terminos` ya
 * está publicado) esta función la rechaza igual — así ningún componente
 * puede abrir un 404 por error, aunque la pida.
 */
export function urlSitio(ruta: string): string | null {
  if (ruta === RUTA_TERMINOS && !TERMINOS_PUBLICADOS) return null
  return (RUTAS_SITIO_PERMITIDAS as readonly string[]).includes(ruta) ? `${SITIO}${ruta}` : null
}

// ---------------------------------------------------------------------------
// "Ver en el mapa" (A4, nube Q1). La app no tiene mapa propio: el botón de la
// ficha abre `/mapa` de la web en el navegador, con el lugar ya elegido. La
// web (`apps/web/app/mapa/page.tsx`) solo preselecciona el lugar si `?lugar=`
// es un uuid Y hay un pin de ese lugar en el filtro que abre; los pines salen
// de `armarPinesDelMapa` (`@qps/core/mapa/pines`), que deja afuera un lugar
// sin coordenadas o con coordenadas fuera de `coordenadasEnSalta`. Por eso el
// botón solo aparece cuando el lugar tendría pin (`tienePinEnElMapa`), y el
// link lleva también el día del evento (ver `urlMapaLugar`).
// ---------------------------------------------------------------------------

/** Lo mínimo de un lugar para decidir si tiene pin y armar el link (lo cumple `Venue`, sin cast). */
export interface LugarParaMapa {
  id: string
  /** `unknown`: PostgREST puede mandar un `numeric` como texto (ver `aCoordenada` en `@qps/core/mapa/pines`). */
  latitude: unknown
  longitude: unknown
}

/**
 * `true` si el lugar tendría pin en `/mapa` de la web: la misma regla que
 * `armarPinesDelMapa` y `VerEnElMapa` (web) — `aCoordenada` sobre latitud y
 * longitud (número finito o string numérico; `''`, `null`, `NaN` o cualquier
 * otra cosa dan `null`) y después `coordenadasEnSalta`. Sin lugar, `false`.
 * Que caiga en el filtro del día no se puede saber desde acá (la ficha no
 * tiene los demás eventos): eso lo resuelve la web, que si no hay pin abre
 * el mapa sin lugar elegido, nunca una página rota.
 */
export function tienePinEnElMapa(venue: Pick<LugarParaMapa, 'latitude' | 'longitude'> | null | undefined): boolean {
  if (!venue) return false
  return coordenadasEnSalta(aCoordenada(venue.latitude), aCoordenada(venue.longitude))
}

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Link absoluto a `/mapa` de la web con `venueId` elegido:
 * `${SITIO}/mapa?lugar=<uuid>`, con el uuid en minúsculas (la web compara
 * `pin.venueId === lugar` tal cual, y los ids de Postgres van en
 * minúsculas). `null` si `venueId` no es un uuid: así nada que no sea un id
 * (`x&y=z`, `../`, una URL entera) llega a la query string.
 *
 * Con `dia` (`AAAA-MM-DD`), el link es
 * `${SITIO}/mapa?cuando=fecha&dia=<dia>&lugar=<uuid>`: el mismo orden y los
 * mismos parámetros que arma `VerEnElMapa` de la web
 * (`apps/web/components/ver-en-el-mapa.tsx`). Sin el día, `/mapa` abre en
 * "hoy" y, para un evento de otro día, el lugar no tiene pin en ese filtro y
 * la web no lo elige. Un `dia` con otra forma se ignora (queda solo
 * `?lugar=`); que esté dentro de los 60 días que acepta la web lo decide
 * `parsearFiltroMapa` del lado de la web (si no, cae en "hoy").
 *
 * No va directo a `Linking.openURL` desde la ficha: la ficha usa
 * `urlMapaDelEvento`, que además exige que el lugar tenga pin
 * (`tests/ver-en-el-mapa.test.ts`).
 */
export function urlMapaLugar(venueId: string, dia?: string | null): string | null {
  // `typeof`: el id sale de la base; si alguna vez llega otra cosa (`null`,
  // un número), da `null` en vez de tirar en `.trim()`.
  if (typeof venueId !== 'string') return null
  const id = venueId.trim()
  if (!esUuid(id)) return null
  const lugar = id.toLowerCase()
  return dia && DIA_RE.test(dia) ? `${SITIO}/mapa?cuando=fecha&dia=${dia}&lugar=${lugar}` : `${SITIO}/mapa?lugar=${lugar}`
}

/**
 * El día de Salta (`AAAA-MM-DD`) de un inicio, o `null` si no es una fecha
 * válida (`formatSaltaDayKey` tira `RangeError` con un `Date` inválido). El
 * día de Salta, no el día UTC crudo: un evento a las 23:30 de Salta queda
 * guardado con la fecha del día siguiente en UTC (mismo cuidado que
 * `VerEnElMapa` de la web).
 */
function diaDeSalta(inicio: string | null | undefined): string | null {
  if (!inicio) return null
  const fecha = new Date(inicio)
  if (Number.isNaN(fecha.getTime())) return null
  return formatSaltaDayKey(fecha)
}

/**
 * El link de "Ver en el mapa" de la ficha (A4, nube Q1): `null` si el evento
 * no tiene lugar, si el lugar no tendría pin (`tienePinEnElMapa`) o si su id
 * no es un uuid (`urlMapaLugar`). Es la única función por la que la ficha
 * abre `/mapa` (`tests/aperturas-url.test.ts`): el botón solo se dibuja si
 * esto no es `null`.
 */
export function urlMapaDelEvento(evento: {
  start_date?: string | null
  venue?: LugarParaMapa | null
}): string | null {
  const venue = evento.venue
  if (!venue || !tienePinEnElMapa(venue)) return null
  return urlMapaLugar(venue.id, diaDeSalta(evento.start_date))
}
