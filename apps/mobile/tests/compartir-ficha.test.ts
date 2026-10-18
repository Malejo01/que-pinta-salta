// 26-c, punto 5: el texto de "Compartir" lleva el link con `o=app`
// (`urlEvento(id, 'app')` de `@qps/core/metricas/links`) y nunca datos de
// la sesión (`session`, `user.email`, `user.id`) en el mensaje.
//
// R29, 29-b (F14): el armado del mensaje se movió de `app/evento/[id].tsx`
// (donde vivía inline en `compartir()`) a `components/BotonCompartir.tsx`,
// sin cambiarlo — ahora lo usan la ficha y la tarjeta. `BotonCompartir.tsx`
// tampoco exporta una función de armado por separado (sigue inline en
// `compartir()`), así que esto se verifica leyendo el archivo: mismo estilo
// de detector con fixtures en memoria que `tests/aperturas-url.test.ts` y
// `tests/iconos.test.ts`.
//
// R29, 29-i (§3.7, integración 29-q punto A): el detector asumía que TODO
// `Share.share` comparte un evento puntual. "Compartir agenda por WhatsApp"
// (`app/(tabs)/favoritos.tsx`) comparte la agenda ENTERA (0 a N eventos,
// películas y flyers), así que no tiene sentido pedirle `urlEvento(id,
// 'app')`: el mensaje lo arma `armarMensajeWhatsApp` (`@qps/core/favoritos/armar`),
// copia literal de `handleShareWhatsApp` de la web, con sus propios links por
// item (`${sitio}/evento/<id>`, `/cines`, `/flyer/<id>`), ninguno de ellos
// con el origen "app" porque no son del tipo que `urlEvento` resuelve. La
// segunda regla válida, entonces, es que el mensaje salga de un llamado a
// `armarMensajeWhatsApp(...)` — no se afloja la primera regla (si alguien
// arma a mano la URL de un evento dentro de un `Share.share`, sin pasar por
// `urlEvento(id, 'app')` NI por `armarMensajeWhatsApp`, sigue fallando).
//
// R42, 42-b: el armado del texto de un evento puntual se movió de
// `BotonCompartir.tsx` (donde vivía inline en `compartir()`) a
// `mensajeCompartirEvento` (`lib/compartir.ts`), sin cambiarlo. La tercera
// regla válida, entonces, es que el mensaje salga de un llamado a
// `mensajeCompartirEvento(...)` — mismo criterio que `armarMensajeWhatsApp`
// de arriba: el nombre exacto, no un escape genérico. Tampoco se afloja nada:
// un `mensajeCompartirEvento(...)` con `session.user.email` en el mismo
// template sigue fallando por el dato de sesión, y un nombre parecido
// (`mensajeCompartirOtraCosa(...)`) no cuela.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_DIR = join(MOBILE_ROOT, 'app')
const COMPONENTS_DIR = join(MOBILE_ROOT, 'components')
const LIB_DIR = join(MOBILE_ROOT, 'lib')
const BOTON_COMPARTIR_RELATIVA = join('components', 'BotonCompartir.tsx')

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

/**
 * Separa por comas de nivel superior (sin entrar en `{}`, `()` ni `[]`) —
 * para poder leer `{ eventId, titulo: tituloConSesion, fecha }` o
 * `armarMensajeWhatsApp(eventosConEmail)` propiedad por propiedad / argumento
 * por argumento, sin romperse con objetos o arrays anidados adentro de un
 * valor.
 */
function separarPorComaDeNivelSuperior(contenido: string): string[] {
  const partes: string[] = []
  let profundidad = 0
  let actual = ''
  for (const caracter of contenido) {
    if ('{(['.includes(caracter)) profundidad++
    else if ('})]'.includes(caracter)) profundidad--
    if (caracter === ',' && profundidad === 0) {
      partes.push(actual)
      actual = ''
    } else {
      actual += caracter
    }
  }
  if (actual.trim()) partes.push(actual)
  return partes
}

/**
 * De los argumentos de un llamado (`{ eventId, titulo: tituloConSesion, ... }`
 * o `eventosConEmail`), los pares "nombre del argumento" → "identificador
 * simple" que se le pasó. Un valor que no sea un identificador suelto (una
 * expresión, un template, un `props.algo`, un `.map(...)`) queda fuera a
 * propósito: esta heurística no resuelve esos casos (ver el comentario de
 * cabecera de `encontrarViolacionesDeCompartir`).
 */
