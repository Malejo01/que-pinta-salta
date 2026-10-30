/**
 * Los accesos al mapa (R54, tarea 54-c): `VerEnElMapa` (la ficha y el modal
 * interceptado), "Mapa" en los dos menús y `/mapa` en el sitemap.
 *
 * Esta ronda NO crea `/mapa` (54-b queda para la Fase 2): estos tests no
 * navegan la ruta ni dependen de que exista `app/mapa/page.tsx`, solo de que
 * los links que apuntan ahí estén bien armados.
 *
 * Sin red ni base; entorno `node` (ver `vitest.config.ts`).
 */
import { readFileSync } from 'node:fs'
import { quitarComentarios as sinComentarios } from '@qps/core/tests/convencion-entorno'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { VerEnElMapa } from '@/components/ver-en-el-mapa'
import { formatSaltaDayKey, saltaWallClockToDate } from '@qps/core/date-format'
import type { Venue } from '@/lib/types'

/**
 * Área táctil mínima, en px (guía de Android, 48dp). El mismo número que
 * `AREA_TACTIL_MINIMA` de `apps/mobile/lib/accesibilidad.ts`, repetido acá: la
 * web no importa código de la app (son dos aplicaciones distintas) y ese valor
 * todavía no vive en `packages/core`. Si alguna vez se muda a core, este
 * literal se reemplaza por el import.
 */
const AREA_TACTIL_MINIMA = 48

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function readSource(relativePath: string): string {
  return readFileSync(path.join(WEB_ROOT, relativePath), 'utf8')
}



