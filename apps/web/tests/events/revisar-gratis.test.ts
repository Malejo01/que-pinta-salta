import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  armarReporte,
  captionOriginal,
  esCandidata,
  evaluarFila,
  limpiarParaImprimir,
  type FilaRevisarGratis,
} from '@/lib/events/revisar-gratis'

const AHORA = new Date('2026-10-24T12:00:00Z')

function fila(parcial: Partial<FilaRevisarGratis> = {}): FilaRevisarGratis {
  return {
    id: 'e1',
    title: 'Recital de rock',
    slug: 'recital-de-rock',
    description: null,
    short_description: null,
    start_date: '2026-11-01T22:00:00Z',
    price_min: 0,
    is_free: false,
    status: 'PUBLISHED',
    scrape_source_key: 'alpogo',
    ai_metadata: null,
    ...parcial,
  }
}

describe('esCandidata', () => {
  it('futuro, no gratis y price_min 0: candidata', () => {
    expect(esCandidata(fila(), AHORA)).toBe(true)
  })
  it('price_min null: candidata', () => {
    expect(esCandidata(fila({ price_min: null }), AHORA)).toBe(true)
  })
  it('borrador u otro estado: no (solo PUBLISHED)', () => {
    expect(esCandidata(fila({ status: 'DRAFT' }), AHORA)).toBe(false)
    expect(esCandidata(fila({ status: null }), AHORA)).toBe(false)
  })
  it('evento pasado: no', () => {
    expect(esCandidata(fila({ start_date: '2026-10-01T22:00:00Z' }), AHORA)).toBe(false)
  })
  it('ya gratis: no', () => {
    expect(esCandidata(fila({ is_free: true }), AHORA)).toBe(false)
  })
  it('is_free null: no (solo is_free === false)', () => {
    expect(esCandidata(fila({ is_free: null }), AHORA)).toBe(false)
  })
  it('precio mayor a cero: no', () => {
    expect(esCandidata(fila({ price_min: 3000 }), AHORA)).toBe(false)
  })
  it('fecha inválida: no', () => {
    expect(esCandidata(fila({ start_date: 'no-es-fecha' }), AHORA)).toBe(false)
  })
})

describe('limpiarParaImprimir', () => {
  it('saltos de línea a espacio', () => {
    expect(limpiarParaImprimir('a\nb\r\nc\rd')).toBe('a b c d')
  })
  it('caracteres de control (incluido ESC, tab, DEL y C1) a ?', () => {
    expect(limpiarParaImprimir('x\u001b[31my\tz\u007f\u0085w')).toBe('x?[31my?z??w')
  })
  it('texto normal queda igual; null y undefined dan vacío', () => {
    expect(limpiarParaImprimir('Entrada libre y gratuita ñandú')).toBe('Entrada libre y gratuita ñandú')
    expect(limpiarParaImprimir(null)).toBe('')
    expect(limpiarParaImprimir(undefined)).toBe('')
  })
})

describe('captionOriginal', () => {
  it('devuelve el caption si es string', () => {
    expect(captionOriginal({ original_caption: 'hola' })).toBe('hola')
  })
  it('tolera null, arrays, primitivos y otras formas', () => {
    expect(captionOriginal(null)).toBeNull()
    expect(captionOriginal(undefined)).toBeNull()
    expect(captionOriginal('texto')).toBeNull()
    expect(captionOriginal(42)).toBeNull()
    expect(captionOriginal(['a'])).toBeNull()
    expect(captionOriginal({})).toBeNull()
    expect(captionOriginal({ original_caption: 123 })).toBeNull()
    expect(captionOriginal({ original_caption: { x: 1 } })).toBeNull()
  })
})