function identificadoresDeArgumentos(argsStr: string): { arg: string; ident: string }[] {
  const recortado = argsStr.trim()
  const esObjeto = recortado.startsWith('{') && recortado.endsWith('}')
  const cuerpo = esObjeto ? recortado.slice(1, -1) : recortado
  const pares: { arg: string; ident: string }[] = []
  for (const parteCruda of separarPorComaDeNivelSuperior(cuerpo)) {
    const parte = parteCruda.trim()
    if (!parte) continue
    const idxDosPuntos = parte.indexOf(':')
    const esPropiedadConValor = esObjeto && idxDosPuntos !== -1
    const arg = esPropiedadConValor ? parte.slice(0, idxDosPuntos).trim() : parte
    const valor = esPropiedadConValor ? parte.slice(idxDosPuntos + 1).trim() : parte
    if (/^[A-Za-z_]\w*$/.test(valor)) {
      pares.push({ arg, ident: valor })
    }
  }
  return pares
}

/** Los pares argumento→identificador de un llamado a `nombreFuncionRe(...)` dentro de `texto`, o `[]` si no aparece. */
function argumentosDelLlamado(
  texto: string,
  nombreFuncionRe: RegExp,
): { arg: string; ident: string }[] {
  const m = texto.match(nombreFuncionRe)
  if (!m || m.index === undefined) return []
  const inicioArgs = m.index + m[0].length
  const argsStr = leerBalanceado(texto, inicioArgs, '(', ')')
  return identificadoresDeArgumentos(argsStr)
}

