// Adaptador propio sobre AsyncStorage (R43, 43-a). `cache.ts` nunca importa
// `@react-native-async-storage/async-storage` directo: solo conoce la
// interfaz `Almacen`, así que en los tests se inyecta un doble en memoria
// (`tests/dobles/async-storage.ts`, vía el alias de `vitest.config.ts`) sin
// mockear nada a mano. Este es el ÚNICO archivo de toda la app que importa
// ese paquete (regla de la ronda).
//
// La versión instalada (2.2.0) tipa `getAllKeys()` como
// `Promise<readonly string[]>` y `multiRemove()` recibe `readonly string[]`
// (node_modules/@react-native-async-storage/async-storage/lib/typescript/types.d.ts).
// `Almacen.claves()` devuelve `string[]` (mutable) para no filtrar ese
// detalle de la librería a `cache.ts`: `claves()` copia el array con un
// spread. `borrarVarias()` no necesita copiar nada, porque ya recibe
// `readonly string[]`, la misma forma que pide `multiRemove`.
import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Lo que `cache.ts` necesita de un almacén clave-valor, todo en `Promise`:
 * `almacenPorDefecto` lo implementa sobre AsyncStorage, y los tests pasan un
 * doble en memoria en su lugar (nunca AsyncStorage real, ni siquiera el
 * doble de Vitest, salvo que el test quiera probar justo ese cableado).
 */
export interface Almacen {
  leer(clave: string): Promise<string | null>
  escribir(clave: string, valor: string): Promise<void>
  borrar(clave: string): Promise<void>
  claves(): Promise<string[]>
  borrarVarias(claves: readonly string[]): Promise<void>
}

export const almacenPorDefecto: Almacen = {
  leer: (clave) => AsyncStorage.getItem(clave),
  escribir: (clave, valor) => AsyncStorage.setItem(clave, valor),
  borrar: (clave) => AsyncStorage.removeItem(clave),
  claves: async () => [...(await AsyncStorage.getAllKeys())],
  borrarVarias: (claves) => AsyncStorage.multiRemove(claves),
}
