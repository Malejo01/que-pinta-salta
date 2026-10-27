// Medición de renders de `TarjetaEvento` en las tres pantallas con listas
// (A7, nube Q1: rendimiento de listas). Dibuja las pantallas REALES
// (`app/(tabs)/index.tsx`, `buscar.tsx`, `favoritos.tsx`) con React DOM sobre
// un documento de jsdom armado a mano (el entorno del archivo sigue siendo
// `node`, como pide `tests/convencion-entorno.test.ts`; ver
// `tests/dobles/react-raiz.ts`) y un doble de `react-native` (`tests/dobles/react-native-listas.ts`:
// qué imita y qué no está en su cabecera), y cuenta cuántas veces se dibuja
// y cuántas veces se MONTA cada tarjeta en cada escenario del ticket:
//
//   (a)  el padre se vuelve a dibujar sin que cambien los datos
//        (tirar para refrescar y que vuelva lo mismo; en Buscar también
//        escribir un texto que deja la misma lista);
//   (b1) se toca el corazón de UNA tarjeta;
//   (b2) una recarga donde cambió UN solo evento (el precio);
//   (c)  Favoritos: una recarga donde se sacó un favorito y las filas de 2
//        cambian de composición;
//   (d)  un cambio de filtro de verdad (pill de fecha en Inicio, texto en
//        Buscar).
//
// Cómo se cuenta (sin tocar el componente): `TarjetaEvento` llama
// `objetivoDeFavorito(evento)` exactamente una vez por render (lo verifica
// el primer test de abajo) — el doble de `@/lib/rutas` lo envuelve y suma por
// `evento.id`. Los montajes salen del doble de `BotonFavorito`, que la tarjeta
// dibuja siempre para un evento real: su `useEffect` de montaje corre solo
// cuando la tarjeta se monta (o se remonta por cambio de `key`).
//
// React: los componentes de la app importan `react` de
// `apps/mobile/node_modules` (19.2.3) y `react-dom` está solo en la raíz
// (19.2.6, con su propio `react`): con dos copias los hooks fallan, así que
// acá se redirige `react` (y sus runtimes de JSX) a la copia de la raíz
// (porqué completo en `tests/dobles/react-raiz.ts`).
//
// Se corre con el resto: `npm test --workspace mobile` (o solo este archivo:
// `npx vitest run tests/renders-listas.test.ts` desde apps/mobile). La tabla
// de números sale por consola al final. Los números de antes/después del
// ticket están en el mensaje del commit de A7.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DisplayEvent } from '@qps/core/home/types'
import { React, crearRaiz, versionDeReact, type RaizDeReact } from './dobles/react-raiz'
import { registroListas } from './dobles/react-native-listas'
// Los `vi.mock` de abajo se elevan por encima de estos `import` (Vitest), así
// que las pantallas ya cargan con los dobles.
import Inicio from '@/app/(tabs)/index'
import Buscar, { VENTANA_RESULTADOS } from '@/app/(tabs)/buscar'
import Favoritos, { VENTANA_FAVORITOS } from '@/app/(tabs)/favoritos'
import { VENTANA_FILA, layoutDeTarjetaEnFila } from '@/components/FilaCategoria'
import { CAMPOS_QUE_USA_LA_TARJETA, sonPropsDeTarjetaIguales } from '@/components/TarjetaEvento'

vi.mock('react', async () => {
  const { React: R } = await import('./dobles/react-raiz')
  return { ...R, default: R }
})
vi.mock('react/jsx-runtime', async () => (await import('./dobles/react-raiz')).jsxRuntime)
vi.mock('react/jsx-dev-runtime', async () => (await import('./dobles/react-raiz')).jsxDevRuntime)
vi.mock('react-native', () => import('./dobles/react-native-listas'))

const medicion = vi.hoisted(() => ({
  renders: new Map<string, number>(),
  montajes: new Map<string, number>(),
  alternarCorazon: new Map<string, () => void>(),
  cambiarAtajo: null as null | ((atajo: string | null) => void),
  cambiarTexto: null as null | ((texto: string) => void),
  eventos: [] as DisplayEvent[],
  favoritos: [] as DisplayEvent[],
}))

