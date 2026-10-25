// 28-q, punto 12 (F3, 28-g) → reescrito en R29, 29-k (ops/paridad-web-app.md
// §3.8): la versión de la R28 navegaba de `app/cines.tsx` a
// `/pelicula/<id>` al tocar la tarjeta. La especificación de la R29 pide que
// la tarjeta de la lista sea autosuficiente, como `MovieCard` de la web (el
// acordeón vive adentro, sin una página aparte): `app/cines.tsx` ya no tiene
// ningún `router.push` hacia `/pelicula/`, y la ruta queda para quien SÍ la
// necesita — Favoritos (`app/(tabs)/favoritos.tsx`) y la fila de cine de la
// portada (`components/FilaCategoria.tsx`), ninguno de los dos en los
// archivos permitidos de esta tarea.
//
// Mismo estilo de detector con fixtures en memoria que el resto de
// `tests/*.test.ts`.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** `true` si `content` tiene algún `router.push`/`router.replace` hacia una
 * ruta `/pelicula/...`. */
export function navegaAPelicula(content: string): boolean {
  return /router\.(?:push|replace)\(\s*[`'"][^`'"]*\/pelicula\//.test(content)
}

describe('navegaAPelicula (fixtures)', () => {
  it('detecta router.push(`/pelicula/${id}`)', () => {
    expect(navegaAPelicula('router.push(`/pelicula/${item.id}`)')).toBe(true)
  })

  it('un router.push a otra ruta (no /pelicula/): false', () => {
    expect(navegaAPelicula('router.push(`/evento/${item.id}`)')).toBe(false)
  })

  it('sin ningún router.push: false', () => {
    expect(navegaAPelicula('function f() { return null }')).toBe(false)
  })
})

describe('app/cines.tsx: la tarjeta de la lista ya no navega a /pelicula/ (R29, 29-k)', () => {
  const RUTA = fileURLToPath(new URL('../app/cines.tsx', import.meta.url))
  const src = readFileSync(RUTA, 'utf8')

  it('no tiene ningún router.push/replace hacia /pelicula/: el acordeón vive dentro de la propia tarjeta', () => {
    expect(navegaAPelicula(src)).toBe(false)
  })

  // R67, 67-c: la tarjeta y el acordeón pasaron a `components/`.
  const tarjeta = readFileSync(fileURLToPath(new URL('../components/TarjetaPelicula.tsx', import.meta.url)), 'utf8')
  const bloque = readFileSync(fileURLToPath(new URL('../components/BloqueCine.tsx', import.meta.url)), 'utf8')

  it('cada película de la lista es una tarjeta con el afiche a sangre y el badge "N Cines"', () => {
    expect(src).toMatch(/<TarjetaPelicula\b/)
    expect(tarjeta).toMatch(/<Afiche\b/)
    expect(tarjeta).toMatch(/\{cantidad\}\s*\{cantidad === 1 \? 'Cine' : 'Cines'\}/)
  })

  it('el acordeón por cine (BloqueCine) toggle con un estado local, no con router', () => {
    expect(bloque).toMatch(/export function BloqueCine/)
    expect(bloque).toMatch(/onToggle/)
    expect(tarjeta).toMatch(/useState<string \| null>\(null\)/)
    expect(navegaAPelicula(tarjeta + bloque)).toBe(false)
  })
})

describe('app/pelicula/[id].tsx: sigue existiendo para Favoritos y la fila de cine de la portada', () => {
  const RUTA = fileURLToPath(new URL('../app/pelicula/[id].tsx', import.meta.url))
  const src = readFileSync(RUTA, 'utf8')

  it('usa obtenerPeliculaPorId (la consulta por id)', () => {
    expect(src).toMatch(/obtenerPeliculaPorId/)
  })

  it('tiene el mismo acordeón por cine (BloqueCine) que app/cines.tsx', () => {
    expect(src).toMatch(/import \{ BloqueCine \} from '@\/components\/BloqueCine'/)
    expect(src).toMatch(/<BloqueCine\b/)
  })
})
