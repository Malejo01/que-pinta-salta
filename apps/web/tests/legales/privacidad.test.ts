/**
 * `/privacidad`, versión 1 (R63): mismo patrón que
 * `tests/legales/pagina-legal.test.ts`: `renderToStaticMarkup` en Node, con los
 * `vi.mock` de `Navbar`/`MobileNav`. La página no tiene props, así que se
 * invoca `PrivacidadPage()` directamente.
 *
 * Fija que ya no es un borrador (sin aviso, sin marcas de revisión legal, sin
 * "Última actualización"), que muestra la versión y la vigencia, que no nombra
 * "Me interesa", cuáles son los únicos `[COMPLETAR` que quedan y los
 * contenidos nuevos de la versión 1 (publicidad en la app, mapa, "Cerca mío",
 * avisos patrocinados). La variante con `ADS_ENABLED` prendido y apagado está
 * en `privacidad-ads.test.ts`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/navbar', () => ({ Navbar: () => null }))
vi.mock('@/components/mobile-nav', () => ({ MobileNav: () => null }))

import PrivacidadPage, { metadata } from '@/app/privacidad/page'
import { VERSION_LEGAL, VIGENTE_DESDE } from '@/components/legal/vigencia'
import { CONTACTO_EMAIL } from '@qps/core/contacto'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function readSource(relativePath: string): string {
  return readFileSync(path.join(WEB_ROOT, relativePath), 'utf8')
}

/** Fuente sin comentarios de bloque ni de línea (los comentarios pueden nombrar lo que ya no existe). */
function sinComentarios(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const SOURCE = readSource('app/privacidad/page.tsx')
const SOURCE_SIN_COMENTARIOS = sinComentarios(SOURCE)
const html = renderToStaticMarkup(React.createElement(PrivacidadPage))

describe('metadata', () => {
  it('canonical es "/privacidad"', () => {
    expect(metadata.alternates?.canonical).toBe('/privacidad')
  })

  it('tiene title que termina en "| Qué Pinta Salta" y description que nombra la app', () => {
    expect(typeof metadata.title).toBe('string')
    expect(String(metadata.title)).toMatch(/\| Qué Pinta Salta$/)
    expect(typeof metadata.description).toBe('string')
    expect(String(metadata.description).toLowerCase()).toContain('app')
  })
})

describe('el mail de contacto sale de la constante, nunca literal en el archivo', () => {
  it('el HTML tiene el mail y un mailto con asunto', () => {
    expect(html).toContain(CONTACTO_EMAIL)
    expect(html).toContain(`href="mailto:${CONTACTO_EMAIL}?subject=`)
  })

  it('el archivo fuente no tiene el mail literal', () => {
    expect(SOURCE).not.toContain(CONTACTO_EMAIL)
  })

  it('el archivo fuente no tiene una secuencia de 8 dígitos o más (CUIT, teléfono, etc.)', () => {
    expect(SOURCE).not.toMatch(/\d{8,}/)
  })
})

describe('ya no es un borrador', () => {
  it('el HTML no dice "borrador" (sin distinguir mayúsculas), "REVISIÓN LEGAL" ni "Última actualización"', () => {
    expect(html).not.toMatch(/borrador/i)
    expect(html).not.toContain('REVISIÓN LEGAL')
    expect(html).not.toContain('Última actualización')
  })

  it('el HTML no tiene el role="note" del aviso viejo', () => {
    expect(html).not.toContain('role="note"')
  })

  it('el archivo fuente (sin comentarios) no usa <Marca> con [REVISIÓN LEGAL]', () => {
    expect(SOURCE_SIN_COMENTARIOS).not.toContain('REVISIÓN LEGAL')
  })
})

describe('versión y vigencia', () => {
  it('muestra "Versión <VERSION_LEGAL>" y "vigente desde el"', () => {
    expect(html).toContain(`Versión ${VERSION_LEGAL}`)
    expect(html).toContain('vigente desde el')
  })
})

describe('"Me interesa" ya no se nombra', () => {
  it('ni en el HTML ni en el fuente (sin comentarios), con cualquier mayúscula', () => {
    expect(html).not.toMatch(/me interesa/i)
    expect(SOURCE_SIN_COMENTARIOS).not.toMatch(/me interesa/i)
  })
})

describe('lo único que falta completar (datos de Mauro antes del merge)', () => {
  // Si alguien suma un [COMPLETAR] o Mauro completa uno, este test lo dice: en
  // ese caso se actualiza la lista a propósito.
  it('el HTML tiene exactamente el del responsable y el de la edad mínima, sin contar VIGENTE_DESDE', () => {
    const sinVigencia = html.split(VIGENTE_DESDE).join('')
    const marcas = sinVigencia.match(/\[COMPLETAR[^\]]*\]/g) ?? []
    expect(marcas).toEqual([
      '[COMPLETAR: nombre o razón social del responsable, CUIT y domicilio]',
      '[COMPLETAR: edad mínima para crear una cuenta]',
    ])
  })

  it('en total, con el de VIGENTE_DESDE (si todavía es una marca), el HTML tiene un [COMPLETAR más', () => {
    const total = (html.match(/\[COMPLETAR/g) ?? []).length
    const deVigencia = VIGENTE_DESDE.startsWith('[COMPLETAR') ? 1 : 0
    expect(total).toBe(2 + deVigencia)
  })
})

describe('el texto nombra lo propio de la app', () => {
  it.each(['token', 'Sentry', 'calendario', 'sin conexión', 'Voy', 'Expo'])(
    'el HTML contiene "%s"',
    (fragmento) => {
      expect(html).toContain(fragmento)
    }
  )
})

describe('enlaces a eliminar cuenta', () => {
  it('enlaza /eliminar-cuenta y /perfil/eliminar-cuenta', () => {
    expect(html).toContain('href="/eliminar-cuenta"')
    expect(html).toContain('href="/perfil/eliminar-cuenta"')
  })
})

describe('marco legal argentino', () => {
  it('dice "Ley 25.326" y nombra la Agencia de Acceso a la Información Pública', () => {
    expect(html).toContain('Ley 25.326')
    expect(html).toContain('Agencia de Acceso a la Información Pública')
  })
})

describe('Server Component', () => {
  it("el archivo no contiene 'use client'", () => {
    expect(SOURCE).not.toContain("'use client'")
    expect(SOURCE).not.toContain('"use client"')
  })
})

describe('"Voy": el total se muestra desde 3 y nunca se dice quién', () => {
  it('el HTML dice que el total se muestra desde 3 personas y que nunca se muestra quién', () => {
    expect(html).toContain('desde 3 personas')
    expect(html).toContain('nunca se muestra quién')
  })
})

describe('el token de notificaciones no se afirma como borrado con certeza', () => {
  it('el HTML no dice que el token se borra siempre, y sí que se intenta borrar', () => {
    expect(html).not.toContain('el token de ese teléfono se borra')
    expect(html).toContain('intentamos borrar el token')
  })
})

describe('carácter facultativo de los datos (art. 6, Ley 25.326)', () => {
  it('el HTML dice que crear una cuenta es opcional y nombra la consecuencia de no crearla', () => {
    expect(html).toContain('Crear una cuenta es opcional')
    expect(html).toContain('no vas a poder guardar eventos')
  })

  // Lo automático (fallas, mapa, SDK de anuncios) sale con o sin cuenta: la
  // página no puede decir que "nada más cambia" sin cuenta.
  it('no dice que darlos sea todo opcional y avisa que algunos datos técnicos se envían igual', () => {
    expect(html).not.toContain('Darnos estos datos es opcional')
    expect(html).not.toContain('Nada más cambia')
    expect(html).toContain('Algunos datos técnicos se envían igual, con o sin cuenta')
  })
})

describe('lo que está por entrar va en condicional (sin código en main)', () => {
  it('los avisos patrocinados: "si las notificaciones de la app incluyen avisos patrocinados"', () => {
    expect(html).toMatch(/si las notificaciones de la app incluyen avisos patrocinados/i)
    expect(html).not.toContain('Mandamos como mucho uno por semana')
  })

  it('la ubicación aproximada por IP no se niega', () => {
    expect(html).toContain('pueden servir para estimar tu ubicación aproximada')
    expect(html).not.toContain('Tampoco tu ubicación,')
  })
})

describe('la publicidad del sitio no se afirma sin condicionar a ADS_ENABLED', () => {
  it('el HTML no dice que se muestra publicidad en el sitio cuando ADS_ENABLED está apagado', () => {
    expect(html).not.toContain('que es lo que sostiene el servicio gratuito')
  })
})

describe('v1: sección "Publicidad en la app"', () => {
  it('tiene la sección con su título y su ancla', () => {
    expect(html).toMatch(/<h2[^>]*>Publicidad en la app<\/h2>/)
    expect(html).toContain('id="publicidad-en-la-app"')
  })

  it('nombra el ID de publicidad y cómo restablecerlo', () => {
    expect(html).toContain('ID de publicidad')
    expect(html).toContain('restablecer')
  })

  it('enlaza a policies.google.com/technologies/partner-sites', () => {
    expect(html).toContain('href="https://policies.google.com/technologies/partner-sites"')
  })
})

describe('v1: mapa, "Cerca mío" y avisos patrocinados', () => {
  it('nombra OpenFreeMap y "Cerca mío"', () => {
    expect(html).toContain('OpenFreeMap')
    expect(html).toContain('Cerca mío')
  })

  it('nombra los avisos patrocinados y "uno por semana"', () => {
    expect(html).toMatch(/avisos patrocinados/i)
    expect(html).toContain('uno por semana')
  })
})

describe('v1: Google Mobile Ads / AdMob en "Con quién los compartimos"', () => {
  it('está nombrado en esa sección (con ADS_ENABLED sin definir en el test)', () => {
    const desde = html.indexOf('Con quién los compartimos')
    expect(desde).toBeGreaterThan(-1)
    const seccion = html.slice(desde, html.indexOf('</section>', desde))
    expect(seccion).toContain('Google Mobile Ads')
    expect(seccion).toContain('AdMob')
  })
})
