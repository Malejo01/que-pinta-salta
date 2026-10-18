// La base de la caché sin conexión (R43, plan §§2-4; ops/rondas/43-sin-conexion/plan.md).
// Puro salvo el almacén inyectado (`Almacen`, de `./almacen`): nunca toca
// AsyncStorage directo, así que se prueba con un almacén en memoria.
//
// Qué se guarda (decisión 2 del plan): solo datos públicos — eventos,
// categorías, películas y la lista de favoritos (con los ids de favoritos
// que van implícitos en esa lista). Nunca sesión, tokens, email ni
// `user_id`: la sesión sigue en SecureStore (`lib/secure-storage.ts`). Qué
// construir con esos datos (la agenda, los favoritos) es de 43-b: este
// archivo solo sabe guardar y leer un sobre versionado bajo una clave.
//
// Formato y versión (decisión 3): el sobre es `{ v: VERSION_CACHE,
// guardadoEn, datos }`. Si el formato de `datos` cambia alguna vez, se sube
// `VERSION_CACHE`: una clave de otra versión, o un sobre con otro `v`, se
// trata como si no existiera (y se borra) en vez de romper la lectura.
//
// Ninguna función de este archivo loguea el contenido ni la clave completa
// (ni acá, ni en los `catch`): nada de esto va a Sentry.
import type { Almacen } from './almacen'
import { almacenPorDefecto } from './almacen'

/** Versión del sobre `{ v, guardadoEn, datos }`. Subirla invalida (y hace que se borre) todo lo guardado con una versión anterior. */
export const VERSION_CACHE = 1

/**
 * Prefijo de TODAS las claves de la caché sin conexión, de cualquier
 * versión — lo usan `borrarTodaLaCache` y `limpiarVersionesViejas` para
 * encontrarlas entre las demás claves de AsyncStorage sin tener que
 * listarlas a mano.
 */
export const PREFIJO_CACHE = 'qps:cache:'

export const CLAVE_AGENDA = 'qps:cache:v1:agenda'
export const CLAVE_FAVORITOS = 'qps:cache:v1:favoritos'

// R43, propuesta sin confirmar (plan §4, tabla de TTL y topes: a confirmar
// por Mauro; mientras tanto la ronda usa estos valores).
export const TTL_AGENDA_MS = 48 * 60 * 60 * 1000
export const TTL_FAVORITOS_MS = 7 * 24 * 60 * 60 * 1000
export const TOPE_CARACTERES_AGENDA = 1_000_000
export const TOPE_CARACTERES_FAVORITOS = 300_000
export const TOPE_ITEMS_AGENDA = 400
export const TOPE_ITEMS_FAVORITOS = 200

/** Hasta dónde recorta `description` `recortarParaCache` antes de contar caracteres. R43, propuesta sin confirmar. */
const LARGO_MAXIMO_DESCRIPCION = 300

/**
 * Cuánto pesa el sobre `{ v, guardadoEn, datos }` ALREDEDOR de `datos`
 * (todo menos lo que mide `datos` en sí), calculado en vez de puesto a
 * mano: se arma el sobre real con `datos: null` y se le resta el largo de
 * `'null'` (4 caracteres), así nunca se desincroniza si el sobre cambia de
 * forma. Es un número fijo porque `VERSION_CACHE` es siempre un solo dígito
 * y `Date.prototype.toISOString()` siempre da exactamente 24 caracteres
 * (`"1970-01-01T00:00:00.000Z"`, con año de 4 cifras — el rango de
 * `Date` no llega a un año de 5 cifras).
 *
 * `guardarCache` mide el sobre COMPLETO contra el tope de la clave; antes de
 * esta vuelta, `recortarParaCache` medía solo el array de `datos`, así que
 * una lista "al borde" podía pasar su propio chequeo y de todos modos hacer
 * que `guardarCache` la rechazara y borrara la clave vieja que sí
 * funcionaba (vuelta 1 de revisión de 43-a, `ops/rondas/43-sin-conexion`).
 * `recortarParaCache` descuenta este margen (más el de
 * `OpcionesRecorte.margenCaracteres`, si el llamador lo pasa) para que lo
 * que devuelve entre de verdad en `guardarCache`.
 */
