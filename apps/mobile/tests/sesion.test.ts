// 28-q, punto 1 (arranque, 28-a): `estadoInicialSesion` (lib/session/index.tsx)
// es pura, así que se prueba directo. El resto del archivo (`SessionProvider`)
// monta un `useEffect` real con React y `supabase.auth`, que no se puede
// correr sin React Native/un cliente real; en vez de montarlo, se lee el
// archivo como texto (mismo estilo que `tests/iconos.test.ts` y
// `tests/compartir-ficha.test.ts`) para fijar dos cosas puntuales del
// diagnóstico del lead: `getSession()` tiene un `.catch(...)` (si no, una
// sesión que no se puede leer deja la app "cargando" para siempre) y el
// efecto no llama a `setEstado` de forma sincrónica (fuera de los callbacks
// de `.then`/`.catch`).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

// `lib/session/index.tsx` importa `{ supabase }` de `../supabase`, que a su
// vez importa `react-native` (para el AppState del auto-refresh) y
// `react-native-url-polyfill/auto`: nada de eso corre en Vitest (entorno
// node, sin transform de RN). `estadoInicialSesion` no usa `supabase` en
// absoluto (recibe `hayCliente` como booleano ya calculado), así que alcanza
// con mockear ese import para poder cargar el módulo sin arrastrar RN.
vi.mock('../lib/supabase', () => ({ supabase: null }))

import { estadoInicialSesion } from '../lib/session'

describe('estadoInicialSesion', () => {
  it('sin cliente de Supabase: arranca sin sesión y sin "cargando"', () => {
    expect(estadoInicialSesion(false)).toEqual({ session: null, cargando: false, sinConexion: false })
  })

  it('con cliente de Supabase: arranca sin sesión, "cargando" hasta que resuelva getSession()', () => {
    expect(estadoInicialSesion(true)).toEqual({ session: null, cargando: true, sinConexion: false })
  })
})

// ---------------------------------------------------------------------------
// Lectura estática de lib/session/index.tsx.
// ---------------------------------------------------------------------------
const RUTA_SESSION = fileURLToPath(new URL('../lib/session/index.tsx', import.meta.url))
const SRC = readFileSync(RUTA_SESSION, 'utf8')

/** El cuerpo del primer `useEffect(() => { ... }, ...)` del archivo, balanceando llaves. */
export function extraerPrimerEfecto(content: string): string | null {
  const inicioMatch = content.match(/useEffect\(\s*\(\)\s*=>\s*\{/)
  if (!inicioMatch || inicioMatch.index === undefined) return null
  const desde = inicioMatch.index + inicioMatch[0].length
  let profundidad = 1
  let i = desde
  for (; i < content.length; i++) {
    if (content[i] === '{') profundidad++
    else if (content[i] === '}') {
      profundidad--
      if (profundidad === 0) break
    }
  }
  return content.slice(desde, i)
}

/** `true` si, dentro de `efecto`, la llamada a `getSession()` está seguida de `.then(...)` y `.catch(...)`. */
export function tieneCatchTrasGetSession(efecto: string): boolean {
  const idx = efecto.indexOf('getSession()')
  if (idx === -1) return false
  // Heurística (no un parser completo): el .then/.catch de la misma cadena
  // tienen que aparecer dentro de una ventana razonable después de
  // getSession(), no en cualquier lugar del archivo.
  const tramo = efecto.slice(idx, idx + 600)
  return /\.then\s*\(/.test(tramo) && /\.catch\s*\(/.test(tramo)
}

/**
 * `true` si, dentro de `efecto`, hay un `setEstado(` que ocurre ANTES del
 * primer `.then(`/`.catch(` — es decir, fuera de cualquier callback
 * asíncrono, de forma sincrónica al correr el efecto.
 */
export function setEstadoEsSincronico(efecto: string): boolean {
  const idxSetEstado = efecto.search(/\bsetEstado\s*\(/)
  if (idxSetEstado === -1) return false
  const posiciones = [efecto.search(/\.then\s*\(/), efecto.search(/\.catch\s*\(/)].filter((i) => i !== -1)
  if (posiciones.length === 0) return true
  return idxSetEstado < Math.min(...posiciones)
}

describe('detectores (fixtures en memoria, para que fallen de verdad)', () => {
  it('tieneCatchTrasGetSession: detecta then + catch', () => {
    const efecto = `supabase.auth.getSession().then(({ data }) => { setEstado(1) }).catch(() => { setEstado(2) })`
    expect(tieneCatchTrasGetSession(efecto)).toBe(true)
  })

  it('tieneCatchTrasGetSession: sin catch, da false (la prueba de rotura 1 del plan)', () => {
    const efecto = `supabase.auth.getSession().then(({ data }) => { setEstado(1) })`
    expect(tieneCatchTrasGetSession(efecto)).toBe(false)
  })

  it('tieneCatchTrasGetSession: sin getSession() en absoluto, da false', () => {
    expect(tieneCatchTrasGetSession('useEffect(() => {}, [])')).toBe(false)
  })

  it('setEstadoEsSincronico: true si setEstado corre antes del then', () => {
    const efecto = `setEstado({ session: null, cargando: false }); supabase.auth.getSession().then(() => {})`
    expect(setEstadoEsSincronico(efecto)).toBe(true)
  })

  it('setEstadoEsSincronico: false si setEstado solo corre dentro de then/catch', () => {
    const efecto = `supabase.auth.getSession().then(({ data }) => { setEstado(1) }).catch(() => { setEstado(2) })`
    expect(setEstadoEsSincronico(efecto)).toBe(false)
  })
})

describe('lib/session/index.tsx', () => {
  const efecto = extraerPrimerEfecto(SRC)

  it('encuentra el useEffect de SessionProvider', () => {
    expect(efecto).not.toBeNull()
  })

  it('getSession() tiene un .catch(...)', () => {
    expect(tieneCatchTrasGetSession(efecto!)).toBe(true)
  })

  it('el efecto no hace setEstado de forma sincrónica (solo dentro de then/catch/onAuthStateChange)', () => {
    expect(setEstadoEsSincronico(efecto!)).toBe(false)
  })
})
