// Ronda 70, tarea 70-a: la invitación a activar los avisos (una sola vez por
// teléfono). Este archivo no importa React Native ni Expo de forma estática:
// `seMuestraInvitacion` es pura y se prueba sola; el acceso a SecureStore se
// carga con `import()` dentro de las funciones que lo necesitan.
//
// Un solo concepto: "la invitación ya se decidió" (`invitacionFueVista` /
// `marcarInvitacionVista`). Activar, "Ahora no" o cerrar la marcan y no se
// vuelve a preguntar, ni con el permiso negado ni al actualizar la app. Si la
// lectura falla se trata como decidida (nunca insistir); la variante "entrá
// primero" (sin sesión) no la marca hasta que la persona la descarta.
import type { EstadoPush } from './estado'

export const CLAVE_INVITACION_AVISOS_VISTA = 'qps.push.invitacion.vista'

/** `'activar'`: botón Activar; `'entrar'`: invita a entrar a la cuenta primero; `null`: no se muestra. */
export type VarianteInvitacion = 'activar' | 'entrar' | null

/**
 * ¿Se muestra la invitación? Solo si no se vio antes. `sin-pedir` invita a
 * activar y `sin-sesion` invita a entrar; con cualquier otro estado (`activo`,
 * `bloqueado`, `denegado`, `no-disponible`, `error-registro`, `pidiendo`) no
 * aparece: si la persona negó el permiso, no se vuelve a insistir.
 */
export function seMuestraInvitacion({
  estado,
  vista,
  cargando = false,
  sincronizado = true,
}: {
  estado: EstadoPush
  vista: boolean
  /** La sesión todavía se está leyendo: `sin-sesion` no es confiable, no se muestra nada. */
  cargando?: boolean
  /** Terminó la primera sincronización con sesión: antes, `sin-pedir` es solo el valor inicial. */
  sincronizado?: boolean
}): VarianteInvitacion {
  if (vista || cargando) return null
  if (estado === 'sin-pedir') return sincronizado ? 'activar' : null
  if (estado === 'sin-sesion') return 'entrar'
  return null
}

// ---------------------------------------------------------------------------
// R81, 81-b: pedir los avisos al principio (R83: una sola vez por persona).
// ---------------------------------------------------------------------------

export const CLAVE_CAMPANIA_AVISOS = 'qps.push.campania'
export const CLAVE_AVISOS_PENDIENTE_LOGIN = 'qps.push.pendiente-login'

/**
 * Clave del respaldo persistente (AsyncStorage, vía `almacenPorDefecto`).
 * Fuera de `qps:cache:` y `qps:busquedas:`, los únicos prefijos que la app
 * borra en masa de ese almacén, y con puntos como las demás claves `qps.push.*`.
 */
export const CLAVE_CAMPANIA_AVISOS_RESPALDO = 'qps.push.campania.respaldo'

/**
 * Respaldo si SecureStore no guarda (la escritura tira o lo leído de vuelta no
 * coincide): la decisión queda en AsyncStorage (sobrevive al arranque en frío)
 * y en memoria del módulo (por si AsyncStorage también falla; vale mientras
 * viva el proceso). Si fallan los dos almacenes, la invitación puede volver a
 * abrirse una vez por arranque en frío (nunca más de una vez por proceso).
 */
let decididaEnMemoria = false

/**
 * ¿Se abre sola la hoja de la campaña? Solo con sesión leída, primera
 * sincronización resuelta, permiso por pedir (`sin-pedir`) y la invitación sin
 * decidir (`vista` falso). Una sola vez por persona: con el permiso `denegado`
 * no se vuelve a preguntar, ni por actualización de la app.
 */
export function debeMostrarCampania({
  estado,
  sincronizado,
  cargando,
  vista,
}: {
  estado: EstadoPush
  sincronizado: boolean
  cargando: boolean
  vista: boolean
}): boolean {
  return !cargando && sincronizado && estado === 'sin-pedir' && !vista
}

/**
 * `true` si la invitación ya se decidió (una sola vez por persona). Cuenta
 * como decidida cualquiera de: la bandera en memoria, la bandera de la R70, o
 * cualquier contenido guardado de la campaña de la R81 (de cualquier versión,
 * pospuesto, hecho o ilegible), en SecureStore o en el respaldo. Si falla la
 * lectura de SecureStore, `true` (nunca insistir); si falla solo el respaldo,
 * se ignora el respaldo.
 */