export const MARGEN_SOBRE_CACHE =
  JSON.stringify({ v: VERSION_CACHE, guardadoEn: new Date(0).toISOString(), datos: null }).length - 'null'.length

export interface SobreCache<T> {
  v: number
  guardadoEn: string
  datos: T
}

export interface CacheLeida<T> {
  datos: T
  guardadoEn: Date
}

// `limpiarVersionesViejas` corre una sola vez por arranque (decisión 3 del
// plan: "la primera vez que se guarda algo en cada arranque"). La bandera
// vive a nivel de módulo: mientras el proceso de la app no reinicie, repetir
// el borrado en cada `guardarCache` de la misma sesión no aporta nada más
// que trabajo de más.
let versionesViejasLimpiadas = false

/** Solo para los tests: vuelve a permitir que la próxima `guardarCache` dispare `limpiarVersionesViejas`. */
export function reiniciarBanderaDeLimpieza(): void {
  versionesViejasLimpiadas = false
}

/**
 * "Época" de la caché de favoritos (vuelta 2 de revisión de 43-b, pedido de
 * seguridad): un contador de módulo, igual que `versionesViejasLimpiadas`
 * arriba — un solo almacén y un solo proceso de app, así que no hace falta
 * nada más elaborado. Arranca en 0 y sube cada vez que
 * `borrarCacheFavoritos`/`borrarTodaLaCache` DECIDEN borrar (ver el
 * comentario de cada una: el incremento va antes de cualquier `await`).
 *
 * El bloqueante que esto tapa: una carga de favoritos puede quedar
 * esperando `obtener(userId)` (hasta 15 s con red lenta, `TIMEOUT_RED_MS`
 * de `lib/favoritos.ts`) justo cuando llega un cierre de sesión, un cambio
 * de cuenta o una eliminación de cuenta. Ese borrado es fire-and-forget y
 * no cancela la petición en vuelo: sin esta época, la respuesta que llega
 * DESPUÉS del borrado podía volver a escribir en el disco la lista de la
 * cuenta que ya no es la actual (y una cuenta siguiente, sin red, la vería).
 * `cargarFavoritosConCache` (lib/sin-conexion/favoritos.ts) captura la
 * época antes de `await obtener(userId)` y la compara con la época actual
 * cuando la respuesta llega: si cambió, no escribe (ni lee) la caché.
 *
 * Memoria del proceso, nunca viaja al sobre ni al disco (no es parte de
 * `SobreCache`): si la app se reinicia no queda ninguna carga en vuelo que
 * invalidar, así que no hace falta persistirla. Monótona creciente: no hay
 * una función para bajarla ni para reiniciarla (ni siquiera "solo para
 * tests", como `reiniciarBanderaDeLimpieza"): los tests pueden leerla antes
 * y después de cada borrado, y eso alcanza.
 */
let epocaCacheFavoritos = 0

/** La época actual de la caché de favoritos. Ver el comentario de `epocaCacheFavoritos`. */
export function epocaDeCacheFavoritos(): number {
  return epocaCacheFavoritos
}

function esClaveDeCache(clave: string): boolean {
  return clave.startsWith(PREFIJO_CACHE)
}

function esClaveDeOtraVersion(clave: string): boolean {
  return esClaveDeCache(clave) && !clave.startsWith(`${PREFIJO_CACHE}v${VERSION_CACHE}:`)
}

function topeCaracteresDe(clave: string): number {
  return clave === CLAVE_FAVORITOS ? TOPE_CARACTERES_FAVORITOS : TOPE_CARACTERES_AGENDA
}

