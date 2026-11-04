// R-1 · /admin/uso y su CSV (Q5-13) de punta a punta, con Supabase de
// mentira: quién entra, qué se lee (con la sesión y con la service key, solo
// conteos) y qué sale (el HTML del panel y el CSV). Hasta hoy solo estaban
// las cuentas puras (tests/uso/panel.test.ts) y detectores de a11y.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Llamada = [string, ...unknown[]]
type Consulta = { tabla: string; cliente: 'sesion' | 'admin'; llamadas: Llamada[] }
type Resultado = { data?: unknown; error?: unknown; count?: number | null }

const estado = vi.hoisted(() => ({
  user: { id: 'admin-1' } as { id: string } | null,
  rol: 'ADMIN' as string | null,
  consultas: [] as Consulta[],
  responder: (() => ({ data: [], error: null })) as (c: Consulta) => Resultado,
  adminCreado: 0,
  redirecciones: [] as string[],
}))

function cliente(tipo: 'sesion' | 'admin') {
  return {
    auth: { getUser: async () => ({ data: { user: estado.user } }) },
    from(tabla: string) {
      const consulta: Consulta = { tabla, cliente: tipo, llamadas: [] }
      estado.consultas.push(consulta)
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'not', 'is', 'gte', 'order', 'range', 'limit']) {
        b[m] = (...a: unknown[]) => {
          consulta.llamadas.push([m, ...a])
          return b
        }
      }
      b.single = async () => {
        consulta.llamadas.push(['single'])
        if (tabla === 'profiles') return { data: estado.rol === null ? null : { role: estado.rol }, error: null }
        return estado.responder(consulta)
      }
      b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(estado.responder(consulta)).then(res, rej)
      return b
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => cliente('sesion'),
  createAdminClient: () => {
    estado.adminCreado++
    return cliente('admin')
  },
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    estado.redirecciones.push(url)
    throw new Error('redirect: ' + url)
  },
}))

import { GET as csv } from '@/app/admin/uso/csv/route'
import AdminUsoPage from '@/app/admin/uso/page'
import { leerDatosUso } from '@/lib/uso/datos'

// Martes 3/11/2026, 15:00 de Salta.
const AHORA = new Date('2026-11-03T18:00:00Z')

const llamada = (c: Consulta, m: string) => c.llamadas.find((l) => l[0] === m)
const desdeRango = (c: Consulta) => (llamada(c, 'range')?.[1] as number) ?? 0

/** Aperturas: tres hashes el 3/11 (uno con sesión), uno el 2/11 y uno viejo (fuera de los 30 días, dentro de la prueba). */
const APERTURAS = [
  { day: '2026-11-03', hash_semana: 'a', con_cuenta: true, plataforma: 'android' },
  { day: '2026-11-03', hash_semana: 'b', con_cuenta: false, plataforma: 'android' },
  { day: '2026-11-03', hash_semana: 'c', con_cuenta: false, plataforma: 'ios' },
  { day: '2026-11-02', hash_semana: 'a', con_cuenta: true, plataforma: 'android' },
  { day: '2026-09-20', hash_semana: 'z', con_cuenta: true, plataforma: 'android' },
]
const VISTAS = [
  { day: '2026-11-03', origin: 'web', views: 7 },
  { day: '2026-11-03', origin: 'app', views: 2 },
  { day: '2026-11-03', origin: 'compartido', views: 1 },
]

function responderConDatos(c: Consulta): Resultado {
  if (c.tabla === 'app_aperturas_diarias') return { data: desdeRango(c) === 0 ? APERTURAS : [], error: null }
  if (c.tabla === 'event_metrics_daily') return { data: desdeRango(c) === 0 ? VISTAS : [], error: null }
  // Los conteos (head: true): un número distinto por consulta para reconocerlos.
  if (c.tabla === 'push_tokens') return { count: llamada(c, 'not') ? 5 : 3, error: null, data: null }
  if (c.tabla === 'user_favorites') return { count: llamada(c, 'gte') ? 4 : 40, error: null, data: null }
  if (c.tabla === 'event_attendance') return { count: llamada(c, 'gte') ? 6 : 60, error: null, data: null }
  return { data: [], error: null }
}

let errores: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  estado.user = { id: 'admin-1' }
  estado.rol = 'ADMIN'
  estado.consultas = []
  estado.responder = responderConDatos
  estado.adminCreado = 0
  estado.redirecciones = []
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  errores = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('GET /admin/uso/csv: quién', () => {
  it.each([
    ['sin sesión', null, 'ADMIN'],
    ['con sesión de USER', { id: 'u1' }, 'USER'],
    ['con sesión sin perfil', { id: 'u1' }, null],
  ])('%s: 403 y no se lee nada (ni se crea el cliente de service role)', async (_n, user, rol) => {
    estado.user = user
    estado.rol = rol
    const r = await csv()
    expect(r.status).toBe(403)
    expect(estado.adminCreado).toBe(0)
    expect(estado.consultas.map((c) => c.tabla).filter((t) => t !== 'profiles')).toEqual([])
  })
})

