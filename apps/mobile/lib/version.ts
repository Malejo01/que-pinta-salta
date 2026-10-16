// Versión y entorno en Cuenta (R28, 28-c). Pura: no importa `react-native`
// ni `expo-constants` — `app/(tabs)/cuenta.tsx` lee `Constants.expoConfig` y
// le pasa los valores ya extraídos.
//
// `textoVersion` es lo que evita que una clave llegue a la pantalla: solo
// acepta una versión con forma `\d+\.\d+\.\d+` y un entorno de la lista
// cerrada de abajo. Cualquier otro valor (por ejemplo una clave puesta por
// error en `extra`) nunca se devuelve tal cual: la versión inválida da
// "desconocida" y el entorno inválido se omite del texto.
export const ENTORNOS_VALIDOS = ['preview', 'production', 'development', 'local'] as const

export type Entorno = (typeof ENTORNOS_VALIDOS)[number]

const VERSION_RE = /^\d+\.\d+\.\d+$/

function esEntornoValido(valor: unknown): valor is Entorno {
  return typeof valor === 'string' && (ENTORNOS_VALIDOS as readonly string[]).includes(valor)
}

export interface TextoVersionArgs {
  version?: unknown
  entorno?: unknown
}

/**
 * `"Versión 0.1.0 · preview"`. Si la versión no tiene forma `\d+\.\d+\.\d+`,
 * se muestra "desconocida" en su lugar (nunca el valor crudo). Si el
 * entorno no está en `ENTORNOS_VALIDOS`, se omite (queda solo "Versión X").
 */
export function textoVersion({ version, entorno }: TextoVersionArgs): string {
  const versionTexto = typeof version === 'string' && VERSION_RE.test(version) ? version : 'desconocida'
  const partes = [`Versión ${versionTexto}`]
  if (esEntornoValido(entorno)) partes.push(entorno)
  return partes.join(' · ')
}
