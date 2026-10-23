// Ronda 50, 50-e (QPS-239, etapa 2): `InsigniaDestacado` (components/
// InsigniaDestacado.tsx) es la ÚNICA copia de la insignia "★ Destacado" —
// antes vivía a mano dentro de `TarjetaEvento.tsx` (líneas 85-91 de esa
// ronda); ahora la montan la tarjeta, el Hero y la ficha. Mismo estilo de
// detector con fixtures en memoria que `tests/tarjeta-evento.test.ts`,
// `tests/hero.test.ts` y `tests/ficha.test.ts`: no hay
// `@testing-library/react-native` en el repo, así que esto no monta nada,
// solo lee el código fuente.
//
// No importa nada de otro `*.test.ts` (QPS-250): `quitarComentarios` es una
// copia local, mismo criterio que `tests/pestanas.test.ts`/`tests/ficha.test.ts`
// /`tests/accesibilidad-docstring-escala.test.ts`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const INSIGNIA_PATH = join(MOBILE_ROOT, 'components', 'InsigniaDestacado.tsx')
const TARJETA_PATH = join(MOBILE_ROOT, 'components', 'TarjetaEvento.tsx')
const HERO_PATH = join(MOBILE_ROOT, 'components', 'Hero.tsx')
const FICHA_PATH = join(MOBILE_ROOT, 'app', 'evento', '[id].tsx')

/** Comentarios de línea y de bloque vaciados, conservando el resto del
 * texto (mismo criterio que `quitarComentarios` de `tests/pestanas.test.ts`
 * y `tests/ficha.test.ts`: copia local, QPS-250). */
function quitarComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

function listarTsxYTs(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...listarTsxYTs(full))
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// 1) La ficha, el Hero y la tarjeta montan <InsigniaDestacado.
// ---------------------------------------------------------------------------
describe('la ficha, el Hero y la tarjeta montan <InsigniaDestacado', () => {
  it.each([
    ['components/TarjetaEvento.tsx', TARJETA_PATH],
    ['components/Hero.tsx', HERO_PATH],
    ["app/evento/[id].tsx", FICHA_PATH],
  ])('%s', (_label, ruta) => {
    const contenido = quitarComentarios(readFileSync(ruta, 'utf8'))
    expect(contenido).toMatch(/<InsigniaDestacado\b/)
  })

  it('los tres importan InsigniaDestacado de @/components/InsigniaDestacado', () => {
    for (const ruta of [TARJETA_PATH, HERO_PATH, FICHA_PATH]) {
      const contenido = readFileSync(ruta, 'utf8')
      expect(contenido).toMatch(
        /import\s*\{[^}]*\bInsigniaDestacado\b[^}]*\}\s*from\s*['"]@\/components\/InsigniaDestacado['"]/,
      )
    }
  })
})

// ---------------------------------------------------------------------------
// 2) Una sola copia: ningún otro archivo de app/ ni de components/ escribe
//    "★ Destacado" ni "Destacado" dentro de un <Text/<Texto.
// ---------------------------------------------------------------------------

/**
 * `true` si `content` (YA sin comentarios) tiene un `<Text` o `<Texto` cuyo
 * texto visible, inmediatamente después de la apertura (sin otro elemento
 * de por medio), es o incluye "Destacado" (con o sin "★" antes).
 *
 * LÍMITE CONOCIDO (no es un parser de JSX, mismo espíritu que
 * `tieneTextoVisible`/`soloHijoIcono` de `tests/accesibilidad-detector.test.ts`):
 * no sigue balanceando el cierre real del tag (se conforma con que no haya
 * otro "<" entre la apertura y la palabra), y no resuelve interpolaciones.
 * CÓMO SE EVADE: `<Text>{'Dest' + 'acado'}</Text>` o
 * `const texto = 'Destacado'; <Text>{texto}</Text>` — en los dos casos la
 * palabra "Destacado" no aparece como texto LITERAL pegado a la apertura del
 * tag, así que este detector no los ve. Tampoco ve un "Destacado" con otro
 * elemento (un ícono, otro Texto) interpuesto antes, dentro del mismo tag.
 */
export function escribeBadgeDestacado(contenidoSinComentarios: string): boolean {
  return /<Text(o)?\b[^<]*>[^<]*(★\s*)?Destacado/.test(contenidoSinComentarios)
}

