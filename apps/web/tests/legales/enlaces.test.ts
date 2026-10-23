/**
 * Tarea 45-d: enlaces a /terminos y /privacidad en el footer, el registro,
 * el login y el modal de auth, más las dos rutas en el sitemap. Detectores
 * de solo lectura sobre el texto de los archivos (sin render).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

function leer(rutaRelativa: string): string {
  const contenido = readFileSync(join(ROOT, rutaRelativa), 'utf8')
  expect(contenido.trim().length).toBeGreaterThan(0)
  return contenido
}

describe('components/footer.tsx', () => {
  const archivo = leer('components/footer.tsx')

  it('tiene href="/terminos" y sigue teniendo href="/privacidad"', () => {
    expect(archivo).toContain('href="/terminos"')
    expect(archivo).toContain('href="/privacidad"')
  })

  it('"Términos y condiciones" aparece después de "Política de Privacidad"', () => {
    const posPrivacidad = archivo.indexOf('Política de Privacidad')
    const posTerminos = archivo.indexOf('Términos y condiciones')
    expect(posPrivacidad).toBeGreaterThan(-1)
    expect(posTerminos).toBeGreaterThan(-1)
    expect(posTerminos).toBeGreaterThan(posPrivacidad)
  })
})

describe('app/auth/sign-up/page.tsx', () => {
  const archivo = leer('app/auth/sign-up/page.tsx')

  it('tiene href="/terminos" y href="/privacidad"', () => {
    expect(archivo).toContain('href="/terminos"')
    expect(archivo).toContain('href="/privacidad"')
  })

  it('contiene la cadena "aceptás" (texto de aceptación de legales)', () => {
    expect(archivo).toContain('aceptás')
  })
})

describe('app/auth/login/page.tsx', () => {
  const archivo = leer('app/auth/login/page.tsx')

  it('tiene href="/terminos" y href="/privacidad"', () => {
    expect(archivo).toContain('href="/terminos"')
    expect(archivo).toContain('href="/privacidad"')
  })

  it('contiene la cadena "aceptás" (texto de aceptación de legales)', () => {
    expect(archivo).toContain('aceptás')
  })

  it('no contiene formas de tuteo que debían corregirse en esta tarea', () => {
    expect(archivo).not.toContain('¿No tienes cuenta?')
    expect(archivo).not.toContain('Iniciar sesion')
    expect(archivo).not.toContain('Iniciando sesion')
    expect(archivo).not.toContain('Iniciar Sesion')
    expect(archivo).not.toContain('Ingresa tu email')
    expect(archivo).not.toContain('Ocurrio un error')
  })
})

describe('components/auth-modal.tsx', () => {
  const archivo = leer('components/auth-modal.tsx')

  it('tiene href="/terminos" y href="/privacidad"', () => {
    expect(archivo).toContain('href="/terminos"')
    expect(archivo).toContain('href="/privacidad"')
  })

  it('contiene la cadena "aceptás" (texto de aceptación de legales)', () => {
    expect(archivo).toContain('aceptás')
  })

  it('el <Link> que lleva a /terminos tiene onClick={close}', () => {
    const matches = archivo.match(/<Link[^>]*href="\/terminos"[^>]*>/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThan(0)
    for (const etiqueta of matches!) {
      expect(etiqueta).toContain('onClick={close}')
    }
  })

  it('el <Link> que lleva a /privacidad tiene onClick={close}', () => {
    const matches = archivo.match(/<Link[^>]*href="\/privacidad"[^>]*>/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThan(0)
    for (const etiqueta of matches!) {
      expect(etiqueta).toContain('onClick={close}')
    }
  })
})

describe('app/sitemap.ts', () => {
  const archivo = leer('app/sitemap.ts')

  it('tiene staticRoute("/terminos" dos veces (lista normal y de respaldo)', () => {
    const apariciones = archivo.split('staticRoute("/terminos"').length - 1
    expect(apariciones).toBe(2)
  })

  it('tiene staticRoute("/privacidad" dos veces (lista normal y de respaldo)', () => {
    const apariciones = archivo.split('staticRoute("/privacidad"').length - 1
    expect(apariciones).toBe(2)
  })
})
