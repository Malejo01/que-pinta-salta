import { describe, expect, it } from 'vitest'
import { MOVIE_SLUG_ALIASES, normalizeMovieTitle } from '@/lib/scraper/cinema-scraper'

// QPS-141 / tarea 31-c: fija el comportamiento de hoy de normalizeMovieTitle
// (apps/web/lib/scraper/cinema-scraper.ts:10-55) antes de que 31-b la toque.
// normalizeMovieTitle ya está exportada en el archivo de hoy, así que se
// testea directo (no hizo falta exportarla ni testear a través de otra
// función).

describe('normalizeMovieTitle — paréntesis y corchetes', () => {
  it('saca el contenido entre paréntesis', () => {
    expect(normalizeMovieTitle('Avatar (Sala VIP)')).toBe('avatar')
  })
  it('saca el contenido entre corchetes', () => {
    expect(normalizeMovieTitle('Avatar [2D]')).toBe('avatar')
  })
  it('saca ambos cuando aparecen juntos', () => {
    expect(normalizeMovieTitle('Avengers: Endgame (Doblada) [2D]')).toBe('avengers-endgame')
  })
})

describe('normalizeMovieTitle — minúsculas y sin tildes', () => {
  it('pasa a minúsculas', () => {
    expect(normalizeMovieTitle('PELICULA')).toBe('pelicula')
  })
  it('saca tildes', () => {
    expect(normalizeMovieTitle('Película')).toBe('pelicula')
  })
  it('saca la ñ (vía normalización NFD)', () => {
    expect(normalizeMovieTitle('Año Nuevo')).toBe('ano-nuevo')
  })
})

describe('normalizeMovieTitle — palabras de formato', () => {
  it.each([
    ['Dune 2D', 'dune'],
    ['Dune 3D', 'dune'],
    ['Dune XD', 'dune'],
    ['Dune DBOX', 'dune'],
    ['Dune D-BOX', 'dune'],
    ['Dune HD', 'dune'],
    ['Dune Castellano', 'dune'],
    ['Dune Cast', 'dune'],
    ['Dune Doblada', 'dune'],
    ['Dune Dob', 'dune'],
    ['Dune Subtitulada', 'dune'],
    ['Dune Subt', 'dune'],
    ['Dune Sub', 'dune'],
    ['Dune Preestreno', 'dune'],
    ['Dune Pre-estreno', 'dune'],
    ['Dune Live Action', 'dune'],
  ])('saca el modificador de %s', (input, expected) => {
    expect(normalizeMovieTitle(input)).toBe(expected)
  })

  it('solo saca la palabra completa, no una que la contiene (ej: "Castellano" ya sacó "cast")', () => {
    // "Castellano" se sacó entero por su propia regla; no queda un "ellano"
    // sobrante ni se corta "cast" de una palabra que no es ese modificador.
    expect(normalizeMovieTitle('Dune Castellano')).toBe('dune')
    expect(normalizeMovieTitle('Casting de Dune')).toBe('casting-de-dune')
  })
})

describe('normalizeMovieTitle — slug (no alfanumérico a guiones)', () => {
  it('los espacios se convierten en un solo guión', () => {
    expect(normalizeMovieTitle('Dos   Palabras')).toBe('dos-palabras')
  })
  it('no quedan guiones repetidos (espacios + guión literal juntos)', () => {
    expect(normalizeMovieTitle('A   -   B')).toBe('a-b')
  })
  it('no quedan guiones en los bordes', () => {
    expect(normalizeMovieTitle('-Hola-')).toBe('hola')
  })
  it('vacío o solo símbolos da cadena vacía', () => {
    expect(normalizeMovieTitle('')).toBe('')
    expect(normalizeMovieTitle('¡¡¡!!!')).toBe('')
  })
  // Comportamiento real de hoy, más estricto que la descripción informal de
  // la tarea ("todo lo que no es alfanumérico pasa a guiones"): el código
  // solo convierte los ESPACIOS en blanco a guión; el resto de los
  // caracteres no alfanuméricos (puntuación pegada a una palabra, sin
  // espacio) se borra sin dejar guión. Dos palabras separadas sin espacio
  // por un signo de puntuación quedan pegadas, no separadas por guión.
  // Para 31-b: si esto cambia, es un cambio de comportamiento, no solo un
  // efecto colateral de la deduplicación de slugs.
  it('puntuación sin espacio alrededor se borra y pega las palabras (no genera guión)', () => {
    expect(normalizeMovieTitle("Rock'n'Roll")).toBe('rocknroll')
    expect(normalizeMovieTitle('Día:Noche')).toBe('dianoche')
  })
})

