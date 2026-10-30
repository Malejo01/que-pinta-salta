// A8 (nube Q1, QPS-339, ronda de correcciones): el envoltorio ÚNICO para
// hablarle al lector de pantalla. Todo anuncio de la app pasa por `anunciar`:
// los conteos (`useAnunciarConteo`, `lib/anunciar-conteo-hook.ts`) y, al
// integrar, los avisos de A5 («Listo, borraste tus búsquedas recientes.») y de
// A6 («Volvió la conexión.», «Listo, actualizado.»). El detector global de
// `tests/anunciar-conteos.test.ts` prohíbe `AccessibilityInfo.announceForAccessibility*`
// fuera de este archivo.
//
// `queue: true` por omisión: en iOS el anuncio espera a que VoiceOver termine
// lo que está diciendo (el chip que se acaba de tocar) en vez de cortarlo. En
// Android la opción NO existe: RN 0.86 (`AccessibilityInfo.js`, ~493) llama a
// `announceForAccessibility` nativo sin opciones, y no está verificado que
// TalkBack lo encole; por eso los anuncios que vienen de un toque esperan
// `DEMORA_TOQUE_ANDROID_MS` en `lib/anunciar-conteo.ts` (quien llame a
// `anunciar` desde un toque en Android tendría que hacer lo mismo).
//
// Plan B para Android 16 (`View.announceForAccessibility` / eventos
// `TYPE_ANNOUNCEMENT` deprecados; hoy TalkBack los sigue leyendo): reemplazar
// el cuerpo de esta función por un nodo de estado SIEMPRE montado (un `Texto`
// visualmente oculto con `accessibilityLiveRegion="polite"`, en el layout de
// las pestañas) cuyo texto se cambia; sin dependencias nuevas. Como todo pasa
// por acá, sería un cambio en un solo lugar.
import { AccessibilityInfo } from 'react-native'

export interface OpcionesAnuncio {
  /** iOS: encolar detrás de lo que VoiceOver esté diciendo (por omisión, sí). En Android no hace nada. */
  queue?: boolean
}

/** Le dice `texto` al lector de pantalla (si no hay lector, no pasa nada). */
export function anunciar(texto: string, opciones: OpcionesAnuncio = {}): void {
  if (!texto) return
  AccessibilityInfo.announceForAccessibilityWithOptions(texto, { queue: opciones.queue ?? true })
}
