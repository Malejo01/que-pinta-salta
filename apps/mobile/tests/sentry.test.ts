// 24-c: el `beforeSend` puro de lib/sentry.ts. El módulo importa
// `@sentry/react-native` a nivel superior (lo necesita `inicializarSentry`);
// se mockea con `vi.mock` para no cargar el paquete real (no hace falta:
// `beforeSend` nunca llama a ninguna función de Sentry, solo transforma el
// evento). Sin red.
import { describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/react-native', () => ({
  init: vi.fn(),
  wrap: (componente: unknown) => componente,
}))

import { beforeSend } from '../lib/sentry'

// Tipos mínimos: el `event`/`hint` reales de Sentry tienen muchos campos
// opcionales; acá solo se construyen los que importan al test, para no
// arrastrar los tipos completos de `@sentry/react-native`. El `ErrorEvent` de
// Sentry exige la clave `type`, así que la conversión pasa por `unknown`: es
// un objeto armado a mano para el test, no un evento real.
function evento(extra: Record<string, unknown>) {
  return extra as unknown as Parameters<typeof beforeSend>[0]
}

describe('beforeSend', () => {
  it('saca user.email y user.ip_address, conserva el resto de user', () => {
    const resultado = beforeSend(
      evento({ user: { id: 'usuario-de-prueba-1', email: 'persona@ejemplo.com', ip_address: '203.0.113.5' } }),
      {}
    )

    expect(resultado).not.toBeNull()
    expect(resultado!.user).toEqual({ id: 'usuario-de-prueba-1' })
  })

  it('saca un email que aparece dentro de message', () => {
    const resultado = beforeSend(evento({ message: 'Fallo el login de persona@ejemplo.com en el login' }), {})

    expect(resultado!.message).toBe('Fallo el login de [email] en el login')
  })

  it('saca un email que aparece dentro de un breadcrumb (message y data)', () => {
    const resultado = beforeSend(
      evento({
        breadcrumbs: [
          {
            message: 'request a persona@ejemplo.com falló',
            data: { usuario: 'otra-persona@ejemplo.com', intento: 3 },
          },
        ],
      }),
      {}
    )

    const migas = resultado!.breadcrumbs!
    expect(migas[0].message).toBe('request a [email] falló')
    expect(migas[0].data).toEqual({ usuario: '[email]', intento: 3 })
  })

  it('deja el resto del evento igual (tags, exception, level)', () => {
    const original = evento({
      level: 'error',
      tags: { pantalla: 'cuenta' },
      exception: { values: [{ type: 'TypeError', value: 'algo falló' }] },
    })

    const resultado = beforeSend(original, {})

    expect(resultado!.level).toBe('error')
    expect(resultado!.tags).toEqual({ pantalla: 'cuenta' })
    expect(resultado!.exception).toEqual({ values: [{ type: 'TypeError', value: 'algo falló' }] })
  })

  it('sin user ni breadcrumbs, no rompe y devuelve el evento', () => {
    const resultado = beforeSend(evento({ message: 'sin datos personales' }), {})

    expect(resultado).not.toBeNull()
    expect(resultado!.user).toBeUndefined()
    expect(resultado!.breadcrumbs).toBeUndefined()
    expect(resultado!.message).toBe('sin datos personales')
  })

  it('no muta el objeto event original (user)', () => {
    const original = evento({ user: { email: 'persona@ejemplo.com' } })
    beforeSend(original, {})

    // El objeto `user` original no se tocó: beforeSend trabaja sobre una copia.
    expect((original as { user: { email?: string } }).user.email).toBe('persona@ejemplo.com')
  })

  // Ronda siguiente de 24-c: el hueco real era `exception.values[].value`
  // (ahí va el texto de una excepción capturada; `message` suele venir
  // vacío en ese caso). También `user.username`, `extra` y `tags`.
  it('saca un email de exception.values[0].value, conserva el resto del texto y no toca "type"', () => {
    const resultado = beforeSend(
      evento({
        exception: {
          values: [{ type: 'TypeError', value: 'fetch para persona@ejemplo.com falló con status 500' }],
        },
      }),
      {}
    )

    const valores = resultado!.exception!.values!
    expect(valores[0].type).toBe('TypeError')
    expect(valores[0].value).toBe('fetch para [email] falló con status 500')
  })

  it('con varias entradas en exception.values, se sanean todas', () => {
    const resultado = beforeSend(
      evento({
        exception: {
          values: [
            { type: 'Error', value: 'primero: persona@ejemplo.com' },
            { type: 'CausedBy', value: 'segundo: otra-persona@ejemplo.com' },
          ],
        },
      }),
      {}
    )

    const valores = resultado!.exception!.values!
    expect(valores[0].value).toBe('primero: [email]')
    expect(valores[1].value).toBe('segundo: [email]')
  })

  it('sin exception, o con exception sin values, no tira y el evento vuelve igual', () => {
    expect(() => beforeSend(evento({ message: 'sin excepción' }), {})).not.toThrow()
    const sinException = beforeSend(evento({ message: 'sin excepción' }), {})
    expect(sinException!.exception).toBeUndefined()

    expect(() => beforeSend(evento({ exception: {} }), {})).not.toThrow()
    const sinValues = beforeSend(evento({ exception: {} }), {})
    expect(sinValues!.exception).toEqual({})
  })

  it('saca user.username, igual que user.email y user.ip_address', () => {
    const resultado = beforeSend(
      evento({
        user: {
          id: 'usuario-de-prueba-1',
          username: 'persona_de_prueba',
          email: 'persona@ejemplo.com',
          ip_address: '203.0.113.5',
        },
      }),
      {}
    )

    expect(resultado!.user).toEqual({ id: 'usuario-de-prueba-1' })
  })

  it('saca un email de un valor string de extra y de tags, pero no toca valores que no son string (sin recursión)', () => {
    const resultado = beforeSend(
      evento({
        extra: {
          detalle: 'contacto: persona@ejemplo.com',
          intento: 3,
          anidado: { email: 'otra-persona@ejemplo.com' },
        },
        tags: { usuario: 'otra-persona@ejemplo.com', version: 7 },
      }),
      {}
    )

    expect(resultado!.extra).toEqual({
      detalle: 'contacto: [email]',
      intento: 3,
      // Saneo superficial nomás: el objeto anidado no se recorre, queda igual.
      anidado: { email: 'otra-persona@ejemplo.com' },
    })
    expect(resultado!.tags).toEqual({ usuario: '[email]', version: 7 })
  })

  it('no muta el objeto event original (exception, user.username, extra, tags)', () => {
    const original = evento({
      exception: { values: [{ type: 'Error', value: 'persona@ejemplo.com' }] },
      user: { username: 'persona_de_prueba' },
      extra: { detalle: 'persona@ejemplo.com' },
      tags: { usuario: 'persona@ejemplo.com' },
    })
    const copiaOriginal = JSON.parse(JSON.stringify(original))

    beforeSend(original, {})

    expect(original).toEqual(copiaOriginal)
  })
})

