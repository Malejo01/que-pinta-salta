/**
 * Idiomas del sitio (Q3, base en inglés). El castellano es el idioma de
 * siempre y vive en las rutas de siempre; el inglés vive bajo `/en` y por
 * ahora solo cubre algunas páginas (ver `rutas.ts`). Puro: sin React ni next/*.
 */
export type Idioma = 'es' | 'en'

export const IDIOMAS: readonly Idioma[] = ['es', 'en']

/** Locale de `Intl` para fechas y números en cada idioma. */
export const LOCALE_INTL: Record<Idioma, string> = {
  es: 'es-AR',
  en: 'en-US',
}

/** Valor del atributo `lang` del documento. El inglés va neutro, sin región. */
export const LANG_HTML: Record<Idioma, string> = {
  es: 'es-AR',
  en: 'en',
}

export function esIdioma(x: unknown): x is Idioma {
  return x === 'es' || x === 'en'
}
