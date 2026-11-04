// Q6-4 · Banco de evaluación de IA: el modo en seco no llama a nadie (ni
// fetch ni el SDK de Gemini), arma los pedidos reales, y el modo --real pide
// confirmación, falla claro sin claves y respeta el tope. Sin red y sin gasto:
// los proveedores del modo real son dobles.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ construido: vi.fn() }))
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function GoogleGenAI() {
    sdk.construido()
    throw new Error('el banco en seco no puede crear el cliente de Gemini')
  }),
}))

import { cargarBanco, costoMaximoEstimado, ejecutarCli, leerOpciones, type DependenciasCli } from '@/lib/ia/evaluacion/cli'
import { pedidoClasificacion, pedidoFlyer, pedidoTraduccion, eventoParaTraducir } from '@/lib/ia/evaluacion/prompts'
import { clavesFaltantes, ejecutarReal } from '@/lib/ia/evaluacion/real'
import { evaluarEnSeco } from '@/lib/ia/evaluacion/seco'
import { textoParaElModelo } from '@/lib/ai/traducir-evento'
import { INSTRUCCION_CLASIFICACION } from '@/lib/ai/clasificar-categoria'
import type { ProveedorIA, ResultadoJson } from '@/lib/ia/tipos'

const WEB = process.cwd()
const DIR = join(WEB, '..', '..', 'docs', 'evaluacion-ia')

let fetchGlobal: { mock: { calls: unknown[] } }
beforeEach(() => {
  fetchGlobal = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    throw new Error('el banco en seco no puede usar fetch')
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  sdk.construido.mockClear()
})

function deps(extra: Partial<DependenciasCli> = {}) {
  const salida: string[] = []
  const errores: string[] = []
  const fetchDoble = vi.fn(async () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { status: 200, headers: { 'content-type': 'image/jpeg' } }))
  const d: DependenciasCli = {
    cwd: WEB,
    entorno: {},
    fetch: fetchDoble,
    log: (l) => salida.push(l),
    error: (l) => errores.push(l),
    leerEnvLocal: () => ({}),
    escribirArchivo: vi.fn(),
    ...extra,
  }
  return { d, salida, errores, fetchDoble }
}

function banco() {
  const { entrada, problemas } = cargarBanco(DIR)
  expect(problemas).toEqual([])
  return entrada!
}

describe('modo en seco (por defecto)', () => {
  it('no llama a fetch ni crea el cliente del SDK, y termina bien', async () => {
    const { d, salida, errores, fetchDoble } = deps()
    expect(await ejecutarCli([], d)).toBe(0)
    expect(errores).toEqual([])
    expect(fetchDoble).not.toHaveBeenCalled()
    expect(fetchGlobal).not.toHaveBeenCalled()
    expect(sdk.construido).not.toHaveBeenCalled()
    const texto = salida.join('\n')
    expect(texto).toMatch(/en seco \(no se llamó a ningún modelo\)/)
    expect(texto).toMatch(/Total mensual estimado/)
    expect(texto).toMatch(/gemini-3\.5-flash-lite/)
    expect(texto).toMatch(/claude-haiku-4-5/)
  })

  it('con --salida guarda el informe en JSON', async () => {
    const { d } = deps()
    expect(await ejecutarCli(['--salida', 'informe.json'], d)).toBe(0)
    const [ruta, contenido] = vi.mocked(d.escribirArchivo!).mock.calls[0]
    expect(ruta).toMatch(/informe\.json$/)
    expect(JSON.parse(contenido).modo).toBe('seco')
  })

  it('el informe estima tokens y costo para cada uso y modelo, y el autocontrol da 100 %', async () => {
    const inf = await evaluarEnSeco(banco())
    expect(inf.costos).toHaveLength(3 * inf.totalMensual.length)
    for (const c of inf.costos) {
      expect(c.tokensEntradaPromedio, `${c.uso} ${c.modelo}`).toBeGreaterThan(0)
      expect(c.tokensSalidaPromedio).toBeGreaterThan(0)
      expect(c.usdPorMes).toBeCloseTo(c.usdPorLlamada * c.llamadasPorMes, 12)
    }
    // Los flyers llevan imagen: cuestan más que una clasificación.
    const de = (uso: string, modelo: string) => inf.costos.find((c) => c.uso === uso && c.modelo === modelo)!
    expect(de('flyers', 'claude-haiku-4-5').tokensEntradaPromedio).toBeGreaterThan(de('clasificacion', 'claude-haiku-4-5').tokensEntradaPromedio + 1000)
    expect(inf.autocontrol.flyers.total.pct).toBe(100)
    expect(inf.autocontrol.flyers.porCampo.categoria.pct).toBe(100)
    expect(inf.autocontrol.traduccion.promedio).toBe(4)
    expect(inf.autocontrol.traduccion.validasProduccion?.pct).toBe(100)
    expect(inf.autocontrol.clasificacion.correctas.pct).toBe(100)
    expect(inf.lineaBase.flyers.length).toBeGreaterThan(0)
  })

  it('un fixture inválido corta con la lista de problemas', async () => {
    const { d, errores } = deps()
    expect(await ejecutarCli(['--dir', join('tests', 'ia')], d)).toBe(1)
    expect(errores.join('\n')).toMatch(/no pasan la validación/)
  })
})

