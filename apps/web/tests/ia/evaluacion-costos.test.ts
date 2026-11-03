// Q6-4 · Banco de evaluación de IA: parseo de precios.md, volúmenes,
// estimación de tokens y costo.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { costoUsd, formatearUsd, MARCA_FIN, MARCA_INICIO, parsearPrecios, parsearVolumenes } from '@/lib/ia/evaluacion/precios'
import {
  CARACTERES_POR_TOKEN,
  estimarLlamada,
  estimarTokensTexto,
  FLYER_ALTO,
  FLYER_ANCHO,
  pesoTexto,
  SOBRECARGA_HERRAMIENTA_CLAUDE_ENTRADA,
  SOBRECARGA_HERRAMIENTA_CLAUDE_SALIDA,
  tokensImagenClaude,
  tokensImagenGemini2,
} from '@/lib/ia/evaluacion/tokens'
import { CLAUDE_MODELO_POR_DEFECTO } from '@/lib/ia/claude'
import { GEMINI_MODEL } from '@/lib/ia/gemini'

const DIR = join(process.cwd(), '..', '..', 'docs', 'evaluacion-ia')
const PRECIOS_MD = readFileSync(join(DIR, 'precios.md'), 'utf8')

function tablaCon(...filas: string[]): string {
  return [
    MARCA_INICIO,
    '| clave | proveedor | entrada_usd_mtok | salida_usd_mtok | tokens_por_imagen | fuente | consultado | estado |',
    '|---|---|---|---|---|---|---|---|',
    ...filas,
    MARCA_FIN,
  ].join('\n')
}

