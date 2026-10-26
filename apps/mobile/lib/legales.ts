/**
 * Legales de la app (QPS-237, ronda 49): puro, sin `react-native` ni
 * `expo-*`, mismo patrón que `lib/accesibilidad.ts` — así se prueba con
 * Vitest en entorno `node`, sin montar nada. `lib/links.ts` importa
 * `TERMINOS_PUBLICADOS` de acá (los dos son puros: no hay ciclo ni problema
 * de polyfill).
 *
 * `TERMINOS_PUBLICADOS`: `/terminos` (el #74) ya está en `main` y publicado,
 * así que está en `true` (R72, 72-d, QPS-333): el link a "Términos y
 * condiciones" se muestra junto a Privacidad y la línea de aceptación nombra
 * los dos documentos. Cambiar este valor pide un build nuevo de EAS, porque
 * la constante se empaqueta en el binario.
 */
export const TERMINOS_PUBLICADOS = true

export const RUTA_PRIVACIDAD = '/privacidad'
export const RUTA_TERMINOS = '/terminos'

export interface EnlaceLegal {
  ruta: string
  texto: string
}

/**
 * Los links legales a mostrar: Política de privacidad siempre, Términos y
 * condiciones solo si `terminosPublicados` (por defecto, `TERMINOS_PUBLICADOS`).
 */
export function enlacesLegales(terminosPublicados: boolean = TERMINOS_PUBLICADOS): EnlaceLegal[] {
  const enlaces: EnlaceLegal[] = [{ ruta: RUTA_PRIVACIDAD, texto: 'Política de privacidad' }]
  if (terminosPublicados) {
    enlaces.push({ ruta: RUTA_TERMINOS, texto: 'Términos y condiciones' })
  }
  return enlaces
}

/**
 * La línea de aceptación al crear cuenta o continuar con Google. Mismo
 * sentido que la línea de la web (#74): nombra los dos documentos solo
 * cuando los dos están publicados.
 */
export function textoAceptacion(terminosPublicados: boolean = TERMINOS_PUBLICADOS): string {
  return terminosPublicados
    ? 'Al crear tu cuenta o continuar con Google aceptás los Términos y condiciones y la Política de privacidad.'
    : 'Al crear tu cuenta o continuar con Google aceptás la Política de privacidad.'
}
