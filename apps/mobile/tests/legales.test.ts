// 49-a (QPS-237): legales en la app. `lib/legales.ts` es puro (enlacesLegales
// y textoAceptacion), `lib/links.ts` valida /privacidad y /terminos contra la
// lista cerrada (con la guarda de TERMINOS_PUBLICADOS) y EnlacesLegales.tsx
// (lectura estática, mismo estilo que tests/cuenta.test.ts) nunca arma la URL
// a mano.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enlacesLegales, textoAceptacion, TERMINOS_PUBLICADOS } from '../lib/legales'
import { urlSitio } from '../lib/links'

describe('TERMINOS_PUBLICADOS', () => {
  it('está en true: /terminos (el #74) ya está publicado (R72, 72-d)', () => {
    expect(TERMINOS_PUBLICADOS).toBe(true)
  })
})

describe('enlacesLegales', () => {
  it('terminosPublicados=false: solo Política de privacidad', () => {
    expect(enlacesLegales(false)).toEqual([{ ruta: '/privacidad', texto: 'Política de privacidad' }])
  })

  it('terminosPublicados=true: suma Términos y condiciones', () => {
    expect(enlacesLegales(true)).toEqual([
      { ruta: '/privacidad', texto: 'Política de privacidad' },
      { ruta: '/terminos', texto: 'Términos y condiciones' },
    ])
  })

  it('sin argumento, usa TERMINOS_PUBLICADOS (hoy true): suma Términos y condiciones', () => {
    expect(enlacesLegales()).toEqual([
      { ruta: '/privacidad', texto: 'Política de privacidad' },
      { ruta: '/terminos', texto: 'Términos y condiciones' },
    ])
  })
})

describe('textoAceptacion', () => {
  it('terminosPublicados=false: solo nombra la Política de privacidad', () => {
    expect(textoAceptacion(false)).toBe(
      'Al crear tu cuenta o continuar con Google aceptás la Política de privacidad.'
    )
  })

  it('terminosPublicados=true: nombra los dos documentos', () => {
    expect(textoAceptacion(true)).toBe(
      'Al crear tu cuenta o continuar con Google aceptás los Términos y condiciones y la Política de privacidad.'
    )
  })

  it('sin argumento, usa TERMINOS_PUBLICADOS (hoy true): nombra los dos documentos', () => {
    expect(textoAceptacion()).toBe(
      'Al crear tu cuenta o continuar con Google aceptás los Términos y condiciones y la Política de privacidad.'
    )
  })
})

describe('urlSitio: los dos legales', () => {
  it('/privacidad da la URL absoluta', () => {
    expect(urlSitio('/privacidad')).toBe('https://www.quepintasalta.com.ar/privacidad')
  })

  it('/terminos se abre con el flag real en true', () => {
    expect(urlSitio('/terminos')).toBe('https://www.quepintasalta.com.ar/terminos')
  })
})

