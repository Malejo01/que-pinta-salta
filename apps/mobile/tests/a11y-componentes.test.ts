// 46-c (Ronda 46, calidad de la app, tanda 2): un caso por componente de que
// `BotonFavorito.tsx`/`BotonCompartir.tsx` usan `hitSlopPara` de
// `lib/accesibilidad.ts` (no un número suelto) y de que las superposiciones
// de `TarjetaEvento.tsx`/`Hero.tsx` usan `ESCALA_MAXIMA_COMPACTA` (no un
// número suelto de `maxFontSizeMultiplier`).
//
// Mismo patrón que `tests/hero.test.ts`/`tests/portada.test.ts`: no hay
// `@testing-library/react-native` en el repo, así que estos componentes (que
// importan React Native) no se pueden `import`ar acá — se leen como texto
// (`readFileSync`) para las comprobaciones estáticas.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const COMPONENTS_DIR = join(MOBILE_ROOT, 'components')

const SRC_BOTON_FAVORITO = readFileSync(join(COMPONENTS_DIR, 'BotonFavorito.tsx'), 'utf8')
const SRC_BOTON_COMPARTIR = readFileSync(join(COMPONENTS_DIR, 'BotonCompartir.tsx'), 'utf8')
const SRC_TARJETA_EVENTO = readFileSync(join(COMPONENTS_DIR, 'TarjetaEvento.tsx'), 'utf8')
const SRC_HERO = readFileSync(join(COMPONENTS_DIR, 'Hero.tsx'), 'utf8')

// ---------------------------------------------------------------------------
// BotonFavorito / BotonCompartir: hitSlopPara, no un número suelto.
// ---------------------------------------------------------------------------
describe('BotonFavorito.tsx / BotonCompartir.tsx: hitSlop viene de hitSlopPara (lib/accesibilidad.ts)', () => {
  it('BotonFavorito.tsx importa hitSlopPara de @/lib/accesibilidad', () => {
    expect(SRC_BOTON_FAVORITO).toMatch(/import\s*\{[^}]*\bhitSlopPara\b[^}]*\}\s*from\s*['"]@\/lib\/accesibilidad['"]/)
  })

  it('BotonFavorito.tsx: hitSlopPara se usa de verdad (no solo se importa) y el Pressable no lleva un hitSlop={<número>} suelto', () => {
    expect(SRC_BOTON_FAVORITO).toMatch(/hitSlopPara\(\s*tamanio\s*\)/)
    expect(SRC_BOTON_FAVORITO).toMatch(/hitSlop=\{/)
    expect(SRC_BOTON_FAVORITO).not.toMatch(/hitSlop=\{\s*-?\d+\s*\}/)
  })

  it('BotonCompartir.tsx importa hitSlopPara de @/lib/accesibilidad', () => {
    expect(SRC_BOTON_COMPARTIR).toMatch(/import\s*\{[^}]*\bhitSlopPara\b[^}]*\}\s*from\s*['"]@\/lib\/accesibilidad['"]/)
  })

  it('BotonCompartir.tsx: hitSlopPara se usa de verdad (no solo se importa) y el Pressable no lleva un hitSlop={<número>} suelto', () => {
    expect(SRC_BOTON_COMPARTIR).toMatch(/hitSlopPara\(\s*tamanio\s*\)/)
    expect(SRC_BOTON_COMPARTIR).toMatch(/hitSlop=\{/)
    expect(SRC_BOTON_COMPARTIR).not.toMatch(/hitSlop=\{\s*-?\d+\s*\}/)
  })

  it('los dos bajan el inset lateral a 3 cuando tamanio <= 32 (gap de 6 en TarjetaEvento.tsx, estilos.accionesArriba)', () => {
    expect(SRC_BOTON_FAVORITO).toMatch(/tamanio\s*<=\s*32[\s\S]{0,40}left:\s*3,?\s*right:\s*3/)
    expect(SRC_BOTON_COMPARTIR).toMatch(/tamanio\s*<=\s*32[\s\S]{0,40}left:\s*3,?\s*right:\s*3/)
  })
})

// ---------------------------------------------------------------------------
// TarjetaEvento / Hero: ESCALA_MAXIMA_COMPACTA, no un número suelto.
// ---------------------------------------------------------------------------
describe('TarjetaEvento.tsx: la superposición usa ESCALA_MAXIMA_COMPACTA (lib/accesibilidad.ts)', () => {
  it('importa ESCALA_MAXIMA_COMPACTA de @/lib/accesibilidad', () => {
    expect(SRC_TARJETA_EVENTO).toMatch(
      /import\s*\{[^}]*\bESCALA_MAXIMA_COMPACTA\b[^}]*\}\s*from\s*['"]@\/lib\/accesibilidad['"]/,
    )
  })

  it('badge, destacado, título, lugar, fecha, "más fechas" y precio llevan maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}', () => {
    const usos = SRC_TARJETA_EVENTO.match(/maxFontSizeMultiplier=\{ESCALA_MAXIMA_COMPACTA\}/g) ?? []
    expect(usos.length).toBeGreaterThanOrEqual(7)
  })

  it('no usa un número literal en maxFontSizeMultiplier', () => {
    expect(SRC_TARJETA_EVENTO).not.toMatch(/maxFontSizeMultiplier=\{\s*-?\d/)
  })
})

describe('Hero.tsx: la superposición de la diapositiva usa ESCALA_MAXIMA_COMPACTA (lib/accesibilidad.ts)', () => {
  it('importa ESCALA_MAXIMA_COMPACTA de @/lib/accesibilidad', () => {
    expect(SRC_HERO).toMatch(/import\s*\{[^}]*\bESCALA_MAXIMA_COMPACTA\b[^}]*\}\s*from\s*['"]@\/lib\/accesibilidad['"]/)
  })

  it('badge, título, datos (fecha y lugar), "Ver detalles" y precio llevan maxFontSizeMultiplier={ESCALA_MAXIMA_COMPACTA}', () => {
    const usos = SRC_HERO.match(/maxFontSizeMultiplier=\{ESCALA_MAXIMA_COMPACTA\}/g) ?? []
    expect(usos.length).toBeGreaterThanOrEqual(6)
  })

  it('no usa un número literal en maxFontSizeMultiplier', () => {
    expect(SRC_HERO).not.toMatch(/maxFontSizeMultiplier=\{\s*-?\d/)
  })

  // 49-f (QPS-246): la etiqueta ya no es un template literal fijo, sale de
  // `etiquetaDiapositiva` (lib/hero-accesible.ts) con el título del evento.
  // Lo que esa función produce en cada caso (con total 1, 2 y 5) se prueba
  // sobre la función pura en `hero-accesible.test.ts`; acá solo se confirma
  // que `Hero.tsx` la usa de verdad, con `evento.title` como primer
  // argumento — si esto quedara en `accessibilityLabel={etiquetaDiapositiva}`
  // sin invocar o con otro argumento, el `toMatch` fallaría.
  it('la diapositiva (DiapositivaHero) lleva accessibilityRole="button" y su etiqueta sale de etiquetaDiapositiva(evento.title, ...)', () => {
    expect(SRC_HERO).toMatch(/accessibilityRole="button"[\s\S]{0,160}accessibilityLabel=\{etiquetaDiapositiva\(\s*evento\.title/)
  })

  it('los puntos de paginación siguen con su propia etiqueta ("Ir al evento N")', () => {
    expect(SRC_HERO).toMatch(/accessibilityLabel=\{`Ir al evento \$\{i \+ 1\}`\}/)
  })
})
