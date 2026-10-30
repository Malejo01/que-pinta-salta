import { describe, expect, it } from 'vitest'
import {
  FIXTURE_COMENTARIO_BLOQUE_CON_DIRECTIVA,
  FIXTURE_CONFIG_BUENA,
  FIXTURE_CONFIG_FALSA_BLOQUE,
  FIXTURE_CONFIG_FALSA_COMENTARIO,
  FIXTURE_LINEA_OCHO_CON_DIRECTIVA,
  FIXTURE_PRIMERA_LINEA_CON_DIRECTIVA,
  FIXTURE_SIN_DIRECTIVA,
  PALABRA_DIRECTIVA,
  buscarDirectiva,
  configTieneEnvironmentNode,
  esValidoFueraDeTestsDom,
  esValidoParaTestsDom,
  listarArchivosRecursivo,
  quitarComentarios,
} from '@qps/core/tests/convencion-entorno'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { readdirSync, statSync } from 'node:fs'

const ESTE_DIR = dirname(fileURLToPath(import.meta.url))

describe('quitarComentarios (helper unificado de tests, QPS-313)', () => {
  it('un comentario // que contiene /* NO deja ciego al detector en las líneas siguientes', () => {
    const fuente = [
      '// este comentario menciona una ruta con glob o apertura: /*.tsx',
      'const codigoSensible = "detectable"',
      '/* comentario de bloque posterior */',
      'const masCodigo = 123',
    ].join('\n')

    const resultado = quitarComentarios(fuente)

    expect(resultado).not.toContain('este comentario menciona')
    expect(resultado).not.toContain('comentario de bloque posterior')
    expect(resultado).toContain('const codigoSensible = "detectable"')
    expect(resultado).toContain('const masCodigo = 123')
  })

  it('un comentario de bloque real de una sola línea se elimina y conserva el código vecino', () => {
    const fuente = 'const a = 1 /* comentario de bloque */ + 2 // fin de linea'
    const resultado = quitarComentarios(fuente)

    expect(resultado).not.toContain('comentario de bloque')
    expect(resultado).not.toContain('fin de linea')
    expect(resultado).toContain('const a = 1')
    expect(resultado).toContain('+ 2')
  })

  it('un comentario de bloque real multilínea se elimina y preserva los saltos de línea para mantener la numeración', () => {
    const fuente = [
      'const linea1 = 1',
      '/*',
      ' * comentario de bloque multilínea',
      ' * línea 3',
      ' */',
      'const linea6 = 6',
    ].join('\n')

    const resultado = quitarComentarios(fuente)

    expect(resultado).not.toContain('comentario de bloque multilínea')
    expect(resultado).toContain('const linea1 = 1')
    expect(resultado).toContain('const linea6 = 6')

    const lineasOriginales = fuente.split('\n')
    const lineasResultado = resultado.split('\n')
    expect(lineasResultado.length).toBe(lineasOriginales.length)
    expect(lineasResultado[0]).toBe('const linea1 = 1')
    expect(lineasResultado[5]).toBe('const linea6 = 6')
  })

  it('no confunde URLs ni secuencias // o /* dentro de strings (comillas dobles, simples y template strings)', () => {
    const fuente = [
      'const u1 = "https://quepintasalta.com.ar/evento/*"',
      "const u2 = 'https://ejemplo.com//test'",
      'const u3 = `https://ejemplo.com/${id}/*`',
      '// comentario de línea real',
    ].join('\n')

    const resultado = quitarComentarios(fuente)

    expect(resultado).toContain('const u1 = "https://quepintasalta.com.ar/evento/*"')
    expect(resultado).toContain("const u2 = 'https://ejemplo.com//test'")
    expect(resultado).toContain('const u3 = `https://ejemplo.com/${id}/*`')
    expect(resultado).not.toContain('comentario de línea real')
  })
})

describe('detector de convención de entorno (QPS-319)', () => {
  it('buscarDirectiva encuentra la directiva en un comentario de bloque', () => {
    expect(buscarDirectiva(FIXTURE_COMENTARIO_BLOQUE_CON_DIRECTIVA)).toEqual({ valor: 'jsdom', linea: 1 })
  })

  it('esValidoParaTestsDom y esValidoFueraDeTestsDom validan la directiva en primera línea', () => {
    expect(esValidoParaTestsDom(FIXTURE_PRIMERA_LINEA_CON_DIRECTIVA)).toBe(true)
    expect(esValidoFueraDeTestsDom(FIXTURE_PRIMERA_LINEA_CON_DIRECTIVA)).toBe(false)
  })

  it('una directiva en la línea 8 no es válida para tests con DOM', () => {
    expect(buscarDirectiva(FIXTURE_LINEA_OCHO_CON_DIRECTIVA)?.linea).toBe(8)
    expect(esValidoParaTestsDom(FIXTURE_LINEA_OCHO_CON_DIRECTIVA)).toBe(false)
  })

  it('un texto sin directiva no produce hallazgos', () => {
    expect(buscarDirectiva(FIXTURE_SIN_DIRECTIVA)).toBeNull()
    expect(esValidoFueraDeTestsDom(FIXTURE_SIN_DIRECTIVA)).toBe(true)
  })

  it('configTieneEnvironmentNode detecta node y no se deja engañar por comentarios', () => {
    expect(configTieneEnvironmentNode(FIXTURE_CONFIG_BUENA)).toBe(true)
    expect(configTieneEnvironmentNode(FIXTURE_CONFIG_FALSA_COMENTARIO)).toBe(false)
    expect(configTieneEnvironmentNode(FIXTURE_CONFIG_FALSA_BLOQUE)).toBe(false)
  })

  it('listarArchivosRecursivo recorre recursivamente y devuelve rutas con separador normalizado', () => {
    const archivos = listarArchivosRecursivo(ESTE_DIR, join(ESTE_DIR, '..'), { readdirSync, statSync, join, relative })
    expect(archivos.length).toBeGreaterThan(0)
    expect(archivos.every((a) => !a.includes('\\'))).toBe(true)
  })
})

