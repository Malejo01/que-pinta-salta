// 26-c, punto 5: el texto de "Compartir" de la ficha lleva el link con
// `o=app` (`urlEvento(id, 'app')` de `@qps/core/metricas/links`) y nunca
// datos de la sesión (`session`, `user.email`, `user.id`) en el mensaje.
//
// `app/evento/[id].tsx` no exporta una función de armado del mensaje por
// separado (está inline en `compartir()`), así que esto se verifica leyendo
// el archivo: mismo estilo de detector con fixtures en memoria que
// `tests/aperturas-url.test.ts` y `tests/iconos.test.ts`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_DIR = join(MOBILE_ROOT, 'app')
const COMPONENTS_DIR = join(MOBILE_ROOT, 'components')
const FICHA_RELATIVA = join('app', 'evento', '[id].tsx')

interface Violation {
  line: number
  message: string
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

function leerBalanceado(content: string, desdeIndex: number, abre: string, cierra: string): string {
  let profundidad = 1
  let j = desdeIndex
  for (; j < content.length; j++) {
    if (content[j] === abre) profundidad++
    else if (content[j] === cierra) {
      profundidad--
      if (profundidad === 0) break
    }
  }
  return content.slice(desdeIndex, j)
}

/** La asignación `const/let <nombre> = ...` (el lado derecho, hasta el salto de línea o ";"), o `null` si no está. */
function definicionDe(content: string, nombre: string): string | null {
  const re = new RegExp(`\\b(?:const|let)\\s+${nombre}\\s*=\\s*([\\s\\S]*?)(?:\\n|;)`)
  const m = content.match(re)
  return m ? m[1] : null
}

const URL_EVENTO_APP_RE = /urlEvento\([^)]*,\s*['"]app['"]\s*\)/
const TOKENS_DE_SESION = ['session', 'user.email', 'user.id']

/**
 * Violaciones de `Share.share({ message: ... })`:
 * - el texto armado para `message` tiene que depender, directa o
 *   indirectamente (una variable intermedia como `url` en
 *   `` `${url}` `` con `const url = urlEvento(id, 'app')` ``), de
 *   `urlEvento(id, 'app')` — el link con el origen "app";
 * - el texto armado nunca puede mencionar `session`, `user.email` ni
 *   `user.id` (datos de la sesión, no de la pantalla).
 *
 * No es un parser completo de JS (es una heurística con regex, como el resto
 * de los detectores de esta carpeta): cubre el patrón real del código
 * (`const mensaje = \`...\`; Share.share({ message: mensaje })`), con un
 * nivel de indirección para variables referenciadas dentro del template.
 */
export function encontrarViolacionesDeCompartir(content: string): Violation[] {
  const violaciones: Violation[] = []
  const re = /Share\.share\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    const inicioArg = m.index + m[0].length
    const arg = leerBalanceado(content, inicioArg, '(', ')')
    const msgMatch = arg.match(/message\s*:\s*([^,}]+)/)
    if (!msgMatch) {
      violaciones.push({ line: lineAt(content, m.index), message: 'Share.share sin "message:"' })
      continue
    }

    const valor = msgMatch[1].trim()
    let textoArmado = valor
    if (/^[A-Za-z_]\w*$/.test(valor)) {
      const def = definicionDe(content, valor)
      if (def === null) {
        violaciones.push({
          line: lineAt(content, m.index),
          message: `Share.share: no encontré la definición de "${valor}"`,
        })
        continue
      }
      textoArmado = def
    }

    let usaUrlEventoApp = URL_EVENTO_APP_RE.test(textoArmado)
    if (!usaUrlEventoApp) {
      const refs = [...textoArmado.matchAll(/\$\{\s*([A-Za-z_]\w*)\b/g)].map((r) => r[1])
      for (const ref of refs) {
        const def = definicionDe(content, ref)
        if (def && URL_EVENTO_APP_RE.test(def)) {
          usaUrlEventoApp = true
          break
        }
      }
    }

    if (!usaUrlEventoApp) {
      violaciones.push({
        line: lineAt(content, m.index),
        message: 'Share.share: el mensaje no usa urlEvento(id, "app")',
      })
    }

    for (const token of TOKENS_DE_SESION) {
      if (textoArmado.includes(token)) {
        violaciones.push({
          line: lineAt(content, m.index),
          message: `Share.share: el mensaje incluye "${token}" (dato de sesión)`,
        })
      }
    }
  }
  return violaciones
}

function listarTsxYTs(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...listarTsxYTs(full))
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

describe('encontrarViolacionesDeCompartir (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('acepta el patrón real: const url = urlEvento(id, "app"); mensaje con ${url}; Share.share({ message: mensaje })', () => {
    const content = [
      `const url = urlEvento(evento.id, 'app')`,
      "const mensaje = `${evento.title}\\n${url}`",
      'Share.share({ message: mensaje })',
    ].join('\n')
    expect(encontrarViolacionesDeCompartir(content)).toEqual([])
  })

  it('acepta cuando el template tiene varias interpolaciones además de ${url} (como la ficha real)', () => {
    const content = [
      `const url = urlEvento(evento.id, 'app')`,
      "const mensaje = `${evento.title}\\n${fecha}${hora ? `· ${hora} hs` : ''} · ${lugar}\\n${url}`",
      'await Share.share({ message: mensaje })',
    ].join('\n')
    expect(encontrarViolacionesDeCompartir(content)).toEqual([])
  })

  it('detecta cuando el mensaje no usa urlEvento en absoluto (por ejemplo, un link armado a mano)', () => {
    const content = [
      "const mensaje = `${evento.title}\\n${evento.ticket_url}`",
      'Share.share({ message: mensaje })',
    ].join('\n')
    const v = encontrarViolacionesDeCompartir(content)
    expect(v.some((x) => x.message.includes('no usa urlEvento'))).toBe(true)
  })

  it('detecta cuando urlEvento no lleva el origen "app" (por ejemplo, sin origen)', () => {
    const content = [
      `const url = urlEvento(evento.id)`,
      "const mensaje = `${evento.title}\\n${url}`",
      'Share.share({ message: mensaje })',
    ].join('\n')
    const v = encontrarViolacionesDeCompartir(content)
    expect(v.some((x) => x.message.includes('no usa urlEvento'))).toBe(true)
  })

  it('detecta cuando urlEvento lleva otro origen (por ejemplo "web", no "app")', () => {
    const content = [
      `const url = urlEvento(evento.id, 'web')`,
      "const mensaje = `${evento.title}\\n${url}`",
      'Share.share({ message: mensaje })',
    ].join('\n')
    const v = encontrarViolacionesDeCompartir(content)
    expect(v.some((x) => x.message.includes('no usa urlEvento'))).toBe(true)
  })

  it('detecta el email de la sesión en el mensaje', () => {
    const content = [
      `const url = urlEvento(evento.id, 'app')`,
      "const mensaje = `${session.user.email} te invita a ${evento.title}\\n${url}`",
      'Share.share({ message: mensaje })',
    ].join('\n')
    const v = encontrarViolacionesDeCompartir(content)
    expect(v.some((x) => x.message.includes('"session"'))).toBe(true)
    expect(v.some((x) => x.message.includes('"user.email"'))).toBe(true)
  })

  it('detecta el id de usuario en el mensaje', () => {
    const content = [
      `const url = urlEvento(evento.id, 'app')`,
      "const mensaje = `De parte de ${user.id}: ${evento.title}\\n${url}`",
      'Share.share({ message: mensaje })',
    ].join('\n')
    const v = encontrarViolacionesDeCompartir(content)
    expect(v.some((x) => x.message.includes('"user.id"'))).toBe(true)
  })

  it('detecta un Share.share sin "message:"', () => {
    const content = `Share.share({ title: 'Qué Pinta Salta' })`
    const v = encontrarViolacionesDeCompartir(content)
    expect(v).toHaveLength(1)
    expect(v[0].message).toMatch(/sin "message:"/)
  })

  it('un archivo sin ningún Share.share: sin violaciones', () => {
    expect(encontrarViolacionesDeCompartir('export function Foo() { return null }')).toEqual([])
  })
})

