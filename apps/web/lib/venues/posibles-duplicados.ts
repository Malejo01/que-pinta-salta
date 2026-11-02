/**
 * Posibles duplicados entre lugares, solo como propuesta para el admin: no
 * fusiona nada. Puro. Se comparan los tokens de `venueCoreKey` sin palabras
 * genéricas; dos lugares son candidatos si los tokens de uno son subconjunto de
 * los del otro y ese subconjunto tiene al menos un token de 4 letras o más.
 */
import { venueCoreKey } from './normalize'

const GENERICAS = new Set([
  'club', 'bar', 'pub', 'salon', 'teatro', 'museo', 'cafe', 'centro', 'espacio', 'casa',
  'restaurante', 'resto', 'boliche', 'cine', 'sala', 'hotel', 'complejo', 'estadio', 'plaza',
  'de', 'del', 'la', 'el', 'las', 'los', 'y', 'e', 'en', 'a',
])

export interface LugarParaDuplicados {
  id: string
  name: string
}

function tokensPropios(nombre: string): Set<string> {
  return new Set(
    venueCoreKey(nombre)
      .split(' ')
      .filter((token) => token !== '' && !GENERICAS.has(token))
  )
}

function esSubconjunto(chico: Set<string>, grande: Set<string>): boolean {
  for (const token of chico) if (!grande.has(token)) return false
  return true
}

/** Por id de lugar, los otros lugares que podrían ser el mismo (nunca él mismo). Solo aparecen los que tienen candidatos. */
export function posiblesDuplicados(lugares: LugarParaDuplicados[]): Map<string, LugarParaDuplicados[]> {
  const tokens = lugares.map((lugar) => tokensPropios(lugar.name))
  const resultado = new Map<string, LugarParaDuplicados[]>()

  for (let i = 0; i < lugares.length; i++) {
    for (let j = i + 1; j < lugares.length; j++) {
      if (lugares[i].id === lugares[j].id) continue
      const a = tokens[i]
      const b = tokens[j]
      if (a.size === 0 || b.size === 0) continue
      const [chico, grande] = a.size <= b.size ? [a, b] : [b, a]
      if (!esSubconjunto(chico, grande)) continue
      if (![...chico].some((token) => token.length >= 4)) continue
      resultado.set(lugares[i].id, [...(resultado.get(lugares[i].id) ?? []), lugares[j]])
      resultado.set(lugares[j].id, [...(resultado.get(lugares[j].id) ?? []), lugares[i]])
    }
  }
  return resultado
}
