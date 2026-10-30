/**
 * `InsigniaDestacado` (R50, QPS-239/-240, tarea 50-c): el badge "★ Destacado"
 * que antes se dibujaba a mano, suelto, en `event-card.tsx`. Ahora es un solo
 * componente (`components/insignia-destacado.tsx`), sin "use client", con
 * `{ visible: boolean; className?: string }`.
 *
 * Firma a propósito (y no `{ evento, className }` leyendo `evento.isFeatured`
 * como decía el plan original): los cinco lugares donde va la insignia NO
 * reciben la misma forma de dato. `event-card.tsx` y `hero-carousel.tsx`
 * reciben un `DisplayEvent` (con `isFeatured` ya resuelto por
 * `transformEvent`); `event-modal.tsx` tiene su propio `DisplayEvent` local
 * con `isFeatured?: boolean`; pero `event-detail-page.tsx` y
 * `event-modal-wrapper.tsx` reciben la FILA CRUDA (`EventWithRelations`), que
 * no tiene `isFeatured`: solo `is_featured` (legado) y `featured_until`. Por
 * eso el componente no conoce ninguna de las dos columnas: solo dibuja según
 * el booleano que le manda quien llama.
 *
 * Sin red ni base; entorno `node` (ver `vitest.config.ts`).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { quitarComentarios as sinComentarios } from '@qps/core/tests/convencion-entorno'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { InsigniaDestacado } from '@/components/insignia-destacado'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function readSource(relativePath: string): string {
  return readFileSync(path.join(WEB_ROOT, relativePath), 'utf8')
}

// ---------------------------------------------------------------------------
// Render: con visible=true aparece el texto y el aria-label; con
// visible=false no se dibuja nada.
// ---------------------------------------------------------------------------
describe('InsigniaDestacado', () => {
  it('visible=true: dibuja "★ Destacado" y aria-label="Evento destacado"', () => {
    const html = renderToStaticMarkup(React.createElement(InsigniaDestacado, { visible: true }))

    expect(html).toContain('★ Destacado')
    expect(html).toContain('aria-label="Evento destacado"')
  })

  it('visible=false: no dibuja nada (null)', () => {
    const html = renderToStaticMarkup(React.createElement(InsigniaDestacado, { visible: false }))

    expect(html).toBe('')
  })

  it('className se compone con las clases propias (no las reemplaza)', () => {
    const html = renderToStaticMarkup(
      React.createElement(InsigniaDestacado, { visible: true, className: 'absolute left-2 top-8' }),
    )

    expect(html).toContain('absolute')
    expect(html).toContain('left-2')
    expect(html).toContain('top-8')
    // Las clases propias del badge (gradiente ámbar) siguen ahí.
    expect(html).toContain('from-amber-500')
  })
})

// ---------------------------------------------------------------------------
// Detector 1: UNA sola copia del texto "★ Destacado" en components/ y app/.
//
// Cómo se evade: un literal partido ("★" + " Destacado"), un escape unicode
// ("★ Destacado") o un emoji visualmente parecido pero distinto
// (ej. "⭐ Destacado", U+2B50) no matchean esta cadena exacta y el detector
// no los vería. También se evade si el texto se arma en un archivo .ts (no
// .tsx) que después alguna página importa como string — este detector solo
// recorre .tsx bajo components/ y app/.
// ---------------------------------------------------------------------------
/** Comentarios de línea y de bloque (también los de JSX) vaciados — mismo criterio que orden-ficha.test.ts. */


function listarTsx(dirAbsoluto: string): string[] {
  const resultado: string[] = []
  for (const entrada of readdirSync(dirAbsoluto, { withFileTypes: true })) {
    const abs = path.join(dirAbsoluto, entrada.name)
    if (entrada.isDirectory()) {
      resultado.push(...listarTsx(abs))
    } else if (entrada.isFile() && entrada.name.endsWith('.tsx')) {
      resultado.push(abs)
    }
  }
  return resultado
}

describe('Detector: "★ Destacado" aparece UNA sola vez (insignia-destacado.tsx)', () => {
  const archivosTsx = [
    ...listarTsx(path.join(WEB_ROOT, 'components')),
    ...listarTsx(path.join(WEB_ROOT, 'app')),
  ]

  it('ningún .tsx de components/ o app/, salvo insignia-destacado.tsx, dibuja "★ Destacado"', () => {
    const conElTexto = archivosTsx.filter((abs) => {
      if (path.basename(abs) === 'insignia-destacado.tsx') return false
      return readFileSync(abs, 'utf8').includes('★ Destacado')
    })

    expect(conElTexto).toEqual([])
  })

  it('insignia-destacado.tsx SÍ lo dibuja (si no, el detector de arriba pasaría por las razones equivocadas)', () => {
    const src = readSource('components/insignia-destacado.tsx')
    expect(src).toContain('★ Destacado')
  })
})

