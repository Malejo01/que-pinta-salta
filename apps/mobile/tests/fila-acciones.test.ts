/**
 * 47-f (QPS-197): `components/FilaAccionesEvento.tsx` (♥ Guardar · ✓ Voy ·
 * Compartir) y `components/BotonSeguir.tsx` (+ Seguir).
 *
 * Por qué esto es solo detectores estáticos (no se importan los .tsx):
 * `vitest.config.ts` corre en `environment: 'node'` y dice explícitamente
 * "Solo lógica pura (apps/mobile/lib y la config), sin React Native" — y en
 * este repo NINGÚN test importa un archivo que importe 'react-native',
 * NUNCA, ni siquiera uno tan chico como `lib/aviso.ts` (que no tiene test
 * propio pese a ser trivial: solo `Platform.OS === 'android'` +
 * `ToastAndroid.show`). `FilaAccionesEvento.tsx`/`BotonSeguir.tsx` importan
 * 'react-native' y 'expo-router' a nivel de módulo, así que importarlos
 * acá arrastraría esas dependencias sin ningún runner de RN que las
 * resuelva (no hay `@testing-library/react-native` en el repo y no se
 * puede instalar nada sin el OK del lead) — mismo criterio que
 * `tests/tarjeta-evento.test.ts`/`tests/asistencia-umbral.test.ts`.
 *
 * Lo que SÍ se prueba importando de verdad (sin react-native, sin riesgo):
 * `ORDEN_FILA_ACCIONES` y `textoBotonVoy`, de `@qps/core/asistencia` — la
 * base de la que depende `botonesDeLaFila` (la función pura que exporta
 * `FilaAccionesEvento.tsx`, documentada ahí mismo; ver el informe de esta
 * tarea para el detalle de por qué no se llama directo en este archivo).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { ORDEN_FILA_ACCIONES, textoBotonVoy } from '@qps/core/asistencia'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const FILA_PATH = join(MOBILE_ROOT, 'components', 'FilaAccionesEvento.tsx')
const SEGUIR_PATH = join(MOBILE_ROOT, 'components', 'BotonSeguir.tsx')

/** Comentarios de línea y de bloque vaciados, conservando el resto del texto (mismo criterio que tests/asistencia-umbral.test.ts). */
function quitarComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

// ---------------------------------------------------------------------------
// Lo genuinamente puro, sin react-native: el orden y los textos que
// `botonesDeLaFila` compone a partir de @qps/core/asistencia.
// ---------------------------------------------------------------------------
describe('ORDEN_FILA_ACCIONES (@qps/core/asistencia): el orden que recorre la fila', () => {
  it('es Guardar, Voy, Compartir, en ese orden (único lugar donde se fija)', () => {
    expect(ORDEN_FILA_ACCIONES).toEqual(['guardar', 'voy', 'compartir'])
  })
})

describe('textoBotonVoy (@qps/core/asistencia): los dos casos del encargo de 47-f', () => {
  it('cantidad 2 (debajo del umbral): "Voy", sin número', () => {
    expect(textoBotonVoy(2)).toBe('Voy')
  })

  it('cantidad 12: "Voy · 12 van"', () => {
    expect(textoBotonVoy(12)).toBe('Voy · 12 van')
  })
})

