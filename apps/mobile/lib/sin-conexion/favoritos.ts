// La carga de Favoritos con caché (R43, 43-b; plan §§4-6, ops/rondas/43-sin-conexion/plan.md).
//
// Punto 4 del plan (TTL y topes, propuesta sin confirmar): la lista vive bajo
// `CLAVE_FAVORITOS` con `TTL_FAVORITOS_MS` (7 días), recortada a
// `TOPE_ITEMS_FAVORITOS` ítems (200) y `TOPE_CARACTERES_FAVORITOS` (300.000)
// de JSON. En la R43 `datos` era el array pelado (`DisplayEvent[]`, lo que
// devolvía `obtenerFavoritos` — decisión 2 del plan); desde QPS-262 es
// `{ voy, eventos }` (ver más abajo), y por eso el recorte deja un margen de
// caracteres para el objeto.
//
// Punto 5: la caché solo se muestra si la carga falló por red
// (`sinConexion: true`) y hay una caché válida (TTL no vencido). Cualquier
// otro error —incluido `MENSAJE_SIN_CONFIGURACION`— muestra el error de
// siempre, nunca la caché. La caché se escribe solo después de una carga
// buena, nunca mientras se está mostrando la caché. Una carga buena sin
// ningún favorito (`{ ok: true, eventos: [] }`, el camino sin red de
// `obtenerFavoritos`) también cuenta como "salió bien": sobreescribe la
// caché con la lista vacía, así no quedan favoritos viejos después de
// borrarlos todos.
//
// Punto 6: al mostrar la caché, `paraMostrarFavoritos` saca los eventos (no
// películas ni flyers) cuyo `date` (día de Salta, `'YYYY-MM-DD'`, ya puesto
// por `transformEvent`) ya pasó, comparado contra el día de Salta de
// `ahora`. Mantiene el orden.
//
// QPS-262 (decisión de Mauro, 18/10): desde la R47 la carga trae dos listas,
// `voy` (la sección "Voy" de Mis eventos) y `eventos` (Guardados, sin los
// Voy). La caché guarda las dos, `{ voy, eventos }`, así sin conexión se ve
// igual que con red. Una caché de antes (`datos` como array pelado, el
// formato de la R43) se lee como `{ voy: [], eventos: <ese array> }`: no
// hace falta subir `VERSION_CACHE`. El recorte (`recortarParaCache`) se
// aplica a las dos listas juntas, Voy primero: si hay que sacar ítems, salen
// los últimos Guardados antes que un Voy.
//
// El `userId` nunca se guarda: solo se usa para llamar a `obtener`.
//
// Vuelta 1 de la revisión de 43-b (seguridad): lo que vuelve de AsyncStorage
// es DATO, no instrucción — puede venir de un backup de Android restaurado
// (Expo deja `allowBackup` en `true`) o de un teléfono con root, con la
// versión correcta (`leerCache`/43-a sí valida eso) pero `datos` de otra
// forma. `cargarFavoritosConCache` y `leerFavoritosGuardados` envuelven el
// tramo que llama a `paraMostrarFavoritos` en un `try/catch`: si `datos` no
// es un array de ítems válidos, se trata exactamente igual que "no hay
// caché" (el error de siempre, o `null`), nunca se escapa la excepción.
//
// Vuelta 2 de la revisión de 43-b (seguridad, el bloqueante): una carga
// puede quedar esperando `obtener(userId)` justo cuando llega un cierre de
// sesión, un cambio de cuenta o una eliminación de cuenta — ese borrado
// (`borrarCacheFavoritos`/`borrarTodaLaCache`, `lib/session/index.tsx`) es
// fire-and-forget y no cancela la petición en vuelo. Sin nada más,
// `cargarFavoritosConCache` podía volver a escribir en el disco, DESPUÉS
// del borrado, la lista de una cuenta que ya no es la actual (y la cuenta
// siguiente, sin red, la vería). Por eso captura `epocaDeCacheFavoritos()`
// (`./cache`) antes de `await obtener(userId)` y la vuelve a comparar
// cuando la respuesta llega: si cambió, ni escribe (rama `ok`) ni lee
// (rama de error por red) la caché — ver el detalle en cada rama, abajo.
// `leerFavoritosGuardados` NO necesita este chequeo: sus dos únicos
// llamadores están los dos en `app/(tabs)/favoritos.tsx` (el
// `useFocusEffect` y `refrescar`, 43-c) y los dos hacen `await
// esperarBorradoDeCache()` antes de llamarla, así que cuando se ejecuta no
// hay ningún borrado en vuelo que invalidar. No hay ninguna otra ruta: si
// alguna vez aparece un llamador nuevo, tiene que esperar el borrado igual
// o llevar el chequeo de época.
import { formatDateInSalta } from '@qps/core/home/transform'
import type { DisplayEvent } from '@qps/core/home/types'
import { obtenerFavoritos, type ResultadoFavoritos } from '@/lib/favoritos'
import type { Almacen } from './almacen'
import {
  CLAVE_FAVORITOS,
  epocaDeCacheFavoritos,
  guardarCache,
  leerCache,
  recortarDescripcion,
  recortarParaCache,
  TOPE_CARACTERES_FAVORITOS,
  TOPE_ITEMS_FAVORITOS,
  TTL_FAVORITOS_MS,
} from './cache'