// QPS-152: además del email, el saneador saca JWT (`eyJ….….…`) y las claves
// `id_token`/`access_token`/`refresh_token` (como propiedad de objeto o como
// parámetro de query string). Ningún JWT de estos tests es real: se arman a
// mano con base64url de un JSON de juguete, igual que lo haría cualquier
// emisor de JWT, pero sin que sea un token que exista en ningún sistema.
function base64url(valor: unknown): string {
  return Buffer.from(JSON.stringify(valor), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// JWT de juguete: cabecera y payload son JSON inventado codificado a mano,
// la "firma" es una cadena fija sin ningún significado criptográfico.
const JWT_DE_JUGUETE = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({
  usuarioDePrueba: true,
  numero: 7,
})}.firmaDeJugueteSinSignificadoXYZ`

describe('beforeSend - JWT (QPS-152)', () => {
  it('saca un JWT de message', () => {
    const resultado = beforeSend(evento({ message: `token viejo: ${JWT_DE_JUGUETE} ya vencido` }), {})

    expect(resultado!.message).toBe('token viejo: [jwt] ya vencido')
  })

  it('saca un JWT de exception.values[].value', () => {
    const resultado = beforeSend(
      evento({ exception: { values: [{ type: 'Error', value: `sesión con ${JWT_DE_JUGUETE} inválida` }] } }),
      {}
    )

    expect(resultado!.exception!.values![0].value).toBe('sesión con [jwt] inválida')
  })

  it('saca un JWT de un breadcrumb (message y data)', () => {
    const resultado = beforeSend(
      evento({
        breadcrumbs: [
          {
            message: `authorization: Bearer ${JWT_DE_JUGUETE}`,
            data: { token: JWT_DE_JUGUETE, intento: 1 },
          },
        ],
      }),
      {}
    )

    const migas = resultado!.breadcrumbs!
    expect(migas[0].message).toBe('authorization: Bearer [jwt]')
    expect(migas[0].data).toEqual({ token: '[jwt]', intento: 1 })
  })

  it('saca un JWT de extra y de tags', () => {
    const resultado = beforeSend(
      evento({
        extra: { sesion: `activa: ${JWT_DE_JUGUETE}` },
        tags: { token: JWT_DE_JUGUETE },
      }),
      {}
    )

    expect(resultado!.extra).toEqual({ sesion: 'activa: [jwt]' })
    expect(resultado!.tags).toEqual({ token: '[jwt]' })
  })

  it('saca un JWT de un campo custom de user (no email/username/ip_address)', () => {
    const resultado = beforeSend(
      evento({ user: { id: 'usuario-de-prueba-1', sesion: JWT_DE_JUGUETE } }),
      {}
    )

    expect(resultado!.user).toEqual({ id: 'usuario-de-prueba-1', sesion: '[jwt]' })
  })

  it('no toca un "eyJ" metido en medio de una palabra más larga', () => {
    const resultado = beforeSend(
      evento({ message: 'revisá la leyJudicial.penal.civil antes de firmar' }),
      {}
    )

    expect(resultado!.message).toBe('revisá la leyJudicial.penal.civil antes de firmar')
  })

  it('no toca una palabra corta con puntos que arranca con "eyJ" pero no es un JWT', () => {
    const resultado = beforeSend(
      evento({ message: 'contactanos en eyJardin.deflores.2024 para más info' }),
      {}
    )

    expect(resultado!.message).toBe('contactanos en eyJardin.deflores.2024 para más info')
  })
})

describe('beforeSend - claves de token (QPS-152)', () => {
  it('reemplaza id_token, access_token y refresh_token como propiedad de objeto, sea lo que sea que tengan adentro', () => {
    const resultado = beforeSend(
      evento({
        extra: { id_token: 'valor-cualquiera-1', access_token: 'valor-cualquiera-2' },
        tags: { refresh_token: 'valor-cualquiera-3' },
        user: { id: 'usuario-de-prueba-1', access_token: 'valor-cualquiera-4' },
      }),
      {}
    )

    expect(resultado!.extra).toEqual({ id_token: '[token]', access_token: '[token]' })
    expect(resultado!.tags).toEqual({ refresh_token: '[token]' })
    expect(resultado!.user).toEqual({ id: 'usuario-de-prueba-1', access_token: '[token]' })
  })

  it('reemplaza access_token, id_token y refresh_token como parámetro de query string, conservando el resto de la URL', () => {
    const resultado = beforeSend(
      evento({
        message:
          'callback a https://app.ejemplo.com/cb?foo=bar&access_token=valor-cualquiera-1&id_token=valor-cualquiera-2&refresh_token=valor-cualquiera-3&state=xyz',
      }),
      {}
    )

    expect(resultado!.message).toBe(
      'callback a https://app.ejemplo.com/cb?foo=bar&access_token=[token]&id_token=[token]&refresh_token=[token]&state=xyz'
    )
  })

  it('reemplaza access_token en el fragmento de la URL (#access_token=…, flujo implícito de OAuth)', () => {
    const resultado = beforeSend(
      evento({ message: 'callback a https://app.ejemplo.com/cb#access_token=valor-cualquiera-1&token_type=bearer' }),
      {}
    )

    expect(resultado!.message).toBe(
      'callback a https://app.ejemplo.com/cb#access_token=[token]&token_type=bearer'
    )
  })

  it('reemplaza refresh_token después de otro parámetro en el fragmento, sin comerse el resto', () => {
    const resultado = beforeSend(
      evento({
        message: 'callback a https://app.ejemplo.com/cb#state=xyz&refresh_token=valor-cualquiera-1&expires_in=3600',
      }),
      {}
    )

    expect(resultado!.message).toBe(
      'callback a https://app.ejemplo.com/cb#state=xyz&refresh_token=[token]&expires_in=3600'
    )
  })

  it('no toca una clave parecida pero distinta (access_token_backup) ni una mención sin "?"/"&" delante', () => {
    const resultado = beforeSend(
      evento({
        extra: { access_token_backup: 'valor-cualquiera-1' },
        message: 'el parámetro access_token=valor-cualquiera-2 cambia cada hora',
      }),
      {}
    )

    expect(resultado!.extra).toEqual({ access_token_backup: 'valor-cualquiera-1' })
    expect(resultado!.message).toBe('el parámetro access_token=valor-cualquiera-2 cambia cada hora')
  })
})

describe('beforeSend - sin datos sensibles (QPS-152)', () => {
  it('deja un evento sin email, JWT ni token igual, sin modificar', () => {
    const original = evento({
      message: 'fetch a /api/eventos falló con status 500',
      level: 'error',
      tags: { pantalla: 'cuenta' },
      extra: { intento: 3 },
      user: { id: 'usuario-de-prueba-1' },
      breadcrumbs: [{ message: 'navegación a /cuenta', data: { desde: '/inicio' } }],
    })
    const copiaOriginal = JSON.parse(JSON.stringify(original))

    const resultado = beforeSend(original, {})

    expect(resultado).toEqual(copiaOriginal)
  })
})