describe('los pedidos son los reales de la app', () => {
  it('flyer: el prompt de sistema de llamadas-ia con la cuenta que publicó, imagen y caption', async () => {
    const { banco: b } = banco()
    const caso = b.flyers.casos[0]
    const p = await pedidoFlyer(caso)
    expect(p.conImagen).toBe(true)
    expect(p.sistema).toContain(`@${caso.cuenta}`)
    expect(p.sistema).toMatch(/MODO CIEGO/)
    expect(p.prompt).toContain(caso.caption!)
    expect(p.maxTokens).toBe(4096)
    expect(p.esquema).toMatchObject({ type: 'OBJECT' })
  })
  it('traducción: el texto de textoParaElModelo y el esquema title_en/description_en', async () => {
    const { banco: b } = banco()
    const caso = b.traduccion.casos[0]
    const p = await pedidoTraduccion(caso)
    expect(p.prompt).toBe(textoParaElModelo(eventoParaTraducir(caso)))
    expect(p.sistema).toMatch(/NEVER translate proper names/)
    expect(JSON.stringify(p.esquema)).toContain('title_en')
  })
  it('clasificación: la instrucción de revisar-calidad y la lista de slugs', async () => {
    const { banco: b } = banco()
    const p = await pedidoClasificacion(b.clasificacion.casos[0], b.clasificacion.categorias!)
    expect(p.sistema).toBe(INSTRUCCION_CLASIFICACION)
    // El mismo texto que tenía revisar-calidad.ts antes de sacarlo a lib/ai/clasificar-categoria.ts.
    expect(INSTRUCCION_CLASIFICACION).toBe('Clasificás eventos culturales de Salta (Argentina) en UNA categoría de la lista. Respondé solo el slug.')
    expect(p.prompt).toMatch(/^Título: /)
    expect(p.maxTokens).toBe(256)
    expect(JSON.stringify(p.esquema)).toContain('"penas"')
  })
})

