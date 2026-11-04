// R-1 · La lista «Lugares para chicos» de la app (Q5-4) montada con React DOM
// (la copia de la raíz) sobre un doble mínimo de `react-native` (con un
// `FlatList` que dibuja encabezado, filas, vacío y pie): los datos y la
// ubicación son dobles. Se mira: los filtros (tipo, «Gratis») cambian la
// lista y el conteo que se anuncia, «Quitar filtros», «Elegí tu barrio»
// ordena por cercanía (sin pedir el permiso de ubicación), con el permiso ya
// concedido ordena por la ubicación aproximada, tocar un lugar abre su ficha
// y el error tiene «Reintentar». Antes, la pantalla solo tenía detectores.
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { React, crearRaiz, type RaizDeReact } from './dobles/react-raiz'
import LugaresChicos from '@/app/lugares-chicos/index'

// El teléfono en castellano desde antes de importar (el idioma por omisión
// del contexto se calcula al cargar `lib/i18n`).
const localeOriginal = vi.hoisted(() => {
  const original = Intl.DateTimeFormat.prototype.resolvedOptions
  Intl.DateTimeFormat.prototype.resolvedOptions = function () {
    return { ...original.call(this), locale: 'es-AR' }
  }
  return original
})

const estado = vi.hoisted(() => ({
  resultado: { ok: true, lugares: [] } as unknown,
  ubicacion: { ok: false, motivo: 'sin-permiso' } as unknown,
  rutas: [] as string[],
  conteos: [] as string[],
}))

vi.mock('react', async () => {
  const { React: R } = await import('./dobles/react-raiz')
  return { ...R, default: R }
})
vi.mock('react/jsx-runtime', async () => (await import('./dobles/react-raiz')).jsxRuntime)
vi.mock('react/jsx-dev-runtime', async () => (await import('./dobles/react-raiz')).jsxDevRuntime)
vi.mock('react-native', async () => {
  const { React: R } = await import('./dobles/react-raiz')
  type P = Record<string, unknown> & { children?: unknown }
  const a = (p: P) => ({
    role: p.accessibilityRole as string | undefined,
    'aria-label': p.accessibilityLabel as string | undefined,
    'aria-selected': (p.accessibilityState as { selected?: boolean } | undefined)?.selected,
  })
  const caja = (tag: string) => (p: P) => R.createElement(tag, a(p), p.children as never)
  const FlatList = (p: { data: unknown[]; renderItem: (i: { item: unknown }) => unknown; keyExtractor: (i: unknown) => string; ListHeaderComponent?: unknown; ListEmptyComponent?: unknown; ListFooterComponent?: unknown }) =>
    R.createElement(
      'section',
      null,
      p.ListHeaderComponent as never,
      p.data.length === 0
        ? (p.ListEmptyComponent as never)
        : R.createElement('ul', { id: 'lista' }, ...p.data.map((item) => R.createElement('li', { key: p.keyExtractor(item) }, p.renderItem({ item }) as never))),
      p.ListFooterComponent as never,
    )
  return {
    View: caja('div'),
    ScrollView: caja('div'),
    Text: caja('span'),
    Pressable: (p: P) => R.createElement('button', { ...a(p), onClick: p.onPress as never }, p.children as never),
    FlatList,
    StyleSheet: { create: <T,>(e: T) => e, flatten: (e: unknown) => e },
    Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
    useColorScheme: () => 'dark',
  }
})
vi.mock('expo-location', () => ({ Accuracy: { Balanced: 3 } }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: (r: string) => estado.rutas.push(r) }) }))
vi.mock('@/components/Icono', () => ({ Icono: () => null }))
vi.mock('@/components/EstadoCarga', async () => {
  const { React: R } = await import('./dobles/react-raiz')
  return {
    Cargando: () => R.createElement('p', { id: 'cargando' }, 'cargando'),
    ErrorCarga: (p: { mensaje: string; onReintentar: () => void }) => R.createElement('button', { id: 'error', onClick: p.onReintentar }, p.mensaje),
    Vacio: (p: { mensaje: string; textoAccion?: string; onAccion?: () => void }) =>
      R.createElement('div', { id: 'vacio' }, p.mensaje, p.textoAccion ? R.createElement('button', { 'aria-label': p.textoAccion, onClick: p.onAccion }, p.textoAccion) : null),
  }
})
vi.mock('@/lib/anunciar-conteo-hook', () => ({
  // Lo que la pantalla le pasa al hook (el hook real, con sus esperas, se prueba aparte).
  useAnunciarConteo: (e: { conteo: string | null; titulo: string | null } | null) => {
    const linea = e ? [e.conteo, e.titulo].filter(Boolean).join(' · ') : null
    if (linea && estado.conteos.at(-1) !== linea) estado.conteos.push(linea)
  },
}))
vi.mock('@/lib/datos/lugares-chicos', () => ({ obtenerLugaresChicos: async () => estado.resultado }))
vi.mock('@/lib/ubicacion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ubicacion')>()),
  ubicacionSiYaConcedida: async () => estado.ubicacion,
}))

type Global = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean; document: Document }
const requerir = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../../package.json'))
let raiz: RaizDeReact | null = null
let div: HTMLElement