// QPS-141 / 31-b: opción A elegida por Mauro (15/10): alias a mano vía
// MOVIE_SLUG_ALIASES, exportado desde cinema-scraper.ts y aplicado en
// addMovieShowing() justo después de calcular el slug:
//   const s = normalizeMovieTitle(rawTitle)
//   const slug = MOVIE_SLUG_ALIASES[s] ?? s
// addMovieShowing() es una función interna de runCinemaScrapeAndSync (no
// exportada, y esa función scrapea por red), así que estos tests no pueden
// invocarla directo. En su lugar:
// - `resolveSlug` reproduce exactamente esa línea de dos pasos para
//   verificar a qué slug canónico llega cada título crudo.
// - La igualdad de `resolveSlug` entre dos títulos es lo que hace que,
//   en el `Record` de `consolidatedMovies` (keyed by slug), las dos
//   entradas caigan bajo la misma clave y por lo tanto compartan el mismo
//   objeto `showings` (una entrada por `cinemaKey`): eso es "las funciones
//   de los dos cines" en una sola tarjeta.
// - `pickPoster` es un espejo de la regla de prioridad de afiche que ya
//   existe, sin cambios, en addMovieShowing (líneas ~390-397): prioriza el
//   CDN de Cinemark o completa si estaba vacía. Sirve para mostrar que,
//   alias aparte, el afiche que gana sigue siendo el de Cinemark cuando
//   está disponible.
function resolveSlug(rawTitle: string): string {
  const s = normalizeMovieTitle(rawTitle)
  return MOVIE_SLUG_ALIASES[s] ?? s
}

function pickPoster(current: string, incoming: string): string {
  if (!incoming) return current
  if (!current || current.includes('no-image')) return incoming
  if (incoming.includes('cinemark.com.ar') && !current.includes('cinemark.com.ar')) return incoming
  return current
}

describe('MOVIE_SLUG_ALIASES — QPS-141: una película, una tarjeta (31-b)', () => {
  it('Verity (Ópera) y Verity (Cinemark) resuelven al mismo slug canónico, el de Cinemark', () => {
    const opera = resolveSlug('Verity la Sombra del Engaño')
    const cinemark = resolveSlug('Verity: la Sombra de un Engaño')
    expect(opera).toBe('verity-la-sombra-de-un-engano')
    expect(cinemark).toBe('verity-la-sombra-de-un-engano')
    expect(opera).toBe(cinemark)
  })

  it('Verity: al compartir slug, las dos entradas se consolidan bajo la misma clave (funciones de los dos cines)', () => {
    const showings: Record<string, true> = {}
    showings[resolveSlug('Verity la Sombra del Engaño')] = true // cine_opera, usa el mismo slug como clave
    const slugCinemark = resolveSlug('Verity: la Sombra de un Engaño')
    const cinemasPorSlug: Record<string, string[]> = {}
    for (const [raw, cinemaKey] of [
      ['Verity la Sombra del Engaño', 'cine_opera'],
      ['Verity: la Sombra de un Engaño', 'cinemark_altonoa'],
      ['Verity: la Sombra de un Engaño', 'cinemark_paseosalta'],
    ] as const) {
      const slug = resolveSlug(raw)
      cinemasPorSlug[slug] = [...(cinemasPorSlug[slug] ?? []), cinemaKey]
    }
    expect(Object.keys(cinemasPorSlug)).toEqual(['verity-la-sombra-de-un-engano'])
    expect(cinemasPorSlug[slugCinemark]).toEqual(['cine_opera', 'cinemark_altonoa', 'cinemark_paseosalta'])
  })

  it('Verity: el afiche final es el de Cinemark (regla de prioridad sin cambios)', () => {
    let poster = ''
    poster = pickPoster(poster, 'https://opera.example.com/poster.jpg')
    poster = pickPoster(poster, 'https://images.cinemark.com.ar/poster-verity.jpg')
    expect(poster).toBe('https://images.cinemark.com.ar/poster-verity.jpg')
  })

  it('Cars (Ópera) y Cars 20° Aniversario (Cinemark) resuelven al mismo slug canónico, "cars"', () => {
    const opera = resolveSlug('Cars')
    const cinemark = resolveSlug('Cars 20° Aniversario')
    expect(opera).toBe('cars')
    expect(cinemark).toBe('cars')
    expect(opera).toBe(cinemark)
  })

  it('Cars: las dos entradas se consolidan bajo la misma clave (funciones de los dos cines)', () => {
    const cinemasPorSlug: Record<string, string[]> = {}
    for (const [raw, cinemaKey] of [
      ['Cars', 'cine_opera'],
      ['Cars 20° Aniversario', 'cinemark_altonoa'],
      ['Cars 20° Aniversario', 'cinemark_paseosalta'],
    ] as const) {
      const slug = resolveSlug(raw)
      cinemasPorSlug[slug] = [...(cinemasPorSlug[slug] ?? []), cinemaKey]
    }
    expect(Object.keys(cinemasPorSlug)).toEqual(['cars'])
    expect(cinemasPorSlug['cars']).toEqual(['cine_opera', 'cinemark_altonoa', 'cinemark_paseosalta'])
  })

  it('un slug sin alias queda igual (no se toca nada fuera de los casos de la tabla)', () => {
    const slug = normalizeMovieTitle('Avatar: El Camino del Agua')
    expect(MOVIE_SLUG_ALIASES[slug]).toBeUndefined()
    expect(resolveSlug('Avatar: El Camino del Agua')).toBe(slug)
  })

  // Prueba de rotura a propósito: si alguien borra la entrada de Verity de
  // MOVIE_SLUG_ALIASES, este test falla (MOVIE_SLUG_ALIASES['verity-la-sombra-del-engano']
  // pasa a ser undefined). Es la que el lead va a correr para confirmar que
  // protege el caso.
  it('[rotura] no se borra el alias de Verity', () => {
    expect(MOVIE_SLUG_ALIASES['verity-la-sombra-del-engano']).toBe('verity-la-sombra-de-un-engano')
  })
})
