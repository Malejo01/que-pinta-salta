// 33-b (QPS-148): la barra de estado del layout raíz sigue al tema. Hoy el
// tema es siempre oscuro (D1, 29-g), así que el estilo es "light" (íconos
// blancos) y fijo — el comentario de `_layout.tsx` deja escrito que el día
// que haya selector de tema, este valor tiene que dejar de ser fijo.
// Lectura estática con `fs`, sin montar nada de React Native: mismo patrón
// que `tests/estado-carga-detector.test.ts` y `tests/base-visual.test.ts`.
//
// 33-q (hueco de evasión, revisor): las dos primeras aserciones de abajo
// matcheaban contra `SRC_LAYOUT` crudo. Eso significa que alguien podía
// comentar el import real (`// import { StatusBar } from 'expo-status-bar'`)
// o cambiar `<StatusBar style="light" />` por `style="dark"` y dejar, al
// lado, un comentario con la línea buena (`// <StatusBar style="light" />`):
// el `.toMatch` encuentra esa subcadena igual, esté comentada o no, y el
// test queda en verde con la barra de estado invisible sobre fondo oscuro
// (el bug que QPS-148 arregló). Ahora las dos usan `quitarComentarios`
// (mismo stripper que `tests/base-visual.test.ts`/`tests/colores-texto.test.ts`)
// antes de matchear.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const RUTA_LAYOUT = fileURLToPath(new URL('../app/_layout.tsx', import.meta.url))
const SRC_LAYOUT = readFileSync(RUTA_LAYOUT, 'utf8')

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

    // R60 (lead, vuelta de 52-c): el `//` se resuelve ANTES de buscar `/*`.
    // Al revés —como estaba, y como siguen `tests/dimensions.test.ts` y
    // `tests/accesibilidad-detector.test.ts`— una línea de comentario que
    // contenga la secuencia `/*` (un glob como `lib/**` o `components/*`) se
    // tomaba como apertura de bloque sin cierre y blanqueaba TODO el resto
    // del archivo hasta el próximo `*/`: cualquier cosa que este detector
    // tenga que ver más abajo se volvía invisible y el test quedaba en verde
    // afirmando algo que no podía comprobar.
    const idxComentarioDeLinea = linea.search(/(^|\s)\/\//)
    const inicioBloque = linea.indexOf('/*')
    const bloqueAntesDelSlashSlash =
      inicioBloque !== -1 && (idxComentarioDeLinea === -1 || inicioBloque < idxComentarioDeLinea)

    if (bloqueAntesDelSlashSlash && linea.indexOf('*/', inicioBloque + 2) === -1) {
      resultado.push(linea.slice(0, inicioBloque))
      dentroDeBloqueComentario = true
      continue
    }

    resultado.push(idxComentarioDeLinea === -1 ? linea : linea.slice(0, idxComentarioDeLinea))
  }

  return resultado.join('\n')
}

/** `true` si `content` importa (de verdad, no en un comentario) `StatusBar` de `expo-status-bar`. */
export function importaStatusBarDeExpoStatusBar(content: string): boolean {
  const limpio = quitarComentarios(content)
  return /import\s*\{\s*StatusBar\s*\}\s*from\s*['"]expo-status-bar['"]/.test(limpio)
}

/** `true` si `content` renderiza (de verdad, no en un comentario) `<StatusBar style="light" />`. */
export function renderizaStatusBarLight(content: string): boolean {
  const limpio = quitarComentarios(content)
  return /<StatusBar\s+style="light"\s*\/>/.test(limpio)
}

/**
 * `true` si `content` importa Y llama (de verdad, no en un comentario)
 * `iniciarAnuncios` (R60/52-c). Las dos cosas: con solo el import, el arranque
 * de AdMob no corre; con solo la llamada, no compila.
 */
export function arrancaAnuncios(content: string): boolean {
  const limpio = quitarComentarios(content)
  const importa = /import\s*\{[^}]*\biniciarAnuncios\b[^}]*\}\s*from\s*['"][^'"]*anuncios\/consentimiento['"]/.test(limpio)
  const llama = /\biniciarAnuncios\s*\(\s*\)/.test(limpio)
  return importa && llama
}