const id = (n: number) => `0000000${n}-0000-4000-8000-000000000000`
const lugar = (n: number, nombre: string, extra: Record<string, unknown>) => ({
  id: `l${n}`,
  venueId: id(n),
  nombre,
  direccion: 'Calle 1',
  slug: null,
  lat: -24.79,
  lng: -65.41,
  tipo: 'plaza_juegos',
  descripcion: null,
  edadMin: null,
  edadMax: null,
  horarios: { version: 1, semana: {}, siempre_abierto: true },
  acceso: 'gratis',
  notaPrecio: null,
  techado: null,
  tieneRampa: null,
  tieneBanoAdaptado: null,
  tieneCambiador: null,
  telefono: null,
  web: null,
  instagram: null,
  verificadoAt: '2026-10-20T12:00:00Z',
  deOsm: false,
  ...extra,
})
// Una plaza en el Centro, un pelotero (pago) en Tres Cerritos y una plaza en Limache.
const LUGARES = [
  lugar(1, 'Plaza Centro', { lat: -24.7883, lng: -65.4106 }),
  lugar(2, 'Pelotero Norte', { tipo: 'pelotero', acceso: 'pago', lat: -24.7686, lng: -65.4003 }),
  lugar(3, 'Plaza Sur', { lat: -24.8185, lng: -65.4148 }),
]

async function montar() {
  crearRaiz()
  const doc = (globalThis as Global).document
  div = doc.createElement('div')
  doc.body.appendChild(div)
  const { createRoot } = requerir('react-dom/client') as { createRoot: (c: unknown) => RaizDeReact }
  raiz = createRoot(div)
  await React.act(async () => {
    raiz!.render(React.createElement(LugaresChicos))
  })
}
const nombres = () => [...div.querySelectorAll('#lista li button')].map((b) => b.querySelector('span')?.textContent)
const boton = (etiqueta: string) => div.querySelector(`button[aria-label="${etiqueta}"]`) as HTMLButtonElement
async function tocar(etiqueta: string) {
  await React.act(async () => boton(etiqueta).click())
}

beforeEach(() => {
  ;(globalThis as Global).IS_REACT_ACT_ENVIRONMENT = true
  estado.resultado = { ok: true, lugares: LUGARES }
  estado.ubicacion = { ok: false, motivo: 'sin-permiso' }
  estado.rutas = []
  estado.conteos = []
})
afterEach(async () => {
  if (raiz) await React.act(async () => raiz!.unmount())
  raiz = null
  ;(globalThis as Global).document.body.innerHTML = ''
})
afterAll(() => {
  Intl.DateTimeFormat.prototype.resolvedOptions = localeOriginal
})

describe('Lugares para chicos (app): la lista', () => {
  it('muestra los publicados con su conteo; tocar uno abre su ficha', async () => {
    await montar()
    expect(nombres()).toHaveLength(3)
    expect(div.textContent).toContain('3 lugares')
    await React.act(async () => (div.querySelector('#lista li button') as HTMLButtonElement).click())
    expect(estado.rutas).toEqual([`/lugares-chicos/${id(1)}`])
  })

  it('«Gratis» deja los gratis; el tipo «Pelotero» deja el pelotero; el conteo se anuncia', async () => {
    await montar()
    await tocar('Solo lugares gratis')
    expect(nombres()).toEqual(expect.arrayContaining(['Plaza Centro', 'Plaza Sur']))
    expect(nombres()).toHaveLength(2)
    expect(boton('Solo lugares gratis').getAttribute('aria-selected')).toBe('true')
    await tocar('Solo lugares gratis')
    await tocar('Pelotero')
    expect(nombres()).toEqual(['Pelotero Norte'])
    expect(estado.conteos).toEqual(['3 lugares', '2 lugares', '3 lugares', '1 lugar'])
  })

  it('sin resultados: el vacío con «Quitar filtros», que vuelve a mostrar todo', async () => {
    await montar()
    await tocar('Pelotero')
    await tocar('Solo lugares gratis')
    expect(div.querySelector('#vacio')?.textContent).toContain('No hay lugares con estos filtros.')
    expect(div.textContent).toContain('Ningún lugar con estos filtros')
    await tocar('Quitar filtros')
    expect(nombres()).toHaveLength(3)
  })

  it('sin permiso de ubicación: «Elegí tu barrio» ordena por cercanía al barrio elegido', async () => {
    await montar()
    expect(div.textContent).not.toContain('tu ubicación aproximada')
    await tocar('Elegí tu barrio para ordenar por cercanía')
    await tocar('Limache')
    expect(nombres()[0]).toBe('Plaza Sur')
    expect(estado.conteos.at(-1)).toBe('3 lugares · Ordenados por cercanía a Limache')
    expect(boton('Barrio: Limache. Cambiar')).not.toBeNull()
    await tocar('Barrio: Limache. Cambiar')
    await tocar('Tres Cerritos')
    expect(nombres()[0]).toBe('Pelotero Norte')
  })

  it('con el permiso ya concedido: ordena por la ubicación aproximada y no ofrece barrio', async () => {
    estado.ubicacion = { ok: true, latitud: -24.82, longitud: -65.41 }
    await montar()
    expect(div.textContent).toContain('Ordenados por cercanía a tu ubicación aproximada.')
    expect(nombres()[0]).toBe('Plaza Sur')
    expect(boton('Elegí tu barrio para ordenar por cercanía')).toBeNull()
  })

  it('sin lugares cargados todavía: el vacío sin «Quitar filtros»', async () => {
    estado.resultado = { ok: true, lugares: [] }
    await montar()
    expect(div.querySelector('#vacio')?.textContent).toBe('Todavía no hay lugares verificados. Estamos cargando los primeros.')
  })

  it('si falla la carga: el error con «Reintentar»', async () => {
    estado.resultado = { ok: false, error: 'x' }
    await montar()
    expect(div.querySelector('#error')?.textContent).toBe('No pudimos cargar los lugares para chicos. Revisá tu conexión.')
    estado.resultado = { ok: true, lugares: LUGARES }
    await React.act(async () => (div.querySelector('#error') as HTMLButtonElement).click())
    expect(nombres()).toHaveLength(3)
  })
})