describe('EnlacesLegales.tsx: nunca arma la URL a mano', () => {
  const RUTA = fileURLToPath(new URL('../components/EnlacesLegales.tsx', import.meta.url))
  const SRC = readFileSync(RUTA, 'utf8')

  it('no contiene el dominio', () => {
    expect(SRC).not.toContain('quepintasalta.com.ar')
  })

  it('no contiene un esquema https:// armado a mano', () => {
    expect(SRC).not.toContain('https://')
  })

  it('usa urlSitio para resolver la URL', () => {
    expect(SRC).toMatch(/urlSitio\(/)
  })

  it('nunca tono="primario" (QPS-241)', () => {
    expect(SRC).not.toMatch(/tono="primario"/)
  })

  it('el Pressable de cada link es accessibilityRole="link"', () => {
    expect(SRC).toMatch(/accessibilityRole="link"/)
  })
})

describe('cuenta.tsx: monta EnlacesLegales en las dos ramas', () => {
  const RUTA_CUENTA = fileURLToPath(new URL('../app/(tabs)/cuenta.tsx', import.meta.url))
  const SRC_CUENTA = readFileSync(RUTA_CUENTA, 'utf8')

  it('importa EnlacesLegales de @/components/EnlacesLegales', () => {
    expect(SRC_CUENTA).toMatch(
      /import\s*\{\s*EnlacesLegales\s*\}\s*from\s*['"]@\/components\/EnlacesLegales['"]/
    )
  })

  it('la rama sin sesión monta <EnlacesLegales conAceptacion', () => {
    expect(SRC_CUENTA).toMatch(/<EnlacesLegales conAceptacion/)
  })

  it('la rama con sesión monta <EnlacesLegales /> (sin conAceptacion)', () => {
    expect(SRC_CUENTA).toMatch(/<EnlacesLegales\s*\/>/)
  })

  it('<EnlacesLegales conAceptacion aparece antes del cierre de la card (después de BotonGoogle)', () => {
    const idxBotonGoogle = SRC_CUENTA.lastIndexOf('<BotonGoogle')
    const idxEnlacesConAceptacion = SRC_CUENTA.indexOf('<EnlacesLegales conAceptacion')
    expect(idxBotonGoogle).toBeGreaterThan(-1)
    expect(idxEnlacesConAceptacion).toBeGreaterThan(idxBotonGoogle)
  })

  it('<EnlacesLegales /> (con sesión) aparece antes de "Cerrar sesión"', () => {
    const idxEnlaces = SRC_CUENTA.indexOf('<EnlacesLegales />')
    const idxCerrarSesion = SRC_CUENTA.lastIndexOf('Cerrar sesión')
    expect(idxEnlaces).toBeGreaterThan(-1)
    expect(idxCerrarSesion).toBeGreaterThan(idxEnlaces)
  })
})

// ---------------------------------------------------------------------------
// R60, 52-d: "Privacidad de los anuncios" — solo con
// `necesitaOpcionesDePrivacidad() === true` (UE/Reino Unido/Suiza, según
// UMP; nunca en Argentina).
//
// A diferencia del resto de este archivo (lectura estática: no hay
// `@testing-library/react-native` en el repo y el paquete real de
// `react-native` no se puede parsear bajo Vitest — Flow, `import typeof`,
// mismo motivo documentado en `tests/push-cuenta.test.ts`), este bloque SÍ
// llama al componente de verdad, directo como función (sin ningún
// renderer): `react-native` se mockea con dobles mínimos (igual que
// `tests/push-cuenta.test.ts`) y, además, `react` — SOLO `useState`/
// `useEffect` — para poder ejecutar los hooks sin un dispatcher real (fuera
// de eso, se reusa el React real con `importActual`, así que `react/jsx-
// runtime`, usado por el JSX de abajo, sigue siendo el de verdad). El
// resultado de llamar a `EnlacesLegales({})` es un árbol de elementos
// (objetos simples con `type`/`props`, nunca renderizados) que se recorre a
// mano para encontrar el Pressable nuevo.
//
// OJO para quien toque este archivo más adelante: `@/lib/legales` y
// `@/lib/links` NO se mockean acá a propósito — son puros, no hace falta, y
// mockearlos rompería los `import`s reales de más arriba de este mismo
// archivo (Vitest mockea por módulo RESUELTO, no por la cadena del
// specifier: `@/lib/legales` y `../lib/legales` apuntan al mismo archivo).
//
// El estado mutable que usan los dobles de abajo vive en `vi.hoisted` (mismo
// patrón que `tests/anuncios-consentimiento.test.ts`): los `vi.mock(...)` se
// izan al tope del archivo, ANTES de cualquier otra declaración — si el
// estado viviera en un `const` normal dentro del `describe`, el doble
// referenciaría una variable que todavía no existe en ese punto (temporal
// dead zone) y rompería con un `ReferenceError` al cargar el archivo.
const dobleConsentimiento = vi.hoisted(() => ({
  estado: { necesita: false },
  suscriptores: [] as (() => void)[],
}))
const dobleEfectos = vi.hoisted(() => ({
  cleanups: [] as (() => void)[],
}))

vi.mock('react-native', () => ({
  Linking: { openURL: vi.fn(() => Promise.resolve()) },
  Pressable: (props: unknown) => ({ tipo: 'Pressable', props }),
  View: (props: unknown) => ({ tipo: 'View', props }),
  StyleSheet: { create: (estilos: unknown) => estilos },
}))

vi.mock('react', async () => {
  const real = await vi.importActual<typeof import('react')>('react')
  return {
    ...real,
    useState: (inicial: unknown) => [inicial, vi.fn()],
    useEffect: (efecto: () => void | (() => void)) => {
      const limpieza = efecto()
      if (typeof limpieza === 'function') dobleEfectos.cleanups.push(limpieza)
    },
  }
})

vi.mock('@/components/Texto', () => ({
  Texto: (props: unknown) => ({ tipo: 'Texto', props }),
}))

vi.mock('@/lib/anuncios/consentimiento', () => ({
  necesitaOpcionesDePrivacidad: vi.fn(() => dobleConsentimiento.estado.necesita),
  mostrarOpcionesDePrivacidad: vi.fn(() => Promise.resolve()),
  suscribirse: vi.fn((cb: () => void) => {
    dobleConsentimiento.suscriptores.push(cb)
    return () => {
      const i = dobleConsentimiento.suscriptores.indexOf(cb)
      if (i >= 0) dobleConsentimiento.suscriptores.splice(i, 1)
    }
  }),
}))

describe('EnlacesLegales: "Privacidad de los anuncios" (R60, 52-d)', () => {
  type ElementoFalso = { tipo?: string; props?: { accessibilityLabel?: string; children?: unknown } } | null | undefined

  /** Recorre el árbol de elementos (en profundidad) buscando el primero con
   * `accessibilityLabel === etiqueta`. */
  function buscarPorEtiqueta(elemento: unknown, etiqueta: string): ElementoFalso {
    if (!elemento || typeof elemento !== 'object') return null
    const el = elemento as ElementoFalso
    if (el?.props?.accessibilityLabel === etiqueta) return el
    const hijos = el?.props?.children
    const lista = Array.isArray(hijos) ? hijos : [hijos]
    for (const hijo of lista) {
      const encontrado = buscarPorEtiqueta(hijo, etiqueta)
      if (encontrado) return encontrado
    }
    return null
  }

  beforeEach(() => {
    dobleConsentimiento.estado.necesita = false
    dobleConsentimiento.suscriptores.length = 0
    dobleEfectos.cleanups.length = 0
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('con necesitaOpcionesDePrivacidad() en true: aparece la entrada (Pressable, accessibilityRole="button")', async () => {
    dobleConsentimiento.estado.necesita = true
    const { EnlacesLegales } = await import('../components/EnlacesLegales')

    const el = EnlacesLegales({})
    const entrada = buscarPorEtiqueta(el, 'Privacidad de los anuncios')

    expect(entrada).toBeTruthy()
    expect((entrada as { props: Record<string, unknown> }).props.accessibilityRole).toBe('button')
  })

  it('con necesitaOpcionesDePrivacidad() en false: NO aparece', async () => {
    dobleConsentimiento.estado.necesita = false
    const { EnlacesLegales } = await import('../components/EnlacesLegales')

    const el = EnlacesLegales({})
    expect(buscarPorEtiqueta(el, 'Privacidad de los anuncios')).toBeNull()
  })

  it('reactivo: se suscribe (no lee necesitaOpcionesDePrivacidad una sola vez) y vuelve a leerla cuando el suscriptor avisa', async () => {
    dobleConsentimiento.estado.necesita = false
    const { EnlacesLegales } = await import('../components/EnlacesLegales')
    const { necesitaOpcionesDePrivacidad } = await import('../lib/anuncios/consentimiento')

    EnlacesLegales({})
    expect(dobleConsentimiento.suscriptores).toHaveLength(1)
    const llamadasIniciales = vi.mocked(necesitaOpcionesDePrivacidad).mock.calls.length

    dobleConsentimiento.estado.necesita = true
    dobleConsentimiento.suscriptores[0]()

    expect(vi.mocked(necesitaOpcionesDePrivacidad).mock.calls.length).toBeGreaterThan(llamadasIniciales)
  })

  it('el cleanup del useEffect desuscribe (devuelve el desuscriptor de suscribirse)', async () => {
    const { EnlacesLegales } = await import('../components/EnlacesLegales')

    EnlacesLegales({})
    expect(dobleConsentimiento.suscriptores).toHaveLength(1)
    expect(dobleEfectos.cleanups).toHaveLength(1)

    dobleEfectos.cleanups[0]()

    expect(dobleConsentimiento.suscriptores).toHaveLength(0)
  })

  it('al tocarla, llama a mostrarOpcionesDePrivacidad (y no rompe si esa llamada rechaza)', async () => {
    dobleConsentimiento.estado.necesita = true
    const { EnlacesLegales } = await import('../components/EnlacesLegales')
    const { mostrarOpcionesDePrivacidad } = await import('../lib/anuncios/consentimiento')
    vi.mocked(mostrarOpcionesDePrivacidad).mockRejectedValueOnce(new Error('fallo inventado del doble'))

    const el = EnlacesLegales({})
    const entrada = buscarPorEtiqueta(el, 'Privacidad de los anuncios') as { props: { onPress: () => void } }

    expect(() => entrada.props.onPress()).not.toThrow()
    expect(mostrarOpcionesDePrivacidad).toHaveBeenCalledTimes(1)
  })
})