const URL_EVENTO_APP_RE = /urlEvento\([^)]*,\s*['"]app['"]\s*\)/
// 29-i/29-q: la segunda forma válida de armar `message` — la agenda entera,
// no un evento puntual (ver el comentario de arriba del archivo).
const ARMAR_MENSAJE_WHATSAPP_RE = /\barmarMensajeWhatsApp\s*\(/
// 42-b: la tercera forma válida — el texto de un evento puntual armado por
// `lib/compartir.ts`, sin cambiarlo (ver el comentario de arriba del archivo).
const MENSAJE_COMPARTIR_EVENTO_RE = /\bmensajeCompartirEvento\s*\(/
const TOKENS_DE_SESION = ['session', 'user.email', 'user.id']

/**
 * Violaciones de `Share.share({ message: ... })`:
 * - el texto armado para `message` tiene que depender, directa o
 *   indirectamente (una variable intermedia como `url` en
 *   `` `${url}` `` con `const url = urlEvento(id, 'app')` ``), de
 *   `urlEvento(id, 'app')` — el link con el origen "app" — **o** salir de un
 *   llamado a `armarMensajeWhatsApp(...)` (el mensaje de "Compartir agenda
 *   por WhatsApp", que no es de un solo evento y arma sus propios links con
 *   su propia regla, auditada en `packages/core/src/favoritos/armar.ts`) **o**
 *   de un llamado a `mensajeCompartirEvento(...)` (el mensaje de un evento
 *   puntual, auditado en `lib/compartir.ts`);
 * - el texto armado nunca puede mencionar `session`, `user.email` ni
 *   `user.id` (datos de la sesión, no de la pantalla) — ni directamente en
 *   `textoArmado`, ni en los ARGUMENTOS con los que se llama a
 *   `mensajeCompartirEvento(...)` / `armarMensajeWhatsApp(...)` (42-b:
 *   `mensajeCompartirEvento({ titulo: tituloConSesion, ... })` con
 *   `const tituloConSesion = \`... ${session.user.email}\`` es la misma
 *   violación con una variable intermedia; se resuelve cada identificador
 *   que se pasa como valor de una propiedad del objeto literal o como
 *   argumento posicional, con `definicionDe`, y se corre `TOKENS_DE_SESION`
 *   también sobre esas definiciones).
 *
 * No es un parser completo de JS (es una heurística con regex, como el resto
 * de los detectores de esta carpeta): cubre el patrón real del código
 * (`const mensaje = \`...\`; Share.share({ message: mensaje })`,
 * `const mensaje = armarMensajeWhatsApp(...); Share.share({ message: mensaje })`
 * o `const mensaje = mensajeCompartirEvento({ ... }); Share.share({ message: mensaje })`),
 * con un nivel de indirección para variables referenciadas dentro del
 * template o pasadas como el valor de `message`, y un nivel más para los
 * identificadores que se pasan como argumento de `mensajeCompartirEvento` /
 * `armarMensajeWhatsApp`. Lo que esto NO ve (y no hay forma de verlo sin un
 * parser real): dos niveles de indirección (una variable que depende de otra
 * variable que depende de la sesión), un dato de sesión que entra por una
 * prop (`titulo: props.titulo`) o por un hook en vez de por un `const`/`let`
 * del mismo archivo, o un dato de sesión metido adentro de un array con
 * `.map(...)` en vez de un identificador suelto. Cuando un argumento no es
 * un identificador simple, o `definicionDe` no encuentra su definición en el
 * archivo, no se reporta nada para ese argumento: es a propósito (ver más
 * abajo, en `identificadoresDeArgumentos`) para no inventar falsos
 * positivos con una heurística de regex.
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

    // "Compartir agenda" (29-i): `armarMensajeWhatsApp` arma el mensaje de la
    // agenda entera, con sus propios links — no tiene por qué llevar
    // `urlEvento(id, 'app')`. Esta regla es específica (el nombre exacto de
    // la función auditada), no un escape genérico: un link armado a mano
    // sigue sin colar.
    const usaArmarMensajeWhatsApp = ARMAR_MENSAJE_WHATSAPP_RE.test(textoArmado)

    // El texto de un evento puntual (42-b): `mensajeCompartirEvento` es el
    // armado que tenía `BotonCompartir.tsx` inline, movido a `lib/compartir.ts`
    // sin cambiarlo. Mismo criterio que `armarMensajeWhatsApp`: el nombre
    // exacto, no un escape genérico.
    const usaMensajeCompartirEvento = MENSAJE_COMPARTIR_EVENTO_RE.test(textoArmado)

    if (!usaUrlEventoApp && !usaArmarMensajeWhatsApp && !usaMensajeCompartirEvento) {
      violaciones.push({
        line: lineAt(content, m.index),
        message:
          'Share.share: el mensaje no usa urlEvento(id, "app"), armarMensajeWhatsApp(...) ni mensajeCompartirEvento(...)',
      })
    }

    // 42-b: la indirección también puede venir por los ARGUMENTOS de
    // `mensajeCompartirEvento(...)` / `armarMensajeWhatsApp(...)`. Una
    // variable intermedia como `tituloConSesion` en
    // `mensajeCompartirEvento({ titulo: tituloConSesion, ... })` no aparece
    // nunca como substring en `textoArmado` (que es el llamado en sí, no el
    // texto final que arma la función) — hay que resolver esos
    // identificadores y correr `TOKENS_DE_SESION` también sobre sus
    // definiciones.
    const textosSecundarios: { arg: string; ident: string; def: string }[] = []
    if (usaMensajeCompartirEvento || usaArmarMensajeWhatsApp) {
      const argumentos = [
        ...(usaMensajeCompartirEvento ? argumentosDelLlamado(textoArmado, MENSAJE_COMPARTIR_EVENTO_RE) : []),
        ...(usaArmarMensajeWhatsApp ? argumentosDelLlamado(textoArmado, ARMAR_MENSAJE_WHATSAPP_RE) : []),
      ]
      for (const { arg, ident } of argumentos) {
        const def = definicionDe(content, ident)
        // Si no hay definición en el archivo (viene por props, por un hook,
        // por destructuring) no se inventa una violación: es una heurística
        // con regex, no un parser, y reportar sin poder resolver de verdad
        // llenaría esto de falsos positivos. Lo que se pierde con esta
        // decisión: un dato de sesión que entra por una prop o un hook en
        // vez de por un `const`/`let` de este archivo no se ve.
        if (def !== null) {
          textosSecundarios.push({ arg, ident, def })
        }
      }
    }

    for (const token of TOKENS_DE_SESION) {
      if (textoArmado.includes(token)) {
        violaciones.push({
          line: lineAt(content, m.index),
          message: `Share.share: el mensaje incluye "${token}" (dato de sesión)`,
        })
      }
      for (const { arg, ident, def } of textosSecundarios) {
        if (def.includes(token)) {
          violaciones.push({
            line: lineAt(content, m.index),
            message: `Share.share: el mensaje incluye "${token}" (dato de sesión) por el argumento "${arg}" (definición de "${ident}")`,
          })
        }
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

  it('acepta el patrón real de "Compartir agenda": const mensaje = armarMensajeWhatsApp(eventos); Share.share({ message: mensaje })', () => {
    const content = [
      'const mensaje = armarMensajeWhatsApp(estado.eventos)',
      'Share.share({ message: mensaje })',
    ].join('\n')
    expect(encontrarViolacionesDeCompartir(content)).toEqual([])
  })

  // 42-b: la tercera forma válida.
  it('acepta el patrón real de un evento puntual: const mensaje = mensajeCompartirEvento({ ... }); Share.share({ message: mensaje })', () => {
    const content = [
      'const mensaje = mensajeCompartirEvento({ eventId, titulo, fecha, hora, lugar })',
      'if (!mensaje) return',
      'await Share.share({ message: mensaje })',
    ].join('\n')
    expect(encontrarViolacionesDeCompartir(content)).toEqual([])
  })

  it('un nombre de función parecido (no mensajeCompartirEvento exacto) no cuela', () => {
    const content = [
      'const mensaje = mensajeCompartirOtraCosa({ eventId, titulo, fecha, hora, lugar })',
      'Share.share({ message: mensaje })',
    ].join('\n')
    const v = encontrarViolacionesDeCompartir(content)
    expect(v.some((x) => x.message.includes('no usa urlEvento'))).toBe(true)
  })

  it('mensajeCompartirEvento(...) con session.user.email en el mismo template sigue fallando por el dato de sesión', () => {
    const content = [
      'const mensaje = mensajeCompartirEvento({ eventId, titulo: `${session.user.email} invita`, fecha, hora, lugar })',
      'Share.share({ message: mensaje })',
    ].join('\n')
    const v = encontrarViolacionesDeCompartir(content)
    expect(v.some((x) => x.message.includes('"session"'))).toBe(true)
    expect(v.some((x) => x.message.includes('"user.email"'))).toBe(true)
  })

  // 42-b, vuelta 1 del revisor: la evasión con una variable intermedia. El
  // dato de sesión no está en `textoArmado` (el llamado en sí) sino en la
  // DEFINICIÓN de `tituloConSesion`, que se le pasa como argumento `titulo`.
  it('mensajeCompartirEvento(...) con una variable intermedia (ej. tituloConSesion) sigue fallando por el dato de sesión', () => {
    const content = [
      'const tituloConSesion = `Mirá esto ${session?.user?.email}`',
      'const mensaje = mensajeCompartirEvento({ eventId, titulo: tituloConSesion, fecha, hora, lugar })',
      'if (!mensaje) return',
      'await Share.share({ message: mensaje })',
    ].join('\n')
    const v = encontrarViolacionesDeCompartir(content)
    expect(v.some((x) => x.message.includes('"session"') && x.message.includes('tituloConSesion'))).toBe(true)
    expect(v.some((x) => x.message.includes('argumento "titulo"'))).toBe(true)
  })

  // La misma evasión, pero con `armarMensajeWhatsApp` (la función de
  // "Compartir agenda") y el dato de sesión adentro del array que se le pasa.
  it('armarMensajeWhatsApp(eventosConEmail) sigue fallando cuando eventosConEmail se define con session.user.email', () => {
    const content = [
      'const eventosConEmail = [{ title: evento.title, nota: session.user.email }]',
      'const mensaje = armarMensajeWhatsApp(eventosConEmail)',
      'Share.share({ message: mensaje })',
    ].join('\n')
    const v = encontrarViolacionesDeCompartir(content)
    expect(v.some((x) => x.message.includes('"session"') && x.message.includes('eventosConEmail'))).toBe(true)
    expect(v.some((x) => x.message.includes('"user.email"') && x.message.includes('eventosConEmail'))).toBe(true)
  })

  // Caso legítimo: una variable intermedia SIN nada de sesión no tiene que
  // fallar — la resolución de argumentos no puede volverse un falso
  // positivo genérico contra cualquier variable intermedia.
  it('mensajeCompartirEvento(...) con una variable intermedia sin datos de sesión (ej. const titulo = evento.title) no falla', () => {
    const content = [
      'const titulo = evento.title',
      'const mensaje = mensajeCompartirEvento({ eventId, titulo, fecha, hora, lugar })',
      'if (!mensaje) return',
      'await Share.share({ message: mensaje })',
    ].join('\n')
    expect(encontrarViolacionesDeCompartir(content)).toEqual([])
  })

  // Un argumento que llega por props (no es un identificador simple, no hay
  // `const`/`let` para resolver): no se inventa una violación.
  it('un argumento que llega por props (titulo: props.titulo) no explota ni inventa una violación', () => {
    const content = [
      'const mensaje = mensajeCompartirEvento({ eventId, titulo: props.titulo, fecha, hora, lugar })',
      'await Share.share({ message: mensaje })',
    ].join('\n')
    expect(encontrarViolacionesDeCompartir(content)).toEqual([])
  })

  // Un identificador suelto como argumento, pero sin `const`/`let` en el
  // archivo (por ejemplo, viene desestructurado de un hook): tampoco
  // inventa una violación.
  it('un argumento cuyo identificador no tiene definición en el archivo (ej. desestructurado de un hook) no explota ni inventa una violación', () => {
    const content = [
      'const { titulo: tituloDesdeHook } = useAlgo()',
      'const mensaje = mensajeCompartirEvento({ eventId, titulo: tituloDesdeHook, fecha, hora, lugar })',
      'await Share.share({ message: mensaje })',
    ].join('\n')
    expect(encontrarViolacionesDeCompartir(content)).toEqual([])
  })

  it('sigue detectando un link de evento armado a mano, aunque el archivo tenga OTRO Share.share válido con armarMensajeWhatsApp', () => {
    const content = [
      'const mensajeAgenda = armarMensajeWhatsApp(estado.eventos)',
      'Share.share({ message: mensajeAgenda })',
      "const mensajeSuelto = `${evento.title}\\n${evento.ticket_url}`",
      'Share.share({ message: mensajeSuelto })',
    ].join('\n')
    const v = encontrarViolacionesDeCompartir(content)
    expect(v.some((x) => x.message.includes('no usa urlEvento'))).toBe(true)
  })

  it('un nombre de función parecido (no armarMensajeWhatsApp exacto) no cuela', () => {
    const content = [
      'const mensaje = armarMensajeDeLoQueSea(estado.eventos)',
      'Share.share({ message: mensaje })',
    ].join('\n')
    const v = encontrarViolacionesDeCompartir(content)
    expect(v.some((x) => x.message.includes('no usa urlEvento'))).toBe(true)
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

describe('components/BotonCompartir.tsx: el texto de compartir usa urlEvento(id, "app") y no lleva datos de sesión', () => {
  const content = readFileSync(join(MOBILE_ROOT, BOTON_COMPARTIR_RELATIVA), 'utf8')

  it('no hay violaciones en BotonCompartir real', () => {
    expect(encontrarViolacionesDeCompartir(content)).toEqual([])
  })
})

// 29-i/29-q: "Compartir agenda por WhatsApp" (app/(tabs)/favoritos.tsx) usa
// armarMensajeWhatsApp, no urlEvento(id, 'app') — la segunda regla válida.
describe('app/(tabs)/favoritos.tsx: "Compartir agenda por WhatsApp" usa armarMensajeWhatsApp', () => {
  const content = readFileSync(join(APP_DIR, '(tabs)', 'favoritos.tsx'), 'utf8')

  it('no hay violaciones en favoritos.tsx real', () => {
    expect(encontrarViolacionesDeCompartir(content)).toEqual([])
  })
})

// Barrido hacia adelante: si el día de mañana aparece otro Share.share en
// app/, components/ o lib/ (42-b: el texto puede armarse en una función de
// lib/, como mensajeCompartirEvento), también tiene que cumplir las reglas.
describe('app/, components/ y lib/: cualquier otro Share.share también cumple las reglas', () => {
  const archivos = [...listarTsxYTs(APP_DIR), ...listarTsxYTs(COMPONENTS_DIR), ...listarTsxYTs(LIB_DIR)]

  it('encuentra al menos un archivo para analizar, incluido BotonCompartir', () => {
    expect(archivos.length).toBeGreaterThan(0)
    expect(archivos.some((f) => relative(MOBILE_ROOT, f) === BOTON_COMPARTIR_RELATIVA)).toBe(true)
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
