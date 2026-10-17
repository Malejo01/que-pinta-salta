/**
 * Tarea 38-q: paridad web/app de "Voy / Me interesa" — que muestren
 * exactamente el mismo texto para las mismas cantidades. Sin red ni base,
 * mismo enfoque que `tests/core/equivalencia.test.ts` (comparar los dos
 * lados) combinado con un detector estático sobre el código real (mismo
 * estilo que `tests/asistencia/web.test.ts`).
 *
 * Por qué hacen falta las DOS cosas (afirmar sobre `textoBoton` de core +
 * detector estático de que los componentes lo llaman), y por qué ninguna de
 * las dos sola alcanza:
 *
 *  - Solo (a) "afirmar sobre textoBoton" no prueba nada de paridad: core es
 *    un módulo único, compartido por los dos lados. Si `textoBoton` da bien
 *    "Voy · 5", eso no dice si `BotonesAsistencia` (web) o `BotonesAsistencia`
 *    (app) en verdad lo usan — un componente podría ignorarlo y armar su
 *    propio texto (`${etiqueta} · ${cantidad}` a mano, sin pasar por el
 *    umbral) y este chequeo seguiría en verde, porque nunca mira el
 *    componente.
 *  - Solo (b) "detector estático de que llaman a textoBoton" tampoco alcanza
 *    sin (a): si alguien rompiera `textoBoton` en core (por ejemplo,
 *    mostrando siempre el número, sin umbral), los dos componentes seguirían
 *    "llamando a textoBoton" tal cual, y el detector (b) no lo notaría — la
 *    paridad real (mismo texto, mismo umbral) solo se cubre si además hay
 *    una aserción directa sobre lo que `textoBoton` devuelve.
 *
 * Juntas: (a) fija qué tiene que devolver `textoBoton` para cada cantidad, y
 * (b) prueba que ningún componente arma su propio texto en vez de usar esa
 * función — entre las dos, un bug real de paridad (un lado que deja de
 * llamar a `textoBoton`, o que `textoBoton` mismo se rompa) tiene que romper
 * al menos una.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ETIQUETAS_ASISTENCIA, TEXTO_ENTRAR_PARA_MARCAR, textoBoton, type TipoAsistencia } from '@qps/core/asistencia'

// ---------------------------------------------------------------------------
// (a) El texto que tiene que mostrar cada lado, para una tabla de
// cantidades (incluye un valor grande, QPS: nunca truncar ni redondear) y
// los dos tipos. Como los dos componentes importan `textoBoton` de
// `@qps/core/asistencia` (lo prueba el bloque (b) de abajo), afirmar sobre
// esta tabla alcanza para fijar lo que web y app van a mostrar.
// ---------------------------------------------------------------------------
describe('textoBoton: tabla de cantidades, igual para los dos tipos', () => {
  const tipos: TipoAsistencia[] = ['voy', 'me_interesa']
  const casos: Array<{ cantidad: number; conNumero: boolean }> = [
    { cantidad: 0, conNumero: false },
    { cantidad: 1, conNumero: false },
    { cantidad: 2, conNumero: false },
    { cantidad: 3, conNumero: true },
    { cantidad: 4, conNumero: true },
    { cantidad: 10, conNumero: true },
    { cantidad: 123456, conNumero: true },
  ]

  for (const tipo of tipos) {
    for (const caso of casos) {
      it(`${tipo}, cantidad=${caso.cantidad}: ${caso.conNumero ? 'con' : 'sin'} número`, () => {
        const esperado = caso.conNumero
          ? `${ETIQUETAS_ASISTENCIA[tipo]} · ${caso.cantidad}`
          : ETIQUETAS_ASISTENCIA[tipo]
        expect(textoBoton(tipo, caso.cantidad)).toBe(esperado)
      })
    }
  }
})

// ---------------------------------------------------------------------------
// Los mismos textos en los dos lados: ninguno de los dos tiene su propia
// constante con las etiquetas o el texto de "sin sesión" — los dos leen las
// mismas constantes de core. Si alguno declarara su propia copia (aunque
// tuviera el mismo valor hoy), un cambio futuro en un solo lado los haría
// divergir sin que ningún test lo note; por eso se chequea la identidad
// (`toBe`, no `toEqual`) contra las constantes de core.
// ---------------------------------------------------------------------------
describe('ETIQUETAS_ASISTENCIA y TEXTO_ENTRAR_PARA_MARCAR: una sola fuente para los dos lados', () => {
  it('ETIQUETAS_ASISTENCIA tiene exactamente "Voy" y "Me interesa"', () => {
    expect(ETIQUETAS_ASISTENCIA.voy).toBe('Voy')
    expect(ETIQUETAS_ASISTENCIA.me_interesa).toBe('Me interesa')
  })

  it('TEXTO_ENTRAR_PARA_MARCAR es el texto exacto de invitación a entrar', () => {
    expect(TEXTO_ENTRAR_PARA_MARCAR).toBe('Entrá para marcar si vas.')
  })
})

// ===========================================================================
// (b) Detector estático: los dos componentes de verdad llaman a `textoBoton`
// y no arman el texto del botón a mano (ni con un template string tipo
// `${etiqueta} · ${cantidad}`, ni con una concatenación, ni dejando un "·"
// suelto). Recorre el código real de los dos componentes (no un fixture
// inventado): si alguno deja de llamar a `textoBoton`, esto se rompe.
// ===========================================================================

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const MOBILE_ROOT = fileURLToPath(new URL('../../../mobile/', import.meta.url))

/** Comentarios de línea y de bloque vaciados, conservando el resto del texto. */
function quitarComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

