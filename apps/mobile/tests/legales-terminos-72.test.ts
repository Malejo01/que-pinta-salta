// R72, 72-q (QPS-333): "Términos y condiciones" publicado en la app.
// Puro: `lib/legales.ts` y `lib/links.ts` no importan nada nativo. El detector
// de texto lee `app/(tabs)/cuenta.tsx` SIN comentarios.
//
// Cómo se pone en rojo:
//   - `TERMINOS_PUBLICADOS = false` en lib/legales.ts   -> "con el flag real" (enlaces, texto y urlSitio)
//   - invertir el orden de los `push` en `enlacesLegales` -> "Privacidad primero"
//   - cuenta.tsx con un <Pressable> a mano hacia /terminos en vez de <EnlacesLegales -> el detector de Cuenta
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SITIO } from '@qps/core/metricas/links'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { enlacesLegales, RUTA_PRIVACIDAD, RUTA_TERMINOS, TERMINOS_PUBLICADOS, textoAceptacion } from '../lib/legales'
import { urlSitio } from '../lib/links'

describe('con el flag real', () => {
  it('TERMINOS_PUBLICADOS es true', () => {
    expect(TERMINOS_PUBLICADOS).toBe(true)
  })

  it('enlacesLegales() trae los dos, Privacidad primero', () => {
    expect(enlacesLegales()).toEqual([
      { ruta: RUTA_PRIVACIDAD, texto: 'Política de privacidad' },
      { ruta: RUTA_TERMINOS, texto: 'Términos y condiciones' },
    ])
    expect(RUTA_PRIVACIDAD).toBe('/privacidad')
    expect(RUTA_TERMINOS).toBe('/terminos')
  })

  it('textoAceptacion() nombra los dos documentos', () => {
    const texto = textoAceptacion()
    expect(texto).toContain('Términos y condiciones')
    expect(texto).toContain('Política de privacidad')
  })

  it('urlSitio("/terminos") es la URL absoluta del sitio', () => {
    expect(urlSitio('/terminos')).toBe(`${SITIO}/terminos`)
    expect(urlSitio('/terminos')).toMatch(/^https:\/\/.+\/terminos$/)
  })

  it('urlSitio("/privacidad") sigue andando y una ruta fuera de la lista da null', () => {
    expect(urlSitio('/privacidad')).toBe(`${SITIO}/privacidad`)
    expect(urlSitio('/terminos/')).toBeNull()
    expect(urlSitio('/admin')).toBeNull()
    expect(urlSitio('https://malo.example/terminos')).toBeNull()
  })
})

describe('con el parámetro false: el comportamiento anterior', () => {
  it('enlacesLegales(false) solo trae Privacidad', () => {
    expect(enlacesLegales(false)).toEqual([{ ruta: RUTA_PRIVACIDAD, texto: 'Política de privacidad' }])
  })

  it('textoAceptacion(false) nombra solo la Política de privacidad', () => {
    const texto = textoAceptacion(false)
    expect(texto).toContain('Política de privacidad')
    expect(texto).not.toContain('Términos')
  })

  it('enlacesLegales(true) coincide con el de por defecto', () => {
    expect(enlacesLegales(true)).toEqual(enlacesLegales())
    expect(textoAceptacion(true)).toBe(textoAceptacion())
  })
})

describe('Cuenta usa <EnlacesLegales (no un link armado a mano)', () => {
  const ruta = fileURLToPath(new URL('../app/(tabs)/cuenta.tsx', import.meta.url))
  const fuente = quitarComentarios(readFileSync(ruta, 'utf8'))

  it('importa EnlacesLegales y lo dibuja', () => {
    expect(fuente).toMatch(/import\s*\{\s*EnlacesLegales\s*\}\s*from\s*['"]@\/components\/EnlacesLegales['"]/)
    expect(fuente).toMatch(/<EnlacesLegales[\s/>]/)
  })

  it('no arma a mano un link a /terminos ni a /privacidad', () => {
    expect(fuente).not.toMatch(/['"`]\/terminos['"`]/)
    expect(fuente).not.toMatch(/urlSitio\(\s*['"`]\/terminos/)
    expect(fuente).not.toMatch(/Términos y condiciones/)
  })

  it('el detector puede fallar: un fixture con el link a mano no pasa', () => {
    const aMano = quitarComentarios(`
      <Pressable onPress={() => Linking.openURL(urlSitio('/terminos'))}><Text>Términos y condiciones</Text></Pressable>
    `)
    expect(aMano).not.toMatch(/<EnlacesLegales[\s/>]/)
    expect(aMano).toMatch(/urlSitio\(\s*['"`]\/terminos/)
  })
})