/**
 * Borra las claves `qps:cache:*` que no son de la versión actual (`v1`) —
 * por ejemplo `qps:cache:v0:agenda`, de un formato anterior. Nunca tira: un
 * almacén que falla al listar o al borrar deja esto sin hacer, sin romper
 * el guardado que la llamó (`guardarCache`, una vez por arranque).
 */
export async function limpiarVersionesViejas(almacen: Almacen = almacenPorDefecto): Promise<void> {
  try {
    const claves = await almacen.claves()
    const viejas = claves.filter(esClaveDeOtraVersion)
    if (viejas.length > 0) await almacen.borrarVarias(viejas)
  } catch {
    // Best-effort: no es motivo para romper `guardarCache`.
  }
}

export interface OpcionesGuardarCache {
  ahora: Date
  almacen?: Almacen
}

/**
 * Guarda `datos` bajo `clave` con el sobre `{ v: VERSION_CACHE, guardadoEn:
 * ahora.toISOString(), datos }`. Si el JSON resultante pasa el tope de
 * caracteres de esa clave (`TOPE_CARACTERES_AGENDA`/`_FAVORITOS`, según
 * `clave`), no escribe nada y borra lo que hubiera — nunca deja un sobre más
 * grande que el límite, aunque el llamador se haya olvidado de pasar la
 * lista por `recortarParaCache` antes. Nunca tira: cualquier error (al
 * serializar, al listar versiones viejas o al escribir/borrar en el
 * almacén) hace que devuelva `false`, sin tumbar la pantalla que llamó.
 */
export async function guardarCache<T>(
  clave: string,
  datos: T,
  { ahora, almacen = almacenPorDefecto }: OpcionesGuardarCache,
): Promise<boolean> {
  try {
    if (!versionesViejasLimpiadas) {
      versionesViejasLimpiadas = true
      await limpiarVersionesViejas(almacen)
    }

    const sobre: SobreCache<T> = { v: VERSION_CACHE, guardadoEn: ahora.toISOString(), datos }
    const texto = JSON.stringify(sobre)

    if (texto.length > topeCaracteresDe(clave)) {
      await almacen.borrar(clave)
      return false
    }

    await almacen.escribir(clave, texto)
    return true
  } catch {
    return false
  }
}

export interface OpcionesLeerCache {
  ahora: Date
  ttlMs: number
  almacen?: Almacen
}

/**
 * Lee el sobre guardado bajo `clave`. Devuelve `null` (y borra la clave, en
 * los casos que lo justifican) si: no hay nada; el JSON está roto; `v` no es
 * `VERSION_CACHE`; `guardadoEn` no es una fecha válida o es futura; o venció
 * `ttlMs` desde `guardadoEn` hasta `ahora`.
 *
 * La validación de `guardadoEn` pasa ACÁ, antes de que nadie la formatee:
 * `formatSaltaDayKey`/`formatSaltaClock` (`./aviso.ts`, vía `@qps/core`)
 * tiran `RangeError` con una fecha inválida, así que si esta función dejara
 * pasar un `guardadoEn` corrupto, el aviso explotaría más adelante en vez de
 * mostrar el error de siempre. Nunca tira: un almacén o un `JSON.parse` que
 * fallan dan `null`, igual que un sobre inválido.
 */
