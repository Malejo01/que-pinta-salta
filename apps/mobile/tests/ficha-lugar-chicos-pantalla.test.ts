// R-1 · La ficha de un lugar para chicos en la app (Q5-4) con «Seguir» (Q5-6),
// montada con React DOM (la copia de la raíz) sobre un doble mínimo de
// `react-native`: la pantalla real y el `BotonSeguir` real; los datos
// (`obtenerLugaresChicos`), `siguesElLugar` y `cambiarSeguimiento` son dobles.
// Se mira: qué lugar muestra, que «Seguir» aparece recién cuando se sabe si
// ya lo sigue, que seguir/dejar de seguir manda el venue correcto, que sin
// sesión lleva a Cuenta, «Cómo llegar» y los contactos, y los estados de
// error / ya no publicado. Antes había solo detectores sobre el fuente.
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { React, crearRaiz, type RaizDeReact } from './dobles/react-raiz'
import FichaLugarChicos from '@/app/lugares-chicos/[id]'

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
  sigue: false as boolean,
  sesion: { session: { user: { id: 'u1' } } } as { session: null | { user: { id: string } } },
  cambios: [] as unknown[][],
  abiertas: [] as string[],
  rutas: [] as string[],
  soltarSigue: null as null | (() => void),
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
  return {
    View: caja('div'),
    ScrollView: caja('div'),
    Text: caja('span'),
    Pressable: (p: P) => R.createElement('button', { ...a(p), disabled: Boolean(p.disabled), onClick: p.onPress as never }, p.children as never),
    ActivityIndicator: () => R.createElement('span', null, '…'),
    StyleSheet: { create: <T,>(e: T) => e, flatten: (e: unknown) => e },
    Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
    useColorScheme: () => 'dark',
  }
})
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: '33333333-3333-4333-8333-333333333333' }),
  useRouter: () => ({ push: (r: string) => estado.rutas.push(r) }),
}))
vi.mock('expo-linking', () => ({ openURL: async (u: string) => void estado.abiertas.push(u) }))
vi.mock('@/components/Icono', () => ({ Icono: () => null }))
vi.mock('@/components/EstadoCarga', async () => {
  const { React: R } = await import('./dobles/react-raiz')
  return {
    Cargando: () => R.createElement('p', { id: 'cargando' }, 'cargando'),
    ErrorCarga: (p: { mensaje: string; onReintentar: () => void }) => R.createElement('button', { id: 'error', onClick: p.onReintentar }, p.mensaje),
    Vacio: (p: { mensaje: string }) => R.createElement('p', { id: 'vacio' }, p.mensaje),
  }
})
vi.mock('@/lib/session', () => ({ useSession: () => estado.sesion }))
vi.mock('@/lib/datos/lugares-chicos', () => ({ obtenerLugaresChicos: async () => estado.resultado }))
vi.mock('@/lib/radar', () => ({
  siguesElLugar: (venueId: string, userId: string | null) =>
    new Promise<boolean>((r) => {
      estado.soltarSigue = () => r(userId !== null && estado.sigue && venueId.length > 0)
    }),
  cambiarSeguimiento: async (...args: unknown[]) => {
    estado.cambios.push(args)
    const { seguir } = args[1] as { seguir: boolean }
    return { ok: true, siguiendo: seguir }
  },
}))

const VENUE = '33333333-3333-4333-8333-333333333333'
type Global = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean; document: Document }
const requerir = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../../package.json'))
let raiz: RaizDeReact | null = null
let div: HTMLElement

const lugar = (extra: Record<string, unknown> = {}) => ({
  id: 'l1',
  venueId: VENUE,
  nombre: 'Pelotero Feliz',
  direccion: 'Güemes 123',
  slug: 'pelotero-feliz',
  lat: -24.79,
  lng: -65.41,
  tipo: 'pelotero',
  descripcion: null,
  edadMin: 2,
  edadMax: 8,
  horarios: { version: 1, semana: {}, siempre_abierto: true },
  acceso: 'pago',
  notaPrecio: null,
  techado: null,
  tieneRampa: null,
  tieneBanoAdaptado: null,
  tieneCambiador: null,
  telefono: '+54 387 123-4567',
  web: 'https://pelotero.example.com/',
  instagram: 'javascript:alert(1)',
  verificadoAt: '2026-10-20T12:00:00Z',
  deOsm: false,
  ...extra,
})

