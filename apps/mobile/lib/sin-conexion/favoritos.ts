// La carga de Favoritos con caché (R43, 43-b; plan §§4-6, ops/rondas/43-sin-conexion/plan.md).
//
// Punto 4 del plan (TTL y topes, propuesta sin confirmar): la lista vive bajo
// `CLAVE_FAVORITOS` con `TTL_FAVORITOS_MS` (7 días), recortada a
// `TOPE_ITEMS_FAVORITOS` ítems (200) y `TOPE_CARACTERES_FAVORITOS` (300.000)
// de JSON. Acá `datos` SÍ es el array pelado (`DisplayEvent[]`, lo que
// devuelve `obtenerFavoritos` — decisión 2 del plan), así que
// `recortarParaCache` no necesita `margenCaracteres` (default 0): a
// diferencia de la agenda (`./agenda.ts`), no hay nada más al lado del array
// dentro de `datos`.
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
import { formatDateInSalta } from '@qps/core/home/transform'
import type { DisplayEvent } from '@qps/core/home/types'
import { obtenerFavoritos, type ResultadoFavoritos } from '@/lib/favoritos'
import type { Almacen } from './almacen'
import {
  CLAVE_FAVORITOS,
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

export type ResultadoCargaFavoritos =
  | { tipo: 'ok'; eventos: DisplayEvent[]; desdeCache: { guardadoEn: Date } | null }
  | { tipo: 'error'; error: string }

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
  const resultado = await obtener(userId)

  if (resultado.ok) {
    const recortados = recortarParaCache(resultado.eventos, {
      topeCaracteres: TOPE_CARACTERES_FAVORITOS,
      topeItems: TOPE_ITEMS_FAVORITOS,
      sinDescripcionLarga: sinDescripcionLargaFavoritos,
    })

    // Igual que en la agenda: si el recorte no da nada válido, se deja la
    // caché vieja; si `guardarCache` falla, ya devuelve `false` sin tirar.
    if (recortados !== null) {
      await guardarCache(CLAVE_FAVORITOS, recortados, { ahora, almacen })
    }

    return { tipo: 'ok', eventos: resultado.eventos, desdeCache: null }
  }

  if (!resultado.sinConexion) {
    return { tipo: 'error', error: resultado.error }
  }

  const cache = await leerCache<DisplayEvent[]>(CLAVE_FAVORITOS, { ahora, ttlMs: TTL_FAVORITOS_MS, almacen })
  if (cache === null) {
    return { tipo: 'error', error: resultado.error }
  }

  // `paraMostrarFavoritos` tira si `cache.datos` no es un array de ítems
  // válidos (`.filter` sobre algo que no es array, o leer una propiedad de
  // un ítem que no es un objeto): ver el comentario de cabecera. Una caché
  // así se trata igual que si no existiera.
  try {
    const eventos = paraMostrarFavoritos(cache.datos, ahora)
    return { tipo: 'ok', eventos, desdeCache: { guardadoEn: cache.guardadoEn } }
  } catch {
    return { tipo: 'error', error: resultado.error }
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
): Promise<{ guardadoEn: Date; eventos: DisplayEvent[] } | null> {
  const { ahora = new Date(), almacen } = deps
  const cache = await leerCache<DisplayEvent[]>(CLAVE_FAVORITOS, { ahora, ttlMs: TTL_FAVORITOS_MS, almacen })
  if (cache === null) return null

  // Mismo resguardo que en `cargarFavoritosConCache`: una caché con `datos`
  // de forma inesperada se trata igual que "no hay caché" (`null`), no tira.
  try {
    return { guardadoEn: cache.guardadoEn, eventos: paraMostrarFavoritos(cache.datos, ahora) }
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
