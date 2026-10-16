import { describe, expect, it } from 'vitest'
import { normalizeMovieTitle } from '@/lib/scraper/cinema-scraper'

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

// QPS-141: casos reales del diagnóstico (ops/qps-141/diagnostico.md), hoy
// dan slugs distintos porque normalizeMovieTitle solo compara igualdad
// exacta del slug. 31-b va a hacer que algunos de estos se junten (alias a
// mano y/o respaldo difuso entre cadenas, según decida Mauro). Cuando eso
// pase, 31-b debería solo cambiar la expectativa de "son distintos" a "son
// iguales" (o a lo que decida para cada caso) en este describe, sin tocar
// el resto del archivo.
describe('normalizeMovieTitle — QPS-141: hoy quedan separados, 31-b los junta', () => {
  it('Verity (Ópera) y Verity (Cinemark) dan slugs distintos hoy', () => {
    const opera = normalizeMovieTitle('Verity la Sombra del Engaño')
    const cinemark = normalizeMovieTitle('Verity: la Sombra de un Engaño')
    expect(opera).toBe('verity-la-sombra-del-engano')
    expect(cinemark).toBe('verity-la-sombra-de-un-engano')
    // Hoy son distintos. 31-b decide si se juntan (ver diagnóstico: Jaccard
    // de tokens da 1,0 sacando palabras vacías) y, si es así, este `expect`
    // pasa a `.toBe(true)`.
    expect(opera).not.toBe(cinemark)
  })

  it('Cars (Ópera) y Cars 20° Aniversario (Cinemark) dan slugs distintos hoy', () => {
    const opera = normalizeMovieTitle('Cars')
    const cinemark = normalizeMovieTitle('Cars 20° Aniversario')
    expect(opera).toBe('cars')
    expect(cinemark).toBe('cars-20-aniversario')
    // Hoy son distintos. El diagnóstico marca este caso como "puede ser a
    // propósito" (es un reestreno) y lo deja a decisión de Mauro: si 31-b
    // los junta, este `expect` pasa a `.toBe(true)`; si Mauro decide que
    // quedan separados, este test queda igual y no hay que tocarlo.
    expect(opera).not.toBe(cinemark)
  })
})
