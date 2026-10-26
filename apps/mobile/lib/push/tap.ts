// Ronda 41, tarea 41-d: qué hacer cuando se toca un aviso push. Puro (sin
// imports de React Native ni de Expo) para poder probarse sin dobles —
// `ManejadorTapPush.tsx` es quien conecta esto con `expo-notifications` y
// `expo-router`.
//
// El `data` de un push es un dato externo y no confiable (lo manda el
// backend, pero también lo puede mandar cualquiera con el token de otra
// persona, o una prueba a mano desde https://expo.dev/notifications): nunca
// se asume su forma. `eventoIdDesdeDatosPush` es el único filtro.
//
// Ronda 51, tarea 51-e: suma `interpretarRespuestaPush`, que decide además
// qué hacer con el botón de baja rápida de los avisos patrocinados
// (`ACCION_BAJA_PATROCINADOS`/`CATEGORIA_PATROCINADO`, de
// `@qps/core/notificaciones/patrocinados`, las mismas constantes que usa el
// servidor al armar el push, 51-a/51-c, y `lib/push/categorias.ts` al
// registrar el botón). Sigue siendo pura: sin imports de React Native ni de
// Expo.
import { ACCION_BAJA_PATROCINADOS, CATEGORIA_PATROCINADO } from '@qps/core/notificaciones/patrocinados'
import { DESTINO_CINES as DESTINO_CINES_CORE } from '@qps/core/notificaciones/equipo'
import { esUuid, eventoIdDesdeLink } from '@/lib/links'

/**
 * Ronda 70, tarea 70-b: `data.destino` de un aviso del equipo que abre Cines.
 * El valor vive en core (`equipo.ts`, lo usa el servidor al armar el push);
 * acá se re-exporta para que la app tenga un solo lugar donde leerlo.
 */
export const DESTINO_CINES = DESTINO_CINES_CORE

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

/**
 * La parte de `NotificationResponse` (expo-notifications) que necesitan
 * `claveRespuesta` e `interpretarRespuestaPush`. `actionIdentifier` y
 * `content` son opcionales a propósito: `claveRespuesta` no los usa (y los
 * fixtures viejos de `tests/push-tap.test.ts`, de antes de la R51, no los
 * traen), así que volverlos obligatorios rompería esos fixtures sin
 * necesidad.
 */
