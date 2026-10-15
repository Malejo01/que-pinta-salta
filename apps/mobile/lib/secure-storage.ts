// Adaptador de almacenamiento para `supabase-js` sobre `expo-secure-store`.
// Nunca AsyncStorage para la sesión (R24, decisión de Mauro): SecureStore la
// cifra en el teléfono.
//
// SecureStore avisa de valores de más de 2048 bytes y la sesión de Supabase
// (access token + refresh token + metadata del usuario) puede superarlos, así
// que cada valor se parte en pedazos de hasta TAMANIO_PEDAZO caracteres:
// `clave.n` guarda la cantidad de pedazos y `clave.0` ... `clave.n-1` el
// contenido. Al escribir menos pedazos que antes se borran los sobrantes. Al
// leer con un pedazo faltante se devuelve `null` (sesión inválida) en vez de
// un JSON roto.
//
// La lógica de partir/unir (partir, unir, claveCantidad, clavePedazo,
// indicesSobrantes, parsearCantidad) es pura: no llama a SecureStore, para
// que 24-c la prueba con un doble del almacenamiento. El import de
// `expo-secure-store` queda a nivel de módulo (lo necesitan getItem/setItem/
// removeItem), pero ninguna función pura depende de él.
import * as SecureStore from 'expo-secure-store'

/** Margen bajo el límite de 2048 bytes de SecureStore (deja lugar a UTF-8 multibyte). */
export const TAMANIO_PEDAZO = 1800

/** Pura. Parte `valor` en pedazos de hasta TAMANIO_PEDAZO caracteres. Un valor vacío no genera pedazos. */
export function partir(valor: string): string[] {
  if (valor.length === 0) return []
  const pedazos: string[] = []
  for (let inicio = 0; inicio < valor.length; inicio += TAMANIO_PEDAZO) {
    pedazos.push(valor.slice(inicio, inicio + TAMANIO_PEDAZO))
  }
  return pedazos
}

/**
 * Pura. Une los pedazos leídos, en orden. Si falta alguno (`null`), la
 * sesión se considera inválida: devuelve `null` en vez de un JSON roto.
 */
export function unir(pedazos: ReadonlyArray<string | null>): string | null {
  if (pedazos.some((pedazo) => pedazo === null)) return null
  return pedazos.join('')
}

/** Pura. La clave donde se guarda la cantidad de pedazos de `clave`. */
export function claveCantidad(clave: string): string {
  return `${clave}.n`
}

/** Pura. La clave del pedazo `indice` (0-based) de `clave`. */
export function clavePedazo(clave: string, indice: number): string {
  return `${clave}.${indice}`
}

/** Pura. Parsea el contenido de `clave.n`. `null` o no numérico cuenta como 0 pedazos. */
export function parsearCantidad(texto: string | null): number {
  if (texto === null) return 0
  const cantidad = Number.parseInt(texto, 10)
  return Number.isInteger(cantidad) && cantidad >= 0 ? cantidad : 0
}

/** Pura. Los índices de pedazos que sobran al pasar de `cantidadVieja` a `cantidadNueva` pedazos. */
export function indicesSobrantes(cantidadVieja: number, cantidadNueva: number): number[] {
  if (!Number.isFinite(cantidadVieja) || cantidadVieja <= cantidadNueva) return []
  const sobrantes: number[] = []
  for (let indice = cantidadNueva; indice < cantidadVieja; indice += 1) sobrantes.push(indice)
  return sobrantes
}

async function leerPedazos(clave: string, cantidad: number): Promise<Array<string | null>> {
  const indices = Array.from({ length: cantidad }, (_valor, indice) => indice)
  return Promise.all(indices.map((indice) => SecureStore.getItemAsync(clavePedazo(clave, indice))))
}

/**
 * El adaptador que necesita `supabase-js`: `getItem`/`setItem`/`removeItem`
 * sobre SecureStore, partido en pedazos.
 *
 * En Android, `SecureStore` puede tirar una excepción si no logra descifrar
 * el valor guardado (pasa después de reinstalar la app o de restaurar un
 * backup): `getItem` se trata como si no hubiera sesión (`null`) en vez de
 * tumbar la app, y se intenta borrar lo ilegible (con su propio `catch`)
 * para no repetir el error en la próxima lectura. Nunca se loguea el valor
 * ni la clave completa.
 */
export async function getItem(clave: string): Promise<string | null> {
  try {
    const cantidadTexto = await SecureStore.getItemAsync(claveCantidad(clave))
    if (cantidadTexto === null) return null
    const cantidad = parsearCantidad(cantidadTexto)
    if (cantidad === 0) return ''
    const pedazos = await leerPedazos(clave, cantidad)
    return unir(pedazos)
  } catch {
    try {
      await removeItem(clave)
    } catch {
      // Si tampoco se puede borrar, se sigue sin sesión: no hay más por
      // hacer acá, y no se tumba la app.
    }
    return null
  }
}

/**
 * Si `SecureStore` falla al escribir, no se deja pasar el error original
 * (podría traer el valor en el mensaje): se tira un `Error` genérico, sin el
 * valor ni la clave completa.
 */
export async function setItem(clave: string, valor: string): Promise<void> {
  try {
    const cantidadAnterior = parsearCantidad(await SecureStore.getItemAsync(claveCantidad(clave)))
    const pedazos = partir(valor)

    await SecureStore.setItemAsync(claveCantidad(clave), String(pedazos.length))
    await Promise.all(pedazos.map((pedazo, indice) => SecureStore.setItemAsync(clavePedazo(clave, indice), pedazo)))

    const sobrantes = indicesSobrantes(cantidadAnterior, pedazos.length)
    await Promise.all(sobrantes.map((indice) => SecureStore.deleteItemAsync(clavePedazo(clave, indice))))
  } catch {
    throw new Error('No se pudo guardar en el almacenamiento seguro.')
  }
}

/** Mismo criterio que `setItem`: si falla, un `Error` genérico, sin el valor ni la clave completa. */
export async function removeItem(clave: string): Promise<void> {
  try {
    const cantidad = parsearCantidad(await SecureStore.getItemAsync(claveCantidad(clave)))
    await SecureStore.deleteItemAsync(claveCantidad(clave))
    const indices = Array.from({ length: cantidad }, (_valor, indice) => indice)
    await Promise.all(indices.map((indice) => SecureStore.deleteItemAsync(clavePedazo(clave, indice))))
  } catch {
    throw new Error('No se pudo borrar del almacenamiento seguro.')
  }
}
