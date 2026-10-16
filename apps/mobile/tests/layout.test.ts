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
