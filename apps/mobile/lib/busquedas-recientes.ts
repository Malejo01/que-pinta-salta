// Búsquedas recientes de Buscar (A5, nube Q1): las últimas
// `TOPE_BUSQUEDAS_RECIENTES` búsquedas de texto, guardadas SOLO en el
// teléfono. La lógica (normalizar, deduplicar, ordenar, topes, leer un sobre
// roto) es pura y vive arriba; la lectura/escritura usa el adaptador
// `Almacen` de `lib/sin-conexion/almacen.ts` — el único archivo de la app que
// importa el paquete de almacenamiento (regla de la R43, que fija el detector
// de `tests/sin-conexion-flujos.test.ts`) —, inyectable para que los tests
// pasen un doble en memoria.
//
// Privacidad (A5): lo que la persona busca nunca sale del teléfono. Este
// archivo no importa `lib/metricas*`, `lib/sentry`, `lib/supabase` ni ningún
// `fetch`, no loguea nada (ni en los `catch`) y la pantalla tampoco pasa el
// texto a ningún lado: `tests/busquedas-recientes.test.ts` lo fija con
// detectores sobre el código. Sentry no lo ve tampoco por los toques: las
// migas de toque de `Sentry.wrap` (`TouchEventBoundary`) solo leen la prop
// `sentry-label` (y una `labelName` que esta app no configura), nunca
// `accessibilityLabel` — por eso la etiqueta «Buscar de nuevo: jazz» no viaja.
//
// Clave y versión (A5): `qps:busquedas:v1:recientes`, con prefijo propio
// `qps:busquedas:` — a propósito FUERA de `qps:cache:` (`PREFIJO_CACHE`,
// `lib/sin-conexion/cache.ts`). Las limpiezas por prefijo del repo, caso por
// caso:
//   - Subir `VERSION_CACHE` (`limpiarVersionesViejas`, que borra las
//     `qps:cache:*` de otra versión): el historial SOBREVIVE. No es una copia
//     de datos públicos que se puede volver a bajar, es lo que escribió la
//     persona; un cambio de formato de la caché no tiene por qué llevárselo.
//     Si cambia el formato del historial, se sube `VERSION_BUSQUEDAS` (acá) y
//     un sobre de otra versión se lee como lista vacía y se borra.
//   - La «época» de favoritos (`epocaCacheFavoritos`) no borra claves: solo
//     invalida cargas de favoritos en vuelo. No aplica.
//   - Cerrar sesión o cambiar de cuenta (`borrarCacheFavoritos`, desde
//     `lib/session/index.tsx`, solo `qps:cache:v<N>:favoritos`): el historial
//     SOBREVIVE. Es del teléfono, no de la cuenta: Buscar funciona igual sin
//     cuenta y el historial existe aunque nunca se haya entrado.
//   - Eliminar la cuenta (`limpiarTrasEliminarCuenta`, `lib/cuenta.ts`): se
//     BORRA, con `borrarHistorialDeBusquedas`. Ahí la persona pide que no
//     quede nada suyo, y la política de privacidad promete que «al eliminar la
//     cuenta, borra toda la copia»; el historial entra en ese espíritu aunque
//     no viva bajo `qps:cache:`.
import { normalizeFilterText } from '@qps/core/home/filters'
import type { Almacen } from './sin-conexion/almacen'
import { almacenPorDefecto } from './sin-conexion/almacen'

/** Versión del sobre `{ v, busquedas }`. Subirla hace que lo guardado con otra versión se lea como lista vacía (y se borre). */
export const VERSION_BUSQUEDAS = 1

/** Prefijo de TODAS las claves del historial, de cualquier versión (lo usa `borrarHistorialDeBusquedas`). */
export const PREFIJO_BUSQUEDAS = 'qps:busquedas:'

export const CLAVE_BUSQUEDAS_RECIENTES = `${PREFIJO_BUSQUEDAS}v${VERSION_BUSQUEDAS}:recientes`

/** Cuántas se guardan (y se muestran). */
export const TOPE_BUSQUEDAS_RECIENTES = 5