export interface DepsCargarFavoritos {
  /** Por defecto, `obtenerFavoritos` (lib/favoritos.ts). Inyectable para los tests. */
  obtener?: (userId: string) => Promise<ResultadoFavoritos>
  ahora?: Date
  almacen?: Almacen
}

// A6 (nube Q1): igual que `ResultadoCargaAgenda` (`./agenda.ts`), la rama de
// error suma `sinConexion: true` cuando `obtener` falló por red y no había
// nada guardado que mostrar (o la época cambió en el medio): la pantalla
// muestra entonces "No hay conexión y todavía no hay nada guardado..." en vez
// del error de siempre. Los `toEqual({ tipo: 'error', error })` de esos casos
// se actualizaron a propósito; un error que no es de red sigue sin la clave.
export type ResultadoCargaFavoritos =
  | { tipo: 'ok'; voy: DisplayEvent[]; eventos: DisplayEvent[]; desdeCache: { guardadoEn: Date } | null }
  | { tipo: 'error'; error: string; sinConexion?: true }

/** Lo que se guarda en `CLAVE_FAVORITOS` desde QPS-262 (antes, el array pelado de `eventos`). */
export interface DatosCacheFavoritos {
  voy: DisplayEvent[]
  eventos: DisplayEvent[]
}

/** Lo que agrega el objeto `{ voy, eventos }` alrededor de los ítems, para el tope de caracteres. */
const MARGEN_CARACTERES_DOS_LISTAS = 32

/**
 * Pura. Las dos listas recortadas para la caché, con el mismo tope de ítems y
 * de caracteres que antes pero sobre las dos juntas (Voy primero). `null` si
 * el recorte no da nada válido (como `recortarParaCache`).
 */
export function recortarFavoritosParaCache(voy: DisplayEvent[], eventos: DisplayEvent[]): DatosCacheFavoritos | null {
  const juntos = recortarParaCache([...voy, ...eventos], {
    topeCaracteres: TOPE_CARACTERES_FAVORITOS,
    topeItems: TOPE_ITEMS_FAVORITOS,
    margenCaracteres: MARGEN_CARACTERES_DOS_LISTAS,
    sinDescripcionLarga: sinDescripcionLargaFavoritos,
  })
  if (juntos === null) return null
  // `recortarParaCache` solo corta la cola, así que los primeros `voy.length`
  // (o menos) siguen siendo los Voy, en su orden.
  const cuantosVoy = Math.min(voy.length, juntos.length)
  return { voy: juntos.slice(0, cuantosVoy), eventos: juntos.slice(cuantosVoy) }
}

/**
 * Pura. Lee `datos` de la caché en cualquiera de los dos formatos: el de
 * QPS-262 (`{ voy, eventos }`) o el viejo de la R43 (el array de `eventos`,
 * que se lee con `voy: []`). Con cualquier otra forma tira, y quien la llama
 * lo trata como "no hay caché" (ver la vuelta 1 de la revisión, arriba).
 */
export function datosDeCacheFavoritos(datos: unknown): DatosCacheFavoritos {
  if (Array.isArray(datos)) return { voy: [], eventos: datos as DisplayEvent[] }
  if (datos !== null && typeof datos === 'object') {
    const { voy, eventos } = datos as Record<string, unknown>
    if (Array.isArray(voy) && Array.isArray(eventos)) return { voy: voy as DisplayEvent[], eventos: eventos as DisplayEvent[] }
  }
  throw new Error('caché de favoritos con una forma inesperada')
}

/** La descripción de `DisplayEvent` vive plana (a diferencia de la agenda, donde está anidada en `evento.description`). */
function sinDescripcionLargaFavoritos(item: DisplayEvent): DisplayEvent {
  return { ...item, description: recortarDescripcion(item.description) }
}

/**
 * Carga los favoritos de `userId` con caché: si `obtener` sale bien, guarda
 * (recortado) y devuelve la lista fresca; si falla por red, muestra la
 * caché (si hay y no venció); si falla por otra cosa, o no hay caché,
 * devuelve el error de siempre.
 */
