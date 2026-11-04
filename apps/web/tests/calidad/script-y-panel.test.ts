// R-1 · La revisión de calidad (Q5-8) de punta a punta: el script
// `scripts/revisar-calidad.ts` corrido de verdad (importarlo corre `main()`)
// con Supabase y la IA de mentira, y el panel /admin/calidad renderizado.
// Antes: las reglas y `aplicarCorrecciones` (revision.test.ts) más un
// detector que leía en el fuente que el script es «en seco» por defecto.
// No hay cron: el job se corre a mano (lo fija revision.test.ts).
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Consulta = { tabla: string; op: 'select' | 'update'; valores?: Record<string, unknown>; filtros: [string, string, unknown][] }

const estado = vi.hoisted(() => ({
  consultas: [] as Consulta[],
  eventos: [] as Record<string, unknown>[],
  clientesCreados: [] as { url: string; clave: string }[],
  ia: [] as { schema: unknown }[],
  respuestaIa: 'teatro' as unknown,
  user: { id: 'admin-1' } as { id: string } | null,
  rol: 'ADMIN',
  redirecciones: [] as string[],
}))

function fake() {
  return {
    auth: { getUser: async () => ({ data: { user: estado.user } }) },
    from(tabla: string) {
      const c: Consulta = { tabla, op: 'select', filtros: [] }
      estado.consultas.push(c)
      const filas = () => {
        if (tabla === 'events') return c.filtros.some(([m, , v]) => m === 'range' && v !== 0) ? [] : estado.eventos
        if (tabla === 'venue_aliases') return c.filtros.some(([m, , v]) => m === 'range' && v !== 0) ? [] : [{ alias: 'La Vieja Estación', alias_normalized: null, venue_id: 'v-vieja' }]
        if (tabla === 'categories')
          return [
            { id: 'cat-penas', slug: 'penas' },
            { id: 'cat-teatro', slug: 'teatro' },
          ]
        return []
      }
      const b: Record<string, unknown> = {
        select: () => b,
        update: (v: Record<string, unknown>) => ((c.op = 'update'), (c.valores = v), b),
        order: () => b,
        returns: () => b,
        range: (d: number) => (c.filtros.push(['range', 'desde', d]), b),
        single: async () => ({ data: tabla === 'profiles' ? { role: estado.rol } : null, error: null }),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(c.op === 'update' ? { data: [{ id: 'x' }], error: null } : { data: filas(), error: null }).then(res, rej),
      }
      for (const m of ['eq', 'gte', 'is']) b[m] = (col: string, v: unknown) => (c.filtros.push([m, col, v]), b)
      return b
    },
  }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, clave: string) => {
    estado.clientesCreados.push({ url, clave })
    return fake()
  },
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake(), createAdminClient: () => fake() }))
vi.mock('@/lib/ai/gemini', () => ({
  generarJsonDeTexto: async (_sistema: string, _texto: string, schema: unknown) => {
    estado.ia.push({ schema })
    return { slug: estado.respuestaIa }
  },
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    estado.redirecciones.push(url)
    throw new Error('redirect: ' + url)
  },
}))
// El script lee .env.local / .env de la carpeta: en el test, que no haya nada.
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  return {
    ...real,
    readFileSync: (ruta: unknown, ...resto: unknown[]) => {
      if (typeof ruta === 'string' && /[/\\]\.env(\.local)?$/.test(ruta)) throw new Error('ENOENT')
      return (real.readFileSync as (...a: unknown[]) => unknown)(ruta, ...resto)
    },
  }
})

