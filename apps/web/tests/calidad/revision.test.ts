// Q5-8 · Calidad de los eventos: reglas (core) y job (aplicar con guardas y
// topes) con fixtures. Sin red ni base: el cliente de Supabase y la IA son dobles.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { evaluarEvento, normalizarAlias, type FilaCalidad } from '@qps/core/events/calidad'
import {
  aplicarCorrecciones,
  categoriaPorPalabras,
  lugarCrudo,
  mapaDeAliases,
  revisarEventos,
  type FilaEventoCalidad,
} from '@/lib/calidad/revision'

const BASE: FilaEventoCalidad = {
  id: 'e0',
  slug: 'evento-0',
  title: 'Recital de rock',
  description: 'Banda local en vivo',
  short_description: null,
  start_date: '2026-11-07T00:30:00Z', // 21:30 en Salta
  image_url: 'https://ejemplo.com/flyer.jpg',
  category_id: 'cat-recitales',
  venue_id: 'v-1',
  price_min: 5000,
  price_max: 8000,
  is_free: false,
  scrape_source_key: 'entradauno',
  ai_metadata: null,
}

const fila = (id: string, cambios: Partial<FilaEventoCalidad>): FilaEventoCalidad => ({ ...BASE, id, slug: id, ...cambios })

const FIXTURES: FilaEventoCalidad[] = [
  BASE, // sano
  fila('sin-imagen', { image_url: null }),
  fila('sin-categoria-peña', { category_id: null, title: 'Peña con chacareras' }),
  fila('sin-categoria-ambigua', { category_id: null, title: 'Noche especial', description: 'Vení' }),
  fila('sin-lugar-alias', { venue_id: null, scrape_source_key: 'instagram-ai', ai_metadata: { extracted_data: { venue_name: 'La Vieja Estación' } } }),
  fila('sin-lugar-desconocido', { venue_id: null, ai_metadata: { extracted_data: { venue_name: 'Un bar nuevo' } } }),
  fila('gratis-con-evidencia', { price_min: 0, description: 'Entrada libre y gratuita' }),
  fila('precio-0-sin-evidencia', { price_min: 0, description: 'Show en vivo' }),
  fila('precio-15', { price_min: 15, price_max: 20 }),
  fila('max-menor', { price_min: 9000, price_max: 5000 }),
  fila('a-las-00', { start_date: '2026-11-07T03:00:00Z' }), // 00:00 en Salta
]

const ALIASES = mapaDeAliases([{ alias: 'La Vieja Estación', alias_normalized: null, venue_id: 'v-vieja' }])

describe('reglas (fixtures)', () => {
  const r = revisarEventos(FIXTURES, ALIASES)
  const de = (id: string) => r.hallazgos.filter((h) => h.eventoId === id).map((h) => [h.regla, h.propuesta.tipo])

  it('un evento sano no tiene hallazgos', () => {
    expect(de('e0')).toEqual([])
  })
  it('cada caso cae en su regla con la propuesta que corresponde', () => {
    expect(de('sin-imagen')).toEqual([['sin_imagen', 'revisar_a_mano']])
    expect(de('sin-categoria-peña')).toEqual([['sin_categoria', 'categoria_por_palabras']])
    expect(de('sin-categoria-ambigua')).toEqual([['sin_categoria', 'categoria_por_ia']])
    expect(de('sin-lugar-alias')).toEqual([['sin_lugar', 'vincular_lugar']])
    expect(de('sin-lugar-desconocido')).toEqual([['sin_lugar', 'revisar_a_mano']])
    expect(de('gratis-con-evidencia')).toEqual([['precio', 'marcar_gratis']])
    expect(de('precio-0-sin-evidencia')).toEqual([['precio', 'revisar_a_mano']])
    expect(de('precio-15')).toEqual([['precio', 'revisar_a_mano']])
    expect(de('max-menor')).toEqual([['precio', 'revisar_a_mano']])
    expect(de('a-las-00')).toEqual([['hora_00', 'revisar_a_mano']])
  })
  it('el conteo por regla separa lo automático de lo manual', () => {
    expect(r.conteo.precio).toEqual({ total: 4, automaticos: 1 })
    expect(r.conteo.sin_categoria).toEqual({ total: 2, automaticos: 1 })
    expect(r.conteo.sin_lugar).toEqual({ total: 2, automaticos: 1 })
    expect(r.conteo.hora_00.total).toBe(1)
  })
  it('auxiliares', () => {
    expect(normalizarAlias('  La Vieja  Estación! ')).toBe('la vieja estacion')
    expect(lugarCrudo({ extracted_data: { venue_name: ' Bar X ' } })).toBe('Bar X')
    expect(lugarCrudo('cualquier cosa')).toBeNull()
    expect(categoriaPorPalabras('Noche de chacareras', '', '')).toBe('penas')
    expect(categoriaPorPalabras('Algo', '', '')).toBeNull()
  })
  it('un evento gratis ya marcado no tiene hallazgo de precio', () => {
    const e: FilaCalidad = { ...BASE, price_min: 0, is_free: true }
    expect(evaluarEvento(e, { aliases: new Map(), categoriaPorPalabras: () => null })).toEqual([])
  })
})

