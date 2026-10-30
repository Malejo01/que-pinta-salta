/**
 * Tarea 47-q: paridad web/app de "✓ Voy" después de QPS-197 ("Guardar, Voy y
 * Seguir"). "Me interesa" desapareció de la interfaz: ahora hay un solo tipo
 * de asistencia (`'voy'`), con un solo texto de botón (`textoBotonVoy`, de
 * `@qps/core/asistencia`) y un solo orden de fila (`ORDEN_FILA_ACCIONES`,
 * también de core). `textoBoton`, `ETIQUETAS_ASISTENCIA.me_interesa` y
 * `siguienteMarca` ya no existen: lo que hereda este archivo de la versión
 * de la R38 es la GARANTÍA de paridad (que la web y la app no tengan cada
 * una su copia de la lógica), no los nombres viejos.
 *
 * Por qué hacen falta las DOS cosas (afirmar sobre `textoBotonVoy` +
 * detector estático de que los componentes lo llaman, junto con
 * `ORDEN_FILA_ACCIONES`), y por qué ninguna de las dos sola alcanza:
 *
 *  - Solo (a) "afirmar sobre textoBotonVoy" no prueba nada de paridad: core
 *    es un módulo único, compartido por los dos lados. Si `textoBotonVoy` da
 *    bien "Voy · 5 van", eso no dice si la fila de la web o la de la app en
 *    verdad lo usan — un componente podría ignorarlo y armar su propio texto
 *    a mano, y este chequeo seguiría en verde, porque nunca mira el
 *    componente.
 *  - Solo (b) "detector estático de que llaman a textoBotonVoy/ORDEN_FILA_ACCIONES"
 *    tampoco alcanza sin (a): si alguien rompiera `textoBotonVoy` en core
 *    (por ejemplo, mostrando siempre el número, sin umbral), los componentes
 *    seguirían "llamando a textoBotonVoy" tal cual, y el detector (b) no lo
 *    notaría.
 *
 * Juntas: (a) fija qué tiene que devolver `textoBotonVoy` para cada
 * cantidad, y (b) prueba que ninguna de las dos filas arma el texto o el
 * orden a mano — entre las dos, un bug real de paridad tiene que romper al
 * menos una.
 *
 * Ojo con un falso positivo real (documentado en el encargo de esta tarea):
 * en la app, `textoBoton` TAMBIÉN es una clave de `StyleSheet`
 * (`estilos.textoBoton`) en `components/EstadoCarga.tsx`, `Hero.tsx` y
 * otros, sin relación con core. Por eso el detector de abajo busca
 * puntualmente el import desde `@qps/core/asistencia` y la llamada
 * `textoBotonVoy(`, nunca la cadena suelta `textoBoton`.
 */
import { readFileSync } from 'node:fs'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ETIQUETAS_ASISTENCIA,
  ORDEN_FILA_ACCIONES,
  TEXTO_ENTRAR_PARA_MARCAR,
  TEXTO_SACASTE_GUARDADO_CON_VOY,
  textoBotonVoy,
} from '@qps/core/asistencia'

// ---------------------------------------------------------------------------
// (a) El texto que tiene que mostrar cada lado, para la tabla de cantidades
// del encargo (0, 2, 3 y 12): como las dos filas llaman a `textoBotonVoy` de
// `@qps/core/asistencia` (lo prueba el bloque (b) de abajo), afirmar sobre
// esta tabla alcanza para fijar lo que web y app van a mostrar.
// ---------------------------------------------------------------------------
describe('textoBotonVoy: la tabla de textos (0, 2, 3 y 12)', () => {
  it('cantidad=0: sin número ("Voy")', () => {
    expect(textoBotonVoy(0)).toBe('Voy')
  })

  it('cantidad=2 (debajo del umbral de 3): sin número ("Voy")', () => {
    expect(textoBotonVoy(2)).toBe('Voy')
  })

  it('cantidad=3 (el umbral, inclusive): con número ("Voy · 3 van")', () => {
    expect(textoBotonVoy(3)).toBe('Voy · 3 van')
  })

  it('cantidad=12: con número, sin truncar ni redondear ("Voy · 12 van")', () => {
    expect(textoBotonVoy(12)).toBe('Voy · 12 van')
  })
})

describe('ETIQUETAS_ASISTENCIA / ORDEN_FILA_ACCIONES / los textos fijos: una sola fuente para los dos lados', () => {
  it('ETIQUETAS_ASISTENCIA tiene EXACTAMENTE la clave "voy" (ya no existe "me_interesa")', () => {
    expect(Object.keys(ETIQUETAS_ASISTENCIA)).toEqual(['voy'])
    expect(ETIQUETAS_ASISTENCIA.voy).toBe('Voy')
  })

  it('ORDEN_FILA_ACCIONES es, en ese orden, guardar → voy → compartir', () => {
    expect(ORDEN_FILA_ACCIONES).toEqual(['guardar', 'voy', 'compartir'])
  })

  it('TEXTO_ENTRAR_PARA_MARCAR es el texto exacto de invitación a entrar', () => {
    expect(TEXTO_ENTRAR_PARA_MARCAR).toBe('Entrá para marcar si vas.')
  })

  it('TEXTO_SACASTE_GUARDADO_CON_VOY es el texto exacto del aviso de "Voy contenido en Guardados"', () => {
    expect(TEXTO_SACASTE_GUARDADO_CON_VOY).toBe('Lo sacaste de tus guardados y ya no figurás como que vas.')
  })
})

