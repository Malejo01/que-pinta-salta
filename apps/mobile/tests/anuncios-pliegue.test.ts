/**
 * R60, 52-q (QA): regla (a) de Mauro del 19/10, la parte que no cubre
 * `tests/anuncios-lugares.test.ts` (52-d).
 *
 * `anuncios-lugares.test.ts` ya prueba, de forma barredora, que
 * `BannerAnuncio` se importa SOLO en `app/(tabs)/index.tsx` y `app/(tabs)/
 * buscar.tsx` (nunca en la ficha, Cuenta, el Radar, etc.) — esa parte NO se
 * duplica acá.
 *
 * Lo que falta y es de este archivo: que en `app/(tabs)/index.tsx`, la
 * sección del anuncio (el render de `tipo: 'anuncio'`, dentro del
 * `secciones.map(...)`) nunca quede ANTES de `<Hero` ni de `<PillsAtajos`
 * — "ningún anuncio arriba del pliegue, y en la app nunca en el Hero de
 * Inicio". `tests/portada.test.ts` (52-d) ya prueba la posición de
 * "anuncio" DENTRO de `seccionesPortada` (después de la 4.ª fila de
 * categorías); lo que prueba este archivo es la posición de ese render
 * respecto al Hero y los atajos, que es un chequeo distinto: aunque
 * `seccionesPortada` esté bien, si el JSX dibujara `{secciones.map(...)}`
 * ANTES de `<Hero` y `<PillsAtajos`, el anuncio terminaría arriba del
 * pliegue sin que ese otro test se entere.
 *
 * El banner en Buscar (`app/(tabs)/buscar.tsx`) va en `ListFooterComponent`
 * de las dos `FlatList` (nunca en `ListHeaderComponent`, que sí estaría
 * arriba del pliegue): eso ya lo prueba `tests/buscar.test.ts` (52-d, el
 * describe "BannerAnuncio: ListFooterComponent de las dos FlatList, nunca
 * ListHeaderComponent"). No se repite acá.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const RUTA_INDEX = fileURLToPath(new URL('../app/(tabs)/index.tsx', import.meta.url))
const SRC_INDEX = readFileSync(RUTA_INDEX, 'utf8')

/**
 * `true` si, en `content`, aparecen un `<Hero` y un `<PillsAtajos` y los dos
 * van ANTES de `secciones.map(` — las tres cosas tienen que existir. `false`
 * si falta alguna, o si el mapa (donde va el anuncio) queda antes de alguno.
 * R67, 67-b: las pills pasaron a la cabecera fija, arriba del Hero, así que
 * el orden entre Hero y pills ya no se exige; lo que importa es el mapa.
 * Puro, con fixtures abajo.
 */
function heroYPillsAntesDelMapaDeSecciones(content: string): boolean {
  const idxHero = content.indexOf('<Hero')
  const idxPills = content.indexOf('<PillsAtajos')
  const idxMapa = content.indexOf('secciones.map(')
  if (idxHero === -1 || idxPills === -1 || idxMapa === -1) return false
  return idxHero < idxMapa && idxPills < idxMapa
}

describe('heroYPillsAntesDelMapaDeSecciones (fixtures en memoria: tiene que poder dar positivo y negativo)', () => {
  it('caso sano: Hero, después PillsAtajos, después el mapa de secciones', () => {
    const content = ['<Hero eventos={x} />', '<PillsAtajos atajo={a} onCambiar={b} />', '{secciones.map((s) => null)}'].join(
      '\n',
    )
    expect(heroYPillsAntesDelMapaDeSecciones(content)).toBe(true)
  })

  it('roto: el mapa de secciones (donde va el anuncio) antes que Hero', () => {
    const content = ['{secciones.map((s) => null)}', '<Hero eventos={x} />', '<PillsAtajos atajo={a} onCambiar={b} />'].join(
      '\n',
    )
    expect(heroYPillsAntesDelMapaDeSecciones(content)).toBe(false)
  })

  it('roto: el mapa de secciones antes que PillsAtajos (aunque Hero esté primero)', () => {
    const content = ['<Hero eventos={x} />', '{secciones.map((s) => null)}', '<PillsAtajos atajo={a} onCambiar={b} />'].join(
      '\n',
    )
    expect(heroYPillsAntesDelMapaDeSecciones(content)).toBe(false)
  })

  it('sano (R67, 67-b): PillsAtajos antes que Hero, los dos antes del mapa', () => {
    const content = ['<PillsAtajos atajo={a} onCambiar={b} />', '<Hero eventos={x} />', '{secciones.map((s) => null)}'].join(
      '\n',
    )
    expect(heroYPillsAntesDelMapaDeSecciones(content)).toBe(true)
  })

  it('falta uno de los tres: false (no asume nada por descarte)', () => {
    const sinPills = ['<Hero eventos={x} />', '{secciones.map((s) => null)}'].join('\n')
    expect(heroYPillsAntesDelMapaDeSecciones(sinPills)).toBe(false)
  })
})

describe('app/(tabs)/index.tsx: el Hero y los atajos van antes del mapa de secciones (donde vive el anuncio)', () => {
  it('Hero, después PillsAtajos, después secciones.map( — el anuncio nunca puede quedar arriba del pliegue', () => {
    expect(heroYPillsAntesDelMapaDeSecciones(SRC_INDEX)).toBe(true)
  })

  // Contraprueba de que el detector mira el archivo real (no un string
  // vacío): los tres literales existen de verdad en index.tsx.
  it('sanity: los tres literales aparecen de verdad en el archivo', () => {
    expect(SRC_INDEX).toContain('<Hero')
    expect(SRC_INDEX).toContain('<PillsAtajos')
    expect(SRC_INDEX).toContain('secciones.map(')
  })
})