describe('GET /admin/uso/csv: qué sale', () => {
  it('un admin baja el CSV del día de Salta, sin caché, con una fila por día de los últimos 30', async () => {
    const r = await csv()
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(r.headers.get('content-disposition')).toBe('attachment; filename="uso-2026-11-03.csv"')
    expect(r.headers.get('cache-control')).toBe('no-store')
    const lineas = (await r.text()).trimEnd().split('\n')
    expect(lineas[0]).toBe('dia,activos_app,aperturas_con_sesion,vistas_web,vistas_app')
    expect(lineas).toHaveLength(31)
    expect(lineas[1]!.startsWith('2026-10-05,')).toBe(true)
    // «compartido» cuenta como web (todo lo que no es la app).
    expect(lineas.at(-1)).toBe('2026-11-03,3,1,8,2')
    expect(lineas.at(-2)).toBe('2026-11-02,1,1,0,0')
    // La apertura del 20/9 (fuera de los 30 días) no aparece en ninguna fila.
    expect(lineas.join('\n')).not.toContain('2026-09-20')
  })

  it('el CSV no tiene ningún hash ni plataforma: solo cantidades por día', async () => {
    const texto = await (await csv()).text()
    for (const l of texto.trimEnd().split('\n').slice(1)) expect(l).toMatch(/^\d{4}-\d{2}-\d{2}(,\d+){4}$/)
  })
})

describe('leerDatosUso', () => {
  it('lee aperturas y vistas con la SESIÓN (RLS) y los totales con la service key, solo como conteos (head: true)', async () => {
    const datos = await leerDatosUso(AHORA)
    expect(datos.hoy).toBe('2026-11-03')
    expect(datos.dias).toHaveLength(30)
    expect(datos.totales).toEqual({ avisosConCuenta: 5, avisosSinCuenta: 3, guardados30d: 4, guardadosTotal: 40, voy30d: 6, voyTotal: 60 })
    const porTabla = (t: string) => estado.consultas.filter((c) => c.tabla === t)
    for (const t of ['app_aperturas_diarias', 'event_metrics_daily']) for (const c of porTabla(t)) expect(c.cliente).toBe('sesion')
    for (const t of ['push_tokens', 'user_favorites', 'event_attendance']) {
      for (const c of porTabla(t)) {
        expect(c.cliente).toBe('admin')
        expect(llamada(c, 'select')).toEqual(['select', 'id', { count: 'exact', head: true }])
      }
    }
    // Las asistencias que cuentan son las de «Voy».
    for (const c of porTabla('event_attendance')) expect(llamada(c, 'eq')).toEqual(['eq', 'kind', 'voy'])
  })

  it('las aperturas se leen desde el inicio de la prueba cerrada (26/10) aunque pasen las 8 semanas, y de a páginas', async () => {
    await leerDatosUso(AHORA)
    const aperturas = estado.consultas.filter((c) => c.tabla === 'app_aperturas_diarias')
    expect(aperturas).toHaveLength(2) // una página con filas y una vacía
    expect(llamada(aperturas[0]!, 'gte')).toEqual(['gte', 'day', '2026-09-08'])
    estado.consultas = []
    await leerDatosUso(new Date('2027-03-01T18:00:00Z'))
    const despues = estado.consultas.find((c) => c.tabla === 'app_aperturas_diarias')!
    expect(llamada(despues, 'gte')).toEqual(['gte', 'day', '2026-10-26'])
  })

  it('un conteo que falla da 0 y se loguea solo el código', async () => {
    estado.responder = (c) =>
      c.tabla === 'push_tokens' ? { count: null, data: null, error: { code: '42501', message: 'permiso denegado' } } : responderConDatos(c)
    const datos = await leerDatosUso(AHORA)
    expect(datos.totales.avisosConCuenta).toBe(0)
    expect(datos.totales.avisosSinCuenta).toBe(0)
    expect(datos.totales.guardadosTotal).toBe(40)
    expect(errores).toHaveBeenCalledWith('[uso] no se pudo contar avisos con cuenta', '42501')
    expect(JSON.stringify(errores.mock.calls)).not.toContain('permiso denegado')
  })
})

describe('/admin/uso: la página', () => {
  it('sin sesión de admin redirige y no lee nada', async () => {
    estado.rol = 'USER'
    await expect(AdminUsoPage()).rejects.toThrow('redirect: /?error=unauthorized')
    expect(estado.adminCreado).toBe(0)
  })

  it('un admin ve el resumen con los números de la base y el link al CSV', async () => {
    const html = renderToStaticMarkup(await AdminUsoPage())
    expect(html).toContain('href="/admin/uso/csv"')
    // Personas activas hoy (3), avisos (5 + 3), guardados (40, 4 en 30 días), «Voy» (60, 6), vistas (8 web + 2 app).
    const tarjeta = (titulo: string) => html.match(new RegExp(`${titulo}</p><p[^>]*>([^<]+)</p>(?:<p[^>]*>([^<]+)</p>)?`))
    expect(tarjeta('Personas activas hoy \\(app\\)')?.[1]).toBe('3')
    expect(tarjeta('Avisos activos')?.slice(1)).toEqual(['8', '5 con cuenta · 3 sin cuenta'])
    expect(tarjeta('Guardados')?.slice(1)).toEqual(['40', '4 en los últimos 30 días'])
    expect(tarjeta('Vistas de eventos \\(30 días\\)')?.slice(1)).toEqual(['10', '8 web · 2 app'])
    // «¿Llegamos al pedido de producción?»: el 3/11 van 9 días de prueba cerrada.
    expect(html).toContain('¿Llegamos al pedido de producción?')
    expect(html).toContain('9 días de prueba')
    expect(html).toContain('2026-W45: 3')
    // Ningún hash llega al HTML.
    expect(html).not.toMatch(/hash_semana|>z</)
  })
})
