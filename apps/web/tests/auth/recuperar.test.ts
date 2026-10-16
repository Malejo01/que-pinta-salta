// F6 (QPS-145, 29-e): /auth/recuperar nunca puede revelar si una cuenta
// existe, ni mostrar `error.message` crudo; /auth/restablecer exige sesión
// igual que /perfil. Sin red ni base: lectura estática del código fuente +
// la función pura `esErrorDeEnvio`, y RestablecerPage con Supabase mockeado.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AuthRetryableFetchError } from '@supabase/supabase-js'

const ROOT = join(__dirname, '..', '..')
const RECUPERAR_PATH = join(ROOT, 'app', 'auth', 'recuperar', 'page.tsx')
const RESTABLECER_PATH = join(ROOT, 'app', 'auth', 'restablecer', 'page.tsx')
const LOGIN_PATH = join(ROOT, 'app', 'auth', 'login', 'page.tsx')

const recuperarSrc = readFileSync(RECUPERAR_PATH, 'utf8')
const restablecerSrc = readFileSync(RESTABLECER_PATH, 'utf8')
const loginSrc = readFileSync(LOGIN_PATH, 'utf8')

import { esErrorDeEnvio, MENSAJE_ENVIADO, MENSAJE_GOOGLE, MENSAJE_LIMITE } from '@/app/auth/recuperar/page'

describe('esErrorDeEnvio: solo red o límite de envíos (429)', () => {
  it('error de red (AuthRetryableFetchError): true', () => {
    expect(esErrorDeEnvio(new AuthRetryableFetchError('offline', 0))).toBe(true)
  })

  it('códigos de límite de envíos: true', () => {
    expect(esErrorDeEnvio({ code: 'over_email_send_rate_limit', message: 'x' })).toBe(true)
    expect(esErrorDeEnvio({ code: 'over_request_rate_limit', message: 'x' })).toBe(true)
  })

  it('status 429 sin código: true', () => {
    expect(esErrorDeEnvio({ status: 429, message: 'Too Many Requests' })).toBe(true)
  })

  it('"usuario no encontrado" (o cualquier otro error): false, nunca revela si la cuenta existe', () => {
    expect(esErrorDeEnvio({ code: 'user_not_found', message: 'User not found', status: 400 })).toBe(false)
    expect(esErrorDeEnvio(new Error('User not found'))).toBe(false)
  })

  it('sin error (éxito): false', () => {
    expect(esErrorDeEnvio(null)).toBe(false)
    expect(esErrorDeEnvio(undefined)).toBe(false)
  })
})

describe('/auth/recuperar: el mensaje nunca revela si la cuenta existe', () => {
  it('el mensaje de éxito es un único texto fijo, siempre el mismo', () => {
    expect(MENSAJE_ENVIADO).toBe(
      'Si hay una cuenta con ese email, te mandamos un link para elegir una contraseña nueva. Revisá tu correo (y el spam).',
    )
    expect(MENSAJE_GOOGLE).toBe('Si entraste con Google, no tenés contraseña: usá el botón de Google.')
  })

  it('el mensaje de límite de envíos es distinto, y solo se usa junto a esErrorDeEnvio', () => {
    expect(MENSAJE_LIMITE).toBe('No pudimos mandar el correo. Probá de nuevo en unos minutos.')
    expect(recuperarSrc).toMatch(/esErrorDeEnvio\([^)]*\)\)\s*\{\s*setErrorLimite\(true\)/)
  })

  it('setEnviado(true) se dispara tanto en el éxito como en el error "no de envío" (misma rama, sin distinguir si la cuenta existe)', () => {
    const matches = recuperarSrc.match(/setEnviado\(true\)/g) ?? []
    // Una vez cuando resetPasswordForEmail no da un error "de envío", y otra
    // vez en el catch cuando la excepción tampoco es "de envío": las dos
    // ramas no pueden distinguir entre éxito y "usuario no encontrado".
    expect(matches.length).toBe(2)
  })

  it('nunca muestra error.message (ni lo lee)', () => {
    expect(recuperarSrc).not.toMatch(/\.message/)
  })

  it('nunca loguea el email (sin console.* con "email")', () => {
    expect(recuperarSrc).not.toMatch(/console\.\w+/)
  })

  it('el botón queda deshabilitado mientras envía', () => {
    expect(recuperarSrc).toMatch(/disabled=\{isLoading\}/)
  })

  it('redirectTo apunta a /auth/callback?next=/auth/restablecer', () => {
    expect(recuperarSrc).toMatch(
      /redirectTo:\s*`\$\{window\.location\.origin\}\/auth\/callback\?next=\/auth\/restablecer`/,
    )
  })

  it('usa el cliente de navegador de la web (lib/supabase/client)', () => {
    expect(recuperarSrc).toMatch(/from ['"]@\/lib\/supabase\/client['"]/)
  })
})

describe('/auth/login: suma el link "¿Olvidaste tu contraseña?" a /auth/recuperar', () => {
  it('el link está y apunta a /auth/recuperar', () => {
    expect(loginSrc).toMatch(/¿Olvidaste tu contraseña\?/)
    expect(loginSrc).toMatch(/href=["']\/auth\/recuperar["']/)
  })
})

describe('/auth/restablecer: exige sesión, igual que /perfil, y monta ChangePasswordForm', () => {
  it('monta ChangePasswordForm tal cual, con el título "Elegí tu contraseña nueva" arriba', () => {
    expect(restablecerSrc).toMatch(/from ["']@\/components\/change-password-form["']/)
    expect(restablecerSrc).toMatch(/<ChangePasswordForm\s*\/>/)
    expect(restablecerSrc).toMatch(/Elegí tu contraseña nueva/)
  })

  it('exige sesión con getUser() y redirect a /auth/login?next=/auth/restablecer', async () => {
    vi.resetModules()
    vi.doMock('next/navigation', () => ({
      redirect: (url: string) => {
        throw new Error('redirect: ' + url)
      },
    }))
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: null } }) },
      }),
    }))
    const { default: RestablecerPage } = await import('@/app/auth/restablecer/page')
    await expect(RestablecerPage()).rejects.toThrow('redirect: /auth/login?next=/auth/restablecer')
  })

  it('con sesión, no redirige', async () => {
    vi.resetModules()
    vi.doMock('next/navigation', () => ({
      redirect: (url: string) => {
        throw new Error('redirect: ' + url)
      },
    }))
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'usuario-de-prueba' } } }) },
      }),
    }))
    const { default: RestablecerPage } = await import('@/app/auth/restablecer/page')
    await expect(RestablecerPage()).resolves.toBeTruthy()
  })
})
