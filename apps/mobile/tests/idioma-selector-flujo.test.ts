// R-1 · «Idioma» en Cuenta de punta a punta (Q5-11 / Q6-6): el
// `IdiomaProvider` real con el `SelectorIdioma` real, montados con React DOM
// (la copia de la raíz, `tests/dobles/react-raiz.ts`) y un almacén en memoria.
// Se toca cada opción y se mira qué queda guardado en el teléfono, qué opción
// queda marcada, en qué idioma se dibuja la app y qué se anuncia. Antes había
// solo la lógica pura (`leerPreferenciaIdioma` / `guardarPreferenciaIdioma`)
// y detectores sobre el fuente.
//
// `react-native` se reemplaza por un doble mínimo de este archivo: `View` y
// `Text` son `div`/`span`, y `Pressable` es un `button` con `onClick` y el
// estado de accesibilidad en atributos `aria-*`, para poder tocarlo.
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { React, crearRaiz, type RaizDeReact } from './dobles/react-raiz'
import { IdiomaProvider, useIdioma, useTextos } from '@/lib/i18n'
import { CLAVE_IDIOMA } from '@/lib/i18n/idioma'
import type { Almacen } from '@/lib/sin-conexion/almacen'
import { SelectorIdioma } from '@/components/SelectorIdioma'

vi.mock('react', async () => {
  const { React: R } = await import('./dobles/react-raiz')
  return { ...R, default: R }
})
vi.mock('react/jsx-runtime', async () => (await import('./dobles/react-raiz')).jsxRuntime)
vi.mock('react/jsx-dev-runtime', async () => (await import('./dobles/react-raiz')).jsxDevRuntime)
vi.mock('react-native', async () => {
  const { React: R } = await import('./dobles/react-raiz')
  type P = Record<string, unknown> & { children?: unknown }
  const atributos = (p: P) => ({
    role: p.accessibilityRole as string | undefined,
    'aria-label': p.accessibilityLabel as string | undefined,
    'aria-checked': (p.accessibilityState as { checked?: boolean } | undefined)?.checked,
    lang: p.accessibilityLanguage as string | undefined,
  })
  return {
    View: (p: P) => R.createElement('div', atributos(p), p.children as never),
    Text: (p: P) => R.createElement('span', atributos(p), p.children as never),
    Pressable: (p: P) => R.createElement('button', { ...atributos(p), onClick: p.onPress as never }, p.children as never),
    StyleSheet: { create: <T,>(e: T) => e, flatten: (e: unknown) => e },
    Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
    useColorScheme: () => 'dark',
  }
})
const anuncios = vi.hoisted(() => [] as string[])
vi.mock('@/lib/anunciar-aviso-hook', async () => {
  const { React: R } = await import('./dobles/react-raiz')
  return {
    useAnunciarAviso: (texto: string | null) =>
      R.useEffect(() => {
        if (texto) anuncios.push(texto)
      }, [texto]),
  }
})
vi.mock('@/components/Icono', () => ({ Icono: () => null }))

type Global = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean; document: Document }

function almacenEnMemoria(inicial: Record<string, string> = {}) {
  const memoria = new Map(Object.entries(inicial))
  const ops: string[] = []
  let lecturaPendiente: (() => void) | null = null
  const almacen: Almacen & { demorarLectura: () => () => void } = {
    async leer(clave) {
      ops.push(`leer:${clave}`)
      // El valor se toma al empezar la lectura (como AsyncStorage, que lee en otro hilo).
      const valor = memoria.get(clave) ?? null
      if (lecturaPendiente === null && demorar) await new Promise<void>((r) => (lecturaPendiente = r))
      return valor
    },
    async escribir(clave, valor) {
      ops.push(`escribir:${clave}=${valor}`)
      memoria.set(clave, valor)
    },
    async borrar(clave) {
      ops.push(`borrar:${clave}`)
      memoria.delete(clave)
    },
    async claves() {
      return [...memoria.keys()]
    },
    async borrarVarias(claves) {
      for (const c of claves) memoria.delete(c)
    },
    demorarLectura() {
      demorar = true
      return () => lecturaPendiente?.()
    },
  }
  let demorar = false
  return { almacen, memoria, ops }
}

/** Lo que dibuja la app con el idioma actual (un título del diccionario y el idioma efectivo). */
function Muestra() {
  const t = useTextos()
  const { idioma, listo } = useIdioma()
  return React.createElement('p', { id: 'muestra' }, `${idioma}|${listo ? 'listo' : 'leyendo'}|${t.idioma.titulo}`)
}

let raiz: RaizDeReact | null = null

// `react-dom/client` de la raíz (la misma copia que usa `crearRaiz`), para
// montar sobre un `div` colgado del body y poder buscar con querySelector.
const requerir = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../../package.json'))

