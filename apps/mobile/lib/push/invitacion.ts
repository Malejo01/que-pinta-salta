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

// ---------------------------------------------------------------------------
// R81, 81-b: pedir los avisos al principio.
// ---------------------------------------------------------------------------

export const CLAVE_CAMPANIA_AVISOS = 'qps.push.campania'
export const CLAVE_AVISOS_PENDIENTE_LOGIN = 'qps.push.pendiente-login'

/**
 * Versión de la campaña "pedir los avisos". Subirla vuelve a preguntar una
 * vez a quien ya la había respondido o pospuesto (sin `expo-application` ni
 * nada del build: es una constante a mano).
 */
export const VERSION_CAMPANIA_AVISOS = '6'

/** "Ahora no" en la campaña la pospone 7 días. */
export const PLAZO_POSPONER_CAMPANIA_MS = 7 * 24 * 60 * 60 * 1000

/** Lo guardado de la campaña. `hecha`: activó o dijo "Sí"; `posponerHasta`: ms epoch. */
export interface RegistroCampania {
  version: string
  posponerHasta?: number
  hecha?: boolean
}

/**
 * ¿Se abre sola la hoja de la campaña? Solo con sesión leída, primera
 * sincronización resuelta y permiso por pedir (`sin-pedir`) o negado una vez
 * (`denegado`, se puede volver a preguntar). Una vez por versión: si ya está
 * hecha, no; si está pospuesta, no hasta `posponerHasta`; con otra versión, sí.
 */
export function debeMostrarCampania({
  estado,
  sincronizado,
  cargando,
  registro,
  ahora,
  version = VERSION_CAMPANIA_AVISOS,
}: {
  estado: EstadoPush
  sincronizado: boolean
  cargando: boolean
  registro: RegistroCampania | null
  ahora: number
  version?: string
}): boolean {
  if (cargando || !sincronizado) return false
  if (estado !== 'sin-pedir' && estado !== 'denegado') return false
  if (!registro || registro.version !== version) return true
  if (registro.hecha) return false
  if (typeof registro.posponerHasta === 'number' && ahora < registro.posponerHasta) return false
  return true
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

/**
 * Lo guardado de la campaña. `null`: nunca se guardó nada. Si la lectura
 * falla o el contenido no se entiende, se devuelve un registro "hecha" de esta
 * versión: nunca insistir.
 */
export async function leerRegistroCampania(): Promise<RegistroCampania | null> {
  const noInsistir: RegistroCampania = { version: VERSION_CAMPANIA_AVISOS, hecha: true }
  try {
    const SecureStore = await import('expo-secure-store')
    const crudo = await SecureStore.getItemAsync(CLAVE_CAMPANIA_AVISOS)
    if (crudo === null || crudo === undefined) return null
    const valor: unknown = JSON.parse(crudo)
    if (typeof valor !== 'object' || valor === null) return noInsistir
    const { version, posponerHasta, hecha } = valor as Record<string, unknown>
    if (typeof version !== 'string') return noInsistir
    return {
      version,
      ...(typeof posponerHasta === 'number' ? { posponerHasta } : {}),
      ...(hecha === true ? { hecha: true } : {}),
    }
  } catch {
    return noInsistir
  }
}

async function guardarRegistroCampania(registro: RegistroCampania): Promise<void> {
  try {
    const SecureStore = await import('expo-secure-store')
    await SecureStore.setItemAsync(CLAVE_CAMPANIA_AVISOS, JSON.stringify(registro))
  } catch {
    // En el peor caso se vuelve a preguntar una vez más.
  }
}

/** Activó o dijo "Sí": no se vuelve a mostrar esta versión. */
export async function marcarCampaniaHecha(): Promise<void> {
  await guardarRegistroCampania({ version: VERSION_CAMPANIA_AVISOS, hecha: true })
}

/** "Ahora no" / Atrás / tocar afuera: se pospone 7 días. */
export async function posponerCampania(ahora: number = Date.now()): Promise<void> {
  await guardarRegistroCampania({ version: VERSION_CAMPANIA_AVISOS, posponerHasta: ahora + PLAZO_POSPONER_CAMPANIA_MS })
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
