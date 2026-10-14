/**
 * Consentimiento de cookies de analítica (QPS-015), en funciones puras y
 * testeables sin navegador.
 *
 * - Estado: 'granted' | 'denied' | null. null = todavía no eligió, o el
 *   storage no tiene nada usable (basura, versión vieja, modo incógnito).
 * - Se guarda con clave versionada (`qps-consent-v1`) para poder invalidar
 *   elecciones viejas si el aviso cambia de forma relevante.
 * - `readConsent`/`writeConsent` reciben un `ConsentStorage` (lo mínimo que
 *   necesitan de `Storage`), así se testean con un objeto falso.
 * - El evento `qps-consent` avisa a quien escuche (el banner, el loader de
 *   GTM) que la elección cambió, sin recargar la página.
 */

export type ConsentValue = 'granted' | 'denied' | null

/** Lo mínimo de `Storage` (localStorage) que necesitamos: alcanza para testear con un objeto falso. */
export interface ConsentStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const CONSENT_STORAGE_KEY = 'qps-consent-v1'

export const CONSENT_EVENT = 'qps-consent'

/**
 * Lee la elección guardada. Devuelve `null` si no hay nada, si el storage
 * tira (incógnito, cookies bloqueadas) o si lo guardado no es un valor
 * reconocido (basura o una versión vieja de la clave).
 */
export function readConsent(storage: ConsentStorage): ConsentValue {
  try {
    const raw = storage.getItem(CONSENT_STORAGE_KEY)
    if (raw === 'granted' || raw === 'denied') return raw
    return null
  } catch {
    return null
  }
}

/**
 * Guarda la elección. `null` borra la clave (vuelve a "sin elegir"). Si el
 * storage tira, no hace nada: no es un error para quien llama.
 */
export function writeConsent(storage: ConsentStorage, value: ConsentValue): void {
  try {
    if (value === null) {
      storage.removeItem(CONSENT_STORAGE_KEY)
    } else {
      storage.setItem(CONSENT_STORAGE_KEY, value)
    }
  } catch {
    // Modo incógnito, cookies bloqueadas o storage lleno: no hay nada que
    // podamos hacer desde acá. Quien llama sigue funcionando (el banner
    // vuelve a aparecer en la próxima visita).
  }
}

/** Avisa que la elección cambió, para que el banner y el loader de GTM se enteren sin recargar. */
export function dispatchConsentEvent(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(CONSENT_EVENT))
}
