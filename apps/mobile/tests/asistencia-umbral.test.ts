/**
 * Tarea 38-q: el umbral del contador de "Voy", del lado de la app. Hueco
 * real, verificado por el lead: se rompió `cantidadVisible` a mano (que
 * devolviera siempre `n`, sin umbral) y la suite de `apps/mobile` pasó
 * entera en verde — ningún test de esta carpeta ejercitaba el umbral (los
 * tests de `packages/core`/`apps/web` lo cubren, pero el runner de
 * `apps/mobile` no los corre). Este archivo cierra ese hueco: importa
 * `textoBotonVoy` exactamente como lo hace la app (`@qps/core/asistencia`,
 * vía el alias de `vitest.config.ts`) y afirma sobre el texto para
 * cantidades de los dos lados del umbral, más un detector estático de que
 * `BotonesAsistencia.tsx` muestra ese texto y no la cantidad cruda.
 *
 * R47, tarea 47-e (QPS-197): BORRADO el caso de `me_interesa` — el modelo
 * cambió a un solo tipo ("Voy"); `textoBoton(tipo, cantidad)` (con dos
 * tipos) ya no existe en core, lo reemplaza `textoBotonVoy(cantidad)`. El
 * `describe.each(tipos)` de la versión de la R38 (38-q) iteraba sobre
 * `['voy', 'me_interesa']`: ahora solo queda `'voy'`, así que se aplanó a un
 * solo `describe` sin parametrizar por tipo.
 *
 * Qué bug real deja en rojo cada bloque:
 *  - El bloque "textoBotonVoy: tabla de cantidades" deja en rojo cualquier
 *    cambio al umbral (constante `UMBRAL_CONTADOR_ASISTENCIA`) o a
 *    `cantidadVisible` en `packages/core/src/asistencia/index.ts`: por
 *    ejemplo, que `cantidadVisible` devuelva siempre `n` (sin umbral), o que
 *    el umbral cambie de 3 a otro número.
 *  - El bloque "BotonesAsistencia.tsx: muestra textoBotonVoy, no la cantidad
 *    cruda" deja en rojo que el componente deje de llamar a `textoBotonVoy`
 *    y muestre `cantidad` (o `cantidades.voy`) directo en un `<Text>`, lo
 *    que mostraría el número sin pasar nunca por el umbral ni por la
 *    etiqueta. **Este bloque va a estar en rojo hasta que 47-f actualice
 *    `BotonesAsistencia.tsx`** (ese archivo no es de esta tarea: hoy todavía
 *    llama a `textoBoton(tipo, cantidad)`, el nombre viejo de core — ver el
 *    informe de la tarea 47-e).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ETIQUETAS_ASISTENCIA, textoBotonVoy } from '@qps/core/asistencia'

// ---------------------------------------------------------------------------
// textoBotonVoy, con cantidades de los dos lados del umbral: 0, 1, 2 (sin
// número) y 3, 4, 10 (con número).
// ---------------------------------------------------------------------------
describe('textoBotonVoy (importado tal como lo hace la app, desde @qps/core/asistencia)', () => {
  it('cantidad 0: sin número', () => {
    expect(textoBotonVoy(0)).toBe(ETIQUETAS_ASISTENCIA.voy)
  })

  it('cantidad 1: sin número', () => {
    expect(textoBotonVoy(1)).toBe(ETIQUETAS_ASISTENCIA.voy)
  })

  it('cantidad 2 (justo debajo del umbral): sin número', () => {
    expect(textoBotonVoy(2)).toBe(ETIQUETAS_ASISTENCIA.voy)
  })

  it('cantidad 3 (justo en el umbral, inclusive): con número', () => {
    expect(textoBotonVoy(3)).toBe(`${ETIQUETAS_ASISTENCIA.voy} · 3 van`)
  })

  it('cantidad 4: con número', () => {
    expect(textoBotonVoy(4)).toBe(`${ETIQUETAS_ASISTENCIA.voy} · 4 van`)
  })

  it('cantidad 10: con número', () => {
    expect(textoBotonVoy(10)).toBe(`${ETIQUETAS_ASISTENCIA.voy} · 10 van`)
  })

  // Si alguien saca el umbral de cantidadVisible (lo hace devolver siempre
  // n), este caso puntual también lo detecta: con la regla rota, 0 y 1
  // mostrarían número, cosa que este test no admite.
  it('0 y 1 nunca muestran "·" (si esto falla, el umbral se rompió)', () => {
    expect(textoBotonVoy(0)).not.toContain('·')
    expect(textoBotonVoy(1)).not.toContain('·')
  })
})

// ===========================================================================
// Detector estático: BotonesAsistencia.tsx muestra el texto que devuelve
// textoBotonVoy, no la cantidad cruda. No se puede renderizar el componente
// en este entorno (vitest.config.ts: `environment: 'node'`, sin runner de
// React Native — ver la nota de esa config); mismo criterio que
// `tests/estado-carga-detector.test.ts` (detector estático sobre el código
// real, no un fixture).
// ===========================================================================

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const RUTA_COMPONENTE = `${MOBILE_ROOT}/components/BotonesAsistencia.tsx`

/** Comentarios de línea y de bloque vaciados, conservando el resto del texto. */
function quitarComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

