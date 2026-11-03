// Q5-6 · Seguir lugares en la app: «Seguir» en la ficha de un lugar para
// chicos y «Lugares que seguís» en Mis eventos. Lectura estática del código.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const leer = (...p: string[]) => readFileSync(join(RAIZ, ...p), 'utf8')

describe('seguir un lugar en la app', () => {
  it('la ficha del lugar dibuja BotonSeguir recién cuando sabe si ya lo sigue', () => {
    const s = leer('app', 'lugares-chicos', '[id].tsx')
    expect(s).toContain('siguesElLugar(id, userId)')
    expect(s).toMatch(/\{siguiendo !== null \? \(/)
    expect(s).toContain('<BotonSeguir key=')
  })
  it('siguesElLugar solo lee (las escrituras siguen siendo de cambiarSeguimiento)', () => {
    const r = leer('lib', 'radar.ts')
    const cuerpo = r.slice(r.indexOf('export async function siguesElLugar'))
    expect(cuerpo).toContain(".select('venue_id')")
    expect(cuerpo).not.toMatch(/\.insert\(|\.delete\(|\.upsert\(|\.update\(/)
  })
  it('Mis eventos muestra «Lugares que seguís» (también con la lista vacía), y abre la ficha web por urlFichaLugarWeb', () => {
    expect(leer('app', '(tabs)', 'favoritos.tsx')).toContain('{userId ? <LugaresQueSeguis userId={userId} /> : null}')
    const c = leer('components', 'LugaresQueSeguis.tsx')
    expect(c).toContain('urlFichaLugarWeb(lugar.id)')
    expect(c).toContain('accessibilityRole="link"')
    expect(c).not.toMatch(/from '@\/lib\/supabase'/)
  })
})
