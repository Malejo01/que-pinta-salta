// 25-c, punto 3: las consultas de datos de la app (`lib/datos/`) usan
// `PUBLIC_EVENT_SELECT` (eventos) y columnas explícitas (cines) — nunca
// `select('*')`. Lectura de los archivos reales, sin red ni base.
//
// 26-c, punto 4: lo mismo para `lib/asistencia.ts` (las consultas de
// `event_attendance_counts`/`event_attendance` de la ficha), más un barrido
// de toda la app para que ninguna consulta pida la columna `user_id` en un
// `select` de `event_attendance` — filtrar por la fila propia (RLS) sí,
// pedir la columna de persona no.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PUBLIC_EVENT_SELECT } from '@qps/core/events/public-select'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const DATOS_DIR = fileURLToPath(new URL('../lib/datos', import.meta.url))
const LIB_DIR = fileURLToPath(new URL('../lib', import.meta.url))

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

  it('encuentra los 3 archivos de datos', () => {
    expect(archivos.sort()).toEqual(['cines.ts', 'eventos.ts', 'flyers.ts'])
  })

  it.each(archivos)('%s no usa select("*")', (archivo) => {
    const src = leer(archivo)
    expect(src).not.toMatch(/\.select\(\s*['"`]\s*\*\s*['"`]?\s*\)/)
  })
})

// ---------------------------------------------------------------------------
// 26-c, punto 4: lib/asistencia.ts (no es lib/datos/, pero también consulta
// la base) y el barrido de "nunca user_id en un select de event_attendance".
// ---------------------------------------------------------------------------
describe('lib/asistencia.ts', () => {
  const src = readFileSync(join(LIB_DIR, 'asistencia.ts'), 'utf8')

  it('no usa select("*") en ninguna consulta', () => {
    expect(src).not.toMatch(/\.select\(\s*['"`]\s*\*/)
  })

  it('el select de event_attendance_counts pide la columna explícita (voy) — R47, QPS-197: "me_interesa" ya no existe', () => {
    expect(src).toMatch(/\.from\(['"]event_attendance_counts['"]\)\s*\.select\(['"]voy['"]\)/)
  })

  it('el select de event_attendance pide solo "kind" (nunca user_id, aunque la RLS ya acote a la fila propia)', () => {
    const m = src.match(/\.from\(['"]event_attendance['"]\)\s*\.select\((['"`])([^'"`]+)\1\)/)
    expect(m).not.toBeNull()
    const columnas = m![2].split(',').map((c) => c.trim())
    expect(columnas).toEqual(['kind'])
    expect(columnas).not.toContain('user_id')
  })
})

describe('toda la app: ningún select de event_attendance pide la columna user_id', () => {
  function listarTsxYTs(root: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(root)) {
      const full = join(root, entry)
      const st = statSync(full)
      if (st.isDirectory()) {
        out.push(...listarTsxYTs(full))
      } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
        out.push(full)
      }
    }
    return out
  }

  const archivos = ['app', 'components', 'lib'].flatMap((d) => listarTsxYTs(join(MOBILE_ROOT, d)))

  it('encuentra archivos para analizar, incluido lib/asistencia.ts', () => {
    expect(archivos.length).toBeGreaterThan(0)
    expect(archivos.some((f) => relative(MOBILE_ROOT, f) === join('lib', 'asistencia.ts'))).toBe(true)
  })

  it.each(archivos.map((file) => [relative(MOBILE_ROOT, file), file] as const))(
    '%s: ningún select de event_attendance incluye user_id',
    (_label, file) => {
      const src = readFileSync(file, 'utf8')
      const re = /\.from\(['"]event_attendance['"]\)\s*\.select\((['"`])([^'"`]*)\1\)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        const columnas = m[2].split(',').map((c) => c.trim())
        expect(columnas).not.toContain('user_id')
      }
    }
  )
})
