// 49-a (QPS-237): legales en la app. `lib/legales.ts` es puro (enlacesLegales
// y textoAceptacion), `lib/links.ts` valida /privacidad y /terminos contra la
// lista cerrada (con la guarda de TERMINOS_PUBLICADOS) y EnlacesLegales.tsx
// (lectura estática, mismo estilo que tests/cuenta.test.ts) nunca arma la URL
// a mano.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { enlacesLegales, textoAceptacion, TERMINOS_PUBLICADOS } from '../lib/legales'
import { urlSitio } from '../lib/links'

describe('TERMINOS_PUBLICADOS', () => {
  it('está en false: /terminos vive en el #74, sin mergear', () => {
    expect(TERMINOS_PUBLICADOS).toBe(false)
  })
})

describe('enlacesLegales', () => {
  it('terminosPublicados=false: solo Política de privacidad', () => {
    expect(enlacesLegales(false)).toEqual([{ ruta: '/privacidad', texto: 'Política de privacidad' }])
  })

  it('terminosPublicados=true: suma Términos y condiciones', () => {
    expect(enlacesLegales(true)).toEqual([
      { ruta: '/privacidad', texto: 'Política de privacidad' },
      { ruta: '/terminos', texto: 'Términos y condiciones' },
    ])
  })

  it('sin argumento, usa TERMINOS_PUBLICADOS (hoy false)', () => {
    expect(enlacesLegales()).toEqual([{ ruta: '/privacidad', texto: 'Política de privacidad' }])
  })
})

describe('textoAceptacion', () => {
  it('terminosPublicados=false: solo nombra la Política de privacidad', () => {
    expect(textoAceptacion(false)).toBe(
      'Al crear tu cuenta o continuar con Google aceptás la Política de privacidad.'
    )
  })

  it('terminosPublicados=true: nombra los dos documentos', () => {
    expect(textoAceptacion(true)).toBe(
      'Al crear tu cuenta o continuar con Google aceptás los Términos y condiciones y la Política de privacidad.'
    )
  })

  it('sin argumento, usa TERMINOS_PUBLICADOS (hoy false)', () => {
    expect(textoAceptacion()).toBe(
      'Al crear tu cuenta o continuar con Google aceptás la Política de privacidad.'
    )
  })
})

describe('urlSitio: los dos legales', () => {
  it('/privacidad da la URL absoluta', () => {
    expect(urlSitio('/privacidad')).toBe('https://www.quepintasalta.com.ar/privacidad')
  })

  it('/terminos da null mientras TERMINOS_PUBLICADOS sea false', () => {
    expect(urlSitio('/terminos')).toBeNull()
  })
})

describe('EnlacesLegales.tsx: nunca arma la URL a mano', () => {
  const RUTA = fileURLToPath(new URL('../components/EnlacesLegales.tsx', import.meta.url))
  const SRC = readFileSync(RUTA, 'utf8')

  it('no contiene el dominio', () => {
    expect(SRC).not.toContain('quepintasalta.com.ar')
  })

  it('no contiene un esquema https:// armado a mano', () => {
    expect(SRC).not.toContain('https://')
  })

  it('usa urlSitio para resolver la URL', () => {
    expect(SRC).toMatch(/urlSitio\(/)
  })

  it('nunca tono="primario" (QPS-241)', () => {
    expect(SRC).not.toMatch(/tono="primario"/)
  })

  it('el Pressable de cada link es accessibilityRole="link"', () => {
    expect(SRC).toMatch(/accessibilityRole="link"/)
  })
})

describe('cuenta.tsx: monta EnlacesLegales en las dos ramas', () => {
  const RUTA_CUENTA = fileURLToPath(new URL('../app/(tabs)/cuenta.tsx', import.meta.url))
  const SRC_CUENTA = readFileSync(RUTA_CUENTA, 'utf8')

  it('importa EnlacesLegales de @/components/EnlacesLegales', () => {
    expect(SRC_CUENTA).toMatch(
      /import\s*\{\s*EnlacesLegales\s*\}\s*from\s*['"]@\/components\/EnlacesLegales['"]/
    )
  })

  it('la rama sin sesión monta <EnlacesLegales conAceptacion', () => {
    expect(SRC_CUENTA).toMatch(/<EnlacesLegales conAceptacion/)
  })

  it('la rama con sesión monta <EnlacesLegales /> (sin conAceptacion)', () => {
    expect(SRC_CUENTA).toMatch(/<EnlacesLegales\s*\/>/)
  })

  it('<EnlacesLegales conAceptacion aparece antes del cierre de la card (después de BotonGoogle)', () => {
    const idxBotonGoogle = SRC_CUENTA.lastIndexOf('<BotonGoogle')
    const idxEnlacesConAceptacion = SRC_CUENTA.indexOf('<EnlacesLegales conAceptacion')
    expect(idxBotonGoogle).toBeGreaterThan(-1)
    expect(idxEnlacesConAceptacion).toBeGreaterThan(idxBotonGoogle)
  })

  it('<EnlacesLegales /> (con sesión) aparece antes de "Cerrar sesión"', () => {
    const idxEnlaces = SRC_CUENTA.indexOf('<EnlacesLegales />')
    const idxCerrarSesion = SRC_CUENTA.lastIndexOf('Cerrar sesión')
    expect(idxEnlaces).toBeGreaterThan(-1)
    expect(idxCerrarSesion).toBeGreaterThan(idxEnlaces)
  })
})
