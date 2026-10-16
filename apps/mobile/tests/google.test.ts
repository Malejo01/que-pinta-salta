// 28-q, punto 13 (F8, 28-h): `codigoErrorGoogle` y `eventoErrorGoogle`
// (lib/google.ts) son puras y no llaman a Sentry ni a console: lo único que
// no es puro es `registrarErrorGoogle`, que no se ejerce acá (no hace falta
// red ni el SDK nativo real). Se mockean los módulos que `lib/google.ts`
// importa a nivel superior (`@sentry/react-native`,
// `@react-native-google-signin/google-signin` y `@/lib/env`) para no
// arrastrar ni Sentry ni el SDK nativo de Google.
//
// También, punto 4 (arranque, 28-a): lectura estática de que el botón de
// Google está detrás de la condición `googleWebClientId` (si falta esa
// variable, `leerEnv().googleWebClientId` ya es `null` — eso lo prueba
// `tests/env.test.ts` — y el botón no se debe ni intentar dibujar).
//
// 29-c mudó el botón de `app/(tabs)/cuenta.tsx` a `components/BotonGoogle.tsx`
// (ahora es un botón outline con la G en SVG, ya no `GoogleSigninButton`
// dentro de `{googleWebClientId ? (...)}`). El invariante sigue siendo el
// mismo, solo que ahora es un `if (!googleWebClientId) return null` al
// principio de `BotonGoogle`: los casos de más abajo se redirigieron a ese
// archivo. `tests/cuenta.test.ts` ya prueba, con otro enfoque (que el guard
// existe tal cual en el texto), que `BotonGoogle.tsx` tiene esa condición;
// acá se agrega que el guard está ANTES de dibujar el botón, no en
// cualquier lugar del archivo — mismo espíritu que la lectura estática
// vieja (el botón "detrás de" la condición, no solo "cerca de" ella).
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
// Lectura estática de components/BotonGoogle.tsx: el guard
// `if (!googleWebClientId) return null` está ANTES del `return (` que
// dibuja el botón (Pressable + ícono), no en cualquier lugar del archivo.
// Reemplaza a `botonGoogleDetrasDeCondicion` (que buscaba
// `{googleWebClientId ? (<GoogleSigninButton ... />) : null}` en
// app/(tabs)/cuenta.tsx, de antes de la mudanza de 29-c).
// ---------------------------------------------------------------------------
export function guardaAntesDeDibujarElBoton(content: string): boolean {
  const idxGuard = content.search(/if\s*\(\s*!googleWebClientId\s*\)\s*return null/)
  if (idxGuard === -1) return false
  // El guard tiene que venir seguido, más adelante, de un `return (` que sea
  // el que arma el JSX del botón: si no hay ningún `return (` después del
  // guard, no queda nada que esa condición esté protegiendo.
  return content.indexOf('return (', idxGuard) !== -1
}

describe('guardaAntesDeDibujarElBoton (fixtures)', () => {
  it('detecta el patrón real: el guard antes del return que dibuja el botón', () => {
    const fixture = [
      'function BotonGoogle() {',
      '  const { googleWebClientId } = leerEnv()',
      '  if (!googleWebClientId) return null',
      '  return (',
      '    <Pressable />',
      '  )',
      '}',
    ].join('\n')
    expect(guardaAntesDeDibujarElBoton(fixture)).toBe(true)
  })

  it('sin el guard en absoluto: false', () => {
    const fixture = 'function BotonGoogle() {\n  return (\n    <Pressable />\n  )\n}'
    expect(guardaAntesDeDibujarElBoton(fixture)).toBe(false)
  })

  it('el guard sin que después se dibuje nada (el "return null" no cuenta como el return del botón): false', () => {
    expect(guardaAntesDeDibujarElBoton('if (!googleWebClientId) return null')).toBe(false)
  })
})

describe('components/BotonGoogle.tsx: sin EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, el botón no se dibuja', () => {
  const RUTA_BOTON_GOOGLE = fileURLToPath(new URL('../components/BotonGoogle.tsx', import.meta.url))
  const srcBotonGoogle = readFileSync(RUTA_BOTON_GOOGLE, 'utf8')

  it('tiene el guard `if (!googleWebClientId) return null`', () => {
    expect(srcBotonGoogle).toMatch(/if\s*\(\s*!googleWebClientId\s*\)\s*return null/)
  })

  it('el guard está antes del return que dibuja el Pressable (si alguien lo saca, esto tiene que fallar)', () => {
    expect(guardaAntesDeDibujarElBoton(srcBotonGoogle)).toBe(true)
  })
})