// ===========================================================================
// (b) Detector estático: las dos filas de verdad recorren
// `ORDEN_FILA_ACCIONES` (nunca escriben ['guardar','voy','compartir'] a
// mano) y la pieza que dibuja el texto de "Voy" llama a `textoBotonVoy`
// (nunca arma "Voy · N" a mano). Recorre el código real de los componentes
// (no un fixture inventado): si alguno deja de usar core, esto se rompe.
// ===========================================================================

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const MOBILE_ROOT = fileURLToPath(new URL('../../../mobile/', import.meta.url))

/** `true` si el contenido importa `nombre` de `@qps/core/asistencia` (con o sin alias), sin comentarios. */
function importaDeCoreAsistencia(content: string, nombre: string): boolean {
  const limpio = quitarComentarios(content)
  const patron = new RegExp(`import\\s+(?:type\\s+)?\\{[^}]*\\b${nombre}\\b[^}]*\\}\\s*from\\s*['"]@qps/core/asistencia['"]`)
  return patron.test(limpio)
}

/**
 * `true` si hay un texto de "Voy" armado a mano: un template string o una
 * concatenación que mezcla "Voy" (o una variable) con el separador real "·"
 * y una cantidad interpolada, en vez de llamar a `textoBotonVoy`. Busca la
 * FORMA (un backtick con "·" y una interpolación `${...}` cerca), no nombres
 * fijos de variable, para que renombrar no lo evada.
 */
function tieneTextoVoyArmadoAMano(content: string): boolean {
  const limpio = quitarComentarios(content)
  if (/`[^`]*·[^`]*\$\{[^}]*\}[^`]*`/.test(limpio)) return true
  if (/`[^`]*\$\{[^}]*\}[^`]*·[^`]*`/.test(limpio)) return true
  if (/['"`][^'"`]*·[^'"`]*['"`]\s*\+/.test(limpio)) return true
  if (/\+\s*['"`][^'"`]*·[^'"`]*['"`]/.test(limpio)) return true
  return false
}

