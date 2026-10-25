/**
 * `packages/core/src/auth/cuenta.ts` (R48, tarea 48-a): tipo de cuenta,
 * textos de la contraseña, validación de la contraseña nueva y el saneo
 * reforzado de `next`. También cubre `resultadoAlta`, `mensajeErrorIngreso`
 * y `mensajeErrorContrasena` de `packages/core/src/auth/mensajes.ts`. Sin
 * React, sin Supabase, sin red. Fixtures inventadas.
 */
import { describe, expect, it } from 'vitest'
import {
  LARGO_MINIMO_CONTRASENA,
  rutaSiguienteSegura,
  textosContrasena,
  tipoDeCuenta,
  validarContrasenaNueva,
} from '@qps/core/auth/cuenta'
import {
  MENSAJE_ALTA_GENERICO,
  mensajeErrorContrasena,
  mensajeErrorIngreso,
  resultadoAlta,
  resultadoAltaConSesion,
} from '@qps/core/auth/mensajes'

// R67, 67-d: el alta con sesión (Confirm email apagado), solo para la app.
describe('resultadoAltaConSesion', () => {
  it('sin error y con una sesión objeto: "sesion"', () => {
    expect(
      resultadoAltaConSesion({ data: { user: { id: '1' }, session: { access_token: 'x' } }, error: null }),
    ).toEqual({ tipo: 'sesion' })
  })

  it('session null: "enviado"', () => {
    expect(resultadoAltaConSesion({ data: { user: { id: '1' }, session: null }, error: null })).toEqual({
      tipo: 'enviado',
    })
  })

  it.each([null, undefined, 'texto', 42, true])('data %s (no objeto): "enviado"', (data) => {
    expect(resultadoAltaConSesion({ data, error: null })).toEqual({ tipo: 'enviado' })
  })

  it('session que no es objeto (string): "enviado"', () => {
    expect(resultadoAltaConSesion({ data: { session: 'abc' }, error: null })).toEqual({ tipo: 'enviado' })
  })

  it('error con sesión: lo que diga el error, nunca "sesion"', () => {
    expect(
      resultadoAltaConSesion({ data: { session: { access_token: 'x' } }, error: { code: 'weak_password' } }),
    ).toEqual({
      tipo: 'error',
      mensaje: 'La contraseña es muy débil: usá al menos 6 caracteres.',
    })
  })

  it('código de "ya existe" con sesión: "enviado"', () => {
    expect(
      resultadoAltaConSesion({ data: { session: { access_token: 'x' } }, error: { code: 'user_already_exists' } }),
    ).toEqual({ tipo: 'enviado' })
  })
})

describe('resultadoAlta', () => {
  // La web sigue con `resultadoAlta`: el alta con sesión se informa "enviado".
  it('sin error y con sesión objeto: sigue dando "enviado" (la web no cambia)', () => {
    expect(resultadoAlta({ data: { user: { id: '1' }, session: { access_token: 'x' } }, error: null })).toEqual({
      tipo: 'enviado',
    })
  })

  it('sin error: enviado', () => {
    expect(resultadoAlta({ data: { user: { id: '1' } }, error: null })).toEqual({ tipo: 'enviado' })
  })

  it('sin error, con identities vacío (email ya existente con Confirm email prendido): enviado', () => {
    expect(resultadoAlta({ data: { user: { identities: [] } }, error: null })).toEqual({ tipo: 'enviado' })
  })

  it('error user_already_exists: enviado', () => {
    expect(resultadoAlta({ data: null, error: { code: 'user_already_exists' } })).toEqual({ tipo: 'enviado' })
  })

  it('error email_exists: enviado', () => {
    expect(resultadoAlta({ data: null, error: { code: 'email_exists' } })).toEqual({ tipo: 'enviado' })
  })

  it('error identity_already_exists: enviado', () => {
    expect(resultadoAlta({ data: null, error: { code: 'identity_already_exists' } })).toEqual({ tipo: 'enviado' })
  })

  it('error weak_password: error con el texto de hoy', () => {
    expect(resultadoAlta({ data: null, error: { code: 'weak_password' } })).toEqual({
      tipo: 'error',
      mensaje: 'La contraseña es muy débil: usá al menos 6 caracteres.',
    })
  })

  it('error sin code: error con el mensaje genérico', () => {
    expect(resultadoAlta({ data: null, error: { message: 'boom' } })).toEqual({
      tipo: 'error',
      mensaje: MENSAJE_ALTA_GENERICO,
    })
  })
})

