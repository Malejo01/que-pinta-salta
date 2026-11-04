// R-1 · Seguir lugares en la app (Q5-6) de punta a punta: `siguesElLugar`
// (el botón «Seguir» de la ficha de un lugar para chicos),
// `obtenerLugaresQueSeguis` y la sección «Lugares que seguís» de Mis eventos
// montada con React DOM (la copia de la raíz) sobre un doble mínimo de
// `react-native`. Supabase es un doble que registra los filtros. Antes había
// solo detectores sobre el fuente (seguir-lugar.test.ts).
//
// Bug que destapó: con un error al leer, la sección decía «Todavía no seguís
// ningún lugar» (leía con `obtenerLoQueSeguis`, que devuelve [] si falla),
// aunque su propio comentario decía que con error no se dibuja.
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { React, crearRaiz, type RaizDeReact } from './dobles/react-raiz'
import { obtenerLugaresQueSeguis, siguesElLugar } from '@/lib/radar'
import { LugaresQueSeguis, TEXTO_SIN_LUGARES_SEGUIDOS, TITULO_LUGARES_QUE_SEGUIS } from '@/components/LugaresQueSeguis'

// El teléfono en castellano desde antes de importar: el valor por omisión del
// contexto de idioma (sin provider) se calcula al cargar `lib/i18n`.
const localeOriginal = vi.hoisted(() => {
  const original = Intl.DateTimeFormat.prototype.resolvedOptions
  Intl.DateTimeFormat.prototype.resolvedOptions = function () {
    return { ...original.call(this), locale: 'es-AR' }
  }
  return original
})

const estado = vi.hoisted(() => ({
  respuesta: { data: null, error: null } as { data: unknown; error: unknown } | 'tira',
  consultas: [] as { tabla: string; columnas: string; filtros: [string, unknown][] }[],
  abiertas: [] as string[],
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(tabla: string) {
      const c = { tabla, columnas: '', filtros: [] as [string, unknown][] }
      estado.consultas.push(c)
      const resolver = async () => {
        if (estado.respuesta === 'tira') throw new Error('Network request failed')
        return estado.respuesta
      }
      const b: Record<string, unknown> = {
        select: (col: string) => ((c.columnas = col), b),
        eq: (col: string, v: unknown) => (c.filtros.push([col, v]), b),
        maybeSingle: resolver,
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => resolver().then(res, rej),
      }
      return b
    },
  },
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
  const a = (p: P) => ({ role: p.accessibilityRole as string | undefined, 'aria-label': p.accessibilityLabel as string | undefined })
  return {
    View: (p: P) => R.createElement('div', a(p), p.children as never),
    Text: (p: P) => R.createElement('span', a(p), p.children as never),
    Pressable: (p: P) => R.createElement('button', { ...a(p), onClick: p.onPress as never }, p.children as never),
    StyleSheet: { create: <T,>(e: T) => e, flatten: (e: unknown) => e },
    Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
    useColorScheme: () => 'dark',
  }
})
vi.mock('expo-router', async () => {
  const { React: R } = await import('./dobles/react-raiz')
  return { useFocusEffect: (efecto: () => void | (() => void)) => R.useEffect(efecto, [efecto]) }
})
vi.mock('expo-linking', () => ({
  openURL: async (url: string) => {
    estado.abiertas.push(url)
  },
}))
vi.mock('@/components/Icono', () => ({ Icono: () => null }))

const USER = 'usuario-de-prueba'
const TEATRO = '11111111-1111-4111-8111-111111111111'
const PLAZA = '22222222-2222-4222-8222-222222222222'

type Global = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean; document: Document }
const requerir = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../../package.json'))
let raiz: RaizDeReact | null = null

async function montar(userId = USER) {
  crearRaiz() // arma el DOM de jsdom la primera vez
  const doc = (globalThis as Global).document
  const div = doc.createElement('div')
  doc.body.appendChild(div)
  const { createRoot } = requerir('react-dom/client') as { createRoot: (c: unknown) => RaizDeReact }
  raiz = createRoot(div)
  await React.act(async () => {
    raiz!.render(React.createElement(LugaresQueSeguis, { userId }))
  })
  return div
}