vi.mock('@/lib/rutas', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/rutas')>()
  return {
    ...real,
    objetivoDeFavorito: (evento: DisplayEvent) => {
      medicion.renders.set(evento.id, (medicion.renders.get(evento.id) ?? 0) + 1)
      return real.objetivoDeFavorito(evento)
    },
  }
})

vi.mock('@/components/BotonFavorito', async () => {
  const { React: R } = await import('./dobles/react-raiz')
  function BotonFavorito({ objetivo }: { objetivo: { id: string } }) {
    // El corazón real guarda "marcado" en su propio estado (components/BotonFavorito.tsx):
    // tocarlo vuelve a dibujar SOLO el botón, no la tarjeta.
    const [, setMarcado] = R.useState(false)
    const id = objetivo.id
    R.useEffect(() => {
      medicion.montajes.set(id, (medicion.montajes.get(id) ?? 0) + 1)
    }, [id])
    medicion.alternarCorazon.set(id, () => setMarcado((m) => !m))
    return null
  }
  return { BotonFavorito }
})

vi.mock('expo-router', async () => {
  const { React: R } = await import('./dobles/react-raiz')
  const router = { push() {}, replace() {}, back() {} }
  const tema = { colors: { background: '#000', border: '#222', primary: '#f00', card: '#111', text: '#fff' } }
  return {
    useRouter: () => router,
    useLocalSearchParams: () => ({}),
    useTheme: () => tema,
    useFocusEffect: (efecto: () => void | (() => void)) => R.useEffect(efecto, [efecto]),
    Redirect: () => null,
  }
})

const { nulo, CATEGORIAS } = vi.hoisted(() => ({
  nulo: () => null,
  CATEGORIAS: [
    { id: 'c1', name: 'Música', slug: 'musica' },
    { id: 'c2', name: 'Teatro', slug: 'teatro' },
    { id: 'c3', name: 'Fiestas', slug: 'fiestas' },
  ],
}))
vi.mock('@/components/Afiche', () => ({ Afiche: nulo }))
vi.mock('@/components/BotonCompartir', () => ({ BotonCompartir: nulo }))
vi.mock('@/components/Icono', () => ({ Icono: nulo, iconoPorCategoria: () => 'Calendar' }))
vi.mock('@/components/BannerAnuncio', () => ({ BannerAnuncio: nulo }))
vi.mock('@/components/BannerRadar', () => ({ BannerRadar: nulo }))
vi.mock('@/components/Hero', () => ({ Hero: nulo }))
vi.mock('@/components/InvitacionAvisos', () => ({ InvitacionAvisos: nulo }))
vi.mock('@/components/TarjetaPelicula', () => ({ TarjetaPelicula: nulo }))
vi.mock('@/components/AvisoSinConexion', () => ({ AvisoSinConexion: nulo }))
vi.mock('@/components/AvisoActivarPush', () => ({ AvisoActivarPush: nulo }))
vi.mock('@/components/ChipsCategorias', () => ({ ChipsCategorias: nulo }))
vi.mock('@/components/EstadoCarga', () => ({ Cargando: nulo, ErrorCarga: nulo, Vacio: nulo }))
vi.mock('@/components/PillsAtajos', () => ({
  PillsAtajos: ({ onCambiar }: { onCambiar: (atajo: string | null) => void }) => {
    medicion.cambiarAtajo = onCambiar
    return null
  },
}))
vi.mock('@/components/CampoTexto', () => ({
  CampoTexto: ({ onChangeText }: { onChangeText: (texto: string) => void }) => {
    medicion.cambiarTexto = onChangeText
    return null
  },
}))
vi.mock('@/assets/logo-circular.png', () => ({ default: 1 }))
vi.mock('@/lib/bienvenida', () => ({ useBienvenidaVista: () => ({ cargando: false, vista: true }) }))
vi.mock('@/lib/session', () => {
  const sesion = { session: { user: { id: 'usuario-1' } }, cargando: false, sinConexion: false }
  return { useSession: () => sesion, esperarBorradoDeCache: async () => {} }
})

