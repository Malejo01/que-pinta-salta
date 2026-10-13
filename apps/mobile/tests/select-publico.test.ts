// 25-c, punto 3: las consultas de datos de la app (`lib/datos/`) usan
// `PUBLIC_EVENT_SELECT` (eventos) y columnas explícitas (cines) — nunca
// `select('*')`. Lectura de los archivos reales, sin red ni base.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PUBLIC_EVENT_SELECT } from '@qps/core/events/public-select'

const DATOS_DIR = fileURLToPath(new URL('../lib/datos', import.meta.url))

function leer(nombre: string): string {
  return readFileSync(join(DATOS_DIR, nombre), 'utf8')
}

describe('lib/datos/eventos.ts', () => {
  const src = leer('eventos.ts')

  it('importa PUBLIC_EVENT_SELECT de @qps/core/events/public-select', () => {
    expect(src).toMatch(/import\s*\{\s*PUBLIC_EVENT_SELECT\s*\}\s*from\s*['"]@qps\/core\/events\/public-select['"]/)
  })

  it('el select de events usa la variable PUBLIC_EVENT_SELECT, no un literal "*"', () => {
    expect(src).toMatch(/\.from\(['"]events['"]\)\.select\(PUBLIC_EVENT_SELECT\)/)
    expect(src).not.toMatch(/\.select\(\s*['"`]\s*\*/)
  })

  it('PUBLIC_EVENT_SELECT en sí no es "*" y no incluye columnas internas (merge_audit, dedup_key, ai_metadata, created_by)', () => {
    expect(PUBLIC_EVENT_SELECT).not.toBe('*')
    expect(PUBLIC_EVENT_SELECT).not.toMatch(/(^|,)\s*\*/)
    for (const interna of ['merge_audit', 'dedup_key', 'ai_metadata', 'created_by']) {
      expect(PUBLIC_EVENT_SELECT).not.toContain(interna)
    }
  })
})

describe('lib/datos/cines.ts', () => {
  const src = leer('cines.ts')

  it('el select de cinema_movies lista columnas explícitas, no "*"', () => {
    const m = src.match(/\.from\(['"]cinema_movies['"]\)\s*\.select\((['"`])([^'"`]+)\1\)/)
    expect(m).not.toBeNull()
    const columnas = m![2]
    expect(columnas).not.toContain('*')
    expect(columnas.split(',').map((c) => c.trim())).toEqual(['id', 'slug', 'title', 'poster_url', 'showings'])
  })

  it('no hay ningún select("*") ni select(\'*\') en el archivo', () => {
    expect(src).not.toMatch(/\.select\(\s*['"`]\s*\*/)
  })
})

describe('lib/datos/: ningún archivo pide "*" a la base', () => {
  const archivos = readdirSync(DATOS_DIR).filter((f) => f.endsWith('.ts'))

  it('encuentra los 2 archivos de datos', () => {
    expect(archivos.sort()).toEqual(['cines.ts', 'eventos.ts'])
  })

  it.each(archivos)('%s no usa select("*")', (archivo) => {
    const src = leer(archivo)
    expect(src).not.toMatch(/\.select\(\s*['"`]\s*\*\s*['"`]?\s*\)/)
  })
})