describe('evaluarFila', () => {
  it('frase en el título: gratis', () => {
    expect(evaluarFila(fila({ title: 'Entrada libre y gratuita' })).gratis).toBe(true)
  })
  it('frase en la descripción corta: gratis', () => {
    expect(evaluarFila(fila({ short_description: 'Entrada libre y gratuita' })).gratis).toBe(true)
  })
  it('frase solo en el caption de ai_metadata: gratis', () => {
    expect(evaluarFila(fila({ ai_metadata: { original_caption: 'Entrada libre y gratuita' } })).gratis).toBe(true)
  })
  it('ai_metadata raro: no rompe y no cuenta como evidencia', () => {
    expect(evaluarFila(fila({ ai_metadata: 'cualquier cosa' }))).toEqual({ gratis: false, motivo: 'sin-evidencia' })
    expect(evaluarFila(fila({ ai_metadata: [1, 2] }))).toEqual({ gratis: false, motivo: 'sin-evidencia' })
  })
  it('sin frase: sin evidencia', () => {
    expect(evaluarFila(fila())).toEqual({ gratis: false, motivo: 'sin-evidencia' })
  })
  it('frase con condición: no gratis por condición', () => {
    const r = evaluarFila(fila({ description: 'Entrada libre. 2x1 en tragos' }))
    expect(r.gratis).toBe(false)
    expect(r).toMatchObject({ motivo: 'condicion' })
  })
})

describe('armarReporte', () => {
  const filas: FilaRevisarGratis[] = [
    fila({ id: 'a', slug: 'a', title: 'Entrada libre y gratuita', scrape_source_key: 'alpogo' }),
    fila({
      id: 'b',
      slug: 'b',
      price_min: null,
      ai_metadata: { original_caption: 'Entrada libre y gratuita' },
      scrape_source_key: 'instagram',
    }),
    fila({ id: 'c', description: 'Entrada libre. 2x1 en tragos', scrape_source_key: 'alpogo' }),
    fila({ id: 'd', scrape_source_key: null }),
    fila({ id: 'e', title: 'Entrada libre y gratuita', start_date: '2026-01-01T00:00:00Z' }),
    fila({ id: 'f', title: 'Entrada libre y gratuita', is_free: true }),
    fila({ id: 'g', title: 'Entrada libre y gratuita', price_min: 2000 }),
  ]
  const { cambios, resumen } = armarReporte(filas, AHORA)

  it('lista solo los que cambiarían, con id, slug, fecha, fuente y frase', () => {
    expect(cambios.map((c) => c.id)).toEqual(['a', 'b'])
    expect(cambios[0]).toMatchObject({
      id: 'a',
      slug: 'a',
      fecha: '2026-11-01T22:00:00Z',
      fuente: 'alpogo',
    })
    expect(cambios[0].frase).toEqual(expect.any(String))
    expect(cambios[0].frase.length).toBeGreaterThan(0)
    expect(cambios[1].price_min).toBeNull()
  })

  it('los cambios llevan el título', () => {
    expect(cambios[0].titulo).toBe('Entrada libre y gratuita')
  })

  it('lista los descartados por condición con id, slug, condición y frase', () => {
    const conCondicion = fila({ id: 'z', slug: 'z', description: 'Entrada libre. 2x1 en tragos' })
    const { descartados } = armarReporte([conCondicion, fila({ id: 'y' })], AHORA)
    expect(descartados).toHaveLength(1)
    expect(descartados[0]).toMatchObject({ id: 'z', slug: 'z' })
    expect(descartados[0].condicion).toEqual(expect.any(String))
    expect(descartados[0].frase).toEqual(expect.any(String))
  })

  it('el resumen cuenta candidatas, cambios y motivos', () => {
    expect(resumen.candidatas).toBe(4)
    expect(resumen.cambian).toBe(2)
    expect(resumen.conCondicion).toBe(1)
    expect(resumen.sinEvidencia).toBe(1)
    expect(Object.values(resumen.porCondicion).reduce((a, b) => a + b, 0)).toBe(1)
  })

  it('el resumen cuenta por fuente, con "(sin fuente)" para null', () => {
    expect(resumen.porFuente).toEqual({
      alpogo: { candidatas: 2, cambian: 1 },
      instagram: { candidatas: 1, cambian: 1 },
      '(sin fuente)': { candidatas: 1, cambian: 0 },
    })
  })

  it('sin filas: reporte vacío', () => {
    const vacio = armarReporte([], AHORA)
    expect(vacio.cambios).toEqual([])
    expect(vacio.resumen.candidatas).toBe(0)
  })
})

