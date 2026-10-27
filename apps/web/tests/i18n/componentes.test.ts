/**
 * Textos de favoritos, compartir y el aviso de cookies (Q3): salen del
 * diccionario (`useTextos()`), así que en /en se ven en inglés. El castellano
 * tiene que seguir EXACTAMENTE igual que antes, y ningún componente puede
 * quedarse con un literal suelto que no pase por el diccionario.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TEXTO_SACASTE_GUARDADO_CON_VOY } from '@qps/core/asistencia'
import { es } from '@/lib/i18n/diccionarios/es'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('el castellano no cambió', () => {
  it('favoritos', () => {
    expect(es.favorito).toEqual({
      guardar: 'Guardar en favoritos',
      quitar: 'Quitar de favoritos',
      errorTitulo: 'Error',
      errorTexto: 'No se pudo actualizar el favorito.',
      guardadoTitulo: 'Favorito guardado',
      pedidoCafecito:
        '¡Plan guardado! ❤️ Si Qué Pinta Salta te ayuda a organizar tu finde, invitanos un cafecito para ayudarnos a crear la App móvil.',
      guardadoTexto: 'El elemento se agregó a tu agenda.',
      donarAhora: 'Donar ahora',
      eliminadoTitulo: 'Favorito eliminado',
      eliminadoTexto: 'El elemento se quitó de tu agenda.',
      sacasteGuardadoConVoy: TEXTO_SACASTE_GUARDADO_CON_VOY,
      errorConexionTitulo: 'Error de conexión',
      errorConexionTexto: 'No pudimos conectarnos al servidor. Intentalo de nuevo.',
    })
  })

  it('compartir', () => {
    expect(es.compartir).toEqual({
      compartirEvento: 'Compartir evento',
      linkCopiado: 'Link copiado',
      noSePudoCopiar: 'No se pudo copiar el link',
    })
  })

  it('cookies', () => {
    expect(es.cookies).toEqual({
      region: 'Aviso de cookies',
      textoConAnuncios: 'Usamos Google Analytics y anuncios de Google. Si aceptás, los anuncios pueden ser personalizados.',
      textoSinAnuncios: 'Usamos Google Analytics para saber qué se usa del sitio. Solo si aceptás.',
      masInfoAria: 'Más información sobre cookies en la Política de Privacidad',
      masInfo: 'Más info',
      rechazar: 'Rechazar',
      aceptar: 'Aceptar',
    })
  })
})

describe.each([
  ['components/favorite-button.tsx', es.favorito],
  ['components/share-button.tsx', es.compartir],
  ['components/consent-banner.tsx', es.cookies],
])('%s usa el diccionario', (archivo, seccion) => {
  // Sin comentarios: pueden nombrar un texto para explicar algo (no es pantalla).
  const fuente = read(archivo).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('llama a useTextos()', () => {
    expect(fuente).toMatch(/useTextos\(\)/)
  })

  it.each(Object.entries(seccion).filter(([clave]) => clave !== 'errorTitulo'))(
    'no tiene el literal de %s',
    (_clave, texto) => {
      expect(fuente).not.toContain(`"${texto}"`)
      expect(fuente).not.toContain(`'${texto}'`)
      expect(fuente).not.toContain(`>${texto}<`)
    },
  )
})

describe('consent-banner: el link a /privacidad (solo en castellano)', () => {
  it('lleva hrefLang="es-AR" fuera del castellano', () => {
    expect(read('components/consent-banner.tsx')).toMatch(/hrefLang=\{idioma === 'es' \? undefined : 'es-AR'\}/)
  })
})