async function montar(almacen: Almacen) {
  crearRaiz() // arma el DOM de jsdom la primera vez
  const div = (globalThis as Global).document.createElement('div')
  ;(globalThis as Global).document.body.appendChild(div)
  const { createRoot } = requerir('react-dom/client') as { createRoot: (c: unknown) => RaizDeReact }
  raiz = createRoot(div)
  await React.act(async () => {
    // `children` va como argumento (no como prop); el tipo del provider lo pide como prop.
    const Provider = IdiomaProvider as unknown as (p: { almacen: Almacen; children?: unknown }) => null
    raiz!.render(React.createElement(Provider, { almacen }, React.createElement(SelectorIdioma), React.createElement(Muestra)))
  })
}

const doc = () => (globalThis as Global).document
const muestra = () => doc().querySelector('#muestra')?.textContent ?? ''
const opcion = (nombre: string) => doc().querySelector(`button[aria-label="${nombre}"]`) as HTMLButtonElement
const marcada = () => [...doc().querySelectorAll('button[aria-checked="true"]')].map((b) => b.getAttribute('aria-label'))

async function tocar(nombre: string) {
  await React.act(async () => {
    opcion(nombre).click()
  })
}

beforeEach(() => {
  ;(globalThis as Global).IS_REACT_ACT_ENVIRONMENT = true
  anuncios.length = 0
  // El «teléfono» está en castellano: «Automático» es castellano.
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ locale: 'es-AR' } as Intl.ResolvedDateTimeFormatOptions)
})
afterEach(async () => {
  if (raiz) await React.act(async () => raiz!.unmount())
  raiz = null
  ;(globalThis as Global).document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('Cuenta › Idioma: el selector con el provider real', () => {
  it('sin nada guardado: «Automático» marcado y la app en el idioma del teléfono', async () => {
    const { almacen, ops } = almacenEnMemoria()
    await montar(almacen)
    expect(ops).toEqual([`leer:${CLAVE_IDIOMA}`])
    expect(marcada()).toEqual(['Automático'])
    expect(muestra()).toBe('es|listo|Idioma')
  })

  it('con «en» guardado: arranca en inglés, con «English» marcado', async () => {
    const { almacen } = almacenEnMemoria({ [CLAVE_IDIOMA]: 'en' })
    await montar(almacen)
    expect(muestra()).toBe('en|listo|Language')
    expect(marcada()).toEqual(['English'])
  })

  it('tocar «English»: se guarda en el teléfono, la app pasa a inglés y se anuncia en inglés', async () => {
    const { almacen, memoria } = almacenEnMemoria()
    await montar(almacen)
    await tocar('English')
    expect(memoria.get(CLAVE_IDIOMA)).toBe('en')
    expect(muestra()).toBe('en|listo|Language')
    expect(marcada()).toEqual(['English'])
    expect(anuncios).toEqual(['Language: English'])
  })

  it('volver a «Automático» borra la clave (no guarda «auto») y se anuncia en el idioma del teléfono', async () => {
    const { almacen, memoria, ops } = almacenEnMemoria({ [CLAVE_IDIOMA]: 'en' })
    await montar(almacen)
    await tocar('Automatic')
    expect(memoria.has(CLAVE_IDIOMA)).toBe(false)
    expect(ops).toContain(`borrar:${CLAVE_IDIOMA}`)
    expect(muestra()).toBe('es|listo|Idioma')
    expect(marcada()).toEqual(['Automático'])
    expect(anuncios.at(-1)).toBe('Idioma: Automático')
  })

  it('la elección sobrevive a cerrar y abrir la app (otro montaje con el mismo almacén)', async () => {
    const { almacen } = almacenEnMemoria()
    await montar(almacen)
    await tocar('English')
    await React.act(async () => raiz!.unmount())
    raiz = null
    await montar(almacen)
    expect(muestra()).toBe('en|listo|Language')
  })

  it('un valor raro guardado vale como «Automático»', async () => {
    const { almacen } = almacenEnMemoria({ [CLAVE_IDIOMA]: 'fr' })
    await montar(almacen)
    expect(marcada()).toEqual(['Automático'])
  })

  it('si el teléfono no deja leer ni escribir, la app sigue andando con lo que se eligió', async () => {
    const { almacen } = almacenEnMemoria()
    almacen.leer = async () => {
      throw new Error('AsyncStorage roto')
    }
    almacen.escribir = async () => {
      throw new Error('disco lleno')
    }
    await montar(almacen)
    expect(muestra()).toBe('es|listo|Idioma')
    await tocar('English')
    expect(muestra()).toBe('en|listo|Language')
  })

  it('bug R-1: si se elige un idioma antes de que termine la lectura del teléfono, la lectura vieja no lo pisa', async () => {
    const { almacen, memoria } = almacenEnMemoria({ [CLAVE_IDIOMA]: 'es' })
    const soltarLectura = almacen.demorarLectura()
    await montar(almacen)
    expect(muestra()).toBe('es|leyendo|Idioma')
    await tocar('English')
    expect(memoria.get(CLAVE_IDIOMA)).toBe('en')
    // Llega la lectura que había empezado antes del toque (con «es»).
    await React.act(async () => soltarLectura())
    expect(muestra()).toBe('en|listo|Language')
    expect(marcada()).toEqual(['English'])
  })
})
