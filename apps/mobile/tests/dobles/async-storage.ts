// Doble de `@react-native-async-storage/async-storage` para Vitest (R43,
// 43-a): mismo export por defecto que la librería real (`getItem`,
// `setItem`, `removeItem`, `getAllKeys`, `multiRemove`), pero en memoria —
// nunca el módulo nativo, que no existe fuera de un teléfono. El alias de
// `vitest.config.ts` lo pone en el lugar de la librería real para CUALQUIER
// test de la app que importe algo que la use, así que ningún test de otra
// tarea tiene que mockearla a mano.
//
// No implementa nada más de la librería real (`mergeItem`, `multiGet`,
// etc.): `lib/sin-conexion/almacen.ts` es el único archivo de la app que
// importa este paquete, y solo usa esos cinco métodos.
//
// No termina en `.test.ts`, así que `vitest.config.ts` (`include:
// ['tests/**/*.test.ts']`) no lo recoge como test.
const memoria = new Map<string, string>()

async function getItem(clave: string): Promise<string | null> {
  return memoria.has(clave) ? (memoria.get(clave) as string) : null
}

async function setItem(clave: string, valor: string): Promise<void> {
  memoria.set(clave, valor)
}

async function removeItem(clave: string): Promise<void> {
  memoria.delete(clave)
}

async function getAllKeys(): Promise<readonly string[]> {
  return [...memoria.keys()]
}

async function multiRemove(claves: readonly string[]): Promise<void> {
  for (const clave of claves) memoria.delete(clave)
}

/** Vacía la memoria entre tests. Llamarlo en un `beforeEach`. */
export function reiniciar(): void {
  memoria.clear()
}

export default { getItem, setItem, removeItem, getAllKeys, multiRemove }
