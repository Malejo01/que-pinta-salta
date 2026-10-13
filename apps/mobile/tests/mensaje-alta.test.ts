// 25-c, punto 2: el mensaje de error del alta de cuenta en la app es
// idéntico al de la web (`MENSAJE_ALTA_GENERICO` de `@qps/core/auth/mensajes`,
// QPS-124) y nunca devuelve el `message` original del error del alta (eso
// confirmaría, para un email ya existente, que la cuenta existe). Sin red:
// `mensajeErrorAlta` es pura.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MENSAJE_ALTA_GENERICO, mensajeErrorAlta } from '@qps/core/auth/mensajes'

const CUENTA_TSX = fileURLToPath(new URL('../app/(tabs)/cuenta.tsx', import.meta.url))

describe('mensajeErrorAlta (@qps/core/auth/mensajes, mismo módulo que usa la web)', () => {
  it('weak_password: mensaje específico, no el genérico', () => {
    expect(mensajeErrorAlta({ code: 'weak_password', message: 'Password should be at least 6 characters' })).toBe(
      'La contraseña es muy débil: usá al menos 6 caracteres.'
    )
  })

  it('email_address_invalid: mensaje específico', () => {
    expect(mensajeErrorAlta({ code: 'email_address_invalid', message: 'Unable to validate email address' })).toBe(
      'Revisá el email: no parece válido.'
    )
  })

  it('rate limit por código: mensaje específico', () => {
    expect(mensajeErrorAlta({ code: 'over_email_send_rate_limit', message: 'rate limited' })).toMatch(/Demasiados intentos/)
    expect(mensajeErrorAlta({ code: 'over_request_rate_limit', message: 'rate limited' })).toMatch(/Demasiados intentos/)
  })

  it('rate limit por status 429 sin código: mensaje específico', () => {
    expect(mensajeErrorAlta({ status: 429, message: 'Too Many Requests' })).toMatch(/Demasiados intentos/)
  })

  it('user_already_exists / email ya registrado: el mensaje GENÉRICO, nunca confirma que existe', () => {
    // QPS-124: justamente el caso que no puede filtrarse. Si el código de
    // Supabase para "ya existe" tuviera un mensaje propio, dejaría de ser
    // indistinguible de cualquier otro fallo del alta.
    expect(mensajeErrorAlta({ code: 'user_already_exists', message: 'A user with this email address has already been registered' })).toBe(
      MENSAJE_ALTA_GENERICO
    )
    expect(mensajeErrorAlta({ code: 'email_exists', message: 'already registered' })).toBe(MENSAJE_ALTA_GENERICO)
    expect(mensajeErrorAlta({ code: 'identity_already_exists', message: 'already registered' })).toBe(MENSAJE_ALTA_GENERICO)
  })

  it('código desconocido: el mensaje genérico', () => {
    expect(mensajeErrorAlta({ code: 'algo_que_no_existe', message: 'detalle interno de la api' })).toBe(
      MENSAJE_ALTA_GENERICO
    )
  })

  it('sin code ni status (por ejemplo un Error de red cualquiera): el mensaje genérico', () => {
    expect(mensajeErrorAlta(new Error('fetch failed'))).toBe(MENSAJE_ALTA_GENERICO)
    expect(mensajeErrorAlta('un string cualquiera')).toBe(MENSAJE_ALTA_GENERICO)
    expect(mensajeErrorAlta(null)).toBe(MENSAJE_ALTA_GENERICO)
    expect(mensajeErrorAlta(undefined)).toBe(MENSAJE_ALTA_GENERICO)
  })

  it('un error "malicioso" (code es un objeto, no un string, o un prototipo manipulado) no explota y da el genérico', () => {
    expect(mensajeErrorAlta({ code: { toString: () => 'weak_password' } })).toBe(MENSAJE_ALTA_GENERICO)
    expect(mensajeErrorAlta({ code: ['weak_password'] })).toBe(MENSAJE_ALTA_GENERICO)
    expect(mensajeErrorAlta(Object.create(null))).toBe(MENSAJE_ALTA_GENERICO)
  })

  it('para ningún caso de prueba el resultado es el "message" original del error', () => {
    const casos: unknown[] = [
      { code: 'user_already_exists', message: 'A user with this email address has already been registered' },
      { code: 'weak_password', message: 'Password should be at least 6 characters' },
      { status: 429, message: 'Too Many Requests' },
      new Error('mensaje crudo que nunca tiene que salir'),
      { message: 'otro mensaje crudo que nunca tiene que salir' },
    ]
    for (const error of casos) {
      const resultado = mensajeErrorAlta(error)
      const mensajeOriginal = (error as { message?: string })?.message
      if (mensajeOriginal) {
        expect(resultado).not.toBe(mensajeOriginal)
        expect(resultado).not.toContain(mensajeOriginal)
      }
    }
  })
})

describe('app/(tabs)/cuenta.tsx: el camino del alta usa mensajeErrorAlta, no error.message crudo', () => {
  const src = readFileSync(CUENTA_TSX, 'utf8')

  it('importa mensajeErrorAlta de @qps/core/auth/mensajes', () => {
    expect(src).toMatch(/import\s*\{\s*mensajeErrorAlta\s*\}\s*from\s*['"]@qps\/core\/auth\/mensajes['"]/)
  })

  it('crearCuenta (la función del alta) llama a mensajeErrorAlta en su manejo de error, no a mensajeDeError', () => {
    const inicio = src.indexOf('async function crearCuenta')
    expect(inicio).toBeGreaterThan(-1)
    // Corta en la siguiente función async del archivo (entrarConGoogle), para
    // mirar solo el cuerpo de crearCuenta.
    const fin = src.indexOf('async function entrarConGoogle')
    expect(fin).toBeGreaterThan(inicio)
    const cuerpo = src.slice(inicio, fin)

    expect(cuerpo).toContain('mensajeErrorAlta(errorCrear)')
    expect(cuerpo).toContain('mensajeErrorAlta(excepcion)')
    // Ni un solo uso del mensaje crudo de la API en este camino.
    expect(cuerpo).not.toMatch(/errorCrear\.message/)
    expect(cuerpo).not.toMatch(/excepcion\.message/)
    expect(cuerpo).not.toContain('mensajeDeError(errorCrear)')
    expect(cuerpo).not.toContain('mensajeDeError(excepcion)')
  })
})
