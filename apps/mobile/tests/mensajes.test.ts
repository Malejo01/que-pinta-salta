// Ronda 27, tarea 27-c, punto 3 (QPS-131): un solo `MENSAJE_SIN_CONFIGURACION`
// definido en toda `apps/mobile` — vive en `lib/mensajes.ts` y todo lo demás
// (`lib/asistencia.ts`, `lib/favoritos.ts`, `lib/radar.ts`,
// `lib/notificaciones.ts`, `lib/datos/eventos.ts`, `lib/datos/cines.ts`) lo
// reexporta con `export { MENSAJE_SIN_CONFIGURACION }`, nunca lo vuelve a
// escribir como literal. El test recorre los archivos reales (mismo patrón
// que `tests/aperturas-url.test.ts` y `tests/select-publico.test.ts`), así
// que si alguien vuelve a copiar el literal en otro archivo, la falla
// muestra el archivo y la línea.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MENSAJE_SIN_CONFIGURACION } from '../lib/mensajes'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const MENSAJES_TS = join('lib', 'mensajes.ts')

function listarTsYTsx(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...listarTsYTsx(full))
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full)
    }
  }
  return out
}

interface Definicion {
  archivo: string
  linea: number
  texto: string
}

/** `export const MENSAJE_SIN_CONFIGURACION = '...'` (la definición real, con un literal). */
const RE_DEFINICION = /export\s+const\s+MENSAJE_SIN_CONFIGURACION\s*=\s*(['"`])/

function encontrarDefiniciones(archivos: string[]): Definicion[] {
  const definiciones: Definicion[] = []
  for (const archivo of archivos) {
    const src = readFileSync(archivo, 'utf8')
    const lineas = src.split('\n')
    lineas.forEach((linea, indice) => {
      if (RE_DEFINICION.test(linea)) {
        definiciones.push({ archivo: relative(MOBILE_ROOT, archivo), linea: indice + 1, texto: linea.trim() })
      }
    })
  }
  return definiciones
}

describe('MENSAJE_SIN_CONFIGURACION: una sola definición en toda la app (QPS-131)', () => {
  const archivos = ['app', 'components', 'lib'].flatMap((d) => listarTsYTsx(join(MOBILE_ROOT, d)))

  it('encuentra archivos para analizar, incluido lib/mensajes.ts', () => {
    expect(archivos.length).toBeGreaterThan(0)
    expect(archivos.some((f) => relative(MOBILE_ROOT, f) === MENSAJES_TS)).toBe(true)
  })

  it('hay exactamente una definición (el resto son reexports, no literales nuevos)', () => {
    const definiciones = encontrarDefiniciones(archivos)
    if (definiciones.length !== 1) {
      const detalle = definiciones.map((d) => `  ${d.archivo}:${d.linea} — ${d.texto}`).join('\n')
      throw new Error(
        `Se esperaba exactamente 1 definición de MENSAJE_SIN_CONFIGURACION, se encontraron ${definiciones.length}:\n${detalle}`
      )
    }
    expect(definiciones).toHaveLength(1)
  })

  it('la única definición vive en lib/mensajes.ts', () => {
    const [definicion] = encontrarDefiniciones(archivos)
    expect(definicion.archivo).toBe(MENSAJES_TS)
  })

  it('el valor exportado coincide con el de la definición (nadie lo pisa en el camino)', () => {
    expect(MENSAJE_SIN_CONFIGURACION).toBe('La app no tiene la configuración de datos: avisá al equipo.')
  })

  it('cada módulo de datos/lib que usa el mensaje lo reexporta, no lo redefine como literal', () => {
    const archivosQueDeberianReexportar = [
      'lib/asistencia.ts',
      'lib/favoritos.ts',
      'lib/radar.ts',
      'lib/notificaciones.ts',
      'lib/datos/eventos.ts',
      'lib/datos/cines.ts',
    ]
    for (const relativo of archivosQueDeberianReexportar) {
      const full = archivos.find((f) => relative(MOBILE_ROOT, f) === join(...relativo.split('/')))
      expect(full, `no se encontró ${relativo}`).toBeDefined()
      const src = readFileSync(full as string, 'utf8')
      expect(src).toMatch(/export\s*\{\s*MENSAJE_SIN_CONFIGURACION\s*\}/)
      expect(src).not.toMatch(RE_DEFINICION)
    }
  })
})
