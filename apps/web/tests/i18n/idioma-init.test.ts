/**
 * `IDIOMA_INIT_SCRIPT` (lib/i18n/idioma-init.ts): el layout raíz escribe
 * siempre `lang="es-AR"` (para no volver dinámico el sitio con headers()) y
 * este script del `<head>` lo pasa a `en` en /en y /en/... antes del primer
 * pintado. Se corre el script de verdad en un contexto de `vm`, con la misma
 * regla que `separarIdioma`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { IDIOMA_INIT_SCRIPT } from '@/lib/i18n/idioma-init'
import { separarIdioma } from '@/lib/i18n/rutas'
import { LANG_HTML } from '@/lib/i18n/idiomas'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function langTrasElScript(pathname: string): string {
  const documentElement = { lang: 'es-AR' }
  vm.runInNewContext(IDIOMA_INIT_SCRIPT, { location: { pathname }, document: { documentElement } })
  return documentElement.lang
}

describe('IDIOMA_INIT_SCRIPT', () => {
  it.each(['/en', '/en/', '/en/cines', '/en/evento/abc'])('%s → en', (pathname) => {
    expect(langTrasElScript(pathname)).toBe('en')
  })

  it.each(['/', '/cines', '/entradas', '/english', '/mapa', '/evento/en'])('%s → queda es-AR', (pathname) => {
    expect(langTrasElScript(pathname)).toBe('es-AR')
  })

  it('coincide con separarIdioma en todos los casos', () => {
    for (const pathname of ['/', '/en', '/en/', '/en/cines', '/entradas', '/english', '/cines', '/en/x/y']) {
      expect(langTrasElScript(pathname)).toBe(LANG_HTML[separarIdioma(pathname).idioma])
    }
  })

  it('no tira si no hay location (lo envuelve un try)', () => {
    expect(() => vm.runInNewContext(IDIOMA_INIT_SCRIPT, {})).not.toThrow()
  })
})

describe('el layout raíz sigue estático', () => {
  // Sin comentarios (de bloque, de línea y de JSX): un comentario que nombre headers() no cuenta.
  const layout = readFileSync(path.join(WEB_ROOT, 'app/layout.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[^\S\n]*\/\/.*$/gm, '')

  it('no lee headers() ni cookies() y escribe lang="es-AR" fijo', () => {
    expect(layout).not.toMatch(/\bheaders\(\)|\bcookies\(\)/)
    expect(layout).not.toMatch(/async function RootLayout/)
    expect(layout).toMatch(/<html lang="es-AR"/)
  })

  it('carga el script de idioma en el <head>', () => {
    expect(layout).toMatch(/__html: IDIOMA_INIT_SCRIPT/)
  })
})
