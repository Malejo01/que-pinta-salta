/**
 * `ChangePasswordForm` (R48, tarea 48-c): "Crear contraseña" para cuentas de
 * Google, además de "cambiar" para cuentas de email. Mismo patrón que
 * `tests/components/password-input.test.ts`: `apps/web` corre Vitest con
 * `environment: 'node'` por omisión, así que se usa `react-dom/server` para
 * renderizar sin DOM, y `fs` para los detectores estáticos sobre el código
 * fuente. (Desde la R61 jsdom y Testing Library están instalados y los tests
 * de `tests/dom/` piden su entorno por archivo; acá no hacen falta.)
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ChangePasswordForm } from '@/components/change-password-form'
import { textosContrasena, type ModoContrasena } from '@qps/core/auth/cuenta'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function readSource(relativePath: string): string {
  return readFileSync(path.join(WEB_ROOT, relativePath), 'utf8')
}

const COMPONENT_PATH = 'components/change-password-form.tsx'

describe('ChangePasswordForm: los textos salen de textosContrasena(modo), no escritos a mano', () => {
  const casos: ModoContrasena[] = ['google', 'email', 'mixta', 'desconocida', 'restablecer']

  it.each(casos)('modo=%s: el HTML contiene el título y la descripción de textosContrasena', (modo) => {
    const { titulo, descripcion } = textosContrasena(modo)
    const html = renderToStaticMarkup(React.createElement(ChangePasswordForm, { modo }))

    expect(html).toContain(titulo)
    expect(html).toContain(descripcion)
  })

  it('modo="google": pide crear una contraseña (no "cambiar")', () => {
    const html = renderToStaticMarkup(React.createElement(ChangePasswordForm, { modo: 'google' }))
    expect(html).toContain(textosContrasena('google').descripcion)
    expect(html).toContain('Entraste con Google')
  })

  it('sin prop (por defecto): los mismos textos que modo="email"', () => {
    const htmlPorDefecto = renderToStaticMarkup(React.createElement(ChangePasswordForm, {}))
    const htmlEmail = renderToStaticMarkup(React.createElement(ChangePasswordForm, { modo: 'email' }))
    expect(htmlPorDefecto).toBe(htmlEmail)
    expect(htmlPorDefecto).toContain(textosContrasena('email').titulo)
  })

  it('modo="restablecer": el título es el de restablecer, no el de email ni el de google', () => {
    const html = renderToStaticMarkup(React.createElement(ChangePasswordForm, { modo: 'restablecer' }))
    expect(html).toContain(textosContrasena('restablecer').titulo)
    expect(html).not.toContain(textosContrasena('google').descripcion)
  })
})

describe('ChangePasswordForm: el componente no escribe los textos a mano (compara contra core, no contra literales)', () => {
  const source = readSource(COMPONENT_PATH)

  it('importa textosContrasena de @qps/core/auth/cuenta', () => {
    expect(source).toMatch(/import\s*\{[^}]*textosContrasena[^}]*\}\s*from\s*['"]@qps\/core\/auth\/cuenta['"]/)
  })

  it('usa textosContrasena(modo) para armar el título/descripción/botón, no strings sueltos', () => {
    expect(source).toMatch(/textosContrasena\(\s*modo\s*\)/)
  })

  // Si alguno de estos literales volviera a aparecer tal cual en el
  // componente, sería porque alguien lo volvió a escribir a mano en vez de
  // dejar que viniera de `textosContrasena` (los valores de hoy, por si
  // cambian en core y el test queda mintiendo).
  const modos: ModoContrasena[] = ['google', 'email', 'mixta', 'desconocida', 'restablecer']
  it.each(modos)('el título de textosContrasena(%s) no está copiado como literal en el componente', (modo) => {
    const { titulo } = textosContrasena(modo)
    // CardTitle usa {titulo} (la variable), no el string: si apareciera el
    // literal entre comillas sería la señal de que se volvió a escribir a
    // mano en vez de usar la función.
    const literalEntreComillas = new RegExp(`['"\`]${titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`)
    expect(source).not.toMatch(literalEntreComillas)
  })
})

describe('ChangePasswordForm: no pide la contraseña actual y no valida a mano', () => {
  const source = readSource(COMPONENT_PATH)

  it('tiene exactamente dos <PasswordInput /> (nueva y confirmar), no un tercero para la actual', () => {
    const coincidencias = source.match(/<PasswordInput\b/g) ?? []
    expect(coincidencias.length).toBe(2)
  })

  it('no tiene un id "current-password" (campo de la contraseña actual)', () => {
    expect(source).not.toMatch(/current-password/i)
  })

  it('usa validarContrasenaNueva, no un chequeo de largo escrito a mano', () => {
    expect(source).toMatch(/import\s*\{[^}]*validarContrasenaNueva[^}]*\}\s*from\s*['"]@qps\/core\/auth\/cuenta['"]/)
    expect(source).toMatch(/validarContrasenaNueva\(/)
  })
})

describe('ChangePasswordForm: QPS-155 — nunca el error crudo a la pantalla ni a la consola', () => {
  const source = readSource(COMPONENT_PATH)

  it('no contiene err.message ni error.message', () => {
    expect(source).not.toMatch(/\berr\.message\b/)
    expect(source).not.toMatch(/\berror\.message\b/)
  })

  it('usa mensajeErrorContrasena para traducir el error a la pantalla', () => {
    expect(source).toMatch(/import\s*\{[^}]*mensajeErrorContrasena[^}]*\}\s*from\s*['"]@qps\/core\/auth\/mensajes['"]/)
    expect(source).toMatch(/mensajeErrorContrasena\(/)
  })

  it('ningún console.error( del archivo tiene un segundo argumento (solo un texto fijo)', () => {
    const llamadas = [...source.matchAll(/console\.error\(([^)]*)\)/g)]
    expect(llamadas.length).toBeGreaterThan(0)
    for (const [, argumentos] of llamadas) {
      // Separar por comas de nivel superior sería más robusto, pero acá
      // alcanza: ninguna llamada real del archivo tiene paréntesis ni
      // llaves anidadas en sus argumentos.
      const partes = argumentos.split(',')
      expect(partes.length).toBe(1)
    }
  })

  it('la contraseña nunca llega a un console.*', () => {
    expect(source).not.toMatch(/console\.\w+\([^)]*password[^)]*\)/i)
  })
})

describe('app/perfil/page.tsx: le pasa a ChangePasswordForm el tipo de cuenta', () => {
  it('contiene modo={tipoDeCuenta(', () => {
    const source = readSource('app/perfil/page.tsx')
    expect(source).toContain('modo={tipoDeCuenta(')
  })

  it('importa tipoDeCuenta de @qps/core/auth/cuenta', () => {
    const source = readSource('app/perfil/page.tsx')
    expect(source).toMatch(/import\s*\{[^}]*tipoDeCuenta[^}]*\}\s*from\s*['"]@qps\/core\/auth\/cuenta['"]/)
  })
})

describe('app/auth/restablecer/page.tsx: le pasa a ChangePasswordForm modo="restablecer"', () => {
  it('contiene modo="restablecer"', () => {
    const source = readSource('app/auth/restablecer/page.tsx')
    expect(source).toContain('modo="restablecer"')
  })

  it('el redirect sin sesión sigue igual (F6/QPS-145)', () => {
    const source = readSource('app/auth/restablecer/page.tsx')
    expect(source).toContain('/auth/login?next=/auth/restablecer')
  })
})