describe('opciones', () => {
  it('lee las combinaciones válidas', () => {
    expect(leerOpciones([])).toMatchObject({ real: false, proveedores: null, tope: 5 })
    expect(leerOpciones(['--real', '--proveedor', 'ambos', '--tope', '3', '--uso', 'flyers', '--confirmo-costo'])).toMatchObject({
      real: true,
      proveedores: ['gemini', 'claude'],
      tope: 3,
      usos: ['flyers'],
      confirmoCosto: true,
    })
  })
  it.each([
    [['--real'], /necesita --proveedor/],
    [['--proveedor', 'claude'], /solo para --real/],
    [['--real', '--proveedor', 'openai'], /gemini, claude o ambos/],
    [['--real', '--proveedor', 'claude', '--tope', '100'], /de 1 a 30/],
    [['--uso', 'todo'], /--uso/],
    [['--salida'], /necesita un valor/],
    [['--rapido'], /opción desconocida/],
  ])('rechaza %j', (argv, error) => {
    expect(() => leerOpciones(argv)).toThrow(error)
  })
})

describe('modo --real: salvaguardas (sin llamar a nadie)', () => {
  it('sin --confirmo-costo muestra el costo máximo estimado y no llama', async () => {
    const { d, salida, errores, fetchDoble } = deps({ entorno: { GEMINI_API_KEY: 'clave-falsa' } })
    expect(await ejecutarCli(['--real', '--proveedor', 'gemini'], d)).toBe(2)
    expect(salida.join('\n')).toMatch(/Costo estimado máximo: USD/)
    expect(errores.join('\n')).toMatch(/--confirmo-costo/)
    expect(fetchDoble).not.toHaveBeenCalled()
    expect(fetchGlobal).not.toHaveBeenCalled()
    expect(sdk.construido).not.toHaveBeenCalled()
  })

  it('sin la clave falla claro, nombra la variable y no llama', async () => {
    const { d, errores, fetchDoble } = deps({ entorno: { GEMINI_API_KEY: 'clave-falsa' } })
    expect(await ejecutarCli(['--real', '--proveedor', 'ambos', '--confirmo-costo'], d)).toBe(1)
    const texto = errores.join('\n')
    expect(texto).toMatch(/faltan ANTHROPIC_API_KEY/)
    expect(texto).toMatch(/No se hizo ninguna llamada/)
    expect(texto).not.toContain('clave-falsa')
    expect(fetchDoble).not.toHaveBeenCalled()
    expect(sdk.construido).not.toHaveBeenCalled()
  })

  it('las claves vacías cuentan como faltantes', () => {
    expect(clavesFaltantes(['gemini', 'claude'], { GEMINI_API_KEY: '  ', ANTHROPIC_API_KEY: 'x' })).toEqual(['GEMINI_API_KEY'])
  })

  it('ejecutarReal también se niega sin claves', async () => {
    const e = banco()
    await expect(ejecutarReal(e.banco, e.precios, { proveedores: ['claude'], usos: ['clasificacion'], tope: 1 }, { entorno: {}, fetch: vi.fn() })).rejects.toThrow(
      /ANTHROPIC_API_KEY/,
    )
  })

  it('el costo máximo usa el tope y el modelo de cada proveedor', async () => {
    const inf = await evaluarEnSeco(banco())
    const uno = costoMaximoEstimado(inf, { usos: ['clasificacion'], tope: 1, proveedores: ['claude'] }, {})
    const diez = costoMaximoEstimado(inf, { usos: ['clasificacion'], tope: 10, proveedores: ['claude'] }, {})
    expect(diez.usd).toBeCloseTo(uno.usd * 10, 12)
    expect(costoMaximoEstimado(inf, { usos: ['flyers'], tope: 1, proveedores: ['claude'] }, { IA_MODELO_CLAUDE: 'claude-modelo-sin-precio' }).sinPrecio).toEqual([
      'claude-modelo-sin-precio',
    ])
  })
})

