/**
 * 35-a: el ojito (`PasswordInput`) en `/auth/login` y el enlace a
 * "¿Olvidaste tu contraseña?" (`/auth/recuperar`) en el modal de login.
 *
 * Sin red ni base: lectura de archivos fuente con `fs`. Rutas resueltas
 * desde este test con `fileURLToPath`; si una ruta no existe, el
 * `readFileSync` tira y el test falla ruidosamente, nunca un "no hay nada
 * que revisar".
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { es } from '@/lib/i18n/diccionarios/es'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function readSource(relativePath: string): string {
  return readFileSync(path.join(WEB_ROOT, relativePath), 'utf8')
}

const LOGIN_PAGE = 'app/auth/login/page.tsx'
const AUTH_MODAL = 'components/auth-modal.tsx'

describe('app/auth/login/page.tsx: el campo de contraseña tiene el ojito (PasswordInput)', () => {
  const src = readSource(LOGIN_PAGE)

  it('importa PasswordInput de @/components/ui/password-input', () => {
    expect(src).toMatch(
      /import\s*\{[^}]*PasswordInput[^}]*\}\s*from\s*['"]@\/components\/ui\/password-input['"]/
    )
  })

  it('usa <PasswordInput id="password" /> en vez de un <Input type="password" /> suelto', () => {
    expect(src).toMatch(/<PasswordInput\b/)
    expect(src).not.toMatch(/type=["']password["']/)
  })

  it('el campo de contraseña sigue enviando id="password", value={password} y onChange para setPassword', () => {
    expect(src).toMatch(/id="password"/)
    expect(src).toMatch(/value=\{password\}/)
    expect(src).toMatch(/onChange=\{\(e\)\s*=>\s*setPassword\(e\.target\.value\)\}/)
  })

  it('sigue teniendo el link a /auth/recuperar (de la R29, no duplicado)', () => {
    const coincidencias = src.match(/href="\/auth\/recuperar"/g) ?? []
    expect(coincidencias.length).toBe(1)
  })
})

describe('components/auth-modal.tsx: el modo login enlaza a /auth/recuperar', () => {
  const src = readSource(AUTH_MODAL)

  it('tiene un <Link href="/auth/recuperar">', () => {
    expect(src).toMatch(/<Link[^>]*href="\/auth\/recuperar"/)
  })

  // Q3: el texto sale del diccionario (`auth.olvidasteContrasena`); en castellano es el mismo de /auth/login.
  it('el texto es el mismo que en /auth/login: "¿Olvidaste tu contraseña?"', () => {
    const bloqueLink = src.match(/<Link[^>]*href="\/auth\/recuperar"[\s\S]*?\/Link>/)![0]
    expect(bloqueLink).toContain('{t.olvidasteContrasena}')
    expect(es.auth.olvidasteContrasena).toBe('¿Olvidaste tu contraseña?')
    expect(readSource(LOGIN_PAGE)).toContain('¿Olvidaste tu contraseña?')
  })

  it('el link cierra el modal al navegar, usando la forma de cerrar que ya existe en el archivo (close)', () => {
    const match = src.match(/<Link[^>]*href="\/auth\/recuperar"[\s\S]*?\/Link>/)
    expect(match).not.toBeNull()
    const bloqueLink = match![0]
    expect(bloqueLink).toMatch(/onClick=\{close\}/)
  })
})
