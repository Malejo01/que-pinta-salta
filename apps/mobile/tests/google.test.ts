// 28-q, punto 13 (F8, 28-h): `codigoErrorGoogle` y `eventoErrorGoogle`
// (lib/google.ts) son puras y no llaman a Sentry ni a console: lo único que
// no es puro es `registrarErrorGoogle`, que no se ejerce acá (no hace falta
// red ni el SDK nativo real). Se mockean los módulos que `lib/google.ts`
// importa a nivel superior (`@sentry/react-native`,
// `@react-native-google-signin/google-signin` y `@/lib/env`) para no
// arrastrar ni Sentry ni el SDK nativo de Google.
//
// También, punto 4 (arranque, 28-a): lectura estática de que en
// `cuenta.tsx` el botón de Google está detrás de la condición
// `googleWebClientId` (si falta esa variable, `leerEnv().googleWebClientId`
// ya es `null` — eso lo prueba `tests/env.test.ts` — y el botón no se debe
// ni intentar dibujar).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/react-native', () => ({
  captureMessage: vi.fn(),
}))

vi.mock('@react-native-google-signin/google-signin', () => ({
  isErrorWithCode: (error: unknown): boolean =>
    Boolean(error && typeof error === 'object' && 'code' in (error as Record<string, unknown>)),
  statusCodes: {
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    DEVELOPER_ERROR: 'DEVELOPER_ERROR',
  },
}))

vi.mock('@/lib/env', () => ({
  leerEnv: () => ({ supabase: null, googleWebClientId: null, sentryDsn: null }),
}))

import { codigoErrorGoogle, eventoErrorGoogle } from '../lib/google'

describe('codigoErrorGoogle', () => {
  it('con un error con code: el código sale como string', () => {
    expect(codigoErrorGoogle({ code: 7 })).toBe('7')
    expect(codigoErrorGoogle({ code: 'DEVELOPER_ERROR' })).toBe('DEVELOPER_ERROR')
  })

  it('con un error sin code (no es un error de la librería): null', () => {
    expect(codigoErrorGoogle(new Error('otra cosa'))).toBeNull()
    expect(codigoErrorGoogle('un string cualquiera')).toBeNull()
    expect(codigoErrorGoogle(null)).toBeNull()
    expect(codigoErrorGoogle(undefined)).toBeNull()
  })
})

describe('eventoErrorGoogle', () => {
  it('el evento tiene solo el código en tags', () => {
    const evento = eventoErrorGoogle('DEVELOPER_ERROR')
    expect(evento.tags).toEqual({ codigo: 'DEVELOPER_ERROR' })
  })

  it('un error con un email y un token inventados en el message: no aparecen en el evento', () => {
    const errorConDatosPersonales = {
      code: 'SIGN_IN_CANCELLED',
      message:
        'Fallo el login de persona-de-prueba@ejemplo.com con el token eyJhbGciOiJIUzI1NiJ9.token-inventado-de-prueba.firma-inventada',
    }

    const codigo = codigoErrorGoogle(errorConDatosPersonales)
    expect(codigo).toBe('SIGN_IN_CANCELLED')

    const evento = eventoErrorGoogle(codigo!)
    const textoCompleto = JSON.stringify(evento)

    expect(textoCompleto).not.toContain('persona-de-prueba@ejemplo.com')
    expect(textoCompleto).not.toContain('eyJhbGciOiJIUzI1NiJ9')
    expect(textoCompleto).not.toContain('token-inventado-de-prueba')
    expect(evento.tags).toEqual({ codigo: 'SIGN_IN_CANCELLED' })
    expect(evento).toEqual({ mensaje: 'google_signin_error', tags: { codigo: 'SIGN_IN_CANCELLED' } })
  })
})

// ---------------------------------------------------------------------------
// Lectura estática de app/(tabs)/cuenta.tsx: el botón de Google
// (`GoogleSigninButton`) está detrás de la condición `googleWebClientId`.
// ---------------------------------------------------------------------------
export function botonGoogleDetrasDeCondicion(content: string): boolean {
  const idxBoton = content.search(/<GoogleSigninButton\b/)
  if (idxBoton === -1) return false
  // Busca, antes del botón, la apertura `{googleWebClientId ? (` (o similar)
  // dentro de una ventana razonable, sin que se cierre esa condición antes
  // de llegar al botón.
  const antes = content.slice(Math.max(0, idxBoton - 400), idxBoton)
  return /\{\s*googleWebClientId\s*\?/.test(antes)
}

describe('botonGoogleDetrasDeCondicion (fixtures)', () => {
  it('detecta el patrón real: {googleWebClientId ? (<GoogleSigninButton ... />) : null}', () => {
    const fixture = `{googleWebClientId ? (\n<GoogleSigninButton size={1} />\n) : null}`
    expect(botonGoogleDetrasDeCondicion(fixture)).toBe(true)
  })

  it('un GoogleSigninButton sin ninguna condición alrededor: false', () => {
    expect(botonGoogleDetrasDeCondicion('<GoogleSigninButton size={1} />')).toBe(false)
  })

  it('sin GoogleSigninButton en absoluto: false', () => {
    expect(botonGoogleDetrasDeCondicion('<Text>Sin Google</Text>')).toBe(false)
  })
})

describe('app/(tabs)/cuenta.tsx: el botón de Google está detrás de googleWebClientId', () => {
  const RUTA_CUENTA = fileURLToPath(new URL('../app/(tabs)/cuenta.tsx', import.meta.url))
  const srcCuenta = readFileSync(RUTA_CUENTA, 'utf8')

  it('usa GoogleSigninButton', () => {
    expect(srcCuenta).toContain('GoogleSigninButton')
  })

  it('el botón está condicionado por googleWebClientId', () => {
    expect(botonGoogleDetrasDeCondicion(srcCuenta)).toBe(true)
  })
})
