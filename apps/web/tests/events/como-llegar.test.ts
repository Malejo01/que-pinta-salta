// QPS-137 (y QPS-130): "Como llegar" solo aparece cuando urlComoLlegar() da una URL.
// Sin dirección ni lugar devuelve null (tests/core/links.test.ts): entonces no hay botón,
// en vez de un link a '#' (la ficha) o a una búsqueda vacía de Maps (los dos modales).
//
// El entorno de Vitest es node, sin DOM: igual que tests/buscar/solo-gratis-chip.test.ts,
// se controla el código fuente de los tres componentes que muestran el botón.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { es } from '@/lib/i18n/diccionarios/es'

const ROOT = join(__dirname, '..', '..')
const COMPONENTES = ['components/event-detail-page.tsx', 'components/event-modal.tsx', 'components/event-modal-wrapper.tsx']

// Q3: desde la ficha en inglés, los textos de los botones salen del
// diccionario (`textos.ficha.*`), así que se busca esa referencia en el
// código; que el castellano siga diciendo exactamente lo mismo lo fija el
// test de abajo contra `es.ficha`.
const TEXTO_BOTON = 'textos.ficha.comoLlegar'

it('en castellano el botón sigue diciendo "Cómo llegar"', () => {
  expect(es.ficha.comoLlegar).toBe('Cómo llegar')
})

describe.each(COMPONENTES)('%s', (archivo) => {
  const fuente = readFileSync(join(ROOT, archivo), 'utf8')

  it('arma la URL con urlComoLlegar(), la misma de la ficha y de la app', () => {
    expect(fuente).toMatch(/import \{[^}]*\burlComoLlegar\b[^}]*\} from "@\/lib\/metricas\/links"/)
    expect(fuente).toMatch(/const googleMapsUrl = urlComoLlegar\(\{/)
  })

  it('no arma la URL de Maps a mano ni cae a "#"', () => {
    expect(fuente).not.toContain('google.com/maps')
    expect(fuente).not.toMatch(/urlComoLlegar\([^)]*\)\s*\?\?/)
  })

  it('el botón "Cómo llegar" está dentro de {googleMapsUrl && (...)}', () => {
    const condicion = fuente.indexOf('{googleMapsUrl && (')
    const boton = fuente.indexOf(TEXTO_BOTON)
    expect(condicion).toBeGreaterThan(-1)
    expect(boton).toBeGreaterThan(condicion)
    // Un solo botón, y el cierre del condicional viene después del texto.
    expect(fuente.split(TEXTO_BOTON)).toHaveLength(2)
    // Y ningún literal suelto que no pase por el diccionario.
    expect(fuente).not.toContain('Cómo llegar<')
    expect(fuente).not.toMatch(/>\s*Cómo llegar\s*</)
    const cierre = fuente.indexOf(')}', boton)
    expect(cierre).toBeGreaterThan(boton)
    // Entre la condición y el texto no se cierra otro bloque JSX condicional.
    expect(fuente.slice(condicion, boton)).not.toContain(')}')
  })
})
