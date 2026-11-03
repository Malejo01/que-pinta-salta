// Q6-1 · El diccionario de un idioma, sin React: lo usan la lógica pura de
// `lib/` (vacíos, conteos, anuncios) y los avisos locales, que se arman fuera
// de un componente. Las pantallas siguen con `useTextos()` (`lib/i18n`).
import { en } from './diccionarios/en'
import { es, type Diccionario } from './diccionarios/es'
import type { Idioma } from './idioma'

const DICCIONARIOS: Record<Idioma, Diccionario> = { es, en }

/** El diccionario de `idioma`; sin idioma, castellano (lo de siempre). */
export function textosDe(idioma: Idioma = 'es'): Diccionario {
  return DICCIONARIOS[idioma] ?? es
}