describe('escribeBadgeDestacado (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta "★ Destacado" como texto de un <Text', () => {
    expect(escribeBadgeDestacado('<Text style={estilos.x}>★ Destacado</Text>')).toBe(true)
  })

  it('detecta "Destacado" (sin la estrella) como texto de un <Texto', () => {
    expect(escribeBadgeDestacado('<Texto>Destacado</Texto>')).toBe(true)
  })

  it('no confunde un <Text con otro texto cualquiera', () => {
    expect(escribeBadgeDestacado('<Text>Entrada Gratuita</Text>')).toBe(false)
  })

  it('no confunde un comentario que menciona "★ Destacado" (si se le pasa el contenido sin comentarios)', () => {
    const original = '// antes esto decía <Text>★ Destacado</Text>, ahora es InsigniaDestacado\n<Text>Hola</Text>'
    expect(escribeBadgeDestacado(quitarComentarios(original))).toBe(false)
  })

  it('LÍMITE CONOCIDO: no ve "Destacado" armado con una variable (evasión documentada)', () => {
    const fixture = "const texto = 'Destacado'\n<Text>{texto}</Text>"
    expect(escribeBadgeDestacado(fixture)).toBe(false)
  })

  it('LÍMITE CONOCIDO: no ve "Destacado" con un elemento interpuesto antes, dentro del mismo tag', () => {
    const fixture = '<Text><Icono nombre="Star" />Destacado</Text>'
    expect(escribeBadgeDestacado(fixture)).toBe(false)
  })
})

describe('app/ y components/: una sola copia de la insignia (InsigniaDestacado.tsx es la única con "★ Destacado"/"Destacado" en un Text/Texto)', () => {
  const archivos = [...listarTsxYTs(join(MOBILE_ROOT, 'app')), ...listarTsxYTs(join(MOBILE_ROOT, 'components'))]

  it('encuentra al menos un archivo para analizar', () => {
    expect(archivos.length).toBeGreaterThan(0)
  })

  it('InsigniaDestacado.tsx SÍ tiene la insignia (si esto da false, el detector de abajo no estaría probando nada)', () => {
    const contenido = quitarComentarios(readFileSync(INSIGNIA_PATH, 'utf8'))
    expect(escribeBadgeDestacado(contenido)).toBe(true)
  })

  it.each(archivos.map((file) => [relative(MOBILE_ROOT, file).replace(/\\/g, '/'), file] as const))(
    '%s',
    (label, file) => {
      if (label === 'components/InsigniaDestacado.tsx') return // la única copia legítima
      const contenido = quitarComentarios(readFileSync(file, 'utf8'))
      if (escribeBadgeDestacado(contenido)) {
        throw new Error(`${label}: escribe "★ Destacado"/"Destacado" en un <Text/<Texto (copia duplicada de la insignia)`)
      }
      expect(escribeBadgeDestacado(contenido)).toBe(false)
    },
  )
})

// ---------------------------------------------------------------------------
// 3) Nadie en apps/mobile/{app,components,lib} mira is_featured ni
//    featuredUntil/featured_until: la regla es de core
//    (`@qps/core/events/destacados`), la app solo lee isFeatured.
// ---------------------------------------------------------------------------

/** `true` si `content` (YA sin comentarios) menciona `is_featured`,
 * `featuredUntil` o `featured_until` como identificador (no dentro de un
 * import de un módulo de core, que SÍ puede nombrarlos en su propia ruta —
 * ver la excepción documentada de abajo para el único caso real). */
export function miraCamposFeaturedCrudos(contenidoSinComentarios: string): boolean {
  return (
    /\bis_featured\b/.test(contenidoSinComentarios) ||
    /\bfeaturedUntil\b/.test(contenidoSinComentarios) ||
    /\bfeatured_until\b/.test(contenidoSinComentarios)
  )
}

describe('miraCamposFeaturedCrudos (fixtures en memoria)', () => {
  it('detecta is_featured', () => {
    expect(miraCamposFeaturedCrudos('if (evento.is_featured) {}')).toBe(true)
  })

  it('detecta featuredUntil', () => {
    expect(miraCamposFeaturedCrudos('evento.featuredUntil')).toBe(true)
  })

  it('detecta featured_until', () => {
    expect(miraCamposFeaturedCrudos('evento.featured_until')).toBe(true)
  })

  it('no detecta nada en un archivo que solo lee isFeatured', () => {
    expect(miraCamposFeaturedCrudos('<InsigniaDestacado visible={evento.isFeatured} />')).toBe(false)
  })
})

