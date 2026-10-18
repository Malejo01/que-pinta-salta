// Ronda 41, tarea 41-q (QA, cierre): lo que cruza la app y el backend — el
// nombre de la RPC y sus parámetros, tal como los llama `lib/push/registro.ts`
// (41-c), tienen que coincidir con lo que `packages/db` (database.types.ts,
// generado por `npm run db:types` desde la migración real) dice que la RPC
// acepta. Si alguien cambia el nombre de un parámetro en la migración y
// corre `db:types`, pero no actualiza `registro.ts` (o al revés), esto
// queda en rojo — sin depender de correr `tsc` (aunque `npm run typecheck`
// también lo atraparía, por el `SupabaseClient<Database>` tipado de
// `registro.ts`: este test es la versión legible y explícita, que no
// depende de que nadie corra ese typecheck para notarlo).
//
// Lectura de texto (no se evalúa `database.types.ts` como módulo en
// runtime: es un archivo generado, enorme, y typar `Database` entero acá no
// hace falta para este chequeo puntual de nombre + claves de Args).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const RUTA_REGISTRO = fileURLToPath(new URL('../lib/push/registro.ts', import.meta.url))
const RUTA_DATABASE_TYPES = fileURLToPath(new URL('../../../packages/db/src/database.types.ts', import.meta.url))

const NOMBRE_RPC = 'register_push_token'

/** Comentarios de línea y de bloque vaciados, conservando el resto del texto (el docstring de registro.ts MENCIONA esta misma llamada en prosa, sin colon en los nombres — sin esto, el regex de abajo matchearía esa mención y no la llamada real). */
function quitarComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

/** Las claves (`p_token`, `p_platform`, ...) del primer objeto literal `{...}` pasado como segundo argumento de `supabase.rpc('register_push_token', {...})`, en el orden en que aparecen en el código. */
function clavesLlamadaRpc(contenidoRegistro: string, nombreRpc: string): string[] {
  const limpio = quitarComentarios(contenidoRegistro)
  const re = new RegExp(`\\.rpc\\(\\s*['"\`]${nombreRpc}['"\`]\\s*,\\s*\\{([^}]*)\\}`)
  const m = re.exec(limpio)
  if (!m) return []
  const cuerpo = m[1]
  const claves: string[] = []
  const reClave = /(\w+)\s*:/g
  let mc: RegExpExecArray | null
  while ((mc = reClave.exec(cuerpo))) claves.push(mc[1])
  return claves
}

/** Las claves declaradas en `Args` de una función de `database.types.ts` (`"p_token": string,"p_platform": string` → `['p_token', 'p_platform']`). */
function clavesArgsDeFuncion(contenidoDatabaseTypes: string, nombreFuncion: string): string[] | null {
  const re = new RegExp(`"${nombreFuncion}":\\s*\\{\\s*Args:\\s*\\{([^}]*)\\}`)
  const m = re.exec(contenidoDatabaseTypes)
  if (!m) return null
  const cuerpo = m[1]
  const claves: string[] = []
  const reClave = /"(\w+)"\s*\??\s*:/g
  let mc: RegExpExecArray | null
  while ((mc = reClave.exec(cuerpo))) claves.push(mc[1])
  return claves
}

describe('clavesLlamadaRpc / clavesArgsDeFuncion (fixtures en memoria: tienen que fallar de verdad)', () => {
  it('clavesLlamadaRpc lee las claves en orden', () => {
    const fixture = `await supabase.rpc('register_push_token', { p_token: token, p_platform: plataforma })`
    expect(clavesLlamadaRpc(fixture, 'register_push_token')).toEqual(['p_token', 'p_platform'])
  })

  it('clavesLlamadaRpc con comillas dobles también matchea', () => {
    const fixture = `supabase.rpc("register_push_token", { p_token: t, p_platform: p })`
    expect(clavesLlamadaRpc(fixture, 'register_push_token')).toEqual(['p_token', 'p_platform'])
  })

  it('clavesLlamadaRpc: sin esa llamada en el archivo, da []', () => {
    expect(clavesLlamadaRpc('export function foo() {}', 'register_push_token')).toEqual([])
  })

  it('clavesLlamadaRpc ignora una MENCIÓN en un comentario (forma abreviada, sin ":") y encuentra la llamada real más abajo (exactamente el caso real de registro.ts: el docstring menciona la RPC en prosa antes de la llamada de verdad)', () => {
    const fixture = [
      '/**',
      " * `supabase.rpc('register_push_token', { p_token, p_platform })`. Nunca un insert.",
      ' */',
      "await supabase.rpc('register_push_token', { p_token: token, p_platform: plataforma })",
    ].join('\n')
    expect(clavesLlamadaRpc(fixture, 'register_push_token')).toEqual(['p_token', 'p_platform'])
  })

  it('clavesArgsDeFuncion lee las claves de Args, con u sin "?"', () => {
    const fixture = `"register_push_token":\n{ Args: { "p_platform": string,"p_token": string }; Returns: undefined\n },`
    expect(clavesArgsDeFuncion(fixture, 'register_push_token')?.sort()).toEqual(['p_platform', 'p_token'])
  })

  it('clavesArgsDeFuncion: función que no existe, da null', () => {
    expect(clavesArgsDeFuncion('"otra_funcion": { Args: { "x": string } }', 'register_push_token')).toBeNull()
  })
})

describe('registro.ts: la llamada a register_push_token coincide con packages/db (código real)', () => {
  const contenidoRegistro = readFileSync(RUTA_REGISTRO, 'utf8')
  const contenidoDatabaseTypes = readFileSync(RUTA_DATABASE_TYPES, 'utf8')

  it('registro.ts llama a la RPC con ese nombre exacto (si esto falla, el test de abajo no estaría probando nada)', () => {
    const claves = clavesLlamadaRpc(contenidoRegistro, NOMBRE_RPC)
    expect(claves.length).toBeGreaterThan(0)
  })

  it('database.types.ts conoce esa función (si esto falla, "npm run db:types" no se corrió, o el nombre cambió)', () => {
    const claves = clavesArgsDeFuncion(contenidoDatabaseTypes, NOMBRE_RPC)
    expect(claves).not.toBeNull()
  })

  it('las claves que manda registro.ts son EXACTAMENTE las que define Args en database.types.ts (mismo conjunto, sin de más ni de menos)', () => {
    const clavesLlamada = clavesLlamadaRpc(contenidoRegistro, NOMBRE_RPC)
    const clavesArgs = clavesArgsDeFuncion(contenidoDatabaseTypes, NOMBRE_RPC) ?? []
    expect([...clavesLlamada].sort()).toEqual([...clavesArgs].sort())
  })

  it('nunca manda user_id (lo toma la RPC de auth.uid(), no de la app)', () => {
    const claves = clavesLlamadaRpc(contenidoRegistro, NOMBRE_RPC)
    expect(claves).not.toContain('user_id')
  })
})