export async function leerCache<T>(
  clave: string,
  { ahora, ttlMs, almacen = almacenPorDefecto }: OpcionesLeerCache,
): Promise<CacheLeida<T> | null> {
  try {
    const texto = await almacen.leer(clave)
    if (texto === null) return null

    let sobre: SobreCache<T>
    try {
      sobre = JSON.parse(texto)
    } catch {
      await almacen.borrar(clave).catch(() => {})
      return null
    }

    if (sobre === null || typeof sobre !== 'object' || sobre.v !== VERSION_CACHE) {
      await almacen.borrar(clave).catch(() => {})
      return null
    }

    const guardadoEn = new Date(sobre.guardadoEn)
    const esFechaInvalida = Number.isNaN(guardadoEn.getTime())
    const esFutura = !esFechaInvalida && guardadoEn.getTime() > ahora.getTime()
    if (esFechaInvalida || esFutura) {
      await almacen.borrar(clave).catch(() => {})
      return null
    }

    const vencio = ahora.getTime() - guardadoEn.getTime() > ttlMs
    if (vencio) {
      await almacen.borrar(clave).catch(() => {})
      return null
    }

    return { datos: sobre.datos, guardadoEn }
  } catch {
    return null
  }
}

export interface OpcionesRecorte<T> {
  /** El tope del SOBRE completo que después escribe `guardarCache` (`TOPE_CARACTERES_AGENDA`/`_FAVORITOS`), no el tope del array: esta función ya descuenta `MARGEN_SOBRE_CACHE` sola. */
  topeCaracteres: number
  topeItems: number
  /**
   * Caracteres extra que el llamador agrega alrededor de ESTE array, además
   * del sobre `{ v, guardadoEn, datos }` (que `MARGEN_SOBRE_CACHE` ya
   * descuenta). Por ejemplo: si `datos` no va a ser el array pelado sino un
   * objeto con más campos al lado — `{ eventos, categorias, peliculas }`,
   * el caso de la agenda en 43-b — quien llame con la lista de `eventos`
   * tiene que pasar en `margenCaracteres` lo que pesan esas otras listas
   * más las llaves/comillas/comas del objeto que las envuelve. Si no lo
   * hace, esta función le va a decir "entra" a una lista que, ya puesta
   * dentro de ese objeto más grande y dentro del sobre, se pasa del tope en
   * `guardarCache` — el mismo agujero que esta vuelta tapa para el caso
   * simple (array pelado como `datos`, `margenCaracteres` en 0). Default
   * `0`: correcto solo cuando `datos` ES el array que se le pasa a
   * `guardarCache`, sin nada más al lado.
   */
  margenCaracteres?: number
  /**
   * Devuelve `item` con su descripción recortada a `LARGO_MAXIMO_DESCRIPCION`
   * caracteres. Inyectada a propósito: la forma de cada lista es distinta.
   * Favoritos guarda `DisplayEvent[]`, con `description` plana
   * (`item.description`); la agenda guarda `EventoVigenteParaInicio[]`, que
   * es `{ evento: DisplayEvent; paraAtajo: {...} }`, con la descripción
   * anidada en `item.evento.description`. Si `recortarParaCache` asumiera
   * una sola forma (por ejemplo leyendo `item.description` a secas), el
   * recorte de la agenda —la caché grande, hasta `TOPE_CARACTERES_AGENDA`
   * caracteres— no recortaría nada nunca: cada llamador (43-b) tiene que
   * pasar la función que le corresponde a su tipo.
   */
  sinDescripcionLarga: (item: T) => T
}

/**
 * Puro. Si `items` no entra en `topeCaracteres` (el tope del SOBRE
 * completo: ver `OpcionesRecorte.topeCaracteres` y `MARGEN_SOBRE_CACHE`)
 * una vez convertido a JSON, se recorta en este orden: primero la
 * descripción de cada ítem (con `sinDescripcionLarga`, a
 * `LARGO_MAXIMO_DESCRIPCION` caracteres), después se queda con los primeros
 * `topeItems` (los más próximos, en el orden en que ya vienen ordenados por
 * el llamador), y por último va sacando ítems del final hasta que el JSON
 * (del array solo, ya descontado el margen del sobre) entre. Los tres pasos
 * se aplican siempre (no solo cuando hace falta): si la lista ya entraba,
 * recortar una descripción corta o cortar en un `topeItems` más grande que
 * `items.length` no cambia nada, así que el resultado es el mismo.
 *
 * Devuelve `null` si ni la lista vacía entra (en la práctica, solo con un
 * `topeCaracteres` más chico que `MARGEN_SOBRE_CACHE + margenCaracteres +
 * 2` — los 2 caracteres de `JSON.stringify([])`).
 */
