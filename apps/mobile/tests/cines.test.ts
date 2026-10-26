// R29, 29-k (ops/paridad-web-app.md §3.8 e inventario, "Cines"): paridad de
// `app/cines.tsx` con `CinesView`/`MovieCard` de la web. Dos partes:
//
// 1. El buscador (`filtrarPeliculasPorTitulo`, que exporta `app/cines.tsx`):
//    por lectura estática, NO importando la pantalla en runtime. El resto de
//    `tests/*.test.ts` que cubre una pantalla (`tests/buscar.test.ts`,
//    `tests/estado-carga-detector.test.ts`) hace lo mismo: `vitest.config.ts`
//    corre en `environment: 'node'`, sin el runner de React Native, así que
//    importar un archivo de `app/` que a su vez importa `react-native` o
//    `expo-router` rompe el módulo. Acá se reimplementa la MISMA función
//    (fixture local, probada con casos) y, aparte, un detector estático
//    confirma que `app/cines.tsx` usa exactamente esa implementación — ver
//    el comentario de `buscar.test.ts` ("Vitest no lo puede parsear fuera de
//    un entorno RN").
// 2. Lectura estática: "Comprar Entradas", el badge "N Cines" y el buscador,
//    con el texto literal de la web, en `app/cines.tsx` y `app/pelicula/[id].tsx`.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

interface PeliculaFixture {
  id: string
  title: string
}

/**
 * Fixture local: la MISMA lógica que `filtrarPeliculasPorTitulo` de
 * `app/cines.tsx` (y que `CinesView` de la web:
 * `movie.title.toLowerCase().includes(searchQuery.toLowerCase())`). No se
 * importa la real (ver el comentario de arriba); el bloque "lectura
 * estática" de más abajo confirma que el archivo real usa este mismo filtro.
 */
function filtrarPeliculasPorTituloFixture<T extends PeliculaFixture>(peliculas: T[], busqueda: string): T[] {
  if (!busqueda) return peliculas
  const query = busqueda.toLowerCase()
  return peliculas.filter((pelicula) => pelicula.title.toLowerCase().includes(query))
}

function pelicula(overrides: Partial<PeliculaFixture> & { id: string }): PeliculaFixture {
  return { title: 'Película de prueba', ...overrides }
}

