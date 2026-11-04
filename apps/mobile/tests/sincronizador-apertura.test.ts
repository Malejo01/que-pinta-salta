// R-1 · `SincronizadorApertura` (Q5-13) montado con React DOM (la copia de la
// raíz) y la lógica real de `lib/apertura.ts`: el almacén es el doble en
// memoria de AsyncStorage (alias de vitest.config.ts) y `fetch` es un doble.
// Se mira cuándo avisa «la app se abrió hoy»: recién cuando se sabe si hay
// sesión, una sola vez por día aunque la app vuelva al frente, y con «con
// cuenta» correcto. Antes, apertura.test.ts probaba `avisarApertura` sola y
// un detector buscaba `<SincronizadorApertura />` en el layout.
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { React, crearRaiz, type RaizDeReact } from './dobles/react-raiz'
import { reiniciar } from './dobles/async-storage'
import { SincronizadorApertura } from '@/components/SincronizadorApertura'
import { CLAVE_DIA_APERTURA, URL_APERTURA } from '@/lib/apertura'
import { almacenPorDefecto } from '@/lib/sin-conexion/almacen'

const estado = vi.hoisted(() => ({
  sesion: { session: null as null | { user: { id: string } }, cargando: true },
  oyentes: [] as ((s: string) => void)[],
  quitados: 0,
}))

vi.mock('react', async () => {
  const { React: R } = await import('./dobles/react-raiz')
  return { ...R, default: R }
})
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: {
    addEventListener: (_tipo: string, oyente: (s: string) => void) => {
      estado.oyentes.push(oyente)
      return {
        remove: () => {
          estado.quitados++
          estado.oyentes = estado.oyentes.filter((o) => o !== oyente)
        },
      }
    },
  },
}))
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.0.9' } } }))
vi.mock('@/lib/session', () => ({ useSession: () => estado.sesion }))

type Global = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean; document: Document }
const requerir = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../../package.json'))
let raiz: RaizDeReact | null = null
let fetchDoble: ReturnType<typeof vi.fn>

async function dibujar() {
  if (!raiz) {
    crearRaiz()
    const div = (globalThis as Global).document.createElement('div')
    const { createRoot } = requerir('react-dom/client') as { createRoot: (c: unknown) => RaizDeReact }
    raiz = createRoot(div)
  }
  await React.act(async () => {
    raiz!.render(React.createElement(SincronizadorApertura))
  })
}
const cuerpos = () => fetchDoble.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)))
async function alFrente(s = 'active') {
  await React.act(async () => {
    for (const o of [...estado.oyentes]) o(s)
  })
}

beforeEach(() => {
  ;(globalThis as Global).IS_REACT_ACT_ENVIRONMENT = true
  reiniciar()
  estado.sesion = { session: null, cargando: true }
  estado.oyentes = []
  estado.quitados = 0
  fetchDoble = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
  vi.stubGlobal('fetch', fetchDoble)
  // Martes 3/11/2026, 10:00 de Salta.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-03T13:00:00Z'))
})
afterEach(async () => {
  if (raiz) await React.act(async () => raiz!.unmount())
  raiz = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('SincronizadorApertura', () => {
  it('mientras se lee la sesión no avisa; después, una vez, con la sesión y la versión de la app', async () => {
    await dibujar()
    expect(fetchDoble).not.toHaveBeenCalled()
    estado.sesion = { session: { user: { id: 'u1' } }, cargando: false }
    await dibujar()
    expect(fetchDoble).toHaveBeenCalledTimes(1)
    expect(fetchDoble.mock.calls[0]![0]).toBe(URL_APERTURA)
    expect(cuerpos()[0]).toMatchObject({ plataforma: 'android', version: '1.0.9', conCuenta: true })
    expect(await almacenPorDefecto.leer(CLAVE_DIA_APERTURA)).toBe('2026-11-03')
  })

  it('sin sesión: avisa con conCuenta false', async () => {
    estado.sesion = { session: null, cargando: false }
    await dibujar()
    expect(cuerpos()).toEqual([expect.objectContaining({ conCuenta: false })])
  })

  it('volver al frente el mismo día no vuelve a avisar; al día siguiente, sí', async () => {
    estado.sesion = { session: null, cargando: false }
    await dibujar()
    await alFrente()
    expect(fetchDoble).toHaveBeenCalledTimes(1)
    vi.setSystemTime(new Date('2026-11-04T13:00:00Z'))
    await alFrente('background')
    expect(fetchDoble).toHaveBeenCalledTimes(1)
    await alFrente('active')
    expect(fetchDoble).toHaveBeenCalledTimes(2)
  })

  it('si el aviso falla, al volver al frente lo intenta de nuevo (no marcó el día)', async () => {
    fetchDoble.mockResolvedValueOnce(new Response('', { status: 500 }))
    estado.sesion = { session: null, cargando: false }
    await dibujar()
    expect(await almacenPorDefecto.leer(CLAVE_DIA_APERTURA)).toBeNull()
    await alFrente()
    expect(fetchDoble).toHaveBeenCalledTimes(2)
    expect(await almacenPorDefecto.leer(CLAVE_DIA_APERTURA)).toBe('2026-11-03')
  })

  it('al desmontar deja de escuchar el estado de la app', async () => {
    estado.sesion = { session: null, cargando: false }
    await dibujar()
    expect(estado.oyentes).toHaveLength(1)
    await React.act(async () => raiz!.unmount())
    raiz = null
    expect(estado.quitados).toBe(1)
    expect(estado.oyentes).toHaveLength(0)
  })
})
