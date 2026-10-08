/**
 * Detecta si un nombre de lugar "parece" una dirección postal en vez de un
 * nombre de venue (QPS-069). Pura, sin red: solo expresiones regulares sobre
 * el string ya trimeado.
 *
 * El admin carga `default_venue_name` a mano para las cuentas de Instagram
 * (y al editar un evento). Si alguien pega "Balcarce 980" ahí, ese string
 * nunca va a hacer match con un venue real y `resolveVenueId` lo manda a la
 * cola de revisión (o, peor, si en algún momento se llama con autocreate,
 * crea un venue nuevo con la dirección como nombre).
 *
 * Casos que SÍ son dirección:
 *   - "Balcarce 980"        -> una palabra (nombre de calle) + número de
 *                              2 a 5 dígitos AL FINAL del string.
 *   - "Av. Belgrano 1250"   -> empieza con "Av."/"Avenida"/"Calle"/"Ruta"
 *                              y el resto contiene un número.
 *   - "Calle Caseros 500"   -> idem.
 *
 * Casos que NO son dirección (aunque tengan un número):
 *   - "Club 20 de Febrero"  -> el número (20) no está al final: le sigue
 *                              "de Febrero". Es el nombre de un club.
 *   - "Sala 1"              -> el número final tiene 1 solo dígito, no
 *                              2 a 5: una sala de teatro/cine, no una altura.
 *   - "La 9 de Julio Bar"   -> el número (9) está en el medio, no al final.
 *   - "Live Fresh"          -> no tiene ningún número.
 *   - "La Vieja Estación"   -> no tiene ningún número.
 */

/** "Av.", "Av", "Avenida", "Calle", "Ruta" al inicio del nombre. */
const STREET_PREFIX = /^(av\.?|avenida|calle|ruta)\s+/i

/**
 * Una o más palabras seguidas de un número de 2 a 5 dígitos, ese número
 * siendo el último token del string (sin nada después, salvo espacios).
 */
const TRAILING_STREET_NUMBER = /^(.+?)\s+(\d{2,5})\s*$/

export function looksLikeAddress(name: string | null | undefined): boolean {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return false

  // "Av. Belgrano 1250", "Avenida Belgrano 1250", "Calle Caseros 500",
  // "Ruta 51": basta con que, después del prefijo de calle, haya algún
  // número en el string (puede venir pegado, como en "Ruta 51").
  if (STREET_PREFIX.test(trimmed) && /\d/.test(trimmed)) {
    return true
  }

  // "Balcarce 980": nombre de calle + altura al final.
  const match = trimmed.match(TRAILING_STREET_NUMBER)
  if (match) {
    const streetName = match[1].trim()
    // Tiene que haber al menos una letra antes del número (no solo
    // dígitos o símbolos sueltos) para que cuente como "nombre de calle".
    if (/[a-zA-ZÀ-ÿ]/.test(streetName)) {
      return true
    }
  }

  return false
}