// ---------------------------------------------------------------------------
// Detectores estáticos sobre FilaAccionesEvento.tsx.
// ---------------------------------------------------------------------------
describe('components/FilaAccionesEvento.tsx (detectores estáticos)', () => {
  const contenido = quitarComentarios(readFileSync(FILA_PATH, 'utf8'))

  it('importa ORDEN_FILA_ACCIONES y textoBotonVoy de @qps/core/asistencia', () => {
    expect(
      /import\s*\{[^}]*\bORDEN_FILA_ACCIONES\b[^}]*\}\s*from\s*['"]@qps\/core\/asistencia['"]/.test(contenido),
    ).toBe(true)
    expect(/import\s*\{[^}]*\btextoBotonVoy\b[^}]*\}\s*from\s*['"]@qps\/core\/asistencia['"]/.test(contenido)).toBe(
      true,
    )
  })

  it('recorre ORDEN_FILA_ACCIONES (filter/map): el orden sale de core, no de una copia a mano', () => {
    expect(/ORDEN_FILA_ACCIONES\s*\.\s*(filter|map)/.test(contenido)).toBe(true)
    expect(contenido).not.toMatch(/\[\s*['"]guardar['"]\s*,\s*['"]voy['"]\s*,\s*['"]compartir['"]\s*\]/)
  })

  it('llama a textoBotonVoy con la cantidad de "voy" (no la muestra cruda)', () => {
    expect(/textoBotonVoy\s*\(/.test(contenido)).toBe(true)
  })

  it('usa BotonCompartir (de la R42) para "compartir", no lo reimplementa', () => {
    expect(/<BotonCompartir\b/.test(contenido)).toBe(true)
  })

  it('el botón de Voy exige status === "PUBLISHED" (si no, event_attendance_counts no lo cuenta y el número mentiría)', () => {
    expect(/status\s*===\s*['"]PUBLISHED['"]/.test(contenido)).toBe(true)
  })

  it('el seleccionado de cada botón sale del `seleccionado` que calcula botonesDeLaFila, no de un booleano aparte', () => {
    expect(/accessibilityState=\{\{\s*selected:\s*boton\.seleccionado/.test(contenido)).toBe(true)
  })

  it('no contiene "Me interesa" ni "me_interesa" (el modelo viejo, QPS-197)', () => {
    expect(contenido).not.toMatch(/Me interesa/i)
    expect(contenido).not.toMatch(/me_interesa/)
  })

  it('sin sesión, redirige a /cuenta (y no llega a escribir nada)', () => {
    expect(contenido).toMatch(/push\(\s*['"]\/cuenta['"]\s*\)/)
  })

  it('los botones (salvo Compartir) tienen accessibilityRole="button" y minHeight: 48', () => {
    expect(contenido).toMatch(/accessibilityRole="button"/)
    expect(contenido).toMatch(/minHeight:\s*48/)
  })
})

describe('components/BotonSeguir.tsx (detectores estáticos)', () => {
  const contenido = quitarComentarios(readFileSync(SEGUIR_PATH, 'utf8'))

  it('usa textoSeguir/textoSeguirCuenta de @qps/core/radar/seguimiento', () => {
    expect(/from\s*['"]@qps\/core\/radar\/seguimiento['"]/.test(contenido)).toBe(true)
  })

  it('escribe siempre a través de cambiarSeguimiento (lib/radar.ts)', () => {
    expect(/cambiarSeguimiento\s*\(/.test(contenido)).toBe(true)
  })

  it('sin sesión, redirige a /cuenta', () => {
    expect(contenido).toMatch(/push\(\s*['"]\/cuenta['"]\s*\)/)
  })

  it('accessibilityRole="button", accessibilityState con "selected" y minHeight: 48', () => {
    expect(contenido).toMatch(/accessibilityRole="button"/)
    expect(contenido).toMatch(/accessibilityState=\{\{\s*selected:/)
    expect(contenido).toMatch(/minHeight:\s*48/)
  })
})

// ---------------------------------------------------------------------------
// Ninguno de los dos componentes importa supabase directo: las escrituras
// pasan siempre por lib/*. Transitivo (siguiendo imports relativos locales,
// no los "@/lib/..." — esos SÍ usan supabase adentro a propósito, es la
// arquitectura): si alguno de los dos importara un módulo local nuevo que
// reexportara supabase, un detector de un solo archivo lo pasaría por alto.
// Se prueba primero contra archivos temporales reales (node:fs), no contra
// fixtures en memoria, porque el recorrido transitivo necesita resolver
// imports relativos en disco.
// ---------------------------------------------------------------------------
function tieneImportSupabaseDirecto(contenido: string): boolean {
  const limpio = quitarComentarios(contenido)
  return /from\s*['"][^'"]*\/supabase['"]/.test(limpio) || /from\s*['"]supabase['"]/.test(limpio)
}

function importaSupabaseTransitivo(rutaInicial: string, visitados: Set<string> = new Set()): boolean {
  const ruta = resolve(rutaInicial)
  if (visitados.has(ruta) || !existsSync(ruta)) return false
  visitados.add(ruta)

  const contenido = readFileSync(ruta, 'utf8')
  if (tieneImportSupabaseDirecto(contenido)) return true

  const limpio = quitarComentarios(contenido)
  const relativos = [...limpio.matchAll(/from\s*['"](\.[^'"]+)['"]/g)].map((coincidencia) => coincidencia[1])

  for (const relativo of relativos) {
    const base = join(dirname(ruta), relativo)
    const candidato = [base, `${base}.ts`, `${base}.tsx`].find((posible) => existsSync(posible))
    if (candidato && importaSupabaseTransitivo(candidato, visitados)) return true
  }

  return false
}

describe('tieneImportSupabaseDirecto (fixtures en memoria: el detector tiene que fallar de verdad)', () => {
  it('detecta un import con alias "@/lib/supabase"', () => {
    expect(tieneImportSupabaseDirecto(`import { supabase } from '@/lib/supabase'`)).toBe(true)
  })

  it('detecta un import relativo "./supabase"', () => {
    expect(tieneImportSupabaseDirecto(`import { supabase } from './supabase'`)).toBe(true)
  })

  it('un import a @/lib/favoritos (vía lib/, esperado) no cuenta', () => {
    expect(tieneImportSupabaseDirecto(`import { marcarFavorito } from '@/lib/favoritos'`)).toBe(false)
  })

  it('un comentario que menciona "supabase" no cuenta (se descarta antes de buscar)', () => {
    const fixture = "// nunca importar supabase acá\nimport { marcarFavorito } from '@/lib/favoritos'"
    expect(tieneImportSupabaseDirecto(fixture)).toBe(false)
  })
})

describe('importaSupabaseTransitivo (con archivos temporales reales: el recorrido relativo tiene que funcionar de verdad)', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('sigue un import relativo local hasta encontrar supabase, aunque el archivo de entrada no lo importe directo', () => {
    dir = mkdtempSync(join(tmpdir(), 'qps-fila-acciones-'))
    writeFileSync(join(dir, 'supabase.ts'), `export const supabase = null\n`)
    writeFileSync(join(dir, 'intermedio.ts'), `export { supabase } from './supabase'\n`)
    writeFileSync(join(dir, 'Componente.tsx'), `import { supabase } from './intermedio'\n`)

    expect(importaSupabaseTransitivo(join(dir, 'Componente.tsx'))).toBe(true)
  })

  it('sin ningún camino local hacia supabase: false', () => {
    dir = mkdtempSync(join(tmpdir(), 'qps-fila-acciones-'))
    writeFileSync(join(dir, 'otro.ts'), `export const x = 1\n`)
    writeFileSync(join(dir, 'Componente.tsx'), `import { x } from './otro'\nimport { marcarFavorito } from '@/lib/favoritos'\n`)

    expect(importaSupabaseTransitivo(join(dir, 'Componente.tsx'))).toBe(false)
  })
})

describe('FilaAccionesEvento.tsx / BotonSeguir.tsx: nunca importan supabase, ni transitivamente por un import relativo local', () => {
  it('FilaAccionesEvento.tsx', () => {
    expect(importaSupabaseTransitivo(FILA_PATH)).toBe(false)
  })

  it('BotonSeguir.tsx', () => {
    expect(importaSupabaseTransitivo(SEGUIR_PATH)).toBe(false)
  })
})
