// Q5-13 · «La app se abrió hoy», para personas activas por día y por semana
// en /admin/uso. Anónimo:
//   - un id de métricas ALEATORIO, generado acá y guardado solo en el
//     teléfono (`qps.metricas.id`). No es el device_id del push ni nada de la
//     cuenta. El servidor no lo guarda: solo sus hashes del día y de la semana.
//   - se manda UNA vez por día de Salta (`qps.apertura.dia`), con la
//     plataforma, la versión de la app y si hay sesión (sí / no).
// Nunca tira y nunca reintenta: medir no puede trabar la app.
import { SITIO } from '@qps/core/metricas/links'
import { userAgentApp } from '@qps/core/metricas/vista-app'
import { formatSaltaDayKey } from '@qps/core/date-format'
import { fetchConTimeout } from '@/lib/red'
import type { Almacen } from '@/lib/sin-conexion/almacen'

export const CLAVE_ID_METRICAS = 'qps.metricas.id'
export const CLAVE_DIA_APERTURA = 'qps.apertura.dia'
export const URL_APERTURA = `${SITIO}/api/app/apertura`
const TIMEOUT_MS = 5000

/** 32 caracteres hex al azar (no identifica a nadie: no sale de ningún dato del teléfono). */
export function nuevoIdMetricas(azar: () => number = Math.random): string {
  let id = ''
  for (let i = 0; i < 32; i++) id += Math.floor(azar() * 16).toString(16)
  return id
}

export interface DependenciasApertura {
  almacen: Almacen
  fetch: typeof fetch
  ahora: Date
  plataforma: 'android' | 'ios'
  version: string | null
  conCuenta: boolean
}

export type ResultadoApertura = 'enviada' | 'ya-se-mando-hoy' | 'fallo'

export async function avisarApertura(d: DependenciasApertura): Promise<ResultadoApertura> {
  try {
    const hoy = formatSaltaDayKey(d.ahora)
    if ((await d.almacen.leer(CLAVE_DIA_APERTURA)) === hoy) return 'ya-se-mando-hoy'
    let id = await d.almacen.leer(CLAVE_ID_METRICAS)
    if (!id || !/^[0-9a-f]{32}$/.test(id)) {
      id = nuevoIdMetricas()
      await d.almacen.escribir(CLAVE_ID_METRICAS, id)
    }
    const version = d.version && /^[0-9A-Za-z._-]{1,20}$/.test(d.version) ? d.version : null
    const respuesta = await fetchConTimeout(d.fetch, TIMEOUT_MS)(URL_APERTURA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': userAgentApp(version ?? '') },
      body: JSON.stringify({ idMetricas: id, plataforma: d.plataforma, version, conCuenta: d.conCuenta }),
    })
    if (!respuesta.ok) return 'fallo'
    await d.almacen.escribir(CLAVE_DIA_APERTURA, hoy)
    return 'enviada'
  } catch {
    return 'fallo'
  }
}