/** Doble del query builder: anota cada update con sus guardas y devuelve una fila cambiada. */
function dobleSupabase() {
  const updates: { cambios: Record<string, unknown>; guardas: string[] }[] = []
  const cliente = {
    from: () => ({
      update: (cambios: Record<string, unknown>) => {
        const registro = { cambios, guardas: [] as string[] }
        updates.push(registro)
        const cadena: Record<string, unknown> = {}
        cadena.eq = (c: string, v: unknown) => (registro.guardas.push(`${c}=${String(v)}`), cadena)
        cadena.is = (c: string, v: unknown) => (registro.guardas.push(`${c} is ${String(v)}`), cadena)
        cadena.select = () => Promise.resolve({ data: [{ id: 'x' }], error: null })
        return cadena
      },
    }),
  }
  return { cliente, updates }
}

describe('aplicarCorrecciones', () => {
  const r = revisarEventos(FIXTURES, ALIASES)
  const filas = new Map(FIXTURES.map((f) => [f.id, f]))
  const categorias = new Map([
    ['penas', 'cat-penas'],
    ['teatro', 'cat-teatro'],
  ])

  it('aplica solo lo seguro, con la guarda del valor leído', async () => {
    const { cliente, updates } = dobleSupabase()
    const resumen = await aplicarCorrecciones(cliente, r.hallazgos, { categorias, filas })
    expect(resumen).toMatchObject({ gratis: 1, lugares: 1, categorias: 1, categoriasIa: 0, errores: 0 })
    expect(updates).toEqual([
      { cambios: { category_id: 'cat-penas' }, guardas: ['id=sin-categoria-peña', 'category_id is null'] },
      { cambios: { venue_id: 'v-vieja' }, guardas: ['id=sin-lugar-alias', 'venue_id is null'] },
      { cambios: { is_free: true }, guardas: ['id=gratis-con-evidencia', 'is_free=false'] },
    ])
  })

  it('la IA solo con clasificador, con tope, y una respuesta fuera de la lista no escribe', async () => {
    const { cliente, updates } = dobleSupabase()
    const clasificar = vi.fn(async () => 'teatro')
    const resumen = await aplicarCorrecciones(cliente, r.hallazgos, { categorias, filas, clasificar, topeIa: 1 })
    expect(clasificar).toHaveBeenCalledTimes(1)
    expect(resumen.categoriasIa).toBe(1)
    expect(updates.some((u) => u.cambios.category_id === 'cat-teatro' && u.guardas.includes('id=sin-categoria-ambigua'))).toBe(true)

    const otro = dobleSupabase()
    const r2 = await aplicarCorrecciones(otro.cliente, r.hallazgos, { categorias, filas, clasificar: async () => 'inventada', topeIa: 5 })
    expect(r2.categoriasIa).toBe(0)
  })

  it('respeta el tope de escrituras', async () => {
    const { cliente, updates } = dobleSupabase()
    const resumen = await aplicarCorrecciones(cliente, r.hallazgos, { categorias, filas, topeEscrituras: 1 })
    expect(updates).toHaveLength(1)
    expect(resumen.salteadosPorTope).toBe(2)
  })
})

describe('el job no está programado y el script es en seco por defecto', () => {
  it('ningún workflow ni cron lo corre', () => {
    const dir = join(process.cwd(), '..', '..', '.github', 'workflows')
    for (const f of readdirSync(dir)) expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(/revisar-calidad/)
    expect(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')).not.toMatch(/calidad/)
  })
  it('escribe solo después de --aplicar; la IA solo con --ia', () => {
    const s = readFileSync(join(process.cwd(), 'scripts', 'revisar-calidad.ts'), 'utf8')
    const corte = s.indexOf('if (!opciones.aplicar)')
    expect(corte).toBeGreaterThan(0)
    expect(s.slice(0, corte)).not.toMatch(/aplicarCorrecciones\(|\.update\(/)
    expect(s).toMatch(/if \(opciones\.ia\) \{\s*const \{ generarJsonDeTexto \}/)
  })
})