/**
 * Menos de esto no se guarda (A5): una sola letra («a», «j») matchea casi
 * cualquier evento y como búsqueda reciente no le sirve a nadie. Con 2 ya
 * entran siglas y números cortos («DJ», «15»).
 */
export const LARGO_MINIMO_BUSQUEDA = 2

/**
 * Tope de largo (A5): más que esto se recorta. Ningún título de evento ni
 * lugar real pasa de acá, y así un pegado accidental de un texto largo no
 * llena el chip ni el almacén.
 */
export const LARGO_MAXIMO_BUSQUEDA = 60

interface SobreBusquedas {
  v: number
  busquedas: string[]
}

/**
 * Puro. Cómo se guarda una búsqueda: sin espacios en las puntas, con los
 * espacios de adentro colapsados a uno y recortada a `LARGO_MAXIMO_BUSQUEDA`.
 * Respeta mayúsculas y tildes tal como las escribió la persona. Devuelve
 * `null` si queda vacía o más corta que `LARGO_MINIMO_BUSQUEDA`.
 */
export function normalizarBusqueda(texto: string): string | null {
  const limpia = texto.replace(/\s+/g, ' ').trim().slice(0, LARGO_MAXIMO_BUSQUEDA).trim()
  if (limpia.length < LARGO_MINIMO_BUSQUEDA) return null
  return limpia
}

/**
 * Puro. La clave para comparar dos búsquedas: sin mayúsculas ni tildes, con
 * `normalizeFilterText` de `@qps/core/home/filters` — la MISMA normalización
 * que usa la búsqueda (`buscarEventosPorTexto`), así «Peña» y «pena» cuentan
 * como la misma búsqueda porque encuentran lo mismo.
 */
export function claveDeComparacion(texto: string): string {
  return normalizeFilterText(texto.replace(/\s+/g, ' '))
}

/**
 * Puro. Pone `texto` primero y saca cualquier repetida (sin distinguir
 * mayúsculas ni tildes): queda la forma NUEVA, la última que escribió la
 * persona. Corta en `TOPE_BUSQUEDAS_RECIENTES`. Si `texto` no se puede
 * guardar (vacío, muy corto), devuelve la lista sin cambios (una copia).
 */
export function agregarBusqueda(lista: readonly string[], texto: string): string[] {
  const nueva = normalizarBusqueda(texto)
  if (nueva === null) return [...lista]
  const clave = claveDeComparacion(nueva)
  const resto = lista.filter((busqueda) => claveDeComparacion(busqueda) !== clave)
  return [nueva, ...resto].slice(0, TOPE_BUSQUEDAS_RECIENTES)
}

/** Puro. Saca `texto` de la lista (sin distinguir mayúsculas ni tildes). */
export function quitarBusqueda(lista: readonly string[], texto: string): string[] {
  const clave = claveDeComparacion(texto)
  return lista.filter((busqueda) => claveDeComparacion(busqueda) !== clave)
}

/**
 * Puro. Lo que hay en el almacén → la lista. Cualquier cosa rara (`null`,
 * JSON roto, otra versión, `busquedas` que no es un array, elementos que no
 * son texto) da `[]` o se descarta, nunca tira. Lo que sí es válido se vuelve
 * a pasar por `agregarBusqueda` (del más viejo al más nuevo), así un sobre
 * escrito a mano o por una versión con otros topes no mete repetidas, vacías
 * ni más de `TOPE_BUSQUEDAS_RECIENTES`.
 */
export function leerSobreBusquedas(crudo: string | null): string[] {
  if (crudo === null) return []
  let sobre: unknown
  try {
    sobre = JSON.parse(crudo)
  } catch {
    return []
  }
  if (sobre === null || typeof sobre !== 'object') return []
  const { v, busquedas } = sobre as Partial<SobreBusquedas>
  if (v !== VERSION_BUSQUEDAS || !Array.isArray(busquedas)) return []
  const textos = busquedas.filter((item): item is string => typeof item === 'string')
  return textos.reduceRight<string[]>((lista, busqueda) => agregarBusqueda(lista, busqueda), [])
}

