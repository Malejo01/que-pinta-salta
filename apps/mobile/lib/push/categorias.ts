// Ronda 51, tarea 51-e: la categoría de notificación de Expo que engancha el
// botón de baja rápida ("No recibir más") en el aviso push patrocinado
// mismo — sin esto, `expo-notifications` no tiene qué botón mostrar aunque
// el servidor mande `categoryId: CATEGORIA_PATROCINADO` (51-b/51-c, del lado
// de `apps/web`).
//
// `CATEGORIA_PATROCINADO`, `ACCION_BAJA_PATROCINADOS` y `TEXTO_BOTON_BAJA`
// salen de `@qps/core/notificaciones/patrocinados` (51-a): el servidor que
// arma el push y esta app que registra el botón usan las mismas constantes,
// nunca un string repetido a mano (si alguna cambiara de un lado y no del
// otro, el botón dejaría de engancharse en silencio).
import { setNotificationCategoryAsync } from 'expo-notifications'
import {
  ACCION_BAJA_PATROCINADOS,
  CATEGORIA_PATROCINADO,
  TEXTO_BOTON_BAJA,
} from '@qps/core/notificaciones/patrocinados'

/**
 * Registra la categoría `CATEGORIA_PATROCINADO` con un solo botón (la baja
 * rápida). La llama `ManejadorTapPush` una sola vez al montar (un intento
 * por arranque de la app, no uno por aviso).
 *
 * `opensAppToForeground: true` es a propósito: con la app cerrada (no solo
 * en segundo plano), tocar el botón tiene que poder ABRIRLA para que
 * `addNotificationResponseReceivedListener` (en `ManejadorTapPush`) llegue a
 * ejecutarse y pueda guardar la preferencia con `cambiarPatrocinados`, que
 * necesita la sesión activa del teléfono — sin este flag, `expo-notifications`
 * no garantiza que ese listener corra si la app estaba completamente cerrada.
 *
 * Nunca propaga el error (`try/catch` sin relanzar): si el registro falla
 * (por ejemplo, una plataforma o versión de SO donde esta API no está
 * disponible), el aviso patrocinado igual llega, solo que sin el botón de
 * baja rápida — la franja de la ficha (`components/AvisoPatrocinado.tsx`)
 * sigue sirviendo como la otra forma de apagarlos. No se loguea nada acá:
 * esta función no recibe ningún dato de push, pero tampoco se loguea el
 * error en sí (mismo criterio de silencio que el resto de `lib/push/`).
 */
export async function registrarCategoriasPush(): Promise<void> {
  try {
    await setNotificationCategoryAsync(CATEGORIA_PATROCINADO, [
      {
        identifier: ACCION_BAJA_PATROCINADOS,
        buttonTitle: TEXTO_BOTON_BAJA,
        options: { opensAppToForeground: true },
      },
    ])
  } catch {
    // Silencioso a propósito: ver el comentario de la función.
  }
}
