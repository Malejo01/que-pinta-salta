// R82 / Q4-2: cliente de la API pública de avisos sin sesión
// (`POST /api/push/registrar` y `POST /api/push/preferencias` del sitio).
//
// - URL (decisión 5): `https://www.quepintasalta.com.ar`, que se puede pisar
//   con `EXPO_PUBLIC_API_URL` (solo https). No es secreto.
// - Nunca tira: devuelve un resultado. Con timeout (`fetchConTimeout`, sin
//   `AbortSignal.timeout`, que Hermes no garantiza).
// - Nunca loguea el token, el deviceId ni `error.message`: como mucho el
//   status HTTP o el nombre del error.
// - La ruta nueva solo existe en producción después del deploy: antes, la app
//   recibe 404 y lo trata como un error de registro, no como un bloqueo.
import { fetchConTimeout, TIMEOUT_RED_MS } from '@/lib/red'

export const URL_API_POR_DEFECTO = 'https://www.quepintasalta.com.ar'

export function urlApi(entorno: string | undefined = process.env.EXPO_PUBLIC_API_URL): string {
  const valor = typeof entorno === 'string' ? entorno.trim().replace(/\/+$/, '') : ''
  return /^https:\/\/[^\s/]+$/.test(valor) ? valor : URL_API_POR_DEFECTO
}

export type Plataforma = 'android' | 'ios'

export type ResultadoRegistroAnonimo =
  | { ok: true; deviceId: string; avisosEquipo: boolean | null; avisosPatrocinados: boolean | null }
  | { ok: false; motivo: 'otro-dispositivo' | 'limite' | 'invalido' | 'red' | 'servidor' }

export type ResultadoPreferenciasAnonimas = { ok: true } | { ok: false; motivo: 'limite' | 'invalido' | 'red' | 'servidor' }

type Fetch = typeof fetch

function motivoDeStatus(status: number): 'limite' | 'invalido' | 'servidor' {
  if (status === 429) return 'limite'
  if (status >= 400 && status < 500) return 'invalido'
  return 'servidor'
}

async function postJson(ruta: string, cuerpo: Record<string, unknown>, fetchBase: Fetch): Promise<Response | null> {
  try {
    const conTimeout = fetchConTimeout(fetchBase, TIMEOUT_RED_MS)
    return await conTimeout(`${urlApi()}${ruta}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(cuerpo),
    })
  } catch (error) {
    const nombre = typeof (error as { name?: unknown })?.name === 'string' ? (error as { name: string }).name : 'desconocido'
    console.warn('[push] la API de avisos no respondió', nombre)
    return null
  }
}

async function leerJson(respuesta: Response): Promise<Record<string, unknown> | null> {
  try {
    const datos = (await respuesta.json()) as unknown
    return datos !== null && typeof datos === 'object' && !Array.isArray(datos) ? (datos as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function registrarAnonimo(
  datos: { token: string; plataforma: Plataforma; deviceId?: string | null; idioma?: string | null },
  fetchBase: Fetch = fetch,
): Promise<ResultadoRegistroAnonimo> {
  const cuerpo: Record<string, unknown> = { token: datos.token, plataforma: datos.plataforma }
  if (datos.deviceId) cuerpo.deviceId = datos.deviceId
  if (datos.idioma) cuerpo.idioma = datos.idioma

  const respuesta = await postJson('/api/push/registrar', cuerpo, fetchBase)
  if (!respuesta) return { ok: false, motivo: 'red' }
  if (!respuesta.ok) {
    console.warn('[push] la API de avisos respondió', respuesta.status)
    return { ok: false, motivo: motivoDeStatus(respuesta.status) }
  }
  const json = await leerJson(respuesta)
  if (!json || json.ok !== true) return { ok: false, motivo: 'servidor' }
  if (json.registrado !== true) return { ok: false, motivo: 'otro-dispositivo' }
  if (typeof json.deviceId !== 'string' || !UUID.test(json.deviceId)) return { ok: false, motivo: 'servidor' }
  return {
    ok: true,
    deviceId: json.deviceId,
    avisosEquipo: typeof json.avisosEquipo === 'boolean' ? json.avisosEquipo : null,
    avisosPatrocinados: typeof json.avisosPatrocinados === 'boolean' ? json.avisosPatrocinados : null,
  }
}

export async function cambiarPreferenciasAnonimas(
  datos: { token: string; deviceId: string; avisosEquipo?: boolean; avisosPatrocinados?: boolean },
  fetchBase: Fetch = fetch,
): Promise<ResultadoPreferenciasAnonimas> {
  const cuerpo: Record<string, unknown> = { token: datos.token, deviceId: datos.deviceId }
  if (typeof datos.avisosEquipo === 'boolean') cuerpo.avisosEquipo = datos.avisosEquipo
  if (typeof datos.avisosPatrocinados === 'boolean') cuerpo.avisosPatrocinados = datos.avisosPatrocinados

  const respuesta = await postJson('/api/push/preferencias', cuerpo, fetchBase)
  if (!respuesta) return { ok: false, motivo: 'red' }
  if (!respuesta.ok) {
    console.warn('[push] la API de avisos respondió', respuesta.status)
    return { ok: false, motivo: motivoDeStatus(respuesta.status) }
  }
  return { ok: true }
}
