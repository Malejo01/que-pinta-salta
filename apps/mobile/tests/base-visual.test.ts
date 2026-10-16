// 29-g: pruebas de la "base visual" de la ronda 29 (ops/paridad-web-app.md
// §2 y §3.1): D1 (oscuro siempre), las 4 pestañas en el orden de la web con
// Cuenta fuera de la barra, y el detector de "texto secundario en border"
// (la causa de F4: casi no se ve). Lectura estática con `fs`, sin montar
// nada de React Native — mismo patrón que tests/iconos.test.ts y
// tests/estado-carga-detector.test.ts.
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))

const APP_CONFIG = readFileSync(join(MOBILE_ROOT, 'app.config.ts'), 'utf8')
const ROOT_LAYOUT = readFileSync(join(MOBILE_ROOT, 'app', '_layout.tsx'), 'utf8')
const TABS_LAYOUT = readFileSync(join(MOBILE_ROOT, 'app', '(tabs)', '_layout.tsx'), 'utf8')

describe('D1: la app arranca siempre en oscuro (decisión de Mauro)', () => {
  it("app.config.ts: userInterfaceStyle: 'dark'", () => {
    expect(APP_CONFIG).toMatch(/userInterfaceStyle:\s*'dark'/)
  })

  it('app/_layout.tsx: no usa useColorScheme en ningún lado (ni el ThemeProvider ni el ErrorBoundary)', () => {
    expect(ROOT_LAYOUT).not.toMatch(/useColorScheme/)
  })

  it('app/_layout.tsx: el ThemeProvider recibe un tema fijo (TEMA_OSCURO), no uno condicional', () => {
    expect(ROOT_LAYOUT).toMatch(/<ThemeProvider\s+value=\{TEMA_OSCURO\}/)
  })
})

describe('app/(tabs)/_layout.tsx: las pestañas de la web, en su mismo orden', () => {
  const ORDEN_ESPERADO = ['index', 'buscar', 'radar', 'favoritos', 'cuenta']

  it('declara Tabs.Screen para index, buscar, radar, favoritos y cuenta, en ese orden', () => {
    const nombres = [...TABS_LAYOUT.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((m) => m[1])
    expect(nombres).toEqual(ORDEN_ESPERADO)
  })

  it("cuenta tiene href: null (sale de la barra, pero conserva la ruta)", () => {
    const bloqueCuenta = TABS_LAYOUT.slice(TABS_LAYOUT.indexOf('name="cuenta"'))
    expect(bloqueCuenta).toMatch(/href:\s*null/)
  })

  it('index, buscar, radar y favoritos NO tienen href: null (sí van en la barra)', () => {
    for (const nombre of ['index', 'buscar', 'radar', 'favoritos']) {
      const inicio = TABS_LAYOUT.indexOf(`name="${nombre}"`)
      const finDeLaEtiqueta = TABS_LAYOUT.indexOf('/>', inicio)
      const bloque = TABS_LAYOUT.slice(inicio, finDeLaEtiqueta)
      expect(bloque).not.toMatch(/href:\s*null/)
    }
  })
})

// Detector de tokens (ops/paridad-web-app.md §2, punto 10: "Texto secundario
// en mutedForeground, nunca en border. Hoy la app usa border para el texto
// secundario, y por eso hay cosas que casi no se ven (F4)."). Cubre el texto
// plano `color: colors.border` / `color: colores.border` (con cualquier
// cantidad de espacios), fuera de comentarios.
function quitarComentarios(content: string): string {
  const lineasDeTexto = content.split('\n')
  const resultado: string[] = []
  let dentroDeBloqueComentario = false

  for (let linea of lineasDeTexto) {
    if (dentroDeBloqueComentario) {
      const finBloque = linea.indexOf('*/')
      if (finBloque === -1) {
        resultado.push('')
        continue
      }
      linea = linea.slice(finBloque + 2)
      dentroDeBloqueComentario = false
    }

    const inicioBloque = linea.indexOf('/*')
    if (inicioBloque !== -1 && linea.indexOf('*/', inicioBloque + 2) === -1) {
      linea = linea.slice(0, inicioBloque)
      dentroDeBloqueComentario = true
    }

    const idxComentarioDeLinea = linea.search(/(^|\s)\/\//)
    resultado.push(idxComentarioDeLinea === -1 ? linea : linea.slice(0, idxComentarioDeLinea))
  }

  return resultado.join('\n')
}

/** `true` si `content` usa `color: colors.border` o `color: colores.border`
 * (el token de borde, como color de *texto*), fuera de comentarios. */
export function usaBorderComoColorDeTexto(content: string): boolean {
  const limpio = quitarComentarios(content)
  return /\bcolor:\s*color(?:es|s)\.border\b/.test(limpio)
}

describe('usaBorderComoColorDeTexto (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta color: colors.border', () => {
    expect(usaBorderComoColorDeTexto('<Text style={{ color: colors.border }}>x</Text>')).toBe(true)
  })

  it('detecta color: colores.border (el hook de 8/9 tokens)', () => {
    expect(usaBorderComoColorDeTexto('{ color: colores.border }')).toBe(true)
  })

  it('no confunde borderColor: colors.border (es un borde, no texto)', () => {
    expect(usaBorderComoColorDeTexto('style={{ borderColor: colors.border }}')).toBe(false)
  })

  it('no confunde color: colors.mutedForeground (el token correcto)', () => {
    expect(usaBorderComoColorDeTexto('{ color: colores.mutedForeground }')).toBe(false)
  })

  it('no confunde un comentario que menciona "color: colors.border"', () => {
    expect(usaBorderComoColorDeTexto('// nunca color: colors.border acá')).toBe(false)
  })
})