// Cada carga devuelve objetos NUEVOS (como un fetch real), con el contenido
// que tenga `medicion.eventos`/`medicion.favoritos` en ese momento.
vi.mock('@/lib/datos/eventos', () => ({
  obtenerEventosVigentesParaInicio: async () => ({
    ok: true,
    eventos: structuredClone(medicion.eventos).map((evento) => ({
      evento,
      paraAtajo: { start_date: evento.startDateTime, end_date: null, category: evento.category },
    })),
  }),
  obtenerCategorias: async () => ({ ok: true, categorias: structuredClone(CATEGORIAS) }),
}))
vi.mock('@/lib/datos/cines', () => ({ obtenerCines: async () => ({ ok: true, peliculas: [] }) }))
vi.mock('@/lib/sin-conexion/agenda', () => ({
  cargarAgendaConCache: async ({ cargar }: { cargar: () => Promise<{ ok: true; datos: unknown }> }) => {
    const resultado = await cargar()
    return { tipo: 'ok', datos: resultado.datos, desdeCache: null }
  },
}))
vi.mock('@/lib/sin-conexion/favoritos', () => ({
  cargarFavoritosConCache: async () => ({ tipo: 'ok', voy: [], eventos: structuredClone(medicion.favoritos), desdeCache: null }),
  leerFavoritosGuardados: async () => null,
}))

// Martes 27/10/2026, 12:00 en Salta (UTC-3).
const AHORA = new Date('2026-10-27T15:00:00Z')

function fechaDia(desplazamiento: number): string {
  return new Date(Date.UTC(2026, 9, 27 + desplazamiento)).toISOString().slice(0, 10)
}

function evento(i: number, dia: number): DisplayEvent {
  const categoria = CATEGORIAS[i % 3]
  const date = fechaDia(dia)
  return {
    id: `ev-${String(i).padStart(2, '0')}`,
    slug: `ev-${i}`,
    title: `Evento ${i}`,
    venue: `Lugar ${i}`,
    date,
    time: '21:00',
    category: categoria.slug,
    categoryName: categoria.name,
    price: i % 4 === 0 ? 'gratis' : 1000 + i,
    image: '',
    description: 'Plan en Salta',
    address: '',
    startDateTime: `${date}T21:00:00-03:00`,
    isFeatured: false,
  }
}

// Agenda: 60 eventos en 5 días (12 por día, 4 por categoría por día).
const AGENDA = Array.from({ length: 60 }, (_, i) => evento(i, i % 5))
// Favoritos: 14 en 2 días (7 por día: filas de 2, 2, 2 y 1).
const FAVORITOS = [...Array.from({ length: 7 }, (_, i) => evento(100 + i, 1)), ...Array.from({ length: 7 }, (_, i) => evento(200 + i, 2))]

const conPrecioCambiado = (lista: DisplayEvent[], id: string) =>
  lista.map((e) => (e.id === id ? { ...e, price: 9999 } : e))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const { act, createElement } = React

interface Conteo {
  renders: number
  montajes: number
}

function total(mapa: Map<string, number>): number {
  let suma = 0
  for (const n of mapa.values()) suma += n
  return suma
}

// Dos `act`: el primero, sincrónico, aplica lo que la acción hace antes de su
// primer `await` (en `refrescar`, `setRefrescando(true)`: en el teléfono ese
// render se ve, con el spinner, antes de que lleguen los datos); el segundo
// espera el resto (los datos nuevos y `setRefrescando(false)`, juntos como en
// el teléfono). Con un solo `act` asíncrono React juntaría todo en un render
// y el escenario (a) contaría de menos.
async function medir(accion: () => unknown): Promise<Conteo> {
  medicion.renders.clear()
  medicion.montajes.clear()
  let pendiente: unknown
  act(() => {
    pendiente = accion()
  })
  await act(async () => {
    await pendiente
  })
  await act(async () => {})
  return { renders: total(medicion.renders), montajes: total(medicion.montajes) }
}

async function montarPantalla(Pantalla: () => unknown): Promise<{ raiz: RaizDeReact; inicial: Conteo }> {
  const raiz = crearRaiz()
  const inicial = await medir(() => raiz.render(createElement(Pantalla as () => null)))
  return { raiz, inicial }
}

const refrescar = () => registroListas.refrescar?.()
const tocarCorazon = (id: string) => medicion.alternarCorazon.get(id)?.()