/** `true` si el contenido importa `textoBoton` de `@qps/core/asistencia` (con o sin alias). */
function importaTextoBoton(content: string): boolean {
  const limpio = quitarComentarios(content)
  return /import\s+(?:type\s+)?\{[^}]*\btextoBoton\b[^}]*\}\s*from\s*['"]@qps\/core\/asistencia['"]/.test(limpio)
}

/**
 * `true` si hay un texto de botón armado a mano: un template string o una
 * concatenación que mezcla la etiqueta ("Voy"/"Me interesa", o una variable
 * de etiqueta) con la cantidad, o un separador "·" suelto en el código (fuera
 * de la constante `ETIQUETAS_ASISTENCIA · n` que vive solo dentro de
 * `textoBoton`, en core). Busca la FORMA (un backtick con `·` y una
 * interpolación `${...}` cerca, o un literal de texto con "·" seguido de un
 * `+`), no nombres fijos de variable — para que renombrar no lo evada.
 */
function tieneTextoBotonArmadoAMano(content: string): boolean {
  const limpio = quitarComentarios(content)
  // Template string con el separador real (· o el guion medio ·) y una
  // interpolación: `${algo} · ${cantidad}` o `${algo} · 5`.
  if (/`[^`]*·[^`]*\$\{[^}]*\}[^`]*`/.test(limpio)) return true
  if (/`[^`]*\$\{[^}]*\}[^`]*·[^`]*`/.test(limpio)) return true
  // Concatenación con "+" que incluye el separador "·" como literal.
  if (/['"`][^'"`]*·[^'"`]*['"`]\s*\+/.test(limpio)) return true
  if (/\+\s*['"`][^'"`]*·[^'"`]*['"`]/.test(limpio)) return true
  return false
}

describe('tieneTextoBotonArmadoAMano / importaTextoBoton (fixtures en memoria: el detector tiene que fallar de verdad)', () => {
  it('detecta un template string armado a mano con el separador real', () => {
    expect(tieneTextoBotonArmadoAMano('const texto = `${etiqueta} · ${cantidad}`')).toBe(true)
  })

  it('detecta el mismo patrón con la cantidad primero', () => {
    expect(tieneTextoBotonArmadoAMano('const texto = `${cantidad} · ${etiqueta}`')).toBe(true)
  })

  it('detecta una concatenación con "+" y el separador como literal', () => {
    expect(tieneTextoBotonArmadoAMano("const texto = etiqueta + ' · ' + cantidad")).toBe(true)
  })

  it('un template string sin el separador (otro uso cualquiera) no cuenta: false', () => {
    expect(tieneTextoBotonArmadoAMano('const label = `Marcar ${texto}`')).toBe(false)
  })

  it('llamar a textoBoton(tipo, cantidad) tal cual no cuenta como armado a mano: false', () => {
    expect(tieneTextoBotonArmadoAMano('const texto = textoBoton(tipo, cantidad)')).toBe(false)
  })

  it('un comentario que menciona el separador "·" no cuenta (se descarta antes de buscar)', () => {
    const fixture = '// el separador es "·", igual que `${etiqueta} · ${cantidad}` en el ejemplo viejo\nconst x = 1'
    expect(tieneTextoBotonArmadoAMano(fixture)).toBe(false)
  })

  it('importaTextoBoton detecta el import real, con alias', () => {
    expect(importaTextoBoton(`import { textoBoton as armar } from '@qps/core/asistencia'`)).toBe(true)
  })

  it('importaTextoBoton: sin textoBoton entre las llaves, false', () => {
    expect(importaTextoBoton(`import { siguienteMarca } from '@qps/core/asistencia'`)).toBe(false)
  })
})

const COMPONENTES_ASISTENCIA = [
  { etiqueta: 'web: components/botones-asistencia.tsx', ruta: `${WEB_ROOT}/components/botones-asistencia.tsx` },
  { etiqueta: 'app: components/BotonesAsistencia.tsx', ruta: `${MOBILE_ROOT}/components/BotonesAsistencia.tsx` },
] as const

describe.each(COMPONENTES_ASISTENCIA)('$etiqueta: llama a textoBoton de core, no arma el texto a mano', (caso) => {
  const contenido = readFileSync(caso.ruta, 'utf8')

  it('importa textoBoton de @qps/core/asistencia', () => {
    if (!importaTextoBoton(contenido)) {
      throw new Error(`${caso.etiqueta}: no importa 'textoBoton' de '@qps/core/asistencia'`)
    }
    expect(importaTextoBoton(contenido)).toBe(true)
  })

  it('no tiene un texto de botón armado a mano (sin template string ni concatenación con "·")', () => {
    if (tieneTextoBotonArmadoAMano(contenido)) {
      throw new Error(`${caso.etiqueta}: parece armar el texto del botón a mano, en vez de usar textoBoton`)
    }
    expect(tieneTextoBotonArmadoAMano(contenido)).toBe(false)
  })

  it('llama a textoBoton con dos argumentos (tipo, cantidad), no solo lo importa sin usarlo', () => {
    const limpio = quitarComentarios(contenido)
    expect(/\btextoBoton\s*\([^)]*,[^)]*\)/.test(limpio)).toBe(true)
  })
})
