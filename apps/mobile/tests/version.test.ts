// 28-q, parte B, punto 17 (28-c): `textoVersion`/`ENTORNOS_VALIDOS`
// (lib/version.ts), puro. Lo que de verdad importa: ningún valor crudo
// (ni la versión ni el entorno) puede llegar al texto final, aunque
// alguien meta por error una clave en `extra` (JWT, token, URL). Sin red
// ni teléfono.
import { describe, expect, it } from 'vitest'
import { ENTORNOS_VALIDOS, textoVersion } from '../lib/version'

describe('ENTORNOS_VALIDOS', () => {
  it('tiene exactamente los 4 entornos esperados', () => {
    expect(ENTORNOS_VALIDOS).toEqual(['preview', 'production', 'development', 'local'])
  })
})

describe('textoVersion: caso feliz', () => {
  it('version y entorno válidos: "Versión 0.1.0 · preview"', () => {
    expect(textoVersion({ version: '0.1.0', entorno: 'preview' })).toBe('Versión 0.1.0 · preview')
  })

  it.each(ENTORNOS_VALIDOS)('acepta el entorno %s', (entorno) => {
    expect(textoVersion({ version: '1.2.3', entorno })).toBe(`Versión 1.2.3 · ${entorno}`)
  })

  it('una versión de más de un dígito por tramo también matchea (10.20.300)', () => {
    expect(textoVersion({ version: '10.20.300', entorno: 'production' })).toBe('Versión 10.20.300 · production')
  })
})

describe('textoVersion: entorno inválido o ausente, se omite (no tira, no inventa)', () => {
  it('un entorno fuera de la lista no aparece (queda solo "Versión X")', () => {
    expect(textoVersion({ version: '0.1.0', entorno: 'staging' })).toBe('Versión 0.1.0')
  })

  it('sin entorno (undefined), no aparece', () => {
    expect(textoVersion({ version: '0.1.0' })).toBe('Versión 0.1.0')
  })

  it('entorno null o number, no aparece', () => {
    expect(textoVersion({ version: '0.1.0', entorno: null })).toBe('Versión 0.1.0')
    expect(textoVersion({ version: '0.1.0', entorno: 7 })).toBe('Versión 0.1.0')
  })

  it('la lista es case-sensitive: "Preview" (con mayúscula) no es válido', () => {
    expect(textoVersion({ version: '0.1.0', entorno: 'Preview' })).toBe('Versión 0.1.0')
  })
})

describe('textoVersion: version sin forma \\d+.\\d+.\\d+ da "desconocida" (nunca el valor crudo)', () => {
  it('menos o más tramos de los que corresponde', () => {
    expect(textoVersion({ version: '1.2', entorno: 'preview' })).toBe('Versión desconocida · preview')
    expect(textoVersion({ version: '1.2.3.4', entorno: 'preview' })).toBe('Versión desconocida · preview')
  })

  it('sin version (undefined), da "desconocida"', () => {
    expect(textoVersion({ entorno: 'local' })).toBe('Versión desconocida · local')
  })

  it('version null o número (no string), da "desconocida"', () => {
    expect(textoVersion({ version: null, entorno: 'local' })).toBe('Versión desconocida · local')
    expect(textoVersion({ version: 123, entorno: 'local' })).toBe('Versión desconocida · local')
  })

  it('version con espacios alrededor no matchea (sin trim): "desconocida"', () => {
    expect(textoVersion({ version: ' 0.1.0 ', entorno: 'local' })).toBe('Versión desconocida · local')
  })

  it('sin version ni entorno: "Versión desconocida" nomás', () => {
    expect(textoVersion({})).toBe('Versión desconocida')
  })
})

describe('textoVersion: ninguna clave cruda llega al texto final (lo que de verdad importa)', () => {
  // Formas de clave, nunca valores reales de producción: nombran el tipo de
  // credencial que imitan, con relleno inventado.
  const CLAVES_DE_PRUEBA = [
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.inventado-de-prueba.firma-inventada-de-prueba', // forma de JWT (anon/service role de Supabase)
    'sk_test_51Hinventado0000000000000000prueba', // forma de clave con prefijo sk_ (API key de terceros)
    'sbp_0123456789abcdef0123456789abcdef01234567', // forma de personal access token (prefijo sbp_)
    'https://proyecto-de-prueba.supabase.co/rest/v1', // forma de URL
  ] as const

  it.each(CLAVES_DE_PRUEBA)('como version: "%s" → "desconocida", nunca el valor crudo', (clave) => {
    const texto = textoVersion({ version: clave, entorno: 'preview' })
    expect(texto).toBe('Versión desconocida · preview')
    expect(texto).not.toContain(clave)
  })

  it.each(CLAVES_DE_PRUEBA)('como entorno: se omite, nunca el valor crudo', (clave) => {
    const texto = textoVersion({ version: '0.1.0', entorno: clave })
    expect(texto).toBe('Versión 0.1.0')
    expect(texto).not.toContain(clave)
  })

  it('las dos con forma de clave a la vez (version y entorno): ninguna de las dos aparece', () => {
    const texto = textoVersion({ version: CLAVES_DE_PRUEBA[0], entorno: CLAVES_DE_PRUEBA[1] })
    expect(texto).toBe('Versión desconocida')
    expect(texto).not.toContain(CLAVES_DE_PRUEBA[0])
    expect(texto).not.toContain(CLAVES_DE_PRUEBA[1])
  })
})
