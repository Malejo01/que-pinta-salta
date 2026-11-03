/**
 * Q5-13 · Aperturas de la app (puro, salvo `createHash` de Node).
 *
 * La app manda un id de métricas aleatorio que vive solo en el teléfono
 * (NO el device_id del push). El servidor nunca lo guarda: calcula
 * `sha256(id:díaDeSalta)` y `sha256(id:semanaISO)` y guarda solo eso. Con el
 * hash del día no se puede seguir a nadie de un día al otro; con el de la
 * semana, solo dentro de la semana (para «personas activas por semana»).
 */
import { createHash } from 'node:crypto'
import { formatSaltaDayKey } from '@qps/core/date-format'

export type DatosApertura = {
  idMetricas: string
  plataforma: 'android' | 'ios'
  version: string | null
  conCuenta: boolean
}

const ID = /^[0-9a-f]{32}$/
const VERSION = /^[0-9A-Za-z._-]{1,20}$/

/** Valida el cuerpo. `null` si no sirve (el endpoint contesta 400 genérico). */
export function validarApertura(cuerpo: unknown): DatosApertura | null {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return null
  const c = cuerpo as Record<string, unknown>
  const claves = Object.keys(c)
  if (claves.some((k) => !['idMetricas', 'plataforma', 'version', 'conCuenta'].includes(k))) return null
  if (typeof c.idMetricas !== 'string' || !ID.test(c.idMetricas)) return null
  if (c.plataforma !== 'android' && c.plataforma !== 'ios') return null
  if (c.version !== undefined && c.version !== null && (typeof c.version !== 'string' || !VERSION.test(c.version))) return null
  if (c.conCuenta !== undefined && typeof c.conCuenta !== 'boolean') return null
  return {
    idMetricas: c.idMetricas,
    plataforma: c.plataforma,
    version: typeof c.version === 'string' ? c.version : null,
    conCuenta: c.conCuenta === true,
  }
}

/** Semana ISO del día de Salta: «2026-W45». */
export function semanaIso(diaKey: string): string {
  const [a, m, d] = diaKey.split('-').map(Number) as [number, number, number]
  const fecha = new Date(Date.UTC(a, m - 1, d))
  const diaSemana = fecha.getUTCDay() || 7
  fecha.setUTCDate(fecha.getUTCDate() + 4 - diaSemana)
  const inicioAnio = new Date(Date.UTC(fecha.getUTCFullYear(), 0, 1))
  const semana = Math.ceil(((fecha.getTime() - inicioAnio.getTime()) / 86_400_000 + 1) / 7)
  return `${fecha.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`
}

function sha256(texto: string): string {
  return createHash('sha256').update(texto).digest('hex')
}

/** Lo que se guarda: el día de Salta y los dos hashes (nunca el id). */
export function filaDeApertura(datos: DatosApertura, ahora: Date): { day: string; hashDia: string; hashSemana: string } {
  const day = formatSaltaDayKey(ahora)
  return { day, hashDia: sha256(`${datos.idMetricas}:${day}`), hashSemana: sha256(`${datos.idMetricas}:${semanaIso(day)}`) }
}