describe('app/evento/[id].tsx: el texto de compartir usa urlEvento(id, "app") y no lleva datos de sesión', () => {
  const content = readFileSync(join(MOBILE_ROOT, FICHA_RELATIVA), 'utf8')

  it('no hay violaciones en la ficha real', () => {
    expect(encontrarViolacionesDeCompartir(content)).toEqual([])
  })
})

// Barrido hacia adelante: si el día de mañana aparece otro Share.share en
// app/ o components/, también tiene que cumplir las dos reglas.
describe('app/ y components/: cualquier otro Share.share también cumple las reglas', () => {
  const archivos = [...listarTsxYTs(APP_DIR), ...listarTsxYTs(COMPONENTS_DIR)]

  it('encuentra al menos un archivo para analizar, incluida la ficha', () => {
    expect(archivos.length).toBeGreaterThan(0)
    expect(archivos.some((f) => relative(MOBILE_ROOT, f) === FICHA_RELATIVA)).toBe(true)
  })

  it.each(archivos.map((file) => [relative(MOBILE_ROOT, file), file] as const))('%s', (label, file) => {
    const src = readFileSync(file, 'utf8')
    const violaciones = encontrarViolacionesDeCompartir(src)
    if (violaciones.length > 0) {
      const detalle = violaciones.map((v) => `  ${label}:${v.line} — ${v.message}`).join('\n')
      throw new Error(`Share.share mal armado:\n${detalle}`)
    }
    expect(violaciones).toEqual([])
  })
})
