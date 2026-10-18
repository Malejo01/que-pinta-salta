// Aviso en línea cuando una acción tiene un efecto que no es obvio (R47,
// tarea 47-e, QPS-197): por ejemplo, sacar el ♥ de un evento con ✓ Voy
// también saca el Voy (`TEXTO_SACASTE_GUARDADO_CON_VOY` de
// `@qps/core/asistencia`). La app no tiene un sistema de toasts propio (no
// hay ninguna librería de notificaciones in-app instalada, y no se agrega
// una sin el OK del lead): este archivo es el único lugar que sabe mostrar
// ese tipo de aviso.
//
// En Android, `ToastAndroid` ya viene con `react-native` (no es una
// dependencia nueva) y es la forma nativa de avisar sin bloquear la
// pantalla. En cualquier otra plataforma (iOS, web) no hace nada: ninguna
// de las dos tiene un equivalente ya disponible en el repo, y agregar uno
// (por ejemplo una librería de toasts, o un componente propio con estado)
// es una decisión de UI que le toca a 47-f/47-g, no a esta tarea. Nadie se
// queda sin el mensaje: la ficha (47-f) muestra el mismo texto en línea
// (por ejemplo, debajo del botón) además de llamar a esta función, así que
// en iOS/web el aviso se ve igual, solo que no como notificación flotante.
import { Platform, ToastAndroid } from 'react-native'

/** Muestra `texto` como aviso no bloqueante. Solo hace algo en Android (ver arriba). */
export function avisar(texto: string): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(texto, ToastAndroid.LONG)
  }
}