/**
 * EXCEPCIÓN DOCUMENTADA (no silenciosa): `app/evento/[id].tsx` SÍ lee
 * `evento.featured_until` (ver esa línea, con su comentario). No es un
 * descuido de esta tarea: es un hallazgo de ella.
 *
 * `obtenerEventoPorId` (`lib/datos/eventos.ts`) NO pasa la fila por
 * `transformEvent` — devuelve `EventoDetalle` (`Event & { category, venue
 * }`), la fila cruda de `PUBLIC_EVENT_SELECT`. Esa fila no tiene
 * `isFeatured` (ese campo solo existe en `DisplayEvent`, el que arma
 * `transformEvent`): tiene la columna `featured_until` tal cual. El encargo
 * de 50-e decía "en la app no se comparan fechas: solo se lee
 * evento.isFeatured" dando por hecho que la ficha ya recibía el evento
 * transformado — no es así (ver el reporte de la tarea).
 *
 * Con `lib/datos/eventos.ts` fuera de los archivos permitidos de esta tarea,
 * la ficha llama directo a la MISMA regla que usa `transformEvent`
 * (`estaDestacado` de `@qps/core/events/destacados`) en vez de reimplementar
 * la comparación de fechas a mano. Si algún día `obtenerEventoPorId` empieza
 * a devolver `isFeatured` ya calculado, esta excepción (y la línea que la
 * motiva) se pueden sacar.
 */
const EXCEPCIONES_FEATURED_CRUDO: readonly string[] = ['app/evento/[id].tsx']

describe('apps/mobile/{app,components,lib}: nadie mira is_featured/featuredUntil/featured_until (salvo la excepción documentada arriba)', () => {
  const archivos = [
    ...listarTsxYTs(join(MOBILE_ROOT, 'app')),
    ...listarTsxYTs(join(MOBILE_ROOT, 'components')),
    ...listarTsxYTs(join(MOBILE_ROOT, 'lib')),
  ]

  it('encuentra al menos un archivo para analizar', () => {
    expect(archivos.length).toBeGreaterThan(0)
  })

  it.each(archivos.map((file) => [relative(MOBILE_ROOT, file).replace(/\\/g, '/'), file] as const))(
    '%s',
    (label, file) => {
      const contenido = quitarComentarios(readFileSync(file, 'utf8'))
      const encontrado = miraCamposFeaturedCrudos(contenido)
      const esExcepcion = EXCEPCIONES_FEATURED_CRUDO.includes(label)
      if (esExcepcion) {
        // La excepción tiene que seguir siendo cierta: si algún día deja de
        // mirar el campo crudo, hay que sacarla de la lista (si no, este
        // `expect` cae, explícito).
        expect(encontrado).toBe(true)
        return
      }
      if (encontrado) {
        throw new Error(`${label}: mira is_featured/featuredUntil/featured_until crudo (la regla es de core, hay que leer isFeatured)`)
      }
      expect(encontrado).toBe(false)
    },
  )
})

// ---------------------------------------------------------------------------
// 4) InsigniaDestacado.tsx: ESCALA_MAXIMA_COMPACTA y accessibilityLabel.
// ---------------------------------------------------------------------------
describe('components/InsigniaDestacado.tsx', () => {
  const contenido = readFileSync(INSIGNIA_PATH, 'utf8')

  it('importa ESCALA_MAXIMA_COMPACTA de @/lib/accesibilidad y la usa en maxFontSizeMultiplier', () => {
    expect(contenido).toMatch(/import\s*\{[^}]*\bESCALA_MAXIMA_COMPACTA\b[^}]*\}\s*from\s*['"]@\/lib\/accesibilidad['"]/)
    expect(contenido).toMatch(/maxFontSizeMultiplier=\{\s*ESCALA_MAXIMA_COMPACTA\s*\}/)
  })

  it('no usa un número literal en maxFontSizeMultiplier', () => {
    expect(contenido).not.toMatch(/maxFontSizeMultiplier=\{\s*-?\d/)
  })

  it('tiene accessibilityLabel', () => {
    expect(contenido).toMatch(/accessibilityLabel\s*=/)
  })

  it('recibe "visible" (boolean) y devuelve null si es false', () => {
    expect(contenido).toMatch(/visible\s*:\s*boolean/)
    expect(contenido).toMatch(/if\s*\(\s*!visible\s*\)\s*return\s*null/)
  })

  it('numberOfLines={1} (caja de alto fijo, no se puede tapar con un texto más grande)', () => {
    expect(contenido).toMatch(/numberOfLines=\{1\}/)
  })
})