describe('tieneTextoVoyArmadoAMano / importaDeCoreAsistencia (fixtures en memoria: el detector tiene que fallar de verdad)', () => {
  it('detecta un template string armado a mano con el separador real', () => {
    expect(tieneTextoVoyArmadoAMano('const texto = `Voy · ${cantidad} van`')).toBe(true)
  })

  it('detecta el mismo patrón con la cantidad primero', () => {
    expect(tieneTextoVoyArmadoAMano('const texto = `${cantidad} · Voy`')).toBe(true)
  })

  it('detecta una concatenación con "+" y el separador como literal', () => {
    expect(tieneTextoVoyArmadoAMano("const texto = 'Voy' + ' · ' + cantidad + ' van'")).toBe(true)
  })

  it('un template string sin el separador (otro uso cualquiera) no cuenta: false', () => {
    expect(tieneTextoVoyArmadoAMano('const label = `Marcar ${texto}`')).toBe(false)
  })

  it('llamar a textoBotonVoy(cantidad) tal cual no cuenta como armado a mano: false', () => {
    expect(tieneTextoVoyArmadoAMano('const texto = textoBotonVoy(cantidad)')).toBe(false)
  })

  it('un comentario que menciona el separador "·" no cuenta (se descarta antes de buscar)', () => {
    const fixture = '// el separador es "·", igual que `Voy · ${cantidad} van` en el ejemplo viejo\nconst x = 1'
    expect(tieneTextoVoyArmadoAMano(fixture)).toBe(false)
  })

  it('importaDeCoreAsistencia detecta el import real, con alias', () => {
    expect(importaDeCoreAsistencia(`import { textoBotonVoy as armar } from '@qps/core/asistencia'`, 'textoBotonVoy')).toBe(
      true,
    )
  })

  it('importaDeCoreAsistencia: sin el nombre buscado entre las llaves, false', () => {
    expect(importaDeCoreAsistencia(`import { ORDEN_FILA_ACCIONES } from '@qps/core/asistencia'`, 'textoBotonVoy')).toBe(
      false,
    )
  })

  it('el falso positivo real: una clave de StyleSheet llamada "textoBoton" no es un import de core', () => {
    const fixture = `const estilos = StyleSheet.create({ textoBoton: { fontWeight: '600' } })`
    expect(importaDeCoreAsistencia(fixture, 'textoBotonVoy')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Las dos filas reales. La web separa en dos archivos (la fila, que recorre
// ORDEN_FILA_ACCIONES y delega el botón de Voy en `BotonVoy`; y
// `botones-asistencia.tsx`, que exporta `BotonVoy` y llama a
// `textoBotonVoy`); la app hace las dos cosas en el mismo archivo
// (`FilaAccionesEvento.tsx`, en `botonesDeLaFila`).
// ---------------------------------------------------------------------------
const WEB_FILA = readFileSync(`${WEB_ROOT}/components/fila-acciones-evento.tsx`, 'utf8')
const WEB_BOTON_VOY = readFileSync(`${WEB_ROOT}/components/botones-asistencia.tsx`, 'utf8')
const MOBILE_FILA = readFileSync(`${MOBILE_ROOT}/components/FilaAccionesEvento.tsx`, 'utf8')

const CASOS_ORDEN = [
  { etiqueta: 'web: components/fila-acciones-evento.tsx', contenido: WEB_FILA },
  { etiqueta: 'app: components/FilaAccionesEvento.tsx', contenido: MOBILE_FILA },
] as const

describe.each(CASOS_ORDEN)('$etiqueta: el orden sale de ORDEN_FILA_ACCIONES, nunca escrito a mano', (caso) => {
  it('importa ORDEN_FILA_ACCIONES de @qps/core/asistencia', () => {
    expect(importaDeCoreAsistencia(caso.contenido, 'ORDEN_FILA_ACCIONES')).toBe(true)
  })

  it('recorre ORDEN_FILA_ACCIONES (map/filter/forEach), no un arreglo propio', () => {
    const limpio = quitarComentarios(caso.contenido)
    expect(/\bORDEN_FILA_ACCIONES\s*\.\s*(map|filter|forEach)\s*\(/.test(limpio)).toBe(true)
  })

  it('no repite ["guardar","voy","compartir"] como un arreglo literal propio', () => {
    const limpio = quitarComentarios(caso.contenido)
    expect(/\[\s*['"]guardar['"]\s*,\s*['"]voy['"]\s*,\s*['"]compartir['"]\s*\]/.test(limpio)).toBe(false)
  })
})

const CASOS_TEXTO = [
  { etiqueta: 'web: components/botones-asistencia.tsx (BotonVoy)', contenido: WEB_BOTON_VOY },
  { etiqueta: 'app: components/FilaAccionesEvento.tsx (botonesDeLaFila)', contenido: MOBILE_FILA },
] as const

describe.each(CASOS_TEXTO)('$etiqueta: el texto de "Voy" sale de textoBotonVoy, nunca armado a mano', (caso) => {
  it('importa textoBotonVoy de @qps/core/asistencia', () => {
    if (!importaDeCoreAsistencia(caso.contenido, 'textoBotonVoy')) {
      throw new Error(`${caso.etiqueta}: no importa 'textoBotonVoy' de '@qps/core/asistencia'`)
    }
    expect(importaDeCoreAsistencia(caso.contenido, 'textoBotonVoy')).toBe(true)
  })

  it('llama a textoBotonVoy con la cantidad, no solo lo importa sin usarlo', () => {
    const limpio = quitarComentarios(caso.contenido)
    expect(/\btextoBotonVoy\s*\([^)]*\)/.test(limpio)).toBe(true)
  })

  it('no tiene un texto de "Voy" armado a mano (sin template string ni concatenación con "·")', () => {
    if (tieneTextoVoyArmadoAMano(caso.contenido)) {
      throw new Error(`${caso.etiqueta}: parece armar el texto de "Voy" a mano, en vez de usar textoBotonVoy`)
    }
    expect(tieneTextoVoyArmadoAMano(caso.contenido)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// La fila de la web delega el botón de Voy en `BotonVoy` (no reimplementa su
// texto): esto conecta los dos archivos de arriba y es lo que hace que
// comprobar ORDEN en `fila-acciones-evento.tsx` y el texto en
// `botones-asistencia.tsx` siga siendo una garantía de paridad real (y no
// dos chequeos de archivos que, en los hechos, no se usan entre sí).
// ---------------------------------------------------------------------------
describe('web: fila-acciones-evento.tsx delega el botón de Voy en BotonVoy (no arma el texto él mismo)', () => {
  it('importa BotonVoy de @/components/botones-asistencia', () => {
    const limpio = quitarComentarios(WEB_FILA)
    expect(/import\s+\{[^}]*\bBotonVoy\b[^}]*\}\s*from\s*['"]@\/components\/botones-asistencia['"]/.test(limpio)).toBe(
      true,
    )
  })

  it('renderiza <BotonVoy ...> dentro del recorrido de ORDEN_FILA_ACCIONES', () => {
    const limpio = quitarComentarios(WEB_FILA)
    expect(/<BotonVoy\b/.test(limpio)).toBe(true)
  })
})