/**
 * Archivos nuevos de la ronda 29 que ya existen al cerrar 29-g (29-g es la
 * primera tarea de la ronda, P0, "todas las pantallas dependen de esto").
 * Las tareas siguientes que agreguen archivos nuevos (29-b en adelante)
 * tienen que sumarse acá — así el detector los sigue cubriendo — y no usar
 * `colors.border`/`colores.border` como color de *texto*.
 */
const ARCHIVOS_NUEVOS_RONDA = [
  join('app', '_layout.tsx'),
  join('app', '(tabs)', '_layout.tsx'),
  join('app', '(tabs)', 'radar.tsx'),
  join('components', 'Icono.tsx'),
  join('components', 'Texto.tsx'),
  join('components', 'Encabezado.tsx'),
  // 29-b (F14, ficha y tarjeta):
  join('app', 'evento', '[id].tsx'),
  join('components', 'BotonFavorito.tsx'),
  join('components', 'BotonCompartir.tsx'),
  join('components', 'TarjetaEvento.tsx'),
  // 29-d: pantalla propia del Radar.
  join('components', 'PantallaRadar.tsx'),
  // 29-c: Cuenta y login (BotonGoogle es el único archivo nuevo de esta
  // tarea; cuenta.tsx y SeccionNotificaciones.tsx ya existían antes de la
  // ronda 29, así que no entran en esta lista).
  join('components', 'BotonGoogle.tsx'),
] as const

/** Lista de excepciones documentadas. Vacía a propósito (29-g): ningún
 * archivo nuevo de la ronda necesita usar `border` como color de texto. */
const EXCEPCIONES: readonly string[] = []

describe('detector de tokens: ningún archivo nuevo de la ronda 29 usa border como color de texto', () => {
  it('encuentra todos los ARCHIVOS_NUEVOS_RONDA en disco', () => {
    for (const relativo of ARCHIVOS_NUEVOS_RONDA) {
      expect(() => statSync(join(MOBILE_ROOT, relativo))).not.toThrow()
    }
  })

  it.each(ARCHIVOS_NUEVOS_RONDA)('%s', (relativo) => {
    if (EXCEPCIONES.includes(relativo)) return
    const content = readFileSync(join(MOBILE_ROOT, relativo), 'utf8')
    if (usaBorderComoColorDeTexto(content)) {
      throw new Error(`${relativo}: usa colors.border/colores.border como color de texto (tiene que ser mutedForeground)`)
    }
    expect(usaBorderComoColorDeTexto(content)).toBe(false)
  })
})