export async function invitacionFueVista(): Promise<boolean> {
  if (decididaEnMemoria) return true
  try {
    const SecureStore = await import('expo-secure-store')
    if ((await SecureStore.getItemAsync(CLAVE_INVITACION_AVISOS_VISTA)) === '1') return true
    const campania = await SecureStore.getItemAsync(CLAVE_CAMPANIA_AVISOS)
    if (campania !== null && campania !== undefined) return true
  } catch {
    return true
  }
  try {
    const { almacenPorDefecto } = await import('@/lib/sin-conexion/almacen')
    const respaldo = await almacenPorDefecto.leer(CLAVE_CAMPANIA_AVISOS_RESPALDO)
    if (respaldo !== null && respaldo !== undefined) return true
  } catch {
    // Sin respaldo legible: manda lo de SecureStore.
  }
  return false
}

export type AccionTrasLogin = 'nada' | 'activar' | 'borrar'

/**
 * Qué hacer con la bandera "pendiente tras iniciar sesión" (la persona dijo
 * "Sí" en la Bienvenida sin tener sesión). Sin sincronizar o con el estado en
 * tránsito (`pidiendo`, `error-registro`): nada todavía. `sin-pedir` /
 * `denegado`: activar. `activo` / `bloqueado` / `no-disponible`: ya no hay
 * nada que pedir, solo se borra la bandera.
 */
export function accionTrasLogin({
  pendiente,
  estado,
  sincronizado,
}: {
  pendiente: boolean
  estado: EstadoPush
  sincronizado: boolean
}): AccionTrasLogin {
  if (!pendiente || !sincronizado) return 'nada'
  if (estado === 'sin-pedir' || estado === 'denegado') return 'activar'
  if (estado === 'activo' || estado === 'bloqueado' || estado === 'no-disponible') return 'borrar'
  return 'nada'
}

/** La persona dijo "Sí" en la Bienvenida sin sesión: activar cuando inicie sesión. */
export async function marcarAvisosPendientesLogin(): Promise<void> {
  try {
    const SecureStore = await import('expo-secure-store')
    await SecureStore.setItemAsync(CLAVE_AVISOS_PENDIENTE_LOGIN, '1')
  } catch {
    // Sin bandera, en Cuenta se activa a mano.
  }
}

/** `false` si no hay bandera o si la lectura falla (nunca insistir). */
export async function avisosPendientesLogin(): Promise<boolean> {
  try {
    const SecureStore = await import('expo-secure-store')
    return (await SecureStore.getItemAsync(CLAVE_AVISOS_PENDIENTE_LOGIN)) === '1'
  } catch {
    return false
  }
}

export async function borrarAvisosPendientesLogin(): Promise<void> {
  try {
    const SecureStore = await import('expo-secure-store')
    await SecureStore.deleteItemAsync(CLAVE_AVISOS_PENDIENTE_LOGIN)
  } catch {
    // Si no se pudo borrar, la próxima vez la regla vuelve a decidir.
  }
}

type Oyente = () => void
const oyentesVista = new Set<Oyente>()
const oyentesAccion = new Set<Oyente>()

/** Se llama cuando cambia la bandera (para que la tarjeta de Inicio y la hoja se sincronicen). */
export function suscribirCambioVista(oyente: Oyente): () => void {
  oyentesVista.add(oyente)
  return () => {
    oyentesVista.delete(oyente)
  }
}

/**
 * La invitación se decidió (activó, "Ahora no", cerró la hoja o la tarjeta):
 * no se vuelve a mostrar. Escribe las dos claves (R70 y campaña) y verifica
 * leyendo de vuelta; si SecureStore no guarda, cae al respaldo (memoria +
 * AsyncStorage). Nunca tira.
 */
export async function marcarInvitacionVista(): Promise<void> {
  const texto = JSON.stringify({ decidida: true })
  let guardada = false
  try {
    const SecureStore = await import('expo-secure-store')
    await SecureStore.setItemAsync(CLAVE_INVITACION_AVISOS_VISTA, '1')
    await SecureStore.setItemAsync(CLAVE_CAMPANIA_AVISOS, texto)
    guardada = (await SecureStore.getItemAsync(CLAVE_CAMPANIA_AVISOS)) === texto
  } catch {
    // Cae al respaldo.
  }
  if (!guardada) {
    decididaEnMemoria = true
    try {
      const { almacenPorDefecto } = await import('@/lib/sin-conexion/almacen')
      await almacenPorDefecto.escribir(CLAVE_CAMPANIA_AVISOS_RESPALDO, texto)
    } catch {
      // Queda solo el respaldo en memoria.
    }
  }
  oyentesVista.forEach((oyente) => oyente())
}

/** La hoja de después de Guardar/Voy escucha esto. */
export function suscribirTrasAccion(oyente: Oyente): () => void {
  oyentesAccion.add(oyente)
  return () => {
    oyentesAccion.delete(oyente)
  }
}

/**
 * Una línea para los botones Guardar / Voy, en el camino de éxito: pide
 * mostrar la invitación. La hoja decide si corresponde (no vista + `sin-pedir`).
 */
export function invitarTrasAccion(): void {
  oyentesAccion.forEach((oyente) => oyente())
}
