// Q5-6 · Seguir lugares en la web: «Lugares que seguís» en Mis eventos, el
// link a la ficha en Perfil y el aviso de novedades (R41) que ya incluye los
// lugares seguidos. Sin red ni base.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contarProximosPorLugar } from '@qps/core/lugares/seguidos'

const leer = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

describe('contarProximosPorLugar', () => {
  it('cuenta por venue e ignora los sin lugar', () => {
    const c = contarProximosPorLugar([{ venue_id: 'a' }, { venue_id: 'b' }, { venue_id: 'a' }, { venue_id: null }])
    expect(Object.fromEntries(c)).toEqual({ a: 2, b: 1 })
  })
})

describe('dónde aparece', () => {
  it('Mis eventos (/favoritos) muestra «Lugares que seguís» con link a la ficha', () => {
    expect(leer('app', 'favoritos', 'page.tsx')).toContain('<LugaresQueSeguis userId={user.id} />')
    const c = leer('components', 'lugares', 'lugares-que-seguis.tsx')
    expect(c).toContain('Lugares que seguís')
    expect(c).toContain('href={`/lugar/${lugar.slug ?? lugar.id}`}')
    // Solo lee: las escrituras de seguimiento viven solo en lib/actions/radar.ts.
    expect(c).not.toMatch(/\.insert\(|\.delete\(|\.upsert\(/)
  })
  it('Perfil › Lo que seguís enlaza cada lugar a su ficha', () => {
    // Q6-2: en /en/perfil el link va a /en/place/<slug> (rutaEn deja igual el castellano).
    expect(leer('app', 'perfil', 'lo-que-seguis.tsx')).toContain('href={rutaEn(idioma, `/lugar/${lugar.slug ?? lugar.id}`)}')
    expect(leer('lib', 'actions', 'radar.ts')).toContain('select("venue:venues(id, name, slug)")')
  })
  it('la ficha del lugar tiene «Seguir»', () => {
    expect(leer('components', 'lugares', 'pagina-lugar.tsx')).toContain('<BotonSeguir tipo="lugar"')
  })
  it('el aviso por evento nuevo de un lugar seguido ya existe (novedades, R41): no hace falta un cron nuevo', () => {
    expect(leer('lib', 'notificaciones', 'novedades.ts')).toContain('user_followed_venues')
  })
})