// ---------------------------------------------------------------------------
// filtrarPeliculasPorTitulo: mismo criterio que CinesView de la web.
// ---------------------------------------------------------------------------
describe('filtrarPeliculasPorTitulo (igual que CinesView, apps/web/components/cines-view.tsx)', () => {
  const endgame = pelicula({ id: 'endgame', title: 'Avengers: Endgame' })
  const cars = pelicula({ id: 'cars', title: 'Cars' })
  const corazon = pelicula({ id: 'corazon', title: 'El Corazón de la Bestia' })
  const todas = [endgame, cars, corazon]

  it('sin búsqueda: todas, en el mismo orden', () => {
    expect(filtrarPeliculasPorTituloFixture(todas, '')).toEqual(todas)
  })

  it('por una parte del título (substring, no solo "empieza con")', () => {
    expect(filtrarPeliculasPorTituloFixture(todas, 'veng').map((p) => p.id)).toEqual(['endgame'])
  })

  it('sin distinguir mayúsculas/minúsculas', () => {
    expect(filtrarPeliculasPorTituloFixture(todas, 'CARS').map((p) => p.id)).toEqual(['cars'])
    expect(filtrarPeliculasPorTituloFixture(todas, 'avengers').map((p) => p.id)).toEqual(['endgame'])
  })

  it('sin coincidencias: []', () => {
    expect(filtrarPeliculasPorTituloFixture(todas, 'xilófono')).toEqual([])
  })

  it(
    'NO normaliza acentos (igual que la web: "corazon" sin tilde no encuentra "Corazón" con tilde, ' +
      'porque CinesView tampoco lo hace — solo toLowerCase())',
    () => {
      expect(filtrarPeliculasPorTituloFixture(todas, 'corazon')).toEqual([])
      expect(filtrarPeliculasPorTituloFixture(todas, 'corazón').map((p) => p.id)).toEqual(['corazon'])
    }
  )

  it('lista vacía: []', () => {
    expect(filtrarPeliculasPorTituloFixture([], 'algo')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Lectura estática: los textos literales de la web y que la pantalla real
// usa exactamente el filtro de arriba (sin acentos, case-insensitive).
// ---------------------------------------------------------------------------
const RUTA_CINES = fileURLToPath(new URL('../app/cines.tsx', import.meta.url))
const SRC_CINES = readFileSync(RUTA_CINES, 'utf8')

const RUTA_PELICULA = fileURLToPath(new URL('../app/pelicula/[id].tsx', import.meta.url))
const SRC_PELICULA = readFileSync(RUTA_PELICULA, 'utf8')

const SRC_BLOQUE = readFileSync(fileURLToPath(new URL('../components/BloqueCine.tsx', import.meta.url)), 'utf8')
const SRC_TARJETA = readFileSync(fileURLToPath(new URL('../components/TarjetaPelicula.tsx', import.meta.url)), 'utf8')

describe('app/cines.tsx: lectura estática', () => {
  it('exporta filtrarPeliculasPorTitulo', () => {
    expect(SRC_CINES).toMatch(/export function filtrarPeliculasPorTitulo/)
  })

  it('el filtro es toLowerCase().includes(...), sin normalize/acentos (igual que CinesView de la web)', () => {
    expect(SRC_CINES).toMatch(/pelicula\.title\.toLowerCase\(\)\.includes\(query\)/)
    expect(SRC_CINES).not.toMatch(/\.normalize\(/)
  })

  it('el placeholder del buscador es el texto literal de la web ("Buscar película por nombre...")', () => {
    expect(SRC_CINES).toMatch(/placeholder="Buscar película por nombre\.\.\."/)
  })

  // R67, 67-c: la tarjeta y el acordeón viven en `components/`; estas tres
  // comprobaciones leen ahí.
  it('"Comprar Entradas" es el texto literal de la web (con mayúsculas, no "Comprar entradas")', () => {
    expect(SRC_BLOQUE).toMatch(/Comprar Entradas/)
    expect(SRC_BLOQUE).not.toMatch(/Comprar entradas/)
  })

  it('el badge usa singular "Cine" / plural "Cines", como MovieCard', () => {
    expect(SRC_CINES).toMatch(/<TarjetaPelicula\b/)
    expect(SRC_TARJETA).toMatch(/cantidad === 1 \? 'Cine' : 'Cines'/)
  })

  it('usa cantidadDeSalas y funcionesPorCine de lib/datos/cines (no cuentas propias)', () => {
    expect(SRC_TARJETA).toMatch(/import\s*\{[^}]*\bcantidadDeSalas\b[^}]*\}\s*from\s*['"]@\/lib\/datos\/cines['"]/)
    expect(SRC_TARJETA).toMatch(/import\s*\{[^}]*\bfuncionesPorCine\b[^}]*\}\s*from\s*['"]@\/lib\/datos\/cines['"]/)
  })

  it('usa Texto e Icono (no Text/lucide directo) para el título y el buscador', () => {
    expect(SRC_CINES).toMatch(/import\s*\{\s*Texto\s*\}\s*from\s*['"]@\/components\/Texto['"]/)
    expect(SRC_CINES).toMatch(/import\s*\{\s*Icono\s*\}\s*from\s*['"]@\/components\/Icono['"]/)
  })

  it('no navega a /pelicula/ desde la tarjeta de la lista (ver tests/cines-navegacion.test.ts)', () => {
    expect(SRC_CINES).not.toMatch(/router\.push\(\s*[`'"][^`'"]*\/pelicula\//)
  })
})

describe('app/pelicula/[id].tsx: mismo armado que la tarjeta abierta (lectura estática)', () => {
  // R67, 67-c: el botón es de `components/BloqueCine.tsx`, que esta ficha usa.
  it('"Comprar Entradas" es el texto literal de la web', () => {
    expect(SRC_PELICULA).toMatch(/<BloqueCine\b/)
    expect(SRC_BLOQUE).toMatch(/Comprar Entradas/)
  })

  it('usa el mismo helper urlCompraCineSegura para el booking_url (ver tests/aperturas-url.test.ts)', () => {
    expect(SRC_BLOQUE).toMatch(/urlCompraCineSegura/)
  })

  it('usa Texto e Icono (Ticket) para "Comprar Entradas"', () => {
    expect(SRC_PELICULA).toMatch(/import\s*\{\s*Texto\s*\}\s*from\s*['"]@\/components\/Texto['"]/)
    expect(SRC_BLOQUE).toMatch(/import\s*\{\s*Texto\s*\}\s*from\s*['"]@\/components\/Texto['"]/)
    expect(SRC_BLOQUE).toMatch(/nombre="Ticket"/)
  })
})