describe('importaStatusBarDeExpoStatusBar / renderizaStatusBarLight (fixtures en memoria: tienen que fallar de verdad)', () => {
  it('detecta el import real', () => {
    expect(importaStatusBarDeExpoStatusBar(`import { StatusBar } from 'expo-status-bar'`)).toBe(true)
  })

  it('no se deja engañar por el import comentado (código real ya no lo importa)', () => {
    const fixture = `// import { StatusBar } from 'expo-status-bar'\nimport { View } from 'react-native'`
    expect(importaStatusBarDeExpoStatusBar(fixture)).toBe(false)
  })

  it('detecta el render real de <StatusBar style="light" />', () => {
    expect(renderizaStatusBarLight(`<View><StatusBar style="light" /></View>`)).toBe(true)
  })

  it('no se deja engañar por un comentario con la línea buena al lado de la rota (código real quedó en "dark")', () => {
    const fixture = `// <StatusBar style="light" />\n<StatusBar style="dark" />`
    expect(renderizaStatusBarLight(fixture)).toBe(false)
  })

  // R60 (lead): el agujero del recortador que estaba acá antes. Sin el
  // arreglo de `quitarComentarios`, el `/*` de dentro del `//` abría un
  // bloque y blanqueaba el resto del fixture, así que el `<StatusBar
  // style="light" />` REAL de abajo se volvía invisible y esto daba `false`.
  it('un comentario de línea que contiene "/*" (un glob) no esconde el código de abajo', () => {
    const fixture = [
      '// el tema vive en lib/** y el layout en app/*',
      'export default function Layout() {',
      '  return <StatusBar style="light" />',
      '}',
    ].join('\n')
    expect(renderizaStatusBarLight(fixture)).toBe(true)
  })
})

describe('arrancaAnuncios (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta el import + la llamada reales', () => {
    const fixture = [
      `import { iniciarAnuncios } from '@/lib/anuncios/consentimiento'`,
      'useEffect(() => { iniciarAnuncios() }, [])',
    ].join('\n')
    expect(arrancaAnuncios(fixture)).toBe(true)
  })

  it('con el import pero sin la llamada: false', () => {
    expect(arrancaAnuncios(`import { iniciarAnuncios } from '@/lib/anuncios/consentimiento'`)).toBe(false)
  })

  it('con la llamada comentada: false', () => {
    const fixture = [
      `import { iniciarAnuncios } from '@/lib/anuncios/consentimiento'`,
      '// iniciarAnuncios()',
    ].join('\n')
    expect(arrancaAnuncios(fixture)).toBe(false)
  })
})

describe('app/_layout.tsx: R60/52-c, el arranque de AdMob', () => {
  it('importa y llama iniciarAnuncios (si no, el consentimiento UMP no corre nunca)', () => {
    expect(arrancaAnuncios(SRC_LAYOUT)).toBe(true)
  })

  it('la llamada va después del gate de las fuentes, no antes', () => {
    const limpio = quitarComentarios(SRC_LAYOUT)
    const idxFuentes = limpio.indexOf('useFonts(')
    const idxAnuncios = limpio.search(/\biniciarAnuncios\s*\(\s*\)/)
    expect(idxFuentes).toBeGreaterThan(-1)
    expect(idxAnuncios).toBeGreaterThan(idxFuentes)
  })
})

describe('app/_layout.tsx: QPS-148, la barra de estado (StatusBar)', () => {
  it('importa StatusBar de expo-status-bar', () => {
    expect(importaStatusBarDeExpoStatusBar(SRC_LAYOUT)).toBe(true)
  })

  it('renderiza <StatusBar style="light" /> dentro del árbol raíz', () => {
    expect(renderizaStatusBarLight(SRC_LAYOUT)).toBe(true)
  })

  it('el comentario de arriba de StatusBar avisa que tiene que seguir al tema cuando haya selector', () => {
    const idx = SRC_LAYOUT.indexOf('<StatusBar style="light" />')
    expect(idx).toBeGreaterThan(-1)
    const comentarioPrevio = SRC_LAYOUT.slice(Math.max(0, idx - 500), idx)
    expect(comentarioPrevio).toMatch(/selector de tema/)
  })
})