describe('precios.md', () => {
  const precios = parsearPrecios(PRECIOS_MD)

  it('trae los dos modelos por defecto de la app y Sonnet de referencia', () => {
    expect(precios.map((p) => p.clave)).toEqual(expect.arrayContaining([GEMINI_MODEL, CLAUDE_MODELO_POR_DEFECTO]))
    expect(precios.some((p) => p.proveedor === 'claude' && /sonnet/.test(p.clave) && p.estado === 'referencia')).toBe(true)
  })

  it('cada fila tiene fuente oficial y fecha de consulta', () => {
    for (const p of precios) {
      expect(p.fuente, p.clave).toMatch(/^https:\/\/(ai\.google\.dev|www\.anthropic\.com|docs\.claude\.com)\//)
      expect(p.consultado, p.clave).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(p.entradaUsdMtok).toBeGreaterThan(0)
      expect(p.salidaUsdMtok).toBeGreaterThan(p.entradaUsdMtok)
    }
  })

  it('el documento avisa que hay que verificar los precios antes de decidir', () => {
    expect(PRECIOS_MD).toMatch(/Verificar antes de decidir/i)
    expect(precios.filter((p) => p.estado !== 'referencia').every((p) => p.estado === 'verificar' || p.estado === 'confirmado')).toBe(true)
  })

  it('los tokens por imagen de Claude salen de la fórmula estándar (1080×1350)', () => {
    for (const p of precios.filter((x) => x.proveedor === 'claude')) expect(p.tokensPorImagen).toBe(tokensImagenClaude(FLYER_ANCHO, FLYER_ALTO))
  })

  it('lee números con coma decimal', () => {
    const [p] = parsearPrecios(tablaCon('| m | gemini | 0,1 | 0,4 | 258 | https://ai.google.dev/x | 2026-11-03 | confirmado |'))
    expect(p).toMatchObject({ clave: 'm', entradaUsdMtok: 0.1, salidaUsdMtok: 0.4, tokensPorImagen: 258, estado: 'confirmado' })
  })

  it.each([
    ['sin marcas', '| a | b |', /marcas/],
    ['sin filas', tablaCon(), /no tiene filas/],
    ['proveedor raro', tablaCon('| m | openai | 1 | 2 | 0 | https://x | 2026-11-03 | verificar |'), /proveedor inválido/],
    ['precio no numérico', tablaCon('| m | claude | uno | 2 | 0 | https://x | 2026-11-03 | verificar |'), /no es un número/],
    ['sin fuente', tablaCon('| m | claude | 1 | 2 | 0 | (ver) | 2026-11-03 | verificar |'), /fuente/],
    ['sin fecha', tablaCon('| m | claude | 1 | 2 | 0 | https://x | ayer | verificar |'), /fecha de consulta/],
    ['estado raro', tablaCon('| m | claude | 1 | 2 | 0 | https://x | 2026-11-03 | seguro |'), /estado inválido/],
    ['repetido', tablaCon('| m | claude | 1 | 2 | 0 | https://x | 2026-11-03 | verificar |', '| m | claude | 1 | 2 | 0 | https://x | 2026-11-03 | verificar |'), /repetido/],
    ['columnas de menos', tablaCon('| m | claude | 1 | 2 |'), /columnas/],
  ])('rechaza una tabla %s', (_nombre, md, error) => {
    expect(() => parsearPrecios(md)).toThrow(error)
  })
})

describe('costo', () => {
  it('USD por millón de tokens de entrada y de salida', () => {
    expect(costoUsd(1_000_000, 0, { entradaUsdMtok: 1, salidaUsdMtok: 5 })).toBe(1)
    expect(costoUsd(2000, 200, { entradaUsdMtok: 1, salidaUsdMtok: 5 })).toBeCloseTo(0.003, 10)
  })
  it('formatea montos chicos con más decimales y coma', () => {
    expect(formatearUsd(1.234)).toBe('USD 1,23')
    expect(formatearUsd(0.1234)).toBe('USD 0,1234')
    expect(formatearUsd(0.000721)).toBe('USD 0,00072')
    expect(formatearUsd(0)).toBe('USD 0,00')
  })
})

describe('volumenes.json', () => {
  it('el de producción se lee y trae los tres usos', () => {
    const v = parsearVolumenes(JSON.parse(readFileSync(join(DIR, 'volumenes.json'), 'utf8')))
    expect(v.porMes.flyers).toBeGreaterThan(0)
    expect(v.porMes.traduccion).toBeGreaterThan(0)
    expect(v.porMes.clasificacion).toBeGreaterThanOrEqual(0)
    expect(v.ventanaDias).toBe(30)
  })
  it('rechaza volúmenes incompletos', () => {
    expect(() => parsearVolumenes({ consultado: '2026-11-03', ventana_dias: 30, por_mes: { flyers: 1, traduccion: 2 } })).toThrow(/clasificacion/)
    expect(() => parsearVolumenes({ consultado: '2026-11-03', ventana_dias: 30, por_mes: { flyers: -1, traduccion: 2, clasificacion: 0 } })).toThrow(/flyers/)
    expect(() => parsearVolumenes(null)).toThrow()
  })
})

describe('estimación de tokens por caracteres', () => {
  it('latino pesa 1, otros símbolos 2, emojis y letras «negrita» 3', () => {
    expect(pesoTexto('Peña')).toBe(4)
    expect(pesoTexto('→')).toBe(2)
    expect(pesoTexto('🎃')).toBe(3)
    expect(pesoTexto('𝐅')).toBe(3)
  })
  it('Gemini 4 caracteres por token, Claude 3,5', () => {
    expect(CARACTERES_POR_TOKEN).toEqual({ gemini: 4, claude: 3.5 })
    expect(estimarTokensTexto('x'.repeat(400), 'gemini')).toBe(100)
    expect(estimarTokensTexto('x'.repeat(350), 'claude')).toBe(100)
    expect(estimarTokensTexto('', 'claude')).toBe(0)
  })
  it('imagen: fórmula de Claude y mosaicos de Gemini 2.x', () => {
    expect(tokensImagenClaude(1080, 1350)).toBe(1532)
    expect(tokensImagenClaude(200, 200)).toBe(54)
    expect(tokensImagenClaude(3000, 1000)).toBeLessThanOrEqual(1600)
    expect(tokensImagenGemini2(300, 300)).toBe(258)
    expect(tokensImagenGemini2(1080, 1350)).toBe(4 * 258)
  })
  it('una llamada suma sistema + prompt + esquema (+ imagen) y, en Claude con JSON, la herramienta', () => {
    const pedido = { sistema: 'x'.repeat(40), prompt: 'y'.repeat(40), esquema: { type: 'object' }, conImagen: true }
    const g = estimarLlamada(pedido, { slug: 'penas' }, 'gemini', 1000)
    const c = estimarLlamada(pedido, { slug: 'penas' }, 'claude', 1000)
    expect(g.entrada).toBeGreaterThan(1000)
    expect(c.entrada - SOBRECARGA_HERRAMIENTA_CLAUDE_ENTRADA).toBeGreaterThan(g.entrada - 1)
    expect(c.salida).toBe(estimarTokensTexto(JSON.stringify({ slug: 'penas' }), 'claude') + SOBRECARGA_HERRAMIENTA_CLAUDE_SALIDA)
    const sinImagen = estimarLlamada({ ...pedido, conImagen: false }, {}, 'gemini', 1000)
    expect(g.entrada - sinImagen.entrada).toBe(1000)
  })
})