export interface RespuestaPushMinima {
  /** El botón tocado (`ACCION_BAJA_PATROCINADOS`, por ejemplo), o el identificador por defecto de Expo en un tap común. */
  actionIdentifier?: string
  notification: {
    request: {
      identifier: string
      content?: {
        /** `null`/`undefined` si el aviso no tiene categoría registrada (ver `lib/push/categorias.ts`). */
        categoryIdentifier?: string | null
        /** Dato externo y no confiable, igual que en `eventoIdDesdeDatosPush`. */
        data?: unknown
      }
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

/**
 * `true` si la respuesta corresponde a un aviso patrocinado: la categoría de
 * la notificación es `CATEGORIA_PATROCINADO` (lo que manda el servidor,
 * 51-c) o — por si la categoría no llegó a registrarse (`registrarCategoriasPush`,
 * `lib/push/categorias.ts`, que nunca propaga su error) — `data.tipo` es,
 * EXACTAMENTE, esa misma categoría. `data` es un dato externo y no
 * confiable: la comparación es con `===` contra el string, así que ni una
 * mayúscula distinta (`'Patrocinado'`), ni un array (`['patrocinado']`), ni
 * un espacio de más cuentan.
 */
function esAvisoPatrocinado(respuesta: RespuestaPushMinima): boolean {
  const content = respuesta.notification.request.content
  if (content?.categoryIdentifier === CATEGORIA_PATROCINADO) return true
  const data = content?.data
  return esObjetoPlano(data) && data.tipo === CATEGORIA_PATROCINADO
}

/** Lo que hay que hacer al recibir una respuesta de push (un tap, o el botón de una acción). */
export type ResultadoInterpretacionPush =
  | { accion: 'abrir'; id: string; patrocinado: boolean }
  | { accion: 'baja-patrocinados' }
  | { accion: 'abrir-cines' }
  | { accion: 'nada' }

/**
 * Pura (sin `expo-notifications` ni `expo-router`): a partir de una
 * respuesta de push, qué hay que hacer. `ManejadorTapPush.tsx` es quien
 * EJECUTA esto (navegar, guardar la preferencia, avisar) — esta función solo
 * decide.
 *
 * Orden (especificado, no incidental):
 * 1. Si tocaron el botón de baja rápida (`actionIdentifier === ACCION_BAJA_PATROCINADOS`)
 *    Y el aviso es patrocinado (`esAvisoPatrocinado`): `{ accion: 'baja-patrocinados' }`.
 *    Ese mismo botón en un aviso que NO es patrocinado (no debería pasar
 *    nunca — solo el patrocinado registra ese botón — pero el payload de un
 *    push no es confiable) NO entra acá: cae al paso 2, como cualquier tap.
 * 2. Si no, `eventoIdDesdeDatosPush(data)`: con un id válido, `{ accion:
 *    'abrir', id, patrocinado }` — `patrocinado` es `data.tipo ===
 *    CATEGORIA_PATROCINADO` con comparación EXACTA (ver `esAvisoPatrocinado`
 *    arriba sobre por qué `===` y no una comparación floja o insensible a
 *    mayúsculas).
 * 3. Sin id válido, `data.destino === DESTINO_CINES` (comparación exacta,
 *    Ronda 70): `{ accion: 'abrir-cines' }`. El evento tiene precedencia.
 * 4. Cualquier otra cosa (sin id válido, un `actionIdentifier` desconocido
 *    sin id, un `data.url` de otro host): `{ accion: 'nada' }`.
 *
 * Nunca devuelve una ruta ni una url que vengan tal cual del push: `id` ya
 * pasó por el filtro de `eventoIdDesdeDatosPush` (uuid válido, normalizado).
 */
export function interpretarRespuestaPush(respuesta: RespuestaPushMinima): ResultadoInterpretacionPush {
  if (respuesta.actionIdentifier === ACCION_BAJA_PATROCINADOS && esAvisoPatrocinado(respuesta)) {
    return { accion: 'baja-patrocinados' }
  }

  const data = respuesta.notification.request.content?.data
  const id = eventoIdDesdeDatosPush(data)
  if (!id) {
    // Un aviso patrocinado nunca abre Cines, aunque su data lo pida.
    if (esObjetoPlano(data) && data.destino === DESTINO_CINES && !esAvisoPatrocinado(respuesta)) {
      return { accion: 'abrir-cines' }
    }
    return { accion: 'nada' }
  }

  const patrocinado = esObjetoPlano(data) && data.tipo === CATEGORIA_PATROCINADO
  return { accion: 'abrir', id, patrocinado }
}

/** Lo que hay que hacer con un `{ accion: 'baja-patrocinados' }` ya decidido, según el estado de la sesión en ESE momento. */
export type DecisionBajaPatrocinados =
  | { accion: 'guardar'; userId: string }
  | { accion: 'esperar' }
  | { accion: 'pedir-sesion' }

/**
 * Qué hacer con el botón de baja rápida, dado el estado de `useSession()` en
 * el momento en que llegó la respuesta del push. Pura, para poder probar el
 * caso del arranque en frío como un comportamiento (esta función), no como
 * un detector de texto sobre `ManejadorTapPush.tsx`.
 *
 * Existe el estado `'esperar'` por este motivo (vuelta 1 de revisión de
 * 51-e): `lib/session/index.tsx` arranca en `{ session: null, cargando: true }`
 * y resuelve `getSession()` de forma ASINCRÓNICA; `opensAppToForeground: true`
 * (`lib/push/categorias.ts`) existe justamente para que este botón funcione
 * con la app CERRADA, así que en un arranque en frío `getLastNotificationResponseAsync()`
 * puede entregar la respuesta del botón ANTES de que la sesión termine de
 * cargar. En ese instante `userId` es `null` no porque la persona no tenga
 * sesión, sino porque todavía no se sabe — tratarlo como "sin sesión"
 * (`'pedir-sesion'`) sería mentirle a alguien que sí tiene cuenta Y, peor,
 * la preferencia nunca se guardaría. `'esperar'` le dice a quien llama que
 * no decida ni avise nada todavía (ver `ManejadorTapPush.tsx`: deja la baja
 * pendiente y la vuelve a evaluar cuando `cargando` pase a `false`).
 *
 * - `userId` presente (con o sin `cargando`: una sesión ya resuelta manda) → `'guardar'`.
 * - sin `userId` y `cargando: true` → `'esperar'` (no se sabe todavía).
 * - sin `userId` y `cargando: false` → `'pedir-sesion'` (ya se sabe que no hay sesión).
 */
export function decidirBajaPatrocinados(estado: { cargando: boolean; userId: string | null }): DecisionBajaPatrocinados {
  if (estado.userId) return { accion: 'guardar', userId: estado.userId }
  if (estado.cargando) return { accion: 'esperar' }
  return { accion: 'pedir-sesion' }
}
