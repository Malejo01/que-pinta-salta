import { describe, it, expect } from 'vitest'
import {
  mensajeErrorAlta,
  MENSAJE_ALTA_GENERICO,
  MENSAJE_ALTA_ENVIADA,
  mensajeErrorIngreso,
  mensajeErrorContrasena,
} from '@/lib/auth/mensajes'

const GENERICO = 'No se pudo crear la cuenta. Si ya tenés una, iniciá sesión.'

describe('mensajeErrorAlta', () => {
  it('texto genérico exacto', () => {
    expect(MENSAJE_ALTA_GENERICO).toBe(GENERICO)
  })

  it('email ya registrado, con código o solo con el mensaje: genérico', () => {
    expect(mensajeErrorAlta({ message: 'User already registered', code: 'user_already_exists', status: 422 })).toBe(GENERICO)
    expect(mensajeErrorAlta(new Error('User already registered'))).toBe(GENERICO)
    expect(mensajeErrorAlta({ message: 'User already registered' })).toBe(GENERICO)
  })

  it('error desconocido: genérico', () => {
    expect(mensajeErrorAlta(null)).toBe(GENERICO)
    expect(mensajeErrorAlta('boom')).toBe(GENERICO)
    expect(mensajeErrorAlta({ code: 'algo_raro', status: 500 })).toBe(GENERICO)
  })

  it('contraseña débil', () => {
    expect(mensajeErrorAlta({ code: 'weak_password', message: 'x' })).toBe('La contraseña es muy débil: usá al menos 6 caracteres.')
  })

  it('email inválido', () => {
    expect(mensajeErrorAlta({ code: 'email_address_invalid', message: 'x' })).toBe('Revisá el email: no parece válido.')
  })

  it('demasiados intentos, por código y por status', () => {
    const esperado = 'Demasiados intentos. Probá de nuevo en unos minutos.'
    expect(mensajeErrorAlta({ code: 'over_email_send_rate_limit', message: 'x' })).toBe(esperado)
    expect(mensajeErrorAlta({ code: 'over_request_rate_limit', message: 'x' })).toBe(esperado)
    expect(mensajeErrorAlta({ status: 429, message: 'x' })).toBe(esperado)
  })

  it('nunca devuelve el message original', () => {
    const mensajes = ['User already registered', 'secreto@example.com ya existe', 'Password should be at least 6 characters']
    for (const message of mensajes) {
      for (const code of [undefined, 'user_already_exists', 'weak_password', 'email_address_invalid', 'over_request_rate_limit']) {
        expect(mensajeErrorAlta({ message, code, status: 400 })).not.toContain(message)
      }
    }
  })
})

describe('MENSAJE_ALTA_ENVIADA', () => {
  it('texto exacto', () => {
    expect(MENSAJE_ALTA_ENVIADA).toBe(
      'Si ese email no tenía cuenta, te mandamos un correo para confirmarla. Si ya tenías una, iniciá sesión o recuperá tu contraseña.',
    )
  })
})

describe('mensajeErrorIngreso', () => {
  it('credenciales inválidas', () => {
    expect(mensajeErrorIngreso({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      'El email o la contraseña no son correctos. Si entraste con Google, usá el botón de Google.',
    )
  })

  it('email no confirmado', () => {
    expect(mensajeErrorIngreso({ code: 'email_not_confirmed', message: 'x' })).toBe(
      'Todavía no confirmaste el email: revisá tu casilla.',
    )
  })

  it('demasiados intentos, por código y por status', () => {
    const esperado = 'Demasiados intentos. Probá de nuevo en unos minutos.'
    expect(mensajeErrorIngreso({ code: 'over_email_send_rate_limit', message: 'x' })).toBe(esperado)
    expect(mensajeErrorIngreso({ code: 'over_request_rate_limit', message: 'x' })).toBe(esperado)
    expect(mensajeErrorIngreso({ status: 429, message: 'x' })).toBe(esperado)
  })

  it('error desconocido', () => {
    expect(mensajeErrorIngreso({ code: 'algo_raro', status: 500 })).toBe(
      'No pudimos iniciar sesión. Probá de nuevo en unos minutos.',
    )
  })

  it('nunca devuelve el message original', () => {
    const mensajes = ['Invalid login credentials', 'secreto@example.com no existe']
    for (const message of mensajes) {
      for (const code of [undefined, 'invalid_credentials', 'email_not_confirmed', 'over_request_rate_limit']) {
        expect(mensajeErrorIngreso({ message, code, status: 400 })).not.toContain(message)
      }
    }
  })
})

describe('mensajeErrorContrasena', () => {
  it('contraseña débil', () => {
    expect(mensajeErrorContrasena({ code: 'weak_password', message: 'x' })).toBe(
      'La contraseña es muy débil: usá al menos 6 caracteres.',
    )
  })

  it('misma contraseña', () => {
    expect(mensajeErrorContrasena({ code: 'same_password', message: 'x' })).toBe('Esa ya es tu contraseña. Elegí otra.')
  })

  it('necesita reautenticarse, por código y por status', () => {
    const esperado = 'Por seguridad, cerrá sesión, volvé a entrar y probá de nuevo.'
    expect(mensajeErrorContrasena({ code: 'reauthentication_needed', message: 'x' })).toBe(esperado)
    expect(mensajeErrorContrasena({ status: 401, message: 'x' })).toBe(esperado)
    expect(mensajeErrorContrasena({ status: 403, message: 'x' })).toBe(esperado)
  })

  it('error desconocido', () => {
    expect(mensajeErrorContrasena({ code: 'algo_raro', status: 500 })).toBe(
      'No pudimos guardar la contraseña. Probá de nuevo en unos minutos.',
    )
  })

  it('nunca devuelve el message original', () => {
    const mensajes = ['Password should be at least 6 characters', 'New password should be different from the old password.']
    for (const message of mensajes) {
      for (const code of [undefined, 'weak_password', 'same_password', 'reauthentication_needed']) {
        expect(mensajeErrorContrasena({ message, code, status: 400 })).not.toContain(message)
      }
    }
  })
})
