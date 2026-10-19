// R48, tarea 48-d: `lib/contrasena.ts` (sin red ni base, con un doble de
// `@/lib/supabase`, mismo patrón que `tests/eliminar-cuenta.test.ts` y
// `tests/radar-prueba.test.ts`) y una lectura estática de `app/contrasena.tsx`
// (sin `@testing-library/react-native` en el repo — ver el comentario de
// cabecera de `tests/ficha.test.ts` — así que esta pantalla se cubre con el
// mismo estilo de detector por texto que el resto de la suite, como
// `tests/cuenta.test.ts` y `tests/a11y-pantallas.test.ts`).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// `quitarComentarios` ya se reusa entre archivos .test.ts en esta suite
// (`tests/accesibilidad-hitslop-real.test.ts` la importa de
// `./accesibilidad-detector.test`): mismo patrón acá, en vez de duplicarla.
import { quitarComentarios } from './accesibilidad-detector.test'

const LIB_CONTRASENA_PATH = fileURLToPath(new URL('../lib/contrasena.ts', import.meta.url))
const APP_CONTRASENA_PATH = fileURLToPath(new URL('../app/contrasena.tsx', import.meta.url))

const estado = vi.hoisted(() => ({
  updateUserLlamado: 0,
  updateUserArgs: [] as unknown[],
  resultadoUpdateUser: { data: { user: {} }, error: null } as { data: unknown; error: unknown },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: vi.fn(async (args: unknown) => {
        estado.updateUserLlamado++
        estado.updateUserArgs.push(args)
        return estado.resultadoUpdateUser
      }),
    },
  },
}))

import { guardarContrasena } from '@/lib/contrasena'

