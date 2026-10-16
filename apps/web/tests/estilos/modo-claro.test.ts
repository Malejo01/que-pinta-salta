// Modo claro en Radar y Cines (tarea 30-d, ronda 30): detector estático sobre
// el código fuente, sin red ni base. Verifica que las 6 pantallas/componentes
// tocados no usen colores fijos (`zinc-*`, `bg-black`, `text-white`) salvo que
// tengan su variante `dark:` (o estén en la lista de excepciones explícita,
// con el motivo), y que `/cines` monte la misma nav (`Navbar`/`MobileNav`)
// que el resto del sitio.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// apps/web/tests/estilos -> apps/web/tests -> apps/web
const ROOT = join(__dirname, '..', '..')
const read = (relPath: string) => readFileSync(join(ROOT, relPath), 'utf8')

const FILES = [
  'app/cines/page.tsx',
  'components/cines-view.tsx',
  'components/movie-card.tsx',
  'components/movie-modal.tsx',
  'app/radar/page.tsx',
  'components/radar-form.tsx',
] as const

/**
 * Cualquier token de clase que contenga `zinc-<n>`, `bg-black(/<n>)?` o
 * `text-white`, tal como aparece en el archivo (incluye los modificadores
 * pegados, p. ej. `hover:bg-black/80` o `dark:from-zinc-100`).
 */
const CLASS_TOKEN_PATTERN =
  /[A-Za-z0-9_:/.[\]#-]*(?:zinc-\d+|bg-black(?:\/\d+)?|text-white)[A-Za-z0-9_:/.[\]#-]*/g

function findFixedColorTokens(content: string): string[] {
  return content.match(CLASS_TOKEN_PATTERN) ?? []
}

/**
 * Excepciones explícitas: clases fijas que a propósito NO tienen variante
 * `dark:` porque el color tiene que quedar igual en los dos temas (van sobre
 * una imagen o un botón con un color de marca fijo, no un token del tema).
 */
const EXCEPTIONS: Record<string, { token: string; reason: string }[]> = {
  'components/movie-card.tsx': [
    {
      token: 'bg-black/70',
      reason:
        'Badge con la cantidad de cines, superpuesto al afiche de la película (brillo variable): necesita contraste garantizado, no el del tema.',
    },
    {
      token: 'hover:bg-black/80',
      reason: 'Mismo badge que bg-black/70, estado hover.',
    },
    {
      token: 'text-white',
      reason: 'Texto del badge sobre el afiche; mismo motivo que bg-black.',
    },
    {
      token: 'border-zinc-700/50',
      reason: 'Borde del mismo badge flotante sobre el afiche.',
    },
  ],
  'components/radar-form.tsx': [
    {
      token: 'text-white',
      reason:
        'Botón "Donar ahora" del toast, con el rojo de marca fijo (#C12026) en los dos temas: el texto blanco no depende de claro/oscuro.',
    },
  ],
}

describe('Radar y Cines en modo claro: sin colores fijos sin variante dark:', () => {
  it.each(FILES)('%s: toda clase zinc-/bg-black/text-white tiene su dark: (o está en la lista de excepciones)', (relPath) => {
    const content = read(relPath)
    const tokens = findFixedColorTokens(content)
    const allowed = (EXCEPTIONS[relPath] ?? []).map((e) => e.token)

    const violations = tokens.filter((token) => !token.includes('dark:') && !allowed.includes(token))

    expect(violations).toEqual([])
  })

  it('las excepciones declaradas existen de verdad en su archivo (no quedaron huérfanas)', () => {
    for (const [relPath, exceptions] of Object.entries(EXCEPTIONS)) {
      const content = read(relPath)
      for (const { token, reason } of exceptions) {
        expect(reason.length).toBeGreaterThan(0)
        expect(content).toContain(token)
      }
    }
  })

  it('border-zinc-850 (clase inexistente en Tailwind) no se usa en ningún archivo', () => {
    for (const relPath of FILES) {
      expect(read(relPath)).not.toContain('zinc-850')
    }
  })
})

describe('/cines usa la misma nav que el resto del sitio', () => {
  const content = read('app/cines/page.tsx')

  it('importa Navbar desde components/navbar', () => {
    expect(content).toMatch(/import\s*\{\s*Navbar\s*\}\s*from\s*['"]@\/components\/navbar['"]/)
  })

  it('importa MobileNav desde components/mobile-nav', () => {
    expect(content).toMatch(/import\s*\{\s*MobileNav\s*\}\s*from\s*['"]@\/components\/mobile-nav['"]/)
  })

  it('renderiza <Navbar /> y <MobileNav />', () => {
    expect(content).toMatch(/<Navbar\s*\/>/)
    expect(content).toMatch(/<MobileNav\s*\/>/)
  })
})
