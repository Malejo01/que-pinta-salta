/**
 * Normalización de las preferencias del Radar antes de guardarlas (R27,
 * tarea 27-a). Valida la frecuencia y limpia las listas de ids de
 * categorías, locales y cuentas de Instagram. Sin React ni Supabase.
 *
 * Sin `email_target`: el Radar solo manda al email de la cuenta, y lo pone
 * el trigger de la base (nunca se acepta un destinatario del cliente).
 */

export const FRECUENCIAS_RADAR = ['weekly', 'biweekly', 'monthly', 'disabled'] as const
export type EmailFrequency = (typeof FRECUENCIAS_RADAR)[number]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Si `valor` es un uuid válido (v4 o no: solo se chequea el formato con
 * guiones de 8-4-4-4-12 hex, insensible a mayúsculas). La usa `limpiarIds`
 * acá mismo y, desde la R47 (tarea 47-a), `radar/seguimiento.ts` para
 * validar el `id` de `validarSeguimiento`: un solo lugar para esta regla,
 * en vez de copiar la expresión regular.
 */
export function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID_RE.test(valor)
}

/** Solo los uuids válidos, sin repetidos (conserva el orden de aparición). */
function limpiarIds(ids: string[] | null | undefined): string[] {
  const vistos = new Set<string>()
  const limpios: string[] = []
  for (const id of ids || []) {
    if (esUuid(id) && !vistos.has(id)) {
      vistos.add(id)
      limpios.push(id)
    }
  }
  return limpios
}

export interface PreferenciasRadarEntrada {
  email_frequency: string
  categoryIds: string[]
  venueIds: string[]
  instagramAccountIds: string[]
}

export interface PreferenciasRadarNormalizadas {
  email_frequency: EmailFrequency
  categoryIds: string[]
  venueIds: string[]
  instagramAccountIds: string[]
}

export type ResultadoNormalizacionRadar =
  | { ok: true; datos: PreferenciasRadarNormalizadas }
  | { ok: false; error: string }

/**
 * Valida y normaliza las preferencias del Radar antes de guardarlas:
 * la frecuencia tiene que estar en `FRECUENCIAS_RADAR`, y las listas de ids
 * quedan solo con uuids válidos y sin repetidos.
 */
export function normalizarPreferenciasRadar(
  datos: PreferenciasRadarEntrada,
): ResultadoNormalizacionRadar {
  if (!(FRECUENCIAS_RADAR as readonly string[]).includes(datos.email_frequency)) {
    return { ok: false, error: 'La frecuencia del Radar no es válida.' }
  }

  return {
    ok: true,
    datos: {
      email_frequency: datos.email_frequency as EmailFrequency,
      categoryIds: limpiarIds(datos.categoryIds),
      venueIds: limpiarIds(datos.venueIds),
      instagramAccountIds: limpiarIds(datos.instagramAccountIds),
    },
  }
}
