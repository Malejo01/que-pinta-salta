import { describe, it, expect } from 'vitest'
import { mensajeErrorAlta, MENSAJE_ALTA_GENERICO } from '@/lib/auth/mensajes'

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