const resultados: Record<string, Conteo> = {}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
})

afterAll(() => {
  vi.useRealTimers()
  const filas = Object.entries(resultados).map(([escenario, c]) => `${escenario.padEnd(58)} renders=${String(c.renders).padStart(3)}  montajes=${String(c.montajes).padStart(3)}`)
  console.info(`\nRenders de TarjetaEvento (A7, nube Q1) — React ${versionDeReact}\n${filas.join('\n')}\n`)
})

describe('la medición cuenta lo que dice que cuenta', () => {
  it('TarjetaEvento llama objetivoDeFavorito una sola vez (un llamado = un render)', () => {
    const fuente = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../components/TarjetaEvento.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(fuente.match(/objetivoDeFavorito\(/g)?.length).toBe(1)
  })
})

describe('sonPropsDeTarjetaIguales (la comparación del memo de TarjetaEvento)', () => {
  const base = evento(1, 0)
  it('misma referencia, o un objeto nuevo con el mismo contenido: no se vuelve a dibujar', () => {
    expect(sonPropsDeTarjetaIguales({ evento: base }, { evento: base })).toBe(true)
    expect(sonPropsDeTarjetaIguales({ evento: base }, { evento: structuredClone(base) })).toBe(true)
  })
  it('cambia cualquier campo que la tarjeta usa: se vuelve a dibujar', () => {
    const otros: Partial<DisplayEvent> = {
      id: 'otro', title: 'x', venue: 'x', date: '2026-11-01', time: '22:00', categoryName: 'x', price: 'confirmar',
      image: 'https://x', isFeatured: true, isCinemaMovie: true, isInstagramFlyer: true, flyerId: 'f',
      occurrences: [{ id: 'a', date: '2026-11-01', time: '' }, { id: 'b', date: '2026-11-02', time: '' }],
    }
    expect(Object.keys(otros).sort()).toEqual([...CAMPOS_QUE_USA_LA_TARJETA].sort())
    for (const [campo, valor] of Object.entries(otros)) {
      expect(sonPropsDeTarjetaIguales({ evento: base }, { evento: { ...base, [campo]: valor } }), campo).toBe(false)
    }
  })
  it('un campo que la tarjeta no muestra (descripción, dirección) no la vuelve a dibujar', () => {
    expect(sonPropsDeTarjetaIguales({ evento: base }, { evento: { ...base, description: 'otra', address: 'otra' } })).toBe(true)
  })
})

describe('layoutDeTarjetaEnFila (getItemLayout de la fila horizontal)', () => {
  it('cada celda arranca después del margen de 16 y de las anteriores (180 + 20 de gap)', () => {
    expect(layoutDeTarjetaEnFila(null, 0)).toEqual({ length: 200, offset: 16, index: 0 })
    expect(layoutDeTarjetaEnFila(null, 3)).toEqual({ length: 200, offset: 616, index: 3 })
  })
  it('los marcos quedan pegados: offset(i + 1) = offset(i) + length(i)', () => {
    for (let i = 0; i < 20; i++) {
      const a = layoutDeTarjetaEnFila(null, i)
      expect(layoutDeTarjetaEnFila(null, i + 1).offset).toBe(a.offset + a.length)
    }
  })
})

// Los números de abajo son los de la tabla del commit de A7 (el "después").
// En main, sin memo y con las ventanas por omisión, (a) y (b2) dibujaban de
// nuevo TODAS las tarjetas de la ventana (hasta 44 en Inicio) y Favoritos (c)
// remontaba 7.
describe('Inicio (filas horizontales de FilaCategoria)', () => {
  it('cuenta los escenarios', async () => {
    medicion.eventos = AGENDA
    const { raiz, inicial } = await montarPantalla(Inicio)
    resultados['Inicio · montaje (atajo Hoy)'] = inicial
    // "Hoy en Salta" + 3 categorías, cada fila con su ventana inicial.
    expect(inicial.renders).toBe(4 * VENTANA_FILA.initialNumToRender)

    const a = (resultados['Inicio · (a) refrescar, vuelve lo mismo'] = await medir(refrescar))
    expect(a).toEqual({ renders: 0, montajes: 0 })
    const b1 = (resultados['Inicio · (b1) corazón en una tarjeta'] = await medir(() => tocarCorazon('ev-00')))
    expect(b1).toEqual({ renders: 0, montajes: 0 })
    medicion.eventos = conPrecioCambiado(AGENDA, 'ev-05')
    const b2 = (resultados['Inicio · (b2) refrescar, cambió un evento'] = await medir(refrescar))
    // ev-05 es de hoy: está en "Hoy en Salta" y en la fila de su categoría.
    expect(b2).toEqual({ renders: 2, montajes: 0 })
    const d = (resultados['Inicio · (d) pill Hoy -> Semana'] = await medir(() => medicion.cambiarAtajo?.('semana')))
    expect(d.renders).toBeLessThanOrEqual(4 * VENTANA_FILA.initialNumToRender)
    act(() => raiz.unmount())
  })
})

describe('Buscar (grilla de 2 de resultados)', () => {
  it('cuenta los escenarios', async () => {
    medicion.eventos = AGENDA
    const { raiz } = await montarPantalla(Buscar)
    const entrar = (resultados['Buscar · entrar a resultados (pill Semana)'] = await medir(() => medicion.cambiarAtajo?.('semana')))
    // `initialNumToRender` cuenta filas de 2.
    expect(entrar.renders).toBe(2 * VENTANA_RESULTADOS.initialNumToRender)
    const a1 = (resultados['Buscar · (a) refrescar, vuelve lo mismo'] = await medir(refrescar))
    expect(a1).toEqual({ renders: 0, montajes: 0 })
    const a2 = (resultados['Buscar · (a) texto que deja la misma lista ("salta")'] = await medir(() => medicion.cambiarTexto?.('salta')))
    expect(a2).toEqual({ renders: 0, montajes: 0 })
    const b1 = (resultados['Buscar · (b1) corazón en una tarjeta'] = await medir(() => tocarCorazon('ev-00')))
    expect(b1).toEqual({ renders: 0, montajes: 0 })
    medicion.eventos = conPrecioCambiado(AGENDA, 'ev-05')
    const b2 = (resultados['Buscar · (b2) refrescar, cambió un evento'] = await medir(refrescar))
    expect(b2).toEqual({ renders: 1, montajes: 0 })
    const d = (resultados['Buscar · (d) texto que filtra ("evento 1")'] = await medir(() => medicion.cambiarTexto?.('evento 1')))
    expect(d.renders).toBeLessThanOrEqual(2 * VENTANA_RESULTADOS.initialNumToRender)
    act(() => raiz.unmount())
  })
})

describe('Favoritos (SectionList de filas de 2)', () => {
  it('cuenta los escenarios', async () => {
    medicion.favoritos = FAVORITOS
    const { raiz, inicial } = await montarPantalla(Favoritos)
    resultados['Favoritos · montaje'] = inicial
    // Ventana de 6 elementos = encabezado + 4 filas (7 tarjetas) + pie.
    expect(VENTANA_FAVORITOS.initialNumToRender).toBe(6)
    expect(inicial.renders).toBe(7)
    const a = (resultados['Favoritos · (a) refrescar, vuelve lo mismo'] = await medir(refrescar))
    expect(a).toEqual({ renders: 0, montajes: 0 })
    const b1 = (resultados['Favoritos · (b1) corazón en una tarjeta'] = await medir(() => tocarCorazon('ev-100')))
    expect(b1).toEqual({ renders: 0, montajes: 0 })
    medicion.favoritos = conPrecioCambiado(FAVORITOS, 'ev-101')
    const b2 = (resultados['Favoritos · (b2) refrescar, cambió un evento'] = await medir(refrescar))
    expect(b2).toEqual({ renders: 1, montajes: 0 })
    medicion.favoritos = FAVORITOS.filter((e) => e.id !== 'ev-101')
    const c = (resultados['Favoritos · (c) sacar el 2.º favorito (filas se corren)'] = await medir(refrescar))
    // Con la clave por el primer id: la fila de ev-100 sigue montada (y ev-100
    // con ella) y solo se montan las tarjetas que cambian de fila (con el join
    // de main se remontaban las 7 de la ventana).
    expect(c).toEqual({ renders: 5, montajes: 5 })
    act(() => raiz.unmount())
  })
})