// Martes 3/11/2026, 15:00 de Salta.
const AHORA = new Date('2026-11-03T18:00:00Z')
const BASE = {
  id: 'e0',
  slug: 'evento-0',
  title: 'Recital de rock',
  description: 'Banda local en vivo',
  short_description: null,
  start_date: '2026-11-07T00:30:00Z',
  image_url: 'https://ejemplo.com/flyer.jpg',
  category_id: 'cat-recitales',
  venue_id: 'v-1',
  price_min: 5000,
  price_max: 8000,
  is_free: false,
  scrape_source_key: 'entradauno',
  ai_metadata: null,
}
const fila = (id: string, cambios: Record<string, unknown>) => ({ ...BASE, id, slug: id, ...cambios })
const EVENTOS = [
  BASE,
  fila('sin-imagen', { image_url: null, title: 'Muestra sin flyer' }),
  fila('sin-categoria-peña', { category_id: null, title: 'Peña con chacareras' }),
  fila('sin-categoria-ambigua', { category_id: null, title: 'Noche especial', description: 'Vení' }),
  fila('sin-lugar-alias', { venue_id: null, ai_metadata: { extracted_data: { venue_name: 'La Vieja Estación' } } }),
  fila('gratis-con-evidencia', { price_min: 0, description: 'Entrada libre y gratuita' }),
  fila('precio-15', { price_min: 15, price_max: 20, title: 'Precio raro' }),
]

let logs: string[]
let errores: string[]
let salida: { mock: { calls: unknown[][] } }
const ENV_ORIGINAL = { ...process.env }
const ARGV_ORIGINAL = process.argv

async function correrScript(args: string[], env: Record<string, string | undefined> = { NEXT_PUBLIC_SUPABASE_URL: 'http://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'clave-de-prueba' }) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  process.argv = ['node', 'scripts/revisar-calidad.ts', ...args]
  vi.resetModules()
  await import('@/scripts/revisar-calidad')
  // `main()` corre sola al importar: se espera a que termine (último log o salida con error).
  await vi.waitFor(() => {
    const termino = salida.mock.calls.length > 0 || logs.some((l) => /en seco|aplicado/.test(l))
    if (!termino) throw new Error('todavía corre')
  })
}

const updates = () => estado.consultas.filter((c) => c.op === 'update')

beforeEach(() => {
  estado.consultas = []
  estado.eventos = EVENTOS
  estado.clientesCreados = []
  estado.ia = []
  estado.respuestaIa = 'teatro'
  estado.user = { id: 'admin-1' }
  estado.rol = 'ADMIN'
  estado.redirecciones = []
  logs = []
  errores = []
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(' ')))
  vi.spyOn(console, 'table').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errores.push(a.map(String).join(' ')))
  salida = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  process.argv = ARGV_ORIGINAL
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (ENV_ORIGINAL[k] === undefined) delete process.env[k]
    else process.env[k] = ENV_ORIGINAL[k]
  }
})

