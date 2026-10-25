// 46-d (Ronda 46, calidad de la app): comprobaciones puntuales sobre los
// atributos de accesibilidad que esta tarea agregó en `app/**`. No es un
// detector general — ese vive en `tests/accesibilidad-detector.test.ts`
// (archivo que esta tarea NO toca, igual que su línea de base en
// `tests/a11y/pendientes-pantallas.ts`, que quedó vacía). Acá se deja, con
// lectura estática del código fuente (mismo estilo que `tests/ficha.test.ts`
// y `tests/compartir-ficha.test.ts`: sin `@testing-library/react-native`,
// solo texto), la prueba puntual que pide el plan (ops/rondas/46-calidad-app/
// tareas/46-d-pantallas.md, sección "Tests"):
//   - los tres CTAs externos (la ficha, el flyer y la película/cines) tienen
//     accessibilityRole="link";
//   - los `Pressable` de `app/(tabs)/cuenta.tsx` tienen accessibilityRole.
//
// La lectura de la etiqueta de apertura cuenta llaves (no corta en el
// primer ">") para no romperse con un `onPress={() => algo()}`: mismo
// problema de fondo que resuelve `leerEtiquetaApertura` de
// `tests/accesibilidad-detector.test.ts`, reimplementado acá en chico (no se
// importa de ese archivo: es un `.test.ts` con `describe`/`it` de nivel de
// módulo, y traerlo como módulo volvería a correr sus tests dentro de este
// archivo).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))

function leer(...partes: string[]): string {
  return readFileSync(join(MOBILE_ROOT, ...partes), 'utf8')
}

/** La apertura de una etiqueta que empieza en `inicio` (el índice del "<"):
 * cuenta llaves, igual que `leerEtiquetaApertura` del detector real, así un
 * `onPress={() => algo()}` no corta la etiqueta en el ">" de la flecha. */
function leerAperturaDesde(content: string, inicio: number): string {
  let profundidad = 0
  for (let i = inicio; i < content.length; i++) {
    const c = content[i]
    if (c === '{') profundidad++
    else if (c === '}') profundidad--
    else if (c === '>' && profundidad <= 0) return content.slice(inicio, i + 1)
  }
  throw new Error(`no se encontró el cierre de la etiqueta que empieza en ${inicio}`)
}

/** Todas las aperturas de `<tag ...>`/`<tag ... />` de `content`, en el
 * orden en que aparecen (sin bajar al cuerpo: alcanza para contar
 * `Pressable` de nivel superior de un archivo sin anidados). */
function aperturasDe(content: string, tag: string): string[] {
  const resultados: string[] = []
  const re = new RegExp(`<${tag}\\b`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    const apertura = leerAperturaDesde(content, m.index)
    resultados.push(apertura)
    re.lastIndex = m.index + apertura.length
  }
  return resultados
}

/** La apertura del `<Pressable` más cercano, hacia atrás, a la ÚLTIMA
 * aparición de `aguja` en `content` (así un comentario de cabecera que
 * MENCIONA el mismo texto, más arriba en el archivo, no se confunde con el
 * `Pressable` real: `lastIndexOf` encuentra el código, no el comentario). */
function aperturaPressableQueContiene(content: string, aguja: string): string {
  const idx = content.lastIndexOf(aguja)
  if (idx === -1) throw new Error(`no se encontró "${aguja}" en el archivo`)
  const inicio = content.lastIndexOf('<Pressable', idx)
  if (inicio === -1) throw new Error(`no se encontró un <Pressable antes de "${aguja}"`)
  return leerAperturaDesde(content, inicio)
}

describe('CTAs externos: accessibilityRole="link" (ficha, flyer, película, cines)', () => {
  it('app/evento/[id].tsx: "Como llegar" (abre mapas) es link', () => {
    const content = leer('app', 'evento', '[id].tsx')
    expect(aperturaPressableQueContiene(content, 'onPress={comoLlegar}')).toMatch(/accessibilityRole="link"/)
  })

  it('app/evento/[id].tsx: "Comprar tickets" (abre la ticketera) es link', () => {
    const content = leer('app', 'evento', '[id].tsx')
    expect(aperturaPressableQueContiene(content, 'onPress={comprar}')).toMatch(/accessibilityRole="link"/)
  })

  it('app/flyer/[id].tsx: "Ver en Instagram" es link', () => {
    const content = leer('app', 'flyer', '[id].tsx')
    expect(aperturaPressableQueContiene(content, 'abrirPostDeInstagram(flyer.ig_post_url)')).toMatch(
      /accessibilityRole="link"/,
    )
  })

  // R67, 67-c: "Comprar Entradas" vive en `components/BloqueCine.tsx`, que usan
  // la ficha de la película y `TarjetaPelicula` (Cines y la portada): se
  // comprueba el botón ahí y que cada pantalla use ese componente.
  it('app/pelicula/[id].tsx: "Comprar Entradas" (por BloqueCine) es link', () => {
    expect(leer('app', 'pelicula', '[id].tsx')).toMatch(/<BloqueCine\b/)
    const content = leer('components', 'BloqueCine.tsx')
    expect(aperturaPressableQueContiene(content, 'Comprar Entradas')).toMatch(/accessibilityRole="link"/)
  })

  it('app/cines.tsx: "Comprar Entradas" (por TarjetaPelicula → BloqueCine) es link', () => {
    expect(leer('app', 'cines.tsx')).toMatch(/<TarjetaPelicula\b/)
    expect(leer('components', 'TarjetaPelicula.tsx')).toMatch(/<BloqueCine\b/)
    const content = leer('components', 'BloqueCine.tsx')
    expect(aperturaPressableQueContiene(content, 'Comprar Entradas')).toMatch(/accessibilityRole="link"/)
  })
})

describe('app/(tabs)/cuenta.tsx: todos los Pressable tienen accessibilityRole', () => {
  const content = leer('app', '(tabs)', 'cuenta.tsx')
  const aperturas = aperturasDe(content, 'Pressable')

  it('encuentra los 8 Pressable esperados (FilaAcceso, "Ver la bienvenida" x2, "Cerrar sesión", "Eliminar mi cuenta", "¿Olvidaste tu contraseña?", "Entrar", "Crear cuenta")', () => {
    expect(aperturas).toHaveLength(8)
  })

  it.each(aperturas.map((apertura, indice) => [indice, apertura] as const))('Pressable #%i tiene accessibilityRole', (_indice, apertura) => {
    expect(apertura).toMatch(/accessibilityRole=/)
  })

  it('"¿Olvidaste tu contraseña?" (abre /auth/recuperar en el navegador) es link, no button', () => {
    expect(aperturaPressableQueContiene(content, 'onPress={abrirRecuperarContrasenia}')).toMatch(/accessibilityRole="link"/)
  })

  it('"Entrar" y "Crear cuenta" llevan accessibilityState={{ busy: ... }} con accionEnCurso', () => {
    const aperturaEntrar = aperturaPressableQueContiene(content, 'onPress={entrar}')
    const aperturaCrear = aperturaPressableQueContiene(content, 'onPress={crearCuenta}')
    expect(aperturaEntrar).toMatch(/accessibilityState=\{\{\s*busy:\s*accionEnCurso/)
    expect(aperturaCrear).toMatch(/accessibilityState=\{\{\s*busy:\s*accionEnCurso/)
  })
})