beforeEach(() => {
  estado.updateUserLlamado = 0
  estado.updateUserArgs = []
  estado.resultadoUpdateUser = { data: { user: {} }, error: null }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// guardarContrasena: valida ANTES de tocar la red.
// ---------------------------------------------------------------------------
describe('guardarContrasena: valida antes de llamar a updateUser', () => {
  it('contraseña corta (menor que LARGO_MINIMO_CONTRASENA): mensaje de largo, updateUser NO se llama', async () => {
    const resultado = await guardarContrasena('123', '123')

    expect(resultado).toEqual({ ok: false, mensaje: 'La contraseña debe tener al menos 6 caracteres.' })
    expect(estado.updateUserLlamado).toBe(0)
  })

  it('dos contraseñas distintas (ambas largas): mensaje de coincidencia, updateUser NO se llama', async () => {
    const resultado = await guardarContrasena('unaContrasenaLarga', 'otraContrasenaLarga')

    expect(resultado).toEqual({ ok: false, mensaje: 'Las contraseñas no coinciden.' })
    expect(estado.updateUserLlamado).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// guardarContrasena: el camino feliz y el error de Supabase.
// ---------------------------------------------------------------------------
describe('guardarContrasena: llama a updateUser con la sesión vigente (nunca con un user_id/token a mano)', () => {
  it('contraseñas válidas e iguales: llama a updateUser({ password: <la nueva> }) una sola vez', async () => {
    const resultado = await guardarContrasena('contrasenaValida', 'contrasenaValida')

    expect(resultado).toEqual({ ok: true })
    expect(estado.updateUserLlamado).toBe(1)
    expect(estado.updateUserArgs[0]).toEqual({ password: 'contrasenaValida' })
  })

  it('un error de Supabase: el mensaje sale de mensajeErrorContrasena (core), NUNCA del error.message crudo', async () => {
    const mensajeCrudoQueNuncaTieneQueSalir = 'Password should be at least 6 characters (detalle interno de Supabase)'
    estado.resultadoUpdateUser = {
      data: { user: null },
      error: { code: 'weak_password', message: mensajeCrudoQueNuncaTieneQueSalir },
    }

    const resultado = await guardarContrasena('contrasenaValida', 'contrasenaValida')

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      // Aserción explícita (QPS-124/48-a, mismo criterio que mensajeErrorAlta):
      // el texto crudo del error NUNCA aparece en el mensaje devuelto.
      expect(resultado.mensaje).not.toBe(mensajeCrudoQueNuncaTieneQueSalir)
      expect(resultado.mensaje).not.toContain(mensajeCrudoQueNuncaTieneQueSalir)
      expect(resultado.mensaje).toBe('La contraseña es muy débil: usá al menos 6 caracteres.')
    }
  })

  it('otro código de error de Supabase: mensaje genérico de mensajeErrorContrasena, tampoco el message crudo', async () => {
    const mensajeCrudo = 'detalle interno cualquiera que nunca tiene que mostrarse'
    estado.resultadoUpdateUser = { data: { user: null }, error: { code: 'algo_no_mapeado', message: mensajeCrudo } }

    const resultado = await guardarContrasena('contrasenaValida', 'contrasenaValida')

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.mensaje).not.toContain(mensajeCrudo)
      expect(resultado.mensaje).toBe('No pudimos guardar la contraseña. Probá de nuevo en unos minutos.')
    }
  })
})

// ---------------------------------------------------------------------------
// lib/contrasena.ts: nunca console./Sentry (texto, sin comentarios).
// ---------------------------------------------------------------------------
describe('lib/contrasena.ts: no contiene console. ni Sentry (fuera de los comentarios que explican la garantía)', () => {
  const codigo = quitarComentarios(readFileSync(LIB_CONTRASENA_PATH, 'utf8'))

  it('sin console.*', () => {
    expect(codigo).not.toMatch(/console\./)
  })

  it('sin Sentry', () => {
    expect(codigo).not.toMatch(/Sentry/)
  })
})

// ---------------------------------------------------------------------------
// La contraseña no va a ningún lado que no sea el argumento de updateUser.
//
// DETECTOR DE TEXTO, no un análisis de flujo de datos real (no hay forma de
// probar en serio "no se filtra a ningún lado" solo leyendo el archivo): lo
// que sigue verifica dos cosas más modestas, pero concretas, sobre el código
// SIN comentarios ni contenido de strings (`sinCadenas`, abajo — así
// "Contraseña nueva" en un `label`/`placeholder` no cuenta como un uso del
// identificador):
//   1) ninguno de los dos archivos usa SecureStore, AsyncStorage ni fetch(
//      (los tres mecanismos de persistencia/red que existen hoy en lib/app
//      de esta app) — si alguno apareciera, haría falta revisar a mano si
//      recibe la contraseña.
//   2) el identificador `nueva` (el valor de la contraseña nueva) aparece,
//      como palabra de código real, EXACTAMENTE en los lugares esperados de
//      cada archivo — ni uno más. Un uso nuevo (pasarlo a una función
//      distinta, guardarlo en otra variable, mandarlo a un `fetch`, etc.)
//      sumaría una ocurrencia y este test se pondría en rojo.
// ---------------------------------------------------------------------------
function sinCadenas(contenido: string): string {
  return contenido
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

function soloCodigo(contenidoOriginal: string): string {
  return sinCadenas(quitarComentarios(contenidoOriginal))
}

/** La línea completa (recortada) que contiene el índice `idx` de `codigo`
 * — se usa en vez de una ventana de caracteres fija porque una asignación
 * como `const [nueva, setNueva] = useState('')` tiene el identificador
 * "permitido" (`useState`) más lejos de "nueva" de lo que entraría en una
 * ventana corta. */
function lineaCompletaDe(codigo: string, idx: number): string {
  const inicio = codigo.lastIndexOf('\n', idx) + 1
  const finBuscado = codigo.indexOf('\n', idx)
  const fin = finBuscado === -1 ? codigo.length : finBuscado
  return codigo.slice(inicio, fin).trim()
}

describe('lib/contrasena.ts + app/contrasena.tsx: sin SecureStore/AsyncStorage/fetch (no hay dónde filtrar la contraseña)', () => {
  it.each([
    ['lib/contrasena.ts', LIB_CONTRASENA_PATH],
    ['app/contrasena.tsx', APP_CONTRASENA_PATH],
  ])('%s', (_label, ruta) => {
    const codigo = soloCodigo(readFileSync(ruta, 'utf8'))
    expect(codigo).not.toMatch(/SecureStore/)
    expect(codigo).not.toMatch(/AsyncStorage/)
    expect(codigo).not.toMatch(/\bfetch\s*\(/)
  })
})

describe('lib/contrasena.ts: el identificador "nueva" (código real, sin comentarios ni strings) solo aparece en la firma, en validarContrasenaNueva(...) y en updateUser(...)', () => {
  const codigo = soloCodigo(readFileSync(LIB_CONTRASENA_PATH, 'utf8'))
  const indices: number[] = []
  const re = /\bnueva\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(codigo))) indices.push(m.index)

  it('aparece exactamente 3 veces', () => {
    expect(indices).toHaveLength(3)
  })

  it('cada aparición está en un contexto permitido (firma de la función, validarContrasenaNueva(...) o updateUser(...))', () => {
    for (const idx of indices) {
      const linea = lineaCompletaDe(codigo, idx)
      const permitido =
        /function\s+guardarContrasena\s*\(/.test(linea) ||
        /validarContrasenaNueva\s*\(/.test(linea) ||
        /updateUser\s*\(/.test(linea)
      expect(permitido, `línea inesperada con "nueva": ${JSON.stringify(linea)}`).toBe(true)
    }
  })
})

describe('app/contrasena.tsx: el identificador "nueva" (código real, sin comentarios ni strings) solo aparece en el useState, en guardarContrasena(...) y en value={nueva} del primer CampoTexto', () => {
  const codigo = soloCodigo(readFileSync(APP_CONTRASENA_PATH, 'utf8'))
  const indices: number[] = []
  const re = /\bnueva\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(codigo))) indices.push(m.index)

  it('aparece exactamente 3 veces', () => {
    expect(indices).toHaveLength(3)
  })

  it('cada aparición está en un contexto permitido (useState, guardarContrasena(...) o value={nueva})', () => {
    for (const idx of indices) {
      const linea = lineaCompletaDe(codigo, idx)
      const permitido =
        /useState/.test(linea) || /guardarContrasena\s*\(/.test(linea) || /value=\{\s*nueva\s*\}/.test(linea)
      expect(permitido, `línea inesperada con "nueva": ${JSON.stringify(linea)}`).toBe(true)
    }
  })
})

// Mismo chequeo, para la confirmación ("repetida"): la lectura es simétrica
// a la de "nueva" (arriba), pero como la contraseña confirma, no como la
// contraseña final, "repetida" nunca llega a updateUser(...).
describe('lib/contrasena.ts + app/contrasena.tsx: el identificador "repetida" tampoco aparece fuera de los lugares esperados', () => {
  it('lib/contrasena.ts: solo en la firma y en validarContrasenaNueva(...) (2 veces, nunca en updateUser)', () => {
    const codigo = soloCodigo(readFileSync(LIB_CONTRASENA_PATH, 'utf8'))
    const indices: number[] = []
    const re = /\brepetida\b/g
    let m: RegExpExecArray | null
    while ((m = re.exec(codigo))) indices.push(m.index)

    expect(indices).toHaveLength(2)
    for (const idx of indices) {
      const linea = lineaCompletaDe(codigo, idx)
      const permitido = /function\s+guardarContrasena\s*\(/.test(linea) || /validarContrasenaNueva\s*\(/.test(linea)
      expect(permitido, `línea inesperada con "repetida": ${JSON.stringify(linea)}`).toBe(true)
      expect(linea).not.toMatch(/updateUser/)
    }
  })

  it('app/contrasena.tsx: solo en el useState, en guardarContrasena(...) y en value={repetida} del segundo CampoTexto (3 veces)', () => {
    const codigo = soloCodigo(readFileSync(APP_CONTRASENA_PATH, 'utf8'))
    const indices: number[] = []
    const re = /\brepetida\b/g
    let m: RegExpExecArray | null
    while ((m = re.exec(codigo))) indices.push(m.index)

    expect(indices).toHaveLength(3)
    for (const idx of indices) {
      const linea = lineaCompletaDe(codigo, idx)
      const permitido =
        /useState/.test(linea) || /guardarContrasena\s*\(/.test(linea) || /value=\{\s*repetida\s*\}/.test(linea)
      expect(permitido, `línea inesperada con "repetida": ${JSON.stringify(linea)}`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// app/contrasena.tsx: sin sesión, redirige a /cuenta (sin render real: lectura
// estática, mismo estilo que tests/cuenta.test.ts).
// ---------------------------------------------------------------------------
describe('app/contrasena.tsx: sin sesión, router.replace a /cuenta', () => {
  const src = readFileSync(APP_CONTRASENA_PATH, 'utf8')

  it('usa useSession (la sesión viene de @/lib/session, no se inventa otra fuente)', () => {
    expect(src).toMatch(/import\s*\{\s*useSession\s*\}\s*from\s*['"]@\/lib\/session['"]/)
    expect(src).toMatch(/useSession\(\)/)
  })

  it('redirige a /cuenta cuando terminó de cargar y no hay sesión', () => {
    expect(src).toMatch(/!cargando\s*&&\s*!session/)
    expect(src).toMatch(/router\.replace\(\s*['"]\/cuenta['"]\s*\)/)
  })

  it('la redirección está dentro de un useEffect (no es un efecto secundario del render)', () => {
    // `useEffect(` (con el paréntesis) ancla la LLAMADA, no el import de
    // arriba (`import { useEffect, useState } from 'react'`, que también
    // contiene la palabra "useEffect" pero sin la llamada).
    const idxEffect = src.indexOf('useEffect(')
    const idxReplace = src.indexOf("router.replace('/cuenta')")
    expect(idxEffect).toBeGreaterThan(-1)
    expect(idxReplace).toBeGreaterThan(idxEffect)
    // Hay una sola llamada a useEffect( en todo el archivo.
    expect(src.indexOf('useEffect(', idxEffect + 1)).toBe(-1)
  })
})
