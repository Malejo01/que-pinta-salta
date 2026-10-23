/**
 * El único archivo de la app que importa `react-native-view-shot` y
 * `expo-sharing` (R42, 42-d). Arma las `deps` de `lib/compartir-imagen/compartir.ts`
 * (el orquestador, puro) con los métodos reales de las dos APIs, leídas del
 * `.d.ts` instalado (no de memoria):
 * - `react-native-view-shot/lib/index.d.ts`: `captureRef<T>(view, options?): Promise<string>`
 *   y `releaseCapture(uri): void` (SINCRÓNICA — por eso el orquestador la
 *   envuelve en su propio `try/catch` dentro del `finally`, no este archivo);
 * - `expo-sharing/build/Sharing.d.ts` y `Sharing.types.d.ts`:
 *   `isAvailableAsync(): Promise<boolean>` y
 *   `shareAsync(url, options?: SharingOptions): Promise<void>`, con
 *   `SharingOptions` = `{ mimeType?, UTI?, dialogTitle?, anchor? }`.
 *
 * `format` de `CaptureOptions` es `'jpg' | 'png' | 'webm' | 'raw'` (NO
 * `'jpeg'`) y `result` es `'tmpfile' | 'base64' | 'data-uri' | 'zip-base64'`.
 */
import type { RefObject } from 'react'
import type { View } from 'react-native'
import { captureRef, releaseCapture, type CaptureOptions } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import type { DepsCompartirTarjeta } from './compartir'

/**
 * `width`/`height` 1080×1350 (4:5): el mismo tamaño que la tarjeta de la
 * web (`apps/web/app/api/tarjeta/[id]/route.tsx`). OJO: `captureRef`
 * REDIMENSIONA desde el tamaño real de la vista cuando se pasan `width`/
 * `height` (lo dice el `.d.ts`: "resized from the View bound") — no es
 * "el tamaño mínimo garantizado". La vista previa mide ~360 de ancho: en un
 * teléfono de densidad 3 la captura nativa ya sale en 1080 y el resize no
 * hace nada; en uno de densidad 2, la imagen se AGRANDA de 720 a 1080. Es
 * una decisión a propósito (no un descuido): se prioriza que la imagen
 * final sea siempre 1080×1350, igual que la de la web, aunque en algunos
 * dispositivos eso implique un leve upscaling.
 */
export const OPCIONES_CAPTURA: CaptureOptions = {
  format: 'png',
  quality: 1,
  result: 'tmpfile',
  width: 1080,
  height: 1350,
}

/**
 * Las `deps` reales de `compartirTarjeta` (42-d). `compartirTexto` llega de
 * afuera (el `compartir()` que ya tiene `BotonCompartir.tsx`, con
 * `mensajeCompartirEvento` de 42-b) — este archivo no arma ningún texto ni
 * llama a `Share.share`.
 */
export function depsDelDispositivo(
  ref: RefObject<View | null>,
  compartirTexto: () => Promise<void>,
): DepsCompartirTarjeta {
  return {
    disponible: () => Sharing.isAvailableAsync(),
    capturar: () => captureRef(ref, OPCIONES_CAPTURA),
    compartirArchivo: (uriArchivo: string) =>
      Sharing.shareAsync(uriArchivo, { mimeType: 'image/png', dialogTitle: 'Compartir evento' }),
    liberar: (uriArchivo: string) => releaseCapture(uriArchivo),
    compartirTexto,
  }
}
