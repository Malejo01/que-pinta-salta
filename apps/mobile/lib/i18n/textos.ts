// Q6-1 · El diccionario de un idioma, sin React: lo usan la lógica pura de
// `lib/` (vacíos, conteos, anuncios) y los avisos locales, que se arman fuera
// de un componente. Las pantallas siguen con `useTextos()` (`lib/i18n`).
import { en } from './diccionarios/en'
import { es, type Diccionario } from './diccionarios/es'
import { idiomaEfectivo, localeDelDispositivo, type Idioma, type PreferenciaIdioma } from './idioma'

const DICCIONARIOS: Record<Idioma, Diccionario> = { es, en }

/** El diccionario de `idioma`; sin idioma, castellano (lo de siempre). */
export function textosDe(idioma: Idioma = 'es'): Diccionario {
  return DICCIONARIOS[idioma] ?? es
}

/**
 * Q6-6 · Lo que se le dice al lector de pantalla al elegir un idioma en
 * Cuenta, EN EL IDIOMA NUEVO («Language: English» al pasar a inglés, «Idioma:
 * Español» al volver): antes salía en el idioma de antes del toque, porque el
 * diccionario era el del render anterior. Con «Automático», en el idioma del
 * teléfono.
 */
export function anuncioCambioDeIdioma(preferencia: PreferenciaIdioma, locale: string = localeDelDispositivo()): string {
  const t = textosDe(idiomaEfectivo(preferencia, locale)).idioma
  const nombre = preferencia === 'auto' ? t.automatico : preferencia === 'es' ? t.castellano : t.ingles
  return t.cambiadoA(nombre)
}