async function montar() {
  crearRaiz()
  const doc = (globalThis as Global).document
  div = doc.createElement('div')
  doc.body.appendChild(div)
  const { createRoot } = requerir('react-dom/client') as { createRoot: (c: unknown) => RaizDeReact }
  raiz = createRoot(div)
  await React.act(async () => {
    raiz!.render(React.createElement(FichaLugarChicos))
  })
}
const boton = (nombre: string) => div.querySelector(`button[aria-label="${nombre}"]`) as HTMLButtonElement | null
async function tocar(b: HTMLElement) {
  await React.act(async () => b.click())
}
async function saberSiSigue() {
  await React.act(async () => estado.soltarSigue?.())
}

beforeEach(() => {
  ;(globalThis as Global).IS_REACT_ACT_ENVIRONMENT = true
  estado.resultado = { ok: true, lugares: [lugar({ venueId: 'otro', nombre: 'Otro' }), lugar()] }
  estado.sigue = false
  estado.sesion = { session: { user: { id: 'u1' } } }
  estado.cambios = []
  estado.abiertas = []
  estado.rutas = []
  estado.soltarSigue = null
})
afterEach(async () => {
  if (raiz) await React.act(async () => raiz!.unmount())
  raiz = null
  ;(globalThis as Global).document.body.innerHTML = ''
})
afterAll(() => {
  Intl.DateTimeFormat.prototype.resolvedOptions = localeOriginal
})

describe('Ficha de un lugar para chicos (app)', () => {
  it('muestra el lugar del id de la ruta; «Seguir» aparece recién cuando se sabe si ya lo sigue', async () => {
    await montar()
    expect(div.querySelector('[role="header"]')?.textContent).toBe('Pelotero Feliz')
    expect(div.textContent).toContain('Espacio abierto')
    expect(boton('Seguir Pelotero Feliz')).toBeNull()
    await saberSiSigue()
    expect(boton('Seguir Pelotero Feliz')).not.toBeNull()
  })

  it('seguir y dejar de seguir: manda el usuario de la sesión y el venue del lugar', async () => {
    await montar()
    await saberSiSigue()
    await tocar(boton('Seguir Pelotero Feliz')!)
    expect(estado.cambios).toEqual([['u1', { tipo: 'lugar', id: VENUE, seguir: true }]])
    await tocar(boton('Dejar de seguir Pelotero Feliz')!)
    expect(estado.cambios.at(-1)).toEqual(['u1', { tipo: 'lugar', id: VENUE, seguir: false }])
    expect(boton('Seguir Pelotero Feliz')).not.toBeNull()
  })

  it('si ya lo sigue, arranca en «Dejar de seguir»', async () => {
    estado.sigue = true
    await montar()
    await saberSiSigue()
    expect(boton('Dejar de seguir Pelotero Feliz')?.getAttribute('aria-selected')).toBe('true')
  })

  it('sin sesión: tocar «Seguir» lleva a Cuenta y no escribe nada', async () => {
    estado.sesion = { session: null }
    await montar()
    await saberSiSigue()
    await tocar(boton('Seguir Pelotero Feliz')!)
    expect(estado.rutas).toEqual(['/cuenta'])
    expect(estado.cambios).toEqual([])
  })

  it('«Cómo llegar» abre el mapa con la dirección del lugar; los contactos válidos se ofrecen y el inválido no', async () => {
    await montar()
    await tocar(boton('Cómo llegar a Pelotero Feliz')!)
    expect(estado.abiertas[0]).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/)
    expect(decodeURIComponent(estado.abiertas[0]!)).toContain('Pelotero Feliz, Güemes 123, Salta')
    await tocar(boton('Llamar a Pelotero Feliz')!)
    expect(estado.abiertas.at(-1)).toBe('tel:+543871234567')
    expect(boton('Web de Pelotero Feliz')).not.toBeNull()
    // El Instagram cargado no es un link de instagram.com con https: no se ofrece.
    expect(div.querySelector('button[aria-label^="Instagram"]')).toBeNull()
  })

  it('un lugar que ya no está publicado: el aviso, sin ficha', async () => {
    estado.resultado = { ok: true, lugares: [lugar({ venueId: 'otro' })] }
    await montar()
    expect(div.querySelector('#vacio')?.textContent).toBe('Este lugar ya no está publicado.')
  })

  it('si falla la carga: el error con «Reintentar», que vuelve a pedir', async () => {
    estado.resultado = { ok: false, error: 'x' }
    await montar()
    expect(div.querySelector('#error')?.textContent).toBe('No pudimos cargar los lugares para chicos. Revisá tu conexión.')
    estado.resultado = { ok: true, lugares: [lugar()] }
    await tocar(div.querySelector('#error') as HTMLElement)
    expect(div.querySelector('[role="header"]')?.textContent).toBe('Pelotero Feliz')
  })
})