describe('mensajeErrorIngreso', () => {
  it('invalid_credentials: no incluye el message original y da el texto fijo', () => {
    const resultado = mensajeErrorIngreso({ code: 'invalid_credentials', message: 'Invalid login credentials' })
    expect(resultado).not.toContain('Invalid login credentials')
    expect(resultado).toBe('El email o la contraseña no son correctos. Si entraste con Google, usá el botón de Google.')
  })

  it('email_not_confirmed', () => {
    expect(mensajeErrorIngreso({ code: 'email_not_confirmed' })).toBe(
      'Todavía no confirmaste el email: revisá tu casilla.',
    )
  })

  it('status 429 sin code: mismo texto que mensajeErrorAlta', () => {
    expect(mensajeErrorIngreso({ status: 429 })).toBe('Demasiados intentos. Probá de nuevo en unos minutos.')
  })

  it('error desconocido', () => {
    expect(mensajeErrorIngreso({ code: 'algo_raro' })).toBe('No pudimos iniciar sesión. Probá de nuevo en unos minutos.')
  })
})

describe('mensajeErrorContrasena', () => {
  it('weak_password: no incluye el message y da el mismo texto que mensajeErrorAlta', () => {
    const resultado = mensajeErrorContrasena({ code: 'weak_password', message: 'Password should be at least 6 characters' })
    expect(resultado).not.toContain('Password should be at least 6 characters')
    expect(resultado).toBe('La contraseña es muy débil: usá al menos 6 caracteres.')
  })

  it('same_password', () => {
    expect(mensajeErrorContrasena({ code: 'same_password', message: 'x' })).toBe('Esa ya es tu contraseña. Elegí otra.')
  })

  it('reauthentication_needed, o sin code con status 401 o 403', () => {
    const esperado = 'Por seguridad, cerrá sesión, volvé a entrar y probá de nuevo.'
    expect(mensajeErrorContrasena({ code: 'reauthentication_needed', message: 'x' })).toBe(esperado)
    expect(mensajeErrorContrasena({ status: 401, message: 'x' })).toBe(esperado)
    expect(mensajeErrorContrasena({ status: 403, message: 'x' })).toBe(esperado)
  })

  it('error desconocido', () => {
    expect(mensajeErrorContrasena({ code: 'algo_raro', message: 'x' })).toBe(
      'No pudimos guardar la contraseña. Probá de nuevo en unos minutos.',
    )
  })
})

describe('tipoDeCuenta', () => {
  it('identities con email y google: mixta', () => {
    expect(tipoDeCuenta({ identities: [{ provider: 'email' }, { provider: 'google' }] })).toBe('mixta')
  })

  it('identities solo con google: google', () => {
    expect(tipoDeCuenta({ identities: [{ provider: 'google' }] })).toBe('google')
  })

  it('identities solo con email: email', () => {
    expect(tipoDeCuenta({ identities: [{ provider: 'email' }] })).toBe('email')
  })

  it('objeto vacío: desconocida', () => {
    expect(tipoDeCuenta({})).toBe('desconocida')
  })

  it('respaldo por app_metadata.providers', () => {
    expect(tipoDeCuenta({ app_metadata: { providers: ['email', 'google'] } })).toBe('mixta')
    expect(tipoDeCuenta({ app_metadata: { providers: ['google'] } })).toBe('google')
    expect(tipoDeCuenta({ app_metadata: { providers: ['email'] } })).toBe('email')
  })

  it('respaldo por app_metadata.provider', () => {
    expect(tipoDeCuenta({ app_metadata: { provider: 'google' } })).toBe('google')
    expect(tipoDeCuenta({ app_metadata: { provider: 'email' } })).toBe('email')
  })

  it('null o undefined: desconocida', () => {
    expect(tipoDeCuenta(null)).toBe('desconocida')
    expect(tipoDeCuenta(undefined)).toBe('desconocida')
  })
})