/** Un `Venue` mínimo pero completo (todas las columnas NOT NULL cubiertas), con overrides. */
function venue(overrides: Partial<Venue> & { id: string }): Venue {
  return {
    name: 'Lugar de prueba',
    address: 'Alguna calle 123',
    canonical_venue_id: null,
    capacity: null,
    created_at: null,
    geocode_source: null,
    geocoded_at: null,
    google_maps_url: null,
    is_placeholder: false,
    latitude: null,
    longitude: null,
    merged_at: null,
    phone: null,
    slug: null,
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function renderVerEnElMapa(props: { venue: Venue | null; startDate: Date }): string {
  return renderToStaticMarkup(React.createElement(VerEnElMapa, props))
}

// ---------------------------------------------------------------------------
// Render: con coordenadas válidas (dentro de la zona de Salta) dibuja el
// link exacto; sin venue, con (0, 0) y con Buenos Aires no dibuja nada.
// ---------------------------------------------------------------------------
describe('VerEnElMapa', () => {
  const startDate = saltaWallClockToDate('2026-03-10T20:00:00')

  it('con coordenadas válidas: el href exacto, con el id del lugar codificado', () => {
    // El id lleva un espacio y una barra a propósito, para que la aserción
    // de abajo solo pase si el componente de verdad llama a
    // `encodeURIComponent` (un uuid real no tiene caracteres que cambien al
    // codificarlos, así que no alcanzaría para detectar un olvido).
    const html = renderVerEnElMapa({
      venue: venue({ id: 'lugar con espacio/barra', latitude: -24.78, longitude: -65.41 }),
      startDate,
    })

    expect(html).toContain(
      'href="/mapa?cuando=fecha&amp;dia=2026-03-10&amp;lugar=lugar%20con%20espacio%2Fbarra"',
    )
    expect(html).toContain('Ver en el mapa')
  })

  it('venue null: no dibuja nada', () => {
    expect(renderVerEnElMapa({ venue: null, startDate })).toBe('')
  })

  it('coordenadas (0, 0): fuera de la zona de Salta, no dibuja nada', () => {
    const html = renderVerEnElMapa({
      venue: venue({ id: 'v-origen', latitude: 0, longitude: 0 }),
      startDate,
    })
    expect(html).toBe('')
  })

  it('coordenadas de Buenos Aires: fuera de la zona de Salta, no dibuja nada', () => {
    const html = renderVerEnElMapa({
      venue: venue({ id: 'v-caba', latitude: -34.6037, longitude: -58.3816 }),
      startDate,
    })
    expect(html).toBe('')
  })

  it('venue sin coordenadas (null, null): no dibuja nada', () => {
    const html = renderVerEnElMapa({
      venue: venue({ id: 'v-sin-coords' }),
      startDate,
    })
    expect(html).toBe('')
  })

  it('el día del link es el día de SALTA, no el día UTC crudo de la fecha guardada', () => {
    // Un evento a las 23:30 de Salta queda guardado con la fecha del día
    // SIGUIENTE en UTC (Salta es UTC-3): 2026-03-10T23:30 de Salta es
    // 2026-03-11T02:30Z. El link tiene que llevar "2026-03-10" (el día que
    // la gente reconoce), no "2026-03-11".
    const inicioDeNoche = saltaWallClockToDate('2026-03-10T23:30:00')

    // Confirma la premisa: el día UTC crudo YA es el día siguiente (si esto
    // fallara, el resto del test no estaría probando nada).
    expect(inicioDeNoche.toISOString().slice(0, 10)).toBe('2026-03-11')
    expect(formatSaltaDayKey(inicioDeNoche)).toBe('2026-03-10')

    const html = renderVerEnElMapa({
      venue: venue({ id: 'v-noche', latitude: -24.78, longitude: -65.41 }),
      startDate: inicioDeNoche,
    })

    expect(html).toContain('dia=2026-03-10')
    expect(html).not.toContain('dia=2026-03-11')
  })
})

// ---------------------------------------------------------------------------
// Detector: la ficha y el modal interceptado usan <VerEnElMapa, no arman
// "/mapa?" a mano.
// ---------------------------------------------------------------------------
describe('event-detail-page.tsx y event-modal-wrapper.tsx: usan <VerEnElMapa, no arman /mapa? a mano', () => {
  const archivos = ['components/event-detail-page.tsx', 'components/event-modal-wrapper.tsx']

  it.each(archivos)('%s importa VerEnElMapa desde @/components/ver-en-el-mapa', (relativePath) => {
    const src = readSource(relativePath)
    expect(src).toMatch(
      /import\s*\{\s*VerEnElMapa\s*\}\s*from\s*['"]@\/components\/ver-en-el-mapa['"]/,
    )
  })

  it.each(archivos)('%s dibuja <VerEnElMapa', (relativePath) => {
    const src = readSource(relativePath)
    expect(src).toContain('<VerEnElMapa')
  })

  it.each(archivos)('%s no arma la URL de /mapa a mano (ni el string literal ni un template literal con cuando=fecha)', (relativePath) => {
    const src = readSource(relativePath)
    expect(src).not.toContain('/mapa?')
    expect(src).not.toContain('cuando=fecha')
  })
})

// ---------------------------------------------------------------------------
// Los dos menús: "Mapa" con prefetch={false}.
// ---------------------------------------------------------------------------
describe('navbar.tsx y mobile-nav.tsx: "Mapa" con prefetch={false}', () => {
  it('navbar.tsx: un link a /mapa con prefetch={false}', () => {
    const src = readSource('components/navbar.tsx')
    expect(src).toMatch(/<Link href="\/mapa"[^>]*prefetch=\{false\}/)
  })

  it('mobile-nav.tsx: /mapa está en navItems, entre /buscar y /radar, con prefetch: false', () => {
    const src = readSource('components/mobile-nav.tsx')
    const inicioBuscar = src.indexOf("href: \"/buscar\"")
    const inicioMapa = src.indexOf("href: \"/mapa\"")
    const inicioRadar = src.indexOf("href: \"/radar\"")

    expect(inicioBuscar).toBeGreaterThan(-1)
    expect(inicioMapa).toBeGreaterThan(inicioBuscar)
    expect(inicioRadar).toBeGreaterThan(inicioMapa)

    // El objeto de /mapa (entre su propia llave de apertura y la próxima
    // línea) tiene `prefetch: false`.
    const finDeMapa = src.indexOf('}', inicioMapa)
    expect(src.slice(inicioMapa, finDeMapa)).toContain('prefetch: false')
  })

  it('mobile-nav.tsx: el <Link> le pasa prefetch={item.prefetch} (así /mapa es el único que lo apaga)', () => {
    const src = readSource('components/mobile-nav.tsx')
    expect(src).toMatch(/prefetch=\{item\.prefetch\}/)
  })
})

// ---------------------------------------------------------------------------
// La barra inferior con 5 ítems: área táctil y escala de la letra.
//
// Las dos aserciones de abajo defienden un arreglo que ux-ui encontró sobre el
// diff de esta ronda: al pasar de 4 a 5 ítems se bajó el padding y el cuerpo de
// letra, y eso dejó al ítem más corto ("Mapa", 4 letras) con un ancho de ~36px
// —por debajo del mínimo que el propio repo fija— y con el tamaño de fuente
// congelado en píxeles. Sin estos tests, sacar cualquiera de las dos clases no
// pone nada en rojo.
// ---------------------------------------------------------------------------
describe('mobile-nav.tsx: los 5 ítems respetan el área táctil mínima y escalan con la letra del sistema', () => {
  // Las dos leen el archivo SIN COMENTARIOS, y no es un detalle: el comentario
  // de `mobile-nav.tsx` nombra las dos clases (la nueva, para explicar por qué
  // está, y la vieja `text-[11px]`, para explicar por qué se fue). Leyendo el
  // texto crudo, el detector del `min-w` pasaba por el comentario incluso con
  // la clase borrada del código —o sea que no podía fallar nunca— y el de la
  // letra fallaba por la explicación en vez de por el código. Las dos roturas
  // se corrieron después del arreglo y ponen su test en rojo.
  it(`cada ítem tiene un piso de ancho de ${AREA_TACTIL_MINIMA}px (el mínimo de Android que ya fija apps/mobile/lib/accesibilidad.ts)`, () => {
    const src = sinComentarios(readSource('components/mobile-nav.tsx'))
    expect(src).toContain(`min-w-[${AREA_TACTIL_MINIMA}px]`)
  })

  it('el cuerpo de letra va en rem, no en px: un px literal no escala si la persona agrandó la letra del sistema', () => {
    const src = sinComentarios(readSource('components/mobile-nav.tsx'))
    const clasesDeTexto = src.match(/text-\[[^\]]+\]/g) ?? []
    expect(clasesDeTexto.length).toBeGreaterThan(0)
    for (const clase of clasesDeTexto) {
      expect(clase).toMatch(/rem\]$/)
    }
  })
})

// ---------------------------------------------------------------------------
// El sitemap: /mapa.
// ---------------------------------------------------------------------------
describe('app/sitemap.ts: incluye /mapa', () => {
  it('el sitemap arma una ruta estática para /mapa', () => {
    const src = readSource('app/sitemap.ts')
    expect(src).toMatch(/staticRoute\("\/mapa"/)
  })
})