describe('modo --real con proveedores dobles', () => {
  function proveedorDoble(nombre: 'gemini' | 'claude', modelo: string) {
    const llamadas: string[] = []
    const uso = { proveedor: nombre, modelo, tokensEntrada: 1000, tokensSalida: 100, latenciaMs: 1 }
    const p: ProveedorIA = {
      nombre,
      modelo,
      generarTexto: vi.fn(),
      async generarJson<T>(pet: { sistema?: string; prompt: string }): Promise<ResultadoJson<T>> {
        llamadas.push('json')
        if (pet.sistema === INSTRUCCION_CLASIFICACION) return { ok: true, datos: { slug: 'penas' } as T, uso }
        return { ok: true, datos: { title_en: 'Event', description_en: 'Event automatically imported from entradauno' } as T, uso }
      },
      async generarJsonDesdeImagen<T>(): Promise<ResultadoJson<T>> {
        llamadas.push('imagen')
        return { ok: true, datos: { date: '2026-07-03', start_time: '20:00', venue_name: 'Peppers', price: 0, category_slug: 'boliches' } as T, uso }
      },
    }
    return { p, llamadas }
  }

  it('respeta el tope, baja las imágenes con el fetch inyectado, mide y cobra con precios.md', async () => {
    const dobles: Record<string, ReturnType<typeof proveedorDoble>> = {}
    const { d, salida, fetchDoble } = deps({
      entorno: { GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'c' },
      crearProveedor: (nombre, modelo) => (dobles[nombre] = proveedorDoble(nombre, modelo)).p,
    })
    expect(await ejecutarCli(['--real', '--proveedor', 'ambos', '--confirmo-costo', '--tope', '2'], d)).toBe(0)
    expect(dobles.gemini.llamadas).toEqual(['imagen', 'imagen', 'json', 'json', 'json', 'json'])
    expect(dobles.claude.llamadas).toHaveLength(6)
    expect(fetchDoble).toHaveBeenCalledTimes(4) // 2 imágenes × 2 proveedores
    expect(fetchGlobal).not.toHaveBeenCalled()
    expect(sdk.construido).not.toHaveBeenCalled()
    const texto = salida.join('\n')
    expect(texto).toMatch(/REAL \(tope 2/)
    expect(texto).toMatch(/Tokens medidos/)
  })

  it('si el proveedor no tiene crédito corta ese proveedor', async () => {
    const e = banco()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let llamadas = 0
    const sinCredito: ProveedorIA = {
      nombre: 'claude',
      modelo: 'claude-haiku-4-5',
      generarTexto: vi.fn(),
      generarJson: vi.fn(),
      async generarJsonDesdeImagen() {
        llamadas++
        return { ok: false, error: { codigo: 'sin_credito', mensaje: 'IA claude: sin crédito' }, uso: { proveedor: 'claude', modelo: 'claude-haiku-4-5', tokensEntrada: null, tokensSalida: null, latenciaMs: 1 } }
      },
    }
    const fetchImg = vi.fn(async () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200 }))
    const r = await ejecutarReal(e.banco, e.precios, { proveedores: ['claude'], usos: ['flyers', 'traduccion'], tope: 5 }, {
      entorno: { ANTHROPIC_API_KEY: 'c' },
      fetch: fetchImg,
      crearProveedor: () => sinCredito,
      registrar: () => {},
    })
    expect(llamadas).toBe(1)
    expect(r.resultados[0].cortado).toBe('sin_credito')
    expect(r.resultados[0].porUso.traduccion).toBeUndefined()
  })
})

describe('el banco no está programado y solo gasta con --real', () => {
  it('ningún workflow ni cron lo corre', () => {
    const dir = join(WEB, '..', '..', '.github', 'workflows')
    for (const f of readdirSync(dir)) expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(/evaluar-ia/)
    expect(readFileSync(join(WEB, 'vercel.json'), 'utf8')).not.toMatch(/evaluar/)
  })
  it('el script delega en lib/ia/evaluacion y no menciona el SDK ni las URLs de los proveedores', () => {
    const s = readFileSync(join(WEB, 'scripts', 'evaluar-ia.ts'), 'utf8')
    expect(s).toMatch(/ejecutarCli\(process\.argv\.slice\(2\)/)
    expect(s).not.toMatch(/@google\/genai|api\.anthropic\.com|generativelanguage/)
  })
})