describe('scripts/revisar-calidad.ts', () => {
  it('sin opciones: en seco. Lee los publicados desde ayer y no escribe nada ni llama a la IA', async () => {
    await correrScript([])
    expect(salida).not.toHaveBeenCalled()
    const eventos = estado.consultas.find((c) => c.tabla === 'events')!
    expect(eventos.filtros).toContainEqual(['eq', 'status', 'PUBLISHED'])
    expect(eventos.filtros).toContainEqual(['gte', 'start_date', '2026-11-02T18:00:00.000Z'])
    expect(updates()).toEqual([])
    expect(estado.ia).toEqual([])
    expect(logs[0]).toBe('[calidad] 7 eventos publicados vigentes revisados')
    expect(logs.at(-1)).toMatch(/en seco: no se escribió nada/)
  })

  it('--aplicar: escribe solo lo seguro (gratis, lugar por alias, categoría por palabras), con guardas, y sin IA', async () => {
    await correrScript(['--aplicar'])
    expect(salida).not.toHaveBeenCalled()
    expect(updates().map((u) => [u.valores, u.filtros])).toEqual([
      [{ category_id: 'cat-penas' }, [['eq', 'id', 'sin-categoria-peña'], ['is', 'category_id', null]]],
      [{ venue_id: 'v-vieja' }, [['eq', 'id', 'sin-lugar-alias'], ['is', 'venue_id', null]]],
      [{ is_free: true }, [['eq', 'id', 'gratis-con-evidencia'], ['eq', 'is_free', false]]],
    ])
    expect(estado.ia).toEqual([])
    expect(logs.at(-1)).toMatch(/^\[calidad\] aplicado/)
  })

  it('--aplicar --ia: clasifica los ambiguos con la lista cerrada de slugs y respeta --tope-ia', async () => {
    estado.eventos = [...EVENTOS, fila('otra-ambigua', { category_id: null, title: 'Algo', description: 'Vení' })]
    await correrScript(['--aplicar', '--ia', '--tope-ia', '1'])
    expect(estado.ia).toHaveLength(1)
    expect(estado.ia[0]!.schema).toEqual({ type: 'object', properties: { slug: { type: 'string', enum: ['penas', 'teatro'] } }, required: ['slug'] })
    expect(updates().some((u) => u.valores?.category_id === 'cat-teatro')).toBe(true)
  })

  it('--ia: una respuesta fuera de la lista no escribe', async () => {
    estado.respuestaIa = 'inventada'
    await correrScript(['--aplicar', '--ia'])
    expect(estado.ia.length).toBeGreaterThan(0)
    expect(updates().map((u) => u.valores)).toEqual([{ category_id: 'cat-penas' }, { venue_id: 'v-vieja' }, { is_free: true }])
  })

  it.each([
    [['--ia'], '--ia solo tiene sentido con --aplicar'],
    [['--aplicar', '--tope-ia', '99'], '--tope-ia va de 0 a 50'],
    [['--borrar-todo'], 'opción desconocida: --borrar-todo'],
  ])('%j: sale con 1, sin crear el cliente ni escribir', async (args, mensaje) => {
    await correrScript(args)
    expect(salida).toHaveBeenCalledWith(1)
    expect(errores).toEqual([`[calidad] falló: ${mensaje}`])
    expect(estado.clientesCreados).toEqual([])
  })

  it('sin las variables de la base: sale con 1 y no imprime ningún valor de entorno', async () => {
    await correrScript([], { NEXT_PUBLIC_SUPABASE_URL: 'http://supabase.test', SUPABASE_SERVICE_ROLE_KEY: undefined })
    expect(salida).toHaveBeenCalledWith(1)
    expect(errores.join('\n')).toBe('[calidad] falló: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
    expect([...errores, ...logs].join('\n')).not.toContain('supabase.test')
  })
})

describe('/admin/calidad', () => {
  async function pagina(regla?: string) {
    const { default: AdminCalidadPage } = await import('@/app/admin/calidad/page')
    return AdminCalidadPage({ searchParams: Promise.resolve(regla ? { regla } : {}) })
  }

  it('sin sesión: al ingreso; con sesión que no es admin: afuera; y no se leen eventos', async () => {
    estado.user = null
    await expect(pagina()).rejects.toThrow('redirect: /auth/login?redirect=/admin/calidad')
    estado.user = { id: 'u1' }
    estado.rol = 'USER'
    await expect(pagina()).rejects.toThrow('redirect: /?error=unauthorized')
    expect(estado.consultas.some((c) => c.tabla === 'events')).toBe(false)
  })

  it('los conteos por regla y, por defecto, los casos de «Precio dudoso» con su link y su propuesta', async () => {
    const html = renderToStaticMarkup(await pagina())
    expect(html).toContain('7 eventos publicados desde ayer en adelante')
    expect(html).toMatch(/aria-current="page"[^>]*><span[^>]*>Precio dudoso<\/span><span[^>]*>2<\/span><span[^>]*>1 automáticos<\/span>/)
    expect(html).toContain('Precio dudoso: 2 casos')
    expect(html).toContain('href="/evento/gratis-con-evidencia"')
    expect(html).toContain('Automático: marcar gratis')
    expect(html).toContain('href="/evento/precio-15"')
    // Solo lectura: el panel nunca escribe.
    expect(updates()).toEqual([])
  })

  it('?regla=sin_imagen muestra esos casos; una regla inventada vuelve a «precio»', async () => {
    const html = renderToStaticMarkup(await pagina('sin_imagen'))
    expect(html).toContain('Sin imagen: 1 casos')
    expect(html).toContain('href="/evento/sin-imagen"')
    expect(renderToStaticMarkup(await pagina('<script>'))).toContain('Precio dudoso: 2 casos')
  })
})
