// Módulo puro (R72, 72-e, QPS-335): solo la constante, sin importar
// `expo-notifications`, `expo-constants` ni `react-native`, para que
// `lib/cuenta.ts` pueda usarla (y sus tests correr en Node) sin arrastrar
// dependencias nativas. `lib/push/registro.ts` la re-exporta con el mismo nombre.

/** Clave de SecureStore donde se guarda el último token de push registrado en este teléfono. */
export const CLAVE_TOKEN_PUSH = 'push-token'