export async function cargarFavoritosConCache(
  userId: string,
  deps: DepsCargarFavoritos = {},
): Promise<ResultadoCargaFavoritos> {
  const { obtener = obtenerFavoritos, ahora = new Date(), almacen } = deps

  // Capturada ANTES del `await`: si cambia mientras `obtener` está en
  // vuelo, es porque llegó un cierre de sesión, un cambio de cuenta o una
  // eliminación de cuenta antes de que la respuesta volviera (el
  // bloqueante de la vuelta 2, ver el comentario de cabecera).
  const epoca = epocaDeCacheFavoritos()
  const resultado = await obtener(userId)

  if (resultado.ok) {
    const recortados = recortarFavoritosParaCache(resultado.voy, resultado.eventos)

    // Igual que en la agenda: si el recorte no da nada válido, se deja la
    // caché vieja; si `guardarCache` falla, ya devuelve `false` sin tirar.
    // Si la época cambió, esta lista es de una sesión que ya no es la
    // actual: no se escribe (lo que la pantalla muestra en este render no
    // cambia por esto; el cambio de sesión ya la va a reemplazar cuando
    // llegue al estado de React) — lo único que se evita es dejarla en el
    // disco.
    if (recortados !== null && epocaDeCacheFavoritos() === epoca) {
      await guardarCache(CLAVE_FAVORITOS, recortados, { ahora, almacen })
    }

    return { tipo: 'ok', voy: resultado.voy, eventos: resultado.eventos, desdeCache: null }
  }

  if (!resultado.sinConexion) {
    return { tipo: 'error', error: resultado.error }
  }

  // Mismo chequeo del otro lado: si la época cambió mientras `obtener`
  // fallaba por red, la caché en disco (si quedó alguna) es de una sesión
  // que ya no es la actual — se devuelve el error de siempre, no la caché.
  if (epocaDeCacheFavoritos() !== epoca) {
    return { tipo: 'error', error: resultado.error, sinConexion: true }
  }

  const cache = await leerCache<unknown>(CLAVE_FAVORITOS, { ahora, ttlMs: TTL_FAVORITOS_MS, almacen })
  if (cache === null) {
    return { tipo: 'error', error: resultado.error, sinConexion: true }
  }

  // `paraMostrarFavoritos` tira si `cache.datos` no es un array de ítems
  // válidos (`.filter` sobre algo que no es array, o leer una propiedad de
  // un ítem que no es un objeto): ver el comentario de cabecera. Una caché
  // así se trata igual que si no existiera.
  try {
    const { voy, eventos } = datosDeCacheFavoritos(cache.datos)
    return {
      tipo: 'ok',
      voy: paraMostrarFavoritos(voy, ahora),
      eventos: paraMostrarFavoritos(eventos, ahora),
      desdeCache: { guardadoEn: cache.guardadoEn },
    }
  } catch {
    return { tipo: 'error', error: resultado.error, sinConexion: true }
  }
}

export interface DepsLeerFavoritos {
  ahora?: Date
  almacen?: Almacen
}

/**
 * Solo la lectura de la caché de favoritos, sin intentar `obtener` — para el
 * caso de 43-d: sin sesión por el token vencido y sin red, se muestra la
 * caché en lugar de "Entrá para guardar tus favoritos".
 */
export async function leerFavoritosGuardados(
  deps: DepsLeerFavoritos = {},
): Promise<{ guardadoEn: Date; voy: DisplayEvent[]; eventos: DisplayEvent[] } | null> {
  const { ahora = new Date(), almacen } = deps
  const cache = await leerCache<unknown>(CLAVE_FAVORITOS, { ahora, ttlMs: TTL_FAVORITOS_MS, almacen })
  if (cache === null) return null

  // Mismo resguardo que en `cargarFavoritosConCache`: una caché con `datos`
  // de forma inesperada se trata igual que "no hay caché" (`null`), no tira.
  try {
    const { voy, eventos } = datosDeCacheFavoritos(cache.datos)
    return { guardadoEn: cache.guardadoEn, voy: paraMostrarFavoritos(voy, ahora), eventos: paraMostrarFavoritos(eventos, ahora) }
  } catch {
    return null
  }
}

/**
 * Pura. Al mostrar la lista guardada: saca los eventos (no películas ni
 * flyers) cuyo `date` (día de Salta) ya pasó respecto del día de Salta de
 * `ahora`. Mantiene el orden.
 */
export function paraMostrarFavoritos(eventos: DisplayEvent[], ahora: Date): DisplayEvent[] {
  const hoyKey = formatDateInSalta(ahora)
  return eventos.filter((item) => item.isCinemaMovie || item.isInstagramFlyer || item.date >= hoyKey)
}
