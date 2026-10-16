// 33-b (QPS-148): la barra de estado del layout raíz sigue al tema. Hoy el
// tema es siempre oscuro (D1, 29-g), así que el estilo es "light" (íconos
// blancos) y fijo — el comentario de `_layout.tsx` deja escrito que el día
// que haya selector de tema, este valor tiene que dejar de ser fijo.
// Lectura estática con `fs`, sin montar nada de React Native: mismo patrón
// que `tests/estado-carga-detector.test.ts` y `tests/base-visual.test.ts`.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const RUTA_LAYOUT = fileURLToPath(new URL('../app/_layout.tsx', import.meta.url))
const SRC_LAYOUT = readFileSync(RUTA_LAYOUT, 'utf8')

describe('app/_layout.tsx: QPS-148, la barra de estado (StatusBar)', () => {
  it('importa StatusBar de expo-status-bar', () => {
    expect(SRC_LAYOUT).toMatch(/import\s*\{\s*StatusBar\s*\}\s*from\s*['"]expo-status-bar['"]/)
  })

  it('renderiza <StatusBar style="light" /> dentro del árbol raíz', () => {
    expect(SRC_LAYOUT).toMatch(/<StatusBar\s+style="light"\s*\/>/)
  })

  it('el comentario de arriba de StatusBar avisa que tiene que seguir al tema cuando haya selector', () => {
    const idx = SRC_LAYOUT.indexOf('<StatusBar style="light" />')
    expect(idx).toBeGreaterThan(-1)
    const comentarioPrevio = SRC_LAYOUT.slice(Math.max(0, idx - 500), idx)
    expect(comentarioPrevio).toMatch(/selector de tema/)
  })
})
