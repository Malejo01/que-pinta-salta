// QPS-348 (Bug de testers de la build 5): la ficha de evento mostraba
// «evento/[id]» como título en la barra superior nativa porque
// `apps/mobile/app/evento/[id].tsx` no definía título y `app/_layout.tsx`
// solo registraba «bienvenida» y «(tabs)» en el <Stack>, haciendo que
// expo-router mostrara el nombre crudo del archivo de ruta.
//
// Este detector recorre estáticamente todas las rutas de `apps/mobile/app`
// que quedan fuera de `(tabs)` y exige que cada una tenga título explícito
// (en `_layout.tsx` o en su propia pantalla con `<Stack.Screen options>`) o
// `headerShown: false`.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_DIR = join(MOBILE_ROOT, 'app')
const LAYOUT_PATH = join(APP_DIR, '_layout.tsx')

/**
 * Obtiene todas las rutas de pantallas fuera de `(tabs)` y excluyendo `_layout.tsx`.
 * Retorna rutas normalizadas con barras `/` (ej: 'evento/[id]', 'cines', '+not-found').
 */
export function listarRutasFueraDeTabs(dir: string = APP_DIR): string[] {
  const rutas: string[] = []

  function explorar(actual: string) {
    const entradas = readdirSync(actual, { withFileTypes: true })
    for (const entrada of entradas) {
      const rutaAbsoluta = join(actual, entrada.name)
      if (entrada.isDirectory()) {
        if (entrada.name === '(tabs)') continue
        explorar(rutaAbsoluta)
      } else if (entrada.isFile() && entrada.name.endsWith('.tsx')) {
        if (entrada.name === '_layout.tsx') continue
        const rel = relative(APP_DIR, rutaAbsoluta)
          .replace(/\\/g, '/')
          .replace(/\.tsx$/, '')
        rutas.push(rel)
      }
    }
  }

  explorar(dir)
  return rutas.sort()
}

export function opcionesDeStackEnLayout(
  codigoLayout: string,
): Map<string, { title: boolean; headerShownFalse: boolean }> {
  const mapa = new Map<string, { title: boolean; headerShownFalse: boolean }>()
  const layoutLimpio = quitarComentarios(codigoLayout)
  const matches = layoutLimpio.matchAll(/<Stack\.Screen\b([^>]*?)(?:\/>|>[\s\S]*?<\/Stack\.Screen>)/g)
  for (const match of matches) {
    const attrs = match[1]
    const nameMatch = attrs.match(/name=["']([^"']+)["']/)
    if (!nameMatch) continue
    const name = nameMatch[1]
    const optionsMatch = attrs.match(/options=\{\{([\s\S]*?)\}\}/)
    const options = optionsMatch ? optionsMatch[1] : ''
    mapa.set(name, {
      title: /\btitle\s*:/.test(options),
      headerShownFalse: /\bheaderShown\s*:\s*false\b/.test(options),
    })
  }
  return mapa
}

export function opcionesDeStackEnPantalla(
  codigoPantalla: string,
): { title: boolean; headerShownFalse: boolean } {
  const pantallaLimpia = quitarComentarios(codigoPantalla)
  const matches = pantallaLimpia.matchAll(/<Stack\.Screen\b([^>]*?)(?:\/>|>[\s\S]*?<\/Stack\.Screen>)/g)
  for (const match of matches) {
    const attrs = match[1]
    const optionsMatch = attrs.match(/options=\{\{([\s\S]*?)\}\}/)
    const options = optionsMatch ? optionsMatch[1] : ''
    if (/\btitle\s*:/.test(options) || /\bheaderShown\s*:\s*false\b/.test(options)) {
      return {
        title: /\btitle\s*:/.test(options),
        headerShownFalse: /\bheaderShown\s*:\s*false\b/.test(options),
      }
    }
  }
  return { title: false, headerShownFalse: false }
}

export function rutaTieneTituloOHeaderOculto(
  nombreRuta: string,
  codigoPantalla: string,
  opcionesLayout: Map<string, { title: boolean; headerShownFalse: boolean }>,
): boolean {
  const optLayout = opcionesLayout.get(nombreRuta)
  if (optLayout && (optLayout.title || optLayout.headerShownFalse)) {
    return true
  }

  const optPantalla = opcionesDeStackEnPantalla(codigoPantalla)
  if (optPantalla.title || optPantalla.headerShownFalse) {
    return true
  }

  return false
}

// ---------------------------------------------------------------------------
// Tests unitarios del detector con fixtures
// ---------------------------------------------------------------------------
describe('detector de títulos de rutas (fixtures en memoria)', () => {
  const mockLayout = `
    <Stack>
      <Stack.Screen name="bienvenida" options={{ headerShown: false }} />
      <Stack.Screen name="evento/[id]" options={{ title: 'Evento' }} />
    </Stack>
  `
  const mapaLayout = opcionesDeStackEnLayout(mockLayout)

  it('detecta ruta configurada en el layout con title', () => {
    const pantallaVacia = 'export default function Page() { return null }'
    expect(rutaTieneTituloOHeaderOculto('evento/[id]', pantallaVacia, mapaLayout)).toBe(true)
  })

  it('detecta ruta configurada en el layout con headerShown: false', () => {
    const pantallaVacia = 'export default function Page() { return null }'
    expect(rutaTieneTituloOHeaderOculto('bienvenida', pantallaVacia, mapaLayout)).toBe(true)
  })

  it('detecta ruta con <Stack.Screen options={{ title: ... }} /> dentro de la propia pantalla', () => {
    const pantallaConTitulo = `
      export default function Pelicula() {
        return (
          <View>
            <Stack.Screen options={{ title: 'Película' }} />
          </View>
        )
      }
    `
    expect(rutaTieneTituloOHeaderOculto('pelicula/[id]', pantallaConTitulo, mapaLayout)).toBe(true)
  })

  it('falla si la ruta no tiene title ni headerShown: false en ningún lado', () => {
    const pantallaSinTitulo = `
      export default function OtraRuta() {
        return <View><Text>Hola</Text></View>
      }
    `
    expect(rutaTieneTituloOHeaderOculto('otra/ruta', pantallaSinTitulo, mapaLayout)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Barrido real sobre apps/mobile/app
// ---------------------------------------------------------------------------
describe('apps/mobile/app: cada ruta fuera de (tabs) tiene título explícito o headerShown: false', () => {
  const rutas = listarRutasFueraDeTabs()
  const codigoLayout = readFileSync(LAYOUT_PATH, 'utf8')
  const opcionesLayout = opcionesDeStackEnLayout(codigoLayout)

  it('encuentra todas las rutas esperadas fuera de (tabs)', () => {
    expect(rutas).toEqual(
      expect.arrayContaining([
        '+not-found',
        'bienvenida',
        'cines',
        'contrasena',
        'eliminar-cuenta',
        'evento/[id]',
        'flyer/[id]',
        'pelicula/[id]',
      ]),
    )
  })

  it.each(rutas)('la ruta "%s" tiene título explícito o headerShown: false', (ruta) => {
    const archivoPantalla = join(APP_DIR, `${ruta}.tsx`)
    const codigoPantalla = readFileSync(archivoPantalla, 'utf8')
    const tieneConfig = rutaTieneTituloOHeaderOculto(ruta, codigoPantalla, opcionesLayout)

    expect(
      tieneConfig,
      `La ruta "${ruta}" en apps/mobile/app/${ruta}.tsx no tiene título explícito en el layout ni en la pantalla, ni headerShown: false.`,
    ).toBe(true)
  })
})