beforeEach(() => {
  ;(globalThis as Global).IS_REACT_ACT_ENVIRONMENT = true
  estado.respuesta = { data: null, error: null }
  estado.consultas = []
  estado.abiertas = []
})
afterEach(async () => {
  if (raiz) await React.act(async () => raiz!.unmount())
  raiz = null
  if ((globalThis as Global).document) (globalThis as Global).document.body.innerHTML = ''
})

afterAll(() => {
  Intl.DateTimeFormat.prototype.resolvedOptions = localeOriginal
})

describe('siguesElLugar', () => {
  it('lo sigue: true, leyendo user_followed_venues por usuario y lugar', async () => {
    estado.respuesta = { data: { venue_id: TEATRO }, error: null }
    expect(await siguesElLugar(TEATRO, USER)).toBe(true)
    expect(estado.consultas).toEqual([{ tabla: 'user_followed_venues', columnas: 'venue_id', filtros: [['user_id', USER], ['venue_id', TEATRO]] }])
  })
  it('no lo sigue (sin fila): false', async () => {
    expect(await siguesElLugar(TEATRO, USER)).toBe(false)
  })
  it('sin sesión: false sin consultar', async () => {
    expect(await siguesElLugar(TEATRO, null)).toBe(false)
    expect(estado.consultas).toEqual([])
  })
  it('error de la base o sin red: false, nunca tira', async () => {
    estado.respuesta = { data: { venue_id: TEATRO }, error: { code: '500' } }
    expect(await siguesElLugar(TEATRO, USER)).toBe(false)
    estado.respuesta = 'tira'
    expect(await siguesElLugar(TEATRO, USER)).toBe(false)
  })
})

describe('obtenerLugaresQueSeguis', () => {
  it('los lugares seguidos del usuario (sin los venues que ya no existen)', async () => {
    estado.respuesta = { data: [{ venue: { id: TEATRO, name: 'Teatro Provincial' } }, { venue: null }], error: null }
    expect(await obtenerLugaresQueSeguis(USER)).toEqual([{ id: TEATRO, nombre: 'Teatro Provincial' }])
    expect(estado.consultas[0]).toEqual({ tabla: 'user_followed_venues', columnas: 'venue:venues(id, name)', filtros: [['user_id', USER]] })
  })
  it('error de la base o sin red: null (no [])', async () => {
    estado.respuesta = { data: null, error: { code: '42501' } }
    expect(await obtenerLugaresQueSeguis(USER)).toBeNull()
    estado.respuesta = 'tira'
    expect(await obtenerLugaresQueSeguis(USER)).toBeNull()
  })
})

describe('Mis eventos › «Lugares que seguís»', () => {
  it('ordenados por nombre; cada uno es un link que abre la ficha web del lugar', async () => {
    estado.respuesta = {
      data: [{ venue: { id: TEATRO, name: 'Teatro Provincial' } }, { venue: { id: PLAZA, name: 'Plaza Güemes' } }],
      error: null,
    }
    const div = await montar()
    expect(div.textContent).toContain(TITULO_LUGARES_QUE_SEGUIS)
    const links = [...div.querySelectorAll('button[role="link"]')]
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual(['Plaza Güemes: ver la ficha del lugar', 'Teatro Provincial: ver la ficha del lugar'])
    await React.act(async () => (links[0] as HTMLButtonElement).click())
    expect(estado.abiertas).toEqual([`https://www.quepintasalta.com.ar/lugar/${PLAZA}`])
  })

  it('sin lugares: el título y la línea que explica cómo seguir uno', async () => {
    estado.respuesta = { data: [], error: null }
    const div = await montar()
    expect(div.textContent).toContain(TEXTO_SIN_LUGARES_SEGUIDOS)
  })

  it('bug R-1: con un error al leer no se dibuja (antes decía «Todavía no seguís ningún lugar»)', async () => {
    estado.respuesta = { data: null, error: { code: '42501' } }
    const div = await montar()
    expect(div.textContent).toBe('')
    estado.respuesta = 'tira'
    const otro = await montar()
    expect(otro.textContent).toBe('')
  })
})