describe('textosContrasena', () => {
  it('google', () => {
    expect(textosContrasena('google')).toEqual({
      titulo: 'Contraseña',
      descripcion:
        'Entraste con Google. Podés crear una contraseña para entrar también con tu email. Si ya creaste una, esto la reemplaza.',
      boton: 'Guardar contraseña',
    })
  })

  it('email', () => {
    expect(textosContrasena('email')).toEqual({
      titulo: 'Cambiar contraseña',
      descripcion: 'Elegí una contraseña nueva.',
      boton: 'Guardar contraseña',
    })
  })

  it('mixta: igual que email', () => {
    expect(textosContrasena('mixta')).toEqual(textosContrasena('email'))
  })

  it('desconocida', () => {
    expect(textosContrasena('desconocida')).toEqual({
      titulo: 'Contraseña',
      descripcion: 'Podés elegir una contraseña nueva para entrar con tu email. Si ya tenías una, esto la reemplaza.',
      boton: 'Guardar contraseña',
    })
  })

  it('restablecer', () => {
    expect(textosContrasena('restablecer')).toEqual({
      titulo: 'Elegí tu contraseña nueva',
      descripcion: 'Escribila dos veces para confirmar.',
      boton: 'Guardar contraseña',
    })
  })

  it('solo el texto de google nombra a Google', () => {
    const modos = ['google', 'email', 'mixta', 'desconocida', 'restablecer'] as const
    for (const modo of modos) {
      const { descripcion } = textosContrasena(modo)
      if (modo === 'google') {
        expect(descripcion).toContain('Google')
      } else {
        expect(descripcion).not.toContain('Google')
      }
    }
  })
})

describe('validarContrasenaNueva', () => {
  it('menos de 6 caracteres: error de largo', () => {
    const resultado = validarContrasenaNueva('abcde', 'abcde')
    expect(resultado).toEqual({ ok: false, mensaje: 'La contraseña debe tener al menos 6 caracteres.' })
  })

  it('dos contraseñas distintas, de largo suficiente: error de coincidencia', () => {
    const resultado = validarContrasenaNueva('zanahoria-7', 'zanahoria-8')
    expect(resultado).toEqual({ ok: false, mensaje: 'Las contraseñas no coinciden.' })
  })

  it('iguales y de largo mínimo: ok', () => {
    expect(validarContrasenaNueva('123456', '123456')).toEqual({ ok: true })
    expect(LARGO_MINIMO_CONTRASENA).toBe(6)
  })

  it('ningún mensaje contiene la contraseña que se pasó', () => {
    const corta = validarContrasenaNueva('zana', 'zana')
    if (!corta.ok) expect(corta.mensaje).not.toContain('zana')

    const distinta = validarContrasenaNueva('zanahoria-7', 'zanahoria-9')
    if (!distinta.ok) {
      expect(distinta.mensaje).not.toContain('zanahoria-7')
      expect(distinta.mensaje).not.toContain('zanahoria-9')
    }
  })
})

describe('rutaSiguienteSegura', () => {
  it('una ruta relativa válida: se acepta', () => {
    expect(rutaSiguienteSegura('/auth/restablecer')).toBe('/auth/restablecer')
  })

  it('casos que caen al valor por defecto', () => {
    const invalidos: unknown[] = [
      '//evil.com',
      '/\\evil.com',
      'https://x',
      'javascript:alert(1)',
      '',
      null,
      undefined,
      42,
      '/' + 'a'.repeat(1000),
      '/a\\b',
      '/a	b',
    ]
    for (const valor of invalidos) {
      expect(rutaSiguienteSegura(valor)).toBe('/')
    }
  })

  it('respeta un porDefecto distinto de /', () => {
    expect(rutaSiguienteSegura('//evil.com', '/cuenta')).toBe('/cuenta')
    expect(rutaSiguienteSegura('/auth/ok', '/cuenta')).toBe('/auth/ok')
  })
})