/** Puro. La lista → el texto que se escribe en el almacén. */
export function armarSobreBusquedas(lista: readonly string[]): string {
  const sobre: SobreBusquedas = { v: VERSION_BUSQUEDAS, busquedas: lista.slice(0, TOPE_BUSQUEDAS_RECIENTES) }
  return JSON.stringify(sobre)
}

// Las escrituras van en fila (A5): guardar es leer-modificar-escribir, y dos
// guardados casi juntos (enviar con el teclado y enseguida tocar un
// resultado, que saca a la persona de Buscar) podían pisarse y perder uno.
// Una sola cadena de promesas a nivel de módulo alcanza: hay un solo almacén
// y un solo proceso de app (mismo criterio que las banderas de `cache.ts`).
// La cadena nunca queda rechazada: cada operación atrapa sus errores.
let fila: Promise<unknown> = Promise.resolve()

function enFila<T>(operacion: () => Promise<T>): Promise<T> {
  const resultado = fila.then(operacion)
  fila = resultado.catch(() => {})
  return resultado
}

/**
 * Lee el historial. Nunca tira: un almacén que falla da `[]`. Si lo guardado
 * está roto o es de otra versión, además lo borra (best-effort), como
 * `leerCache` de `lib/sin-conexion/cache.ts`.
 */
export async function leerBusquedasRecientes(almacen: Almacen = almacenPorDefecto): Promise<string[]> {
  try {
    const crudo = await almacen.leer(CLAVE_BUSQUEDAS_RECIENTES)
    const lista = leerSobreBusquedas(crudo)
    if (crudo !== null && lista.length === 0) await almacen.borrar(CLAVE_BUSQUEDAS_RECIENTES).catch(() => {})
    return lista
  } catch {
    return []
  }
}

/**
 * Suma `texto` al historial guardado y devuelve cómo quedó. Nunca tira: si
 * el almacén falla al leer, parte de `[]`; si falla al escribir, devuelve la
 * lista igual (la pantalla la muestra en esta sesión aunque no haya quedado
 * en el disco). Un `texto` que no se puede guardar no escribe nada.
 */
export function guardarBusquedaReciente(texto: string, almacen: Almacen = almacenPorDefecto): Promise<string[]> {
  return enFila(async () => {
    const actual = await leerBusquedasRecientes(almacen)
    if (normalizarBusqueda(texto) === null) return actual
    const nueva = agregarBusqueda(actual, texto)
    try {
      await almacen.escribir(CLAVE_BUSQUEDAS_RECIENTES, armarSobreBusquedas(nueva))
    } catch {
      // Best-effort: no es motivo para romper Buscar.
    }
    return nueva
  })
}

/** Saca una búsqueda del historial guardado y devuelve cómo quedó. Nunca tira (mismo criterio que `guardarBusquedaReciente`). */
export function quitarBusquedaReciente(texto: string, almacen: Almacen = almacenPorDefecto): Promise<string[]> {
  return enFila(async () => {
    const nueva = quitarBusqueda(await leerBusquedasRecientes(almacen), texto)
    try {
      if (nueva.length === 0) await almacen.borrar(CLAVE_BUSQUEDAS_RECIENTES)
      else await almacen.escribir(CLAVE_BUSQUEDAS_RECIENTES, armarSobreBusquedas(nueva))
    } catch {
      // Best-effort.
    }
    return nueva
  })
}

/**
 * «Borrar historial» (y el camino de eliminar la cuenta): borra todas las
 * claves `qps:busquedas:*`, de CUALQUIER versión — no solo la actual, por el
 * mismo motivo que `borrarCacheFavoritos` en `cache.ts`: una clave de una
 * versión anterior que nadie volvió a leer no tiene que quedar en el disco.
 * Devuelve si se pudo; nunca tira.
 */
export function borrarHistorialDeBusquedas(almacen: Almacen = almacenPorDefecto): Promise<boolean> {
  return enFila(async () => {
    try {
      const propias = (await almacen.claves()).filter((clave) => clave.startsWith(PREFIJO_BUSQUEDAS))
      if (propias.length > 0) await almacen.borrarVarias(propias)
      return true
    } catch {
      return false
    }
  })
}
