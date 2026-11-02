/**
 * Validación de los cuerpos de la API pública de avisos sin sesión (R82 / Q4-2):
 * `POST /api/push/registrar` y `POST /api/push/preferencias`. Puro, sin red ni
 * base. Devuelve `{ ok: false }` sin decir qué campo falló: la ruta responde un
 * 400 genérico para no darle pistas a quien prueba a ciegas.
 *
 * El formato del token es el mismo que exige la base (`register_anon_push_token`):
 * `ExponentPushToken[...]`, sin espacios ni `]` adentro, hasta 200 caracteres.
 * Es más estricto que `esTokenExpoValido` del envío (que acepta espacios) a
 * propósito: lo que entra por una API pública tiene que pasar el check de la base.
 */

export const LARGO_MAXIMO_TOKEN = 200

const TOKEN_EXPO = /^ExponentPushToken\[[^\]\s]+\]$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const IDIOMA = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/

export type Plataforma = 'android' | 'ios'

export type DatosRegistro = {
  token: string
  /** Ausente en el primer registro: lo genera el servidor (decisión 3). */
  deviceId: string | null
  plataforma: Plataforma
  idioma: string | null
}

export type DatosPreferencias = {
  token: string
  deviceId: string
  avisosEquipo: boolean | null
  avisosPatrocinados: boolean | null
}

export type Resultado<T> = { ok: true; datos: T } | { ok: false }

export function esTokenExpoEstricto(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length <= LARGO_MAXIMO_TOKEN && TOKEN_EXPO.test(valor)
}

export function esDeviceId(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID.test(valor)
}

function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
}

export function validarRegistro(cuerpo: unknown): Resultado<DatosRegistro> {
  if (!esObjetoPlano(cuerpo)) return { ok: false }
  const { token, deviceId, plataforma, idioma } = cuerpo
  if (!esTokenExpoEstricto(token)) return { ok: false }
  if (plataforma !== 'android' && plataforma !== 'ios') return { ok: false }
  if (deviceId !== undefined && deviceId !== null && !esDeviceId(deviceId)) return { ok: false }
  // Un idioma raro no invalida el pedido (la base tampoco lo rechaza): se ignora.
  const idiomaValido = typeof idioma === 'string' && idioma.length <= 12 && IDIOMA.test(idioma) ? idioma : null
  return {
    ok: true,
    datos: {
      token,
      deviceId: typeof deviceId === 'string' ? deviceId.toLowerCase() : null,
      plataforma,
      idioma: idiomaValido,
    },
  }
}

export function validarPreferencias(cuerpo: unknown): Resultado<DatosPreferencias> {
  if (!esObjetoPlano(cuerpo)) return { ok: false }
  const { token, deviceId, avisosEquipo, avisosPatrocinados } = cuerpo
  if (!esTokenExpoEstricto(token) || !esDeviceId(deviceId)) return { ok: false }
  const equipo = avisosEquipo === undefined ? null : avisosEquipo
  const patrocinados = avisosPatrocinados === undefined ? null : avisosPatrocinados
  if (equipo !== null && typeof equipo !== 'boolean') return { ok: false }
  if (patrocinados !== null && typeof patrocinados !== 'boolean') return { ok: false }
  if (equipo === null && patrocinados === null) return { ok: false }
  return {
    ok: true,
    datos: { token, deviceId: deviceId.toLowerCase(), avisosEquipo: equipo, avisosPatrocinados: patrocinados },
  }
}

