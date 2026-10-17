// Ronda 41, tarea 41-d: qué hacer cuando se toca un aviso push. Puro (sin
// imports de React Native ni de Expo) para poder probarse sin dobles —
// `ManejadorTapPush.tsx` es quien conecta esto con `expo-notifications` y
// `expo-router`.
//
// El `data` de un push es un dato externo y no confiable (lo manda el
// backend, pero también lo puede mandar cualquiera con el token de otra
// persona, o una prueba a mano desde https://expo.dev/notifications): nunca
// se asume su forma. `eventoIdDesdeDatosPush` es el único filtro.
import { esUuid, eventoIdDesdeLink } from '@/lib/links'

// Tope prudente ANTES de aplicar cualquier expresión regular (`eventoIdDesdeLink`
// usa regex ancladas con `^...$`, así que no hay ReDoS posible, pero un
// payload de push no tiene por qué pesar más que un link real: cortamos la
// cadena larguísima antes de tocar la regex, no después).
const LARGO_MAXIMO_URL = 2048

/**
 * `true` solo si `data` es un objeto plano (ni `null`, ni un array, ni un
 * string, ni un número). `typeof data === 'object'` solo no alcanza:
 * `typeof [] === 'object'` también es `true`.
 */
function esObjetoPlano(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object' && data !== null && !Array.isArray(data)
}

function idDesdeUrl(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  if (valor.length > LARGO_MAXIMO_URL) return null
  return eventoIdDesdeLink(valor)
}

function idDesdeEventId(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  if (!esUuid(valor)) return null
  // `esUuid` acepta mayúsculas sin normalizar; `eventoIdDesdeLink` sí
  // normaliza. Sin este `.toLowerCase()`, el mismo evento llegaría con dos
  // ids distintos según qué campo mandó el push.
  return valor.toLowerCase()
}

/**
 * El id de evento que hay que abrir al tocar un push, o `null` si no hay
 * ninguno válido. Orden de precedencia (especificado, no incidental):
 * 1. `data.url`, si pasa `eventoIdDesdeLink` (lo que manda la R39).
 * 2. si no, `data.eventId`, si pasa `esUuid` (lo que usa la prueba a mano de
 *    `ops/push-firebase-pasos.md`).
 * Un `url` inválido NO corta la evaluación: si `eventId` es válido, gana.
 */
export function eventoIdDesdeDatosPush(data: unknown): string | null {
  if (!esObjetoPlano(data)) return null

  const desdeUrl = idDesdeUrl(data.url)
  if (desdeUrl) return desdeUrl

  return idDesdeEventId(data.eventId)
}

/** La parte de `NotificationResponse` (expo-notifications) que necesita `claveRespuesta`. */
export interface RespuestaPushMinima {
  notification: {
    request: {
      identifier: string
    }
  }
}

/**
 * El identificador de la notificación de una respuesta (tap), para no
 * navegar dos veces con la misma respuesta: `getLastNotificationResponseAsync`
 * (arranque en frío) y `addNotificationResponseReceivedListener` pueden
 * entregar la misma respuesta.
 */
export function claveRespuesta(respuesta: RespuestaPushMinima): string {
  return respuesta.notification.request.identifier
}