// ---------------------------------------------------------------------------
// Detector 2: ningún .tsx de components/ o app/ mira `is_featured` para
// decidir qué mostrar. Se despojan los comentarios antes de buscar (mismo
// criterio que orden-ficha.test.ts): `insignia-destacado.tsx` y
// `control-destacado.tsx` NOMBRAN la columna en un comentario, explicando
// justamente que no la miran, y eso no debe hacer fallar el detector.
//
// Cómo se evade: una desestructuración que renombra el campo
// (`const { is_featured: legado } = event`) y usa `legado` después no
// matchea la cadena "is_featured" en el punto de uso (sí en la
// desestructuración, así que el string crudo igual aparecería en el
// archivo — este detector busca el texto "is_featured" en todo el archivo,
// no el patrón de lectura puntual, así que SÍ lo detectaría igual). Donde
// de verdad se evade es con acceso dinámico (`event['is_feat' + 'ured']`),
// pasando el nombre de la columna como variable armada en otro módulo, o
// escondiendo código real detrás de un comentario mal formado que
// `sinComentarios` no reconoce (su regex de línea no borra un `//` que
// viene justo después de `:`, `"` o `'`, a propósito, para no comerse URLs
// dentro de strings — ver `tests/asistencia/orden-ficha.test.ts`).
//
// Excepciones legítimas que encontré (ninguna está en components/ ni app/
// como .tsx, así que no las toca este detector, pero quedan documentadas):
//   - `app/api/cron/scrape/run-scrape-job.ts` (.ts, no .tsx): inserta
//     `is_featured: false` en eventos nuevos scrapeados — un INSERT, no una
//     decisión de qué mostrar.
//   - `lib/scraper/save-to-supabase.ts`, `lib/scraper/parsers.ts`,
//     `lib/recurrentes/generar.ts`, `lib/ai/process-flyer-ai.ts`: mismo
//     patrón, insertan `is_featured: false` por default en filas nuevas.
//   - `lib/scraper/merge-events.ts`: solo lo nombra en un comentario (lista
//     de columnas que son "propiedades del registro, no del evento").
//   - `lib/admin-actions.ts` (`toggleEventFeatured`): ESCRIBE `is_featured`
//     (la regla vieja, sin fecha) — sigue viva porque no es de este
//     programador borrarla, pero ya no tiene ningún llamador en la UI
//     (`event-detail-page.tsx` ahora monta `ControlDestacado`, que llama a
//     `destacarEvento`/`quitarDestacado` de `lib/admin/destacados-actions.ts`,
//     que escriben `featured_until`).
//   - `lib/data.ts` (`getEvents({ featured: true })`): filtra
//     `.eq('is_featured', true)` si se le pasa esa opción, pero ningún call
//     site de la UI la usa hoy.
//   - `components/admin/control-destacado.tsx`: lo nombra en un comentario
//     explicando por qué el switch viejo quedó reemplazado.
// ---------------------------------------------------------------------------
describe('Detector: ningún .tsx de components/ o app/ mira is_featured', () => {
  const archivosTsx = [
    ...listarTsx(path.join(WEB_ROOT, 'components')),
    ...listarTsx(path.join(WEB_ROOT, 'app')),
  ]

  it('is_featured no aparece en ningún .tsx de components/ ni app/ (fuera de comentarios)', () => {
    // sinComentarios: insignia-destacado.tsx y control-destacado.tsx lo
    // NOMBRAN en un comentario (explicando, justamente, que la insignia no
    // lo mira), no lo leen para decidir nada. Despojamos comentarios antes
    // de buscar, mismo criterio que tests/asistencia/orden-ficha.test.ts.
    const conLaColumna = archivosTsx
      .filter((abs) => sinComentarios(readFileSync(abs, 'utf8')).includes('is_featured'))
      .map((abs) => path.relative(WEB_ROOT, abs))

    expect(conLaColumna).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// event-detail-page.tsx: ya no importa toggleEventFeatured, y
// ControlDestacado queda DENTRO del bloque isAdmin (no visible para quien no
// es admin) — la aserción que más vale de este archivo.
// ---------------------------------------------------------------------------
describe('event-detail-page.tsx: reemplaza el switch viejo por ControlDestacado', () => {
  const src = readSource('components/event-detail-page.tsx')

  it('no importa toggleEventFeatured (lib/admin-actions.ts)', () => {
    expect(src).not.toMatch(/toggleEventFeatured/)
  })

  it('importa ControlDestacado desde @/components/admin/control-destacado', () => {
    expect(src).toMatch(
      /import\s*\{\s*ControlDestacado\s*\}\s*from\s*['"]@\/components\/admin\/control-destacado['"]/,
    )
  })

  it('<ControlDestacado aparece DENTRO del bloque isAdmin (no se monta para quien no es admin)', () => {
    const inicioIsAdmin = src.indexOf('{isAdmin &&')
    expect(inicioIsAdmin).toBeGreaterThan(-1)

    // Cierre del bloque: el `)}` que balancea el `{isAdmin && (` de más arriba.
    // No hace falta un parser completo: alcanza con que <ControlDestacado
    // aparezca DESPUÉS de "{isAdmin &&" y ANTES del próximo bloque grande
    // que ya sabemos que está fuera (el de fecha/hora, ancla estable de
    // orden-ficha.test.ts: "<Calendar" del bloque de fecha).
    const inicioControl = src.indexOf('<ControlDestacado', inicioIsAdmin)
    const inicioBloqueFecha = src.indexOf('mb-6 space-y-4', inicioIsAdmin)

    expect(inicioControl).toBeGreaterThan(inicioIsAdmin)
    expect(inicioBloqueFecha).toBeGreaterThan(inicioControl)
  })

  it('le pasa eventId y featuredUntil (featured_until con fallback a null)', () => {
    expect(src).toMatch(
      /<ControlDestacado\s+eventId=\{event\.id\}\s+featuredUntil=\{event\.featured_until \?\? null\}\s*\/>/,
    )
  })
})

// ---------------------------------------------------------------------------
// Los dos archivos que reciben la fila cruda llaman a estaDestacado() de
// core, nunca comparan featured_until con una fecha a mano.
// ---------------------------------------------------------------------------
describe('event-detail-page.tsx y event-modal-wrapper.tsx: usan estaDestacado() de core, no comparan fechas a mano', () => {
  const archivos = ['components/event-detail-page.tsx', 'components/event-modal-wrapper.tsx']

  it.each(archivos)('%s importa estaDestacado desde @qps/core/events/destacados', (relativePath) => {
    const src = readSource(relativePath)
    expect(src).toMatch(
      /import\s*\{\s*estaDestacado\s*\}\s*from\s*['"]@qps\/core\/events\/destacados['"]/,
    )
  })

  it.each(archivos)('%s llama a estaDestacado(event.featured_until, ...) para la prop visible', (relativePath) => {
    const src = readSource(relativePath)
    expect(src).toMatch(/visible=\{estaDestacado\(event\.featured_until,\s*new Date\(\)\)\}/)
  })

  it.each(archivos)('%s no compara featured_until con una fecha a mano', (relativePath) => {
    const src = readSource(relativePath)
    // Ninguna comparación directa de fechas: ni `new Date(event.featured_until) >`
    // ni `> new Date()` aplicado a featured_until fuera de la llamada a estaDestacado.
    expect(src).not.toMatch(/featured_until\)\s*[<>]/)
    expect(src).not.toMatch(/new Date\(event\.featured_until\)/)
  })
})

// ---------------------------------------------------------------------------
// event-card.tsx y hero-carousel.tsx: usan event.isFeatured directo (ya
// resuelto por transformEvent), sin llamar a estaDestacado.
// ---------------------------------------------------------------------------
describe('event-card.tsx y hero-carousel.tsx: usan isFeatured (DisplayEvent), no llaman a estaDestacado', () => {
  it('event-card.tsx: <InsigniaDestacado visible={event.isFeatured} ...>, sin estaDestacado', () => {
    const src = readSource('components/event-card.tsx')
    expect(src).toMatch(/<InsigniaDestacado visible=\{event\.isFeatured\}/)
    expect(src).not.toMatch(/estaDestacado/)
  })

  it('hero-carousel.tsx: <InsigniaDestacado visible={currentEvent.isFeatured} ...>, sin estaDestacado', () => {
    const src = readSource('components/hero-carousel.tsx')
    expect(src).toMatch(/<InsigniaDestacado visible=\{currentEvent\.isFeatured\}/)
    expect(src).not.toMatch(/estaDestacado/)
  })
})