export function recortarParaCache<T>(
  items: readonly T[],
  { topeItems, topeCaracteres, margenCaracteres = 0, sinDescripcionLarga }: OpcionesRecorte<T>,
): T[] | null {
  const topeArray = topeCaracteres - MARGEN_SOBRE_CACHE - margenCaracteres

  let recortados = items.map(sinDescripcionLarga).slice(0, topeItems)

  while (recortados.length > 0 && JSON.stringify(recortados).length > topeArray) {
    recortados = recortados.slice(0, -1)
  }

  if (recortados.length === 0 && JSON.stringify([]).length > topeArray) return null

  return recortados
}

/** Recorta `texto` a `LARGO_MAXIMO_DESCRIPCION` caracteres. Para que cada `sinDescripcionLarga` de 43-b no repita el número mágico. */
export function recortarDescripcion(texto: string): string {
  return texto.slice(0, LARGO_MAXIMO_DESCRIPCION)
}

/** `qps:cache:v<N>:favoritos`, de cualquier versión — no solo `CLAVE_FAVORITOS` (`v1`). */
const PATRON_CLAVE_FAVORITOS = /^qps:cache:v\d+:favoritos$/

/**
 * Borra la clave de favoritos de CUALQUIER versión, no solo la actual
 * (`CLAVE_FAVORITOS`). Por qué: `limpiarVersionesViejas` (la que borra las
 * claves de otras versiones) solo corre dentro de un `guardarCache`
 * exitoso, es decir, con red. Si `VERSION_CACHE` sube y la persona no
 * vuelve a tener una carga buena de Favoritos antes de cerrar sesión o
 * cambiar de cuenta (lo que va a usar 43-d), la lista de favoritos de la
 * versión vieja quedaba en el disco sin que nada la alcanzara. Nunca tira.
 *
 * Primero sube `epocaCacheFavoritos` (vuelta 2 de revisión, seguridad): ANTES
 * de cualquier `await`, para que invalide una carga de favoritos en vuelo
 * desde el instante en que se decide borrar, no desde que el borrado (que
 * sigue, debajo, siendo best-effort y asíncrono) termina. Si se
 * incrementara al final, la ventana seguiría abierta justo mientras el
 * borrado corre. Esto no puede fallar (es un entero en memoria), así que
 * queda fuera del `try`/`catch` de abajo.
 */
export async function borrarCacheFavoritos(almacen: Almacen = almacenPorDefecto): Promise<void> {
  epocaCacheFavoritos += 1
  try {
    const claves = await almacen.claves()
    const propias = claves.filter((clave) => PATRON_CLAVE_FAVORITOS.test(clave))
    if (propias.length > 0) await almacen.borrarVarias(propias)
  } catch {
    // Best-effort: ver el comentario de `limpiarVersionesViejas`.
  }
}

/**
 * Borra todas las claves que empiezan con `PREFIJO_CACHE`, de cualquier
 * versión (incluida la actual). Nunca tira. Sube `epocaCacheFavoritos`
 * primero, por la misma razón que `borrarCacheFavoritos` (es el camino de
 * eliminar la cuenta, que también puede llegar con una carga de favoritos
 * en vuelo).
 */
export async function borrarTodaLaCache(almacen: Almacen = almacenPorDefecto): Promise<void> {
  epocaCacheFavoritos += 1
  try {
    const claves = await almacen.claves()
    const propias = claves.filter(esClaveDeCache)
    if (propias.length > 0) await almacen.borrarVarias(propias)
  } catch {
    // Best-effort: ver el comentario de `limpiarVersionesViejas`.
  }
}