// ===========================================================================
// El script: dry-run por defecto, con la guarda, y nunca programado.
// ===========================================================================
const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const SCRIPT = readFileSync(`${WEB_ROOT}scripts/revisar-gratis.ts`, 'utf8')

/** Quita comentarios de bloque y de línea para analizar solo el código. */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

describe('scripts/revisar-gratis.ts', () => {
  const codigo = sinComentarios(SCRIPT)

  const cadenasDeUpdate = (): string[] => {
    const partes = codigo.split('.update(').slice(1)
    return partes.map((p) => p.slice(0, p.indexOf('.select(')))
  }

  it('los updates (uno por rama de precio) están después del corte del dry-run (if (!aplicar) { … return })', () => {
    expect(codigo.match(/\.update\(/g) ?? []).toHaveLength(2)
    const corte = codigo.search(/if \(!aplicar\) \{[^}]*\breturn\b[^}]*\}/)
    expect(corte).toBeGreaterThan(-1)
    expect(codigo.indexOf('.update(')).toBeGreaterThan(corte)
  })

  it("todo update lleva .eq('id', …) y la guarda .eq('is_free', false)", () => {
    const cadenas = cadenasDeUpdate()
    expect(cadenas).toHaveLength(2)
    for (const cadena of cadenas) {
      expect(cadena).toContain(".eq('id', c.id)")
      expect(cadena).toContain(".eq('is_free', false)")
    }
  })

  it('guarda de carrera por precio: price_min null → .is(null) y escribe 0; price_min 0 → .eq(0)', () => {
    const [paraNull, paraCero] = cadenasDeUpdate()
    expect(paraNull).toContain('{ is_free: true, price_min: 0 }')
    expect(paraNull).toContain(".is('price_min', null)")
    expect(paraCero).toContain('{ is_free: true }')
    expect(paraCero).toContain(".eq('price_min', 0)")
    expect(codigo).toMatch(/c\.price_min === null\s*\?/)
  })

  it('la consulta pide solo PUBLISHED, is_free = false y price_min null o 0', () => {
    expect(codigo).toContain(".eq('status', 'PUBLISHED')")
    expect(codigo).toContain(".eq('is_free', false)")
    expect(codigo).toContain(".or('price_min.is.null,price_min.eq.0')")
  })

  it('imprime título, slug, fuente y frase pasando por limpiarParaImprimir', () => {
    expect(codigo).toContain('limpiarParaImprimir')
    expect(codigo).toMatch(/l\(c\.titulo\)/)
    expect(codigo).toMatch(/l\(c\.slug\)/)
    expect(codigo).toMatch(/l\(c\.fuente\)/)
    expect(codigo).toMatch(/l\(c\.frase\)/)
    expect(codigo).toMatch(/l\(d\.frase\)/)
  })

  it('no hay otras escrituras (insert, upsert, delete, rpc)', () => {
    expect(codigo).not.toMatch(/\.(insert|upsert|delete|rpc)\(/)
  })

  it('no imprime valores de las variables de entorno', () => {
    expect(codigo).not.toMatch(/console\.\w+\([^)]*process\.env\.(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)/)
  })
})

describe('el script no está programado', () => {
  const candidatos: string[] = []
  const workflows = `${REPO_ROOT}.github/workflows`
  if (existsSync(workflows)) {
    for (const nombre of readdirSync(workflows)) candidatos.push(`${workflows}/${nombre}`)
  }
  for (const ruta of [`${REPO_ROOT}vercel.json`, `${WEB_ROOT}vercel.json`]) {
    if (existsSync(ruta)) candidatos.push(ruta)
  }

  it('hay archivos para barrer', () => {
    expect(candidatos.length).toBeGreaterThanOrEqual(2)
  })

  it.each(candidatos.map((ruta) => [ruta.replace(REPO_ROOT, ''), ruta] as const))('%s no lo nombra', (_etiqueta, ruta) => {
    expect(readFileSync(ruta, 'utf8').toLowerCase()).not.toContain('revisar-gratis')
  })
})