/** `true` si el contenido importa `textoBotonVoy` de `@qps/core/asistencia` (con o sin alias). */
function importaTextoBotonVoy(content: string): boolean {
  const limpio = quitarComentarios(content)
  return /import\s+(?:type\s+)?\{[^}]*\btextoBotonVoy\b[^}]*\}\s*from\s*['"]@qps\/core\/asistencia['"]/.test(limpio)
}

/**
 * `true` si hay un `<Text ...>{algo}</Text>` cuyo contenido es una cantidad
 * cruda (una variable/propiedad que se llama o termina en "cantidad", o el
 * acceso directo a `cantidades.voy`), en vez del resultado de
 * `textoBotonVoy(...)`. Busca la FORMA de la interpolación, no un nombre de
 * componente fijo.
 */
function muestraCantidadCrudaEnTexto(content: string): boolean {
  const limpio = quitarComentarios(content)
  const regex = /<Text\b[^>]*>\s*\{\s*([^}]+?)\s*\}\s*<\/Text>/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(limpio))) {
    const expresion = m[1].trim()
    if (/\btextoBotonVoy\s*\(/.test(expresion)) continue
    if (/\bcantidad(es)?\b/i.test(expresion)) return true
  }
  return false
}

describe('muestraCantidadCrudaEnTexto / importaTextoBotonVoy (fixtures en memoria: el detector tiene que fallar de verdad)', () => {
  it('detecta mostrar la cantidad cruda directo', () => {
    expect(muestraCantidadCrudaEnTexto('<Text>{cantidad}</Text>')).toBe(true)
  })

  it('detecta mostrar cantidades.voy directo', () => {
    expect(muestraCantidadCrudaEnTexto('<Text style={estilo}>{cantidades.voy}</Text>')).toBe(true)
  })

  it('llamar a textoBotonVoy(cantidad) dentro del Text no cuenta como cantidad cruda: false', () => {
    expect(muestraCantidadCrudaEnTexto('<Text style={estilos.textoBoton}>{textoBotonVoy(cantidad)}</Text>')).toBe(
      false,
    )
  })

  it('un Text con otro contenido cualquiera (sin relación a cantidad) no cuenta: false', () => {
    expect(muestraCantidadCrudaEnTexto('<Text>{MENSAJE_NO_DISPONIBLE}</Text>')).toBe(false)
  })

  it('un comentario que menciona "cantidad" no cuenta (se descarta antes de buscar)', () => {
    const fixture = '// acá se muestra la cantidad, nunca cruda\n<Text>{textoBotonVoy(cantidad)}</Text>'
    expect(muestraCantidadCrudaEnTexto(fixture)).toBe(false)
  })

  it('importaTextoBotonVoy detecta el import real, con alias', () => {
    expect(importaTextoBotonVoy(`import { textoBotonVoy as armar } from '@qps/core/asistencia'`)).toBe(true)
  })

  it('importaTextoBotonVoy: sin textoBotonVoy entre las llaves, false', () => {
    expect(importaTextoBotonVoy(`import { pasosDeTocar } from '@qps/core/asistencia'`)).toBe(false)
  })
})

describe('components/BotonesAsistencia.tsx: muestra textoBotonVoy, no la cantidad cruda', () => {
  const contenido = readFileSync(RUTA_COMPONENTE, 'utf8')

  it('importa textoBotonVoy de @qps/core/asistencia', () => {
    if (!importaTextoBotonVoy(contenido)) {
      throw new Error(
        'BotonesAsistencia.tsx: no importa "textoBotonVoy" de "@qps/core/asistencia" todavía ' +
          '(esperado hasta que 47-f lo actualice: ver el informe de la tarea 47-e)'
      )
    }
    expect(importaTextoBotonVoy(contenido)).toBe(true)
  })

  it('llama a textoBotonVoy con un argumento (cantidad)', () => {
    const limpio = quitarComentarios(contenido)
    expect(/\btextoBotonVoy\s*\([^)]*\)/.test(limpio)).toBe(true)
  })

  it('ningún <Text> muestra la cantidad cruda en vez del resultado de textoBotonVoy', () => {
    if (muestraCantidadCrudaEnTexto(contenido)) {
      throw new Error(
        'BotonesAsistencia.tsx: parece mostrar la cantidad cruda, en vez de textoBotonVoy(cantidad)'
      )
    }
    expect(muestraCantidadCrudaEnTexto(contenido)).toBe(false)
  })
})
