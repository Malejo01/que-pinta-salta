// Módulo puro (R72, 72-e, QPS-335): solo la constante, sin importar
// `expo-notifications`, `expo-constants` ni `react-native`, para que
// `lib/cuenta.ts` pueda usarla (y sus tests correr en Node) sin arrastrar
// dependencias nativas. `lib/push/registro.ts` la re-exporta con el mismo nombre.

/** Clave de SecureStore donde se guarda el último token de push registrado en este teléfono. */
export const CLAVE_TOKEN_PUSH = 'push-token'

/**
 * R82 / Q4-2: el `device_id` de esta instalación (lo genera el servidor en el
 * primer `POST /api/push/registrar`). Identifica la instalación, no a la
 * persona: no se borra al cerrar sesión ni al eliminar la cuenta.
 */
export const CLAVE_DEVICE_ID = 'push-device-id'

/** R82 / Q4-2: último estado conocido de los interruptores sin cuenta (JSON). */
export const CLAVE_AVISOS_ANONIMOS = 'push-avisos-anonimos'

/**
 * R82 / Q4-2 (decisión 6): marca que la persona eliminó su cuenta en este
 * teléfono. En el próximo registro sin cuenta, los avisos se apagan
 * explícitamente (y la marca se borra solo si el apagado salió bien).
 */
export const CLAVE_AVISOS_APAGAR_TRAS_BAJA = 'push-avisos-apagar-tras-baja'
