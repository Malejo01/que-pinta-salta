/**
 * Orquestador puro de "Compartir imagen" (R42, tarea 42-d; plan
 * `ops/rondas/42-ficha-completa/plan.md`, decisión 3). Sin `react-native` ni
 * `expo-*`: recibe las `deps` inyectadas (las reales vienen de
 * `lib/compartir-imagen/dispositivo.ts`, el único archivo que importa
 * `react-native-view-shot` y `expo-sharing`), así que corre en Vitest con
 * dobles, sin RN.
 *
 * `disponible()` y `capturar()` deciden si hay cómo armar una imagen;
 * `compartirArchivo(uri)` la manda; `compartirTexto()` es la caída al texto
 * de siempre (el `compartir()` que ya tenía `BotonCompartir.tsx`, con
 * `mensajeCompartirEvento` de 42-b) — la persona SIEMPRE puede compartir
 * algo, aunque no haya `expo-sharing` disponible o la captura falle.
 */

export interface ResultadoCompartirTarjeta {
  /** `'nada'`: ni la imagen ni el texto se compartieron (`disponible()`,
   * `capturar()` o `compartirArchivo()` fallaron, Y `compartirTexto()`
   * — la caída — también rechazó). No hay que mentir con `'texto'` cuando
   * no se compartió nada. */
  tipo: 'imagen' | 'texto' | 'nada'
  /** Solo en el caso `'texto'` que viene de una captura fallida (para que la
   * hoja muestre "No pudimos armar la imagen; compartimos el link."). */
  motivo?: 'captura'
}

export interface DepsCompartirTarjeta {
  /** `Sharing.isAvailableAsync()` en el dispositivo real. */
  disponible: () => Promise<boolean>
  /** `captureRef(ref, OPCIONES_CAPTURA)`: la URI de un archivo temporal con la tarjeta. */
  capturar: () => Promise<string>
  /** `Sharing.shareAsync(uri, { mimeType: 'image/png', ... })`. */
  compartirArchivo: (uriArchivo: string) => Promise<void>
  /** `releaseCapture(uri)`: sincrónica, libera el archivo temporal. */
  liberar: (uriArchivo: string) => void
  /** El `compartir()` de `BotonCompartir.tsx` (`Share.share` con el texto de
   * `mensajeCompartirEvento`, 42-b) — la caída. */
  compartirTexto: () => Promise<void>
}

/**
 * El orden:
 * 1. `disponible()` da `false` (o tira) → `compartirTexto()` → `{ tipo: 'texto' }`.
 * 2. `capturar()` tira error → `compartirTexto()` → `{ tipo: 'texto', motivo: 'captura' }`.
 * 3. `compartirArchivo(uri)` → `{ tipo: 'imagen' }`. Si tira error → `compartirTexto()` → `{ tipo: 'texto' }`.
 * 4. **Siempre** `liberar(uri)` al final, si hubo URI (en un `finally`), y
 *    envuelto en su propio `try/catch`: `releaseCapture` es SINCRÓNICA
 *    (`react-native-view-shot/lib/index.d.ts`), así que una excepción
 *    tirada ahí, sin ese `try/catch` propio, se escaparía del `finally` y
 *    rompería la promesa de que esta función "nunca tira".
 *
 * Nunca tira, de verdad: `disponible()` y cada llamada a `compartirTexto()`
 * (las tres caídas) están protegidas con su propio `try/catch` —
 * `intentarCompartirTexto` abajo. Si `disponible()` tira, no se sabe si se
 * puede compartir una imagen, así que se trata como "no disponible" y se cae
 * al texto igual. Si `compartirTexto()` (la caída) también tira, ya no queda
 * nada que ofrecer: el resultado es `{ tipo: 'nada' }`, nunca `{ tipo:
 * 'texto' }` (eso mentiría: la hoja mostraría "compartimos el link" cuando
 * no se compartió nada). Cerrar el selector de "compartir" sin elegir nada
 * no es un error (si `compartirArchivo` rechaza por eso, se cae al texto
 * igual).
 */
export async function compartirTarjeta(deps: DepsCompartirTarjeta): Promise<ResultadoCompartirTarjeta> {
  let uriArchivo: string | null = null

  try {
    let disponible: boolean
    try {
      disponible = await deps.disponible()
    } catch {
      // No se sabe si se puede compartir una imagen: se trata igual que
      // "no disponible" y se cae al texto.
      disponible = false
    }

    if (!disponible) {
      return (await intentarCompartirTexto(deps)) ? { tipo: 'texto' } : { tipo: 'nada' }
    }

    try {
      uriArchivo = await deps.capturar()
    } catch {
      return (await intentarCompartirTexto(deps)) ? { tipo: 'texto', motivo: 'captura' } : { tipo: 'nada', motivo: 'captura' }
    }

    try {
      await deps.compartirArchivo(uriArchivo)
      return { tipo: 'imagen' }
    } catch {
      return (await intentarCompartirTexto(deps)) ? { tipo: 'texto' } : { tipo: 'nada' }
    }
  } finally {
    if (uriArchivo) {
      try {
        deps.liberar(uriArchivo)
      } catch {
        // `liberar` (`releaseCapture`) es sincrónica: una excepción acá no
        // puede escaparse de este `finally` y romper la promesa de arriba.
      }
    }
  }
}

/** Llama a `compartirTexto()` (la caída) protegida con su propio
 * `try/catch`: si rechaza, no hay ya nada más que intentar, pero esa
 * excepción tampoco puede escaparse de `compartirTarjeta`. Devuelve si se
 * compartió el texto de verdad. */
async function intentarCompartirTexto(deps: DepsCompartirTarjeta): Promise<boolean> {
  try {
    await deps.compartirTexto()
    return true
  } catch {
    return false
  }
}
