// Ronda 70, tarea 70-a: la invitación a activar los avisos (una sola vez por
// teléfono). Este archivo no importa React Native ni Expo de forma estática:
// `seMuestraInvitacion` es pura y se prueba sola; el acceso a SecureStore se
// carga con `import()` dentro de las funciones que lo necesitan.
//
// Bandera propia en SecureStore (mismo patrón que `lib/bienvenida.ts`): si la
// lectura falla se trata como "ya vista" (nunca insistir). Activar, descartar
// o negar el permiso la marcan; la variante "entrá primero" (sin sesión) no
// la marca hasta que la persona la descarta.
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

/** `true` si ya se vio. Si la lectura falla, `true` (nunca insistir). */
export async function invitacionFueVista(): Promise<boolean> {
  try {
    const SecureStore = await import('expo-secure-store')
    return (await SecureStore.getItemAsync(CLAVE_INVITACION_AVISOS_VISTA)) === '1'
  } catch {
    return true
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

/** Marca la invitación como vista. Si la escritura falla, no se rompe nada. */
export async function marcarInvitacionVista(): Promise<void> {
  try {
    const SecureStore = await import('expo-secure-store')
    await SecureStore.setItemAsync(CLAVE_INVITACION_AVISOS_VISTA, '1')
  } catch {
    // En el peor caso se vuelve a mostrar una vez más.
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
