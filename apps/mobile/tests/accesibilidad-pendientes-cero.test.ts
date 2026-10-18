// 46-q (Ronda 46, calidad de la app): verifica que la línea de base de
// accesibilidad (`tests/a11y/pendientes-componentes.ts` y
// `pendientes-pantallas.ts`, línea de base de `tests/accesibilidad-detector.test.ts`,
// 46-b/46-c/46-d) llegó a cero en las tres reglas "sin arreglo aceptable" —
// `sin-rol`, `sin-etiqueta` y `link-externo` — y que lo único que queda es
// `area-chica`, siempre con un motivo escrito en el propio archivo de
// pendientes.
//
// Esto NO vuelve a correr el detector (eso ya lo hace
// `tests/accesibilidad-detector.test.ts`): lee las CONSTANTES ya
// construidas (importadas, no por texto) y el TEXTO FUENTE de los dos
// archivos de pendientes (para el motivo en comentario).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PENDIENTES_COMPONENTES, type LineaBaseAccesibilidad, type ReglaAccesibilidad } from './a11y/pendientes-componentes'
import { PENDIENTES_PANTALLAS } from './a11y/pendientes-pantallas'

const RUTA_COMPONENTES = fileURLToPath(new URL('./a11y/pendientes-componentes.ts', import.meta.url))
const RUTA_PANTALLAS = fileURLToPath(new URL('./a11y/pendientes-pantallas.ts', import.meta.url))

const LISTAS: Record<'componentes' | 'pantallas', { lista: LineaBaseAccesibilidad; ruta: string }> = {
  componentes: { lista: PENDIENTES_COMPONENTES, ruta: RUTA_COMPONENTES },
  pantallas: { lista: PENDIENTES_PANTALLAS, ruta: RUTA_PANTALLAS },
}

const REGLAS_SIN_ARREGLO_ACEPTABLE: ReglaAccesibilidad[] = ['sin-rol', 'sin-etiqueta', 'link-externo']
const REGLAS_PROHIBIDAS_EN_LA_BASE: ReglaAccesibilidad[] = ['sin-escalar', 'escala-suelta']

describe('pendientes-*.ts: sin-rol, sin-etiqueta y link-externo están en 0 en las dos listas (46-c/46-d ya las bajaron)', () => {
  for (const [nombreLista, { lista }] of Object.entries(LISTAS)) {
    it(`${nombreLista}: ninguna entrada declara sin-rol, sin-etiqueta ni link-externo`, () => {
      const encontradas: string[] = []
      for (const [archivo, conteos] of Object.entries(lista)) {
        for (const regla of REGLAS_SIN_ARREGLO_ACEPTABLE) {
          const n = conteos[regla] ?? 0
          if (n > 0) encontradas.push(`${archivo}: "${regla}" = ${n}`)
        }
      }
      if (encontradas.length > 0) {
        throw new Error(`se esperaba 0 en sin-rol/sin-etiqueta/link-externo, hay:\n  ${encontradas.join('\n  ')}`)
      }
      expect(encontradas).toEqual([])
    })
  }
})

describe('pendientes-*.ts: sin-escalar y escala-suelta nunca entran a la línea de base (el detector ya las exige en 0 sin pasar por acá — esto es para que nadie las tape agregándolas aquí)', () => {
  for (const [nombreLista, { lista }] of Object.entries(LISTAS)) {
    it(`${nombreLista}: ninguna entrada declara sin-escalar ni escala-suelta`, () => {
      const encontradas: string[] = []
      for (const [archivo, conteos] of Object.entries(lista)) {
        for (const regla of REGLAS_PROHIBIDAS_EN_LA_BASE) {
          const n = conteos[regla] ?? 0
          if (n > 0) encontradas.push(`${archivo}: "${regla}" = ${n}`)
        }
      }
      expect(encontradas).toEqual([])
    })
  }
})

describe('pendientes-*.ts: lo único que queda en cada entrada es "area-chica"', () => {
  for (const [nombreLista, { lista }] of Object.entries(LISTAS)) {
    for (const archivo of Object.keys(lista)) {
      it(`${nombreLista}: '${archivo}' solo tiene la clave "area-chica"`, () => {
        const conteos = lista[archivo]
        const reglas = Object.keys(conteos) as ReglaAccesibilidad[]
        expect(reglas, `${archivo} tiene: ${JSON.stringify(conteos)}`).toEqual(['area-chica'])
      })
    }
  }
})

/**
 * `true` si, en el TEXTO FUENTE de `rutaArchivo` (leído con `readFileSync`,
 * no por las constantes ya parseadas), la línea donde aparece la clave
 * `'archivo'` (como string literal de objeto, comillas simples o dobles)
 * tiene, en alguna de las hasta 15 líneas de arriba, un comentario de línea
 * (`//`) con contenido no vacío. No exige que el comentario esté
 * INMEDIATAMENTE arriba (puede haber líneas de texto del comentario de
 * varios renglones, como las que tiene hoy cada entrada): alcanza con que
 * HAYA uno no vacío en la ventana.
 */
function tieneMotivoEscritoArriba(rutaArchivo: string, archivo: string, ventana = 15): boolean {
  const texto = readFileSync(rutaArchivo, 'utf8')
  const lineas = texto.split('\n')
  const idx = lineas.findIndex((l) => l.includes(`'${archivo}'`) || l.includes(`"${archivo}"`))
  if (idx === -1) return false

  const desde = Math.max(0, idx - ventana)
  const bloque = lineas.slice(desde, idx)
  return bloque.some((l) => {
    const t = l.trim()
    return t.startsWith('//') && t.replace(/^\/\/\s*/, '').length > 0
  })
}

describe('tieneMotivoEscritoArriba (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('si no encuentra la clave del archivo en el texto fuente, da false (no revienta)', () => {
    expect(tieneMotivoEscritoArriba(RUTA_COMPONENTES, 'components/NoExiste.tsx')).toBe(false)
  })

  it('encuentra el motivo real de un archivo que SÍ tiene entrada (sanity check contra el archivo de hoy)', () => {
    expect(tieneMotivoEscritoArriba(RUTA_COMPONENTES, 'components/CampoTexto.tsx')).toBe(true)
  })
})

describe('pendientes-*.ts: cada archivo con area-chica tiene su motivo escrito en el propio archivo de pendientes (comentario no vacío en las ~15 líneas de arriba de la entrada)', () => {
  for (const [nombreLista, { lista, ruta }] of Object.entries(LISTAS)) {
    for (const [archivo, conteos] of Object.entries(lista)) {
      if ((conteos['area-chica'] ?? 0) <= 0) continue
      it(`${nombreLista}: '${archivo}' tiene un comentario arriba de su entrada`, () => {
        const tieneMotivo = tieneMotivoEscritoArriba(ruta, archivo)
        expect(tieneMotivo, `no se encontró un comentario no vacío en las ~15 líneas arriba de la entrada de '${archivo}' en ${ruta}`).toBe(true)
      })
    }
  }
})
