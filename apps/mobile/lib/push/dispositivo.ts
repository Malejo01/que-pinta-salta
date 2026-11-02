// R82 / Q4-2: lo que el teléfono guarda de su registro sin cuenta, en el
// almacenamiento seguro: el `device_id` (lo genera el servidor) y el último
// estado conocido de los interruptores. Puro sobre un `Almacenamiento`
// inyectado; nunca tira (una lectura que falla es «no hay dato»).
import { CLAVE_AVISOS_ANONIMOS, CLAVE_AVISOS_APAGAR_TRAS_BAJA, CLAVE_DEVICE_ID } from './clave-token'

export interface AlmacenamientoSimple {
  getItem: (clave: string) => Promise<string | null>
  setItem: (clave: string, valor: string) => Promise<void>
  removeItem: (clave: string) => Promise<void>
}

export interface AvisosAnonimos {
  avisosEquipo: boolean
  avisosPatrocinados: boolean
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function leer(almacen: AlmacenamientoSimple, clave: string): Promise<string | null> {
  try {
    return await almacen.getItem(clave)
  } catch {
    return null
  }
}

async function escribir(almacen: AlmacenamientoSimple, clave: string, valor: string | null): Promise<void> {
  try {
    if (valor === null) await almacen.removeItem(clave)
    else await almacen.setItem(clave, valor)
  } catch {
    // Best-effort: se vuelve a intentar en el próximo registro.
  }
}

export async function leerDeviceId(almacen: AlmacenamientoSimple): Promise<string | null> {
  const valor = await leer(almacen, CLAVE_DEVICE_ID)
  return valor && UUID.test(valor) ? valor : null
}

export function guardarDeviceId(almacen: AlmacenamientoSimple, deviceId: string): Promise<void> {
  return escribir(almacen, CLAVE_DEVICE_ID, deviceId)
}

/** `null` si nunca se guardó o lo guardado no se entiende. Patrocinados: solo `true` estricto. */
export async function leerAvisosAnonimos(almacen: AlmacenamientoSimple): Promise<AvisosAnonimos | null> {
  const valor = await leer(almacen, CLAVE_AVISOS_ANONIMOS)
  if (!valor) return null
  try {
    const datos = JSON.parse(valor) as Record<string, unknown>
    if (typeof datos?.avisosEquipo !== 'boolean') return null
    return { avisosEquipo: datos.avisosEquipo, avisosPatrocinados: datos.avisosPatrocinados === true }
  } catch {
    return null
  }
}

export function guardarAvisosAnonimos(almacen: AlmacenamientoSimple, avisos: AvisosAnonimos | null): Promise<void> {
  return escribir(almacen, CLAVE_AVISOS_ANONIMOS, avisos ? JSON.stringify(avisos) : null)
}

export async function hayQueApagarTrasBaja(almacen: AlmacenamientoSimple): Promise<boolean> {
  return (await leer(almacen, CLAVE_AVISOS_APAGAR_TRAS_BAJA)) === '1'
}

export function marcarApagarTrasBaja(almacen: AlmacenamientoSimple, marcar: boolean): Promise<void> {
  return escribir(almacen, CLAVE_AVISOS_APAGAR_TRAS_BAJA, marcar ? '1' : null)
}

/** Lo que muestran los interruptores de Cuenta sin sesión: apagados si el permiso no está activo. */
export function avisosVisibles(activo: boolean, guardados: AvisosAnonimos | null): AvisosAnonimos {
  if (!activo) return { avisosEquipo: false, avisosPatrocinados: false }
  return guardados ?? { avisosEquipo: true, avisosPatrocinados: false }
}
