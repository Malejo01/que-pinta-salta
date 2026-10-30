/**
 * Detector estático (R65-q): Nominatim NO se llama sin click. La política de
 * uso de Nominatim prohíbe el autocompletar ("Auto-complete search"), así que
 * en `components/admin/lugar-mapa-ubicar.tsx` la server action
 * `buscarDireccionLugar` solo puede salir del `onSubmit` del formulario: una
 * búsqueda por click en "Buscar" (o Enter), nunca al tipear ni con un debounce.
 * Sin red ni base; entorno `node`; solo lee texto.
 *
 * Qué verifica `violacionesDeBusqueda(codigo)` (sobre el código SIN comentarios):
 *  1. `buscarDireccionLugar` aparece exactamente una vez fuera del `import`, y
 *     como llamada (`buscarDireccionLugar(`): no se pasa como callback ni se
 *     guarda en una variable.
 *  2. Esa llamada está adentro del cuerpo del manejador del `onSubmit` (sea
 *     `onSubmit={handleBuscar}` con `handleBuscar` definido en el archivo, o
 *     una función en línea).
 *  3. Ninguna región `onChange`/`onInput`/`onKeyUp`/`onKeyDown`/`onBlur`/`onFocus`
 *     (`prop={...}`), `useEffect`/`useLayoutEffect`, `setTimeout` ni
 *     `setInterval` (`nombre(...)`) nombra la búsqueda ni al manejador del
 *     submit. Esto cubre el debounce (un `setTimeout` que busca), el efecto que
 *     depende del texto y un `onChange` que dispara el submit.
 *  4. El manejador del submit se nombra solo dos veces: su definición y el
 *     `onSubmit={...}` (nadie más lo invoca).
 *
 * LÍMITES (por eso es conservador, no un análisis de flujo): es regex y
 * conteo de llaves/paréntesis, no un parser. No entiende llaves dentro de
 * strings o regex literales, ni alias (`const b = buscarDireccionLugar`: ya lo
 * frena la regla 1 porque exige una única aparición y que sea una llamada), ni
 * archivos que re-exporten la action. Ante cualquier forma que no reconoce
 * (por ejemplo, un `onSubmit` cuyo manejador no se encuentra definido) devuelve
 * una violación en vez de dar por bueno: prefiere un falso rojo a un falso
 * verde. Si alguien reestructura el componente y esto se pone en rojo, hay que
 * revisar a mano que la búsqueda siga saliendo solo del submit.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const COMPONENTE = 'components/admin/lugar-mapa-ubicar.tsx'

/** El código sin comentarios de bloque ni de línea completa (mismo criterio que `tests/mapa/componentes.test.ts`). */
export function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\S\n]*\/\/.*$/gm, '')
}

/** El texto entre el `abre` en `desde` y su `cierra` balanceado (ambos incluidos), o `null` si no cierra. */
function balanceado(codigo: string, desde: number, abre: string, cierra: string): { inicio: number; fin: number } | null {
  let nivel = 0
  for (let i = desde; i < codigo.length; i++) {
    if (codigo[i] === abre) nivel++
    else if (codigo[i] === cierra && --nivel === 0) return { inicio: desde, fin: i + 1 }
  }
  return null
}

/** Todas las regiones `prop={ ... }` (atributos JSX) cuyo nombre coincide con `props`. */
function regionesDeAtributo(codigo: string, props: RegExp): Array<{ nombre: string; inicio: number; fin: number }> {
  const salida: Array<{ nombre: string; inicio: number; fin: number }> = []
  const regex = new RegExp(`\\b(${props.source})=\\{`, 'g')
  let m: RegExpExecArray | null
  while ((m = regex.exec(codigo))) {
    const region = balanceado(codigo, m.index + m[0].length - 1, '{', '}')
    if (region) salida.push({ nombre: m[1], ...region })
  }
  return salida
}

/** Todas las regiones `nombre( ... )` (llamadas) cuyo nombre coincide con `nombres`. */
function regionesDeLlamada(codigo: string, nombres: RegExp): Array<{ nombre: string; inicio: number; fin: number }> {
  const salida: Array<{ nombre: string; inicio: number; fin: number }> = []
  const regex = new RegExp(`\\b(${nombres.source})\\s*\\(`, 'g')
  let m: RegExpExecArray | null
  while ((m = regex.exec(codigo))) {
    const region = balanceado(codigo, m.index + m[0].length - 1, '(', ')')
    if (region) salida.push({ nombre: m[1], ...region })
  }
  return salida
}

/** El cuerpo `{ ... }` del manejador `nombre` (arrow en un `const` o `function`), o `null` si no se encuentra. */
function cuerpoDeManejador(codigo: string, nombre: string): { inicio: number; fin: number } | null {
  const id = nombre.replace(/[$]/g, '\\$')
  const arrow = new RegExp(`\\b(?:const|let)\\s+${id}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)(?:\\s*:\\s*[^=]+?)?\\s*=>\\s*\\{`).exec(codigo)
  const funcion = new RegExp(`\\bfunction\\s+${id}\\s*\\([^)]*\\)\\s*\\{`).exec(codigo)
  const m = arrow ?? funcion
  if (!m) return null
  return balanceado(codigo, m.index + m[0].length - 1, '{', '}')
}

const ATRIBUTOS_DE_ESCRITURA = /on(?:Change|Input|KeyUp|KeyDown|KeyPress|Blur|Focus)/
const LLAMADAS_DIFERIDAS = /useEffect|useLayoutEffect|setTimeout|setInterval/
/** Formas de disparar el submit sin click: no pueden aparecer en esas regiones. */
const DISPARADORES_DE_SUBMIT = /requestSubmit|dispatchEvent|\.submit\s*\(/

/** Lista (vacía si está todo bien) de los motivos por los que la búsqueda podría dispararse sin un click. */
export function violacionesDeBusqueda(fuente: string): string[] {
  const codigo = sinComentarios(fuente)
  const violaciones: string[] = []

  // 1. Una sola aparición fuera del import, y es una llamada.
  const sinImports = codigo.replace(/^\s*import\s+[^'"(]*?from\s*['"][^'"]+['"]\s*;?\s*$/gm, '')
  const apariciones = [...sinImports.matchAll(/\bbuscarDireccionLugar\b/g)]
  const llamadas = [...sinImports.matchAll(/\bbuscarDireccionLugar\s*\(/g)]
  if (apariciones.length === 0) violaciones.push('buscarDireccionLugar no aparece: el componente ya no busca (o cambió de forma)')
  if (apariciones.length > 1) violaciones.push(`buscarDireccionLugar aparece ${apariciones.length} veces: tiene que ser una sola llamada`)
  if (apariciones.length > llamadas.length) violaciones.push('buscarDireccionLugar se usa sin llamarla (alias o callback)')

  // 2. La llamada está adentro del manejador del onSubmit.
  const submit = regionesDeAtributo(codigo, /onSubmit/)
  let nombreManejador: string | null = null
  if (submit.length !== 1) {
    violaciones.push(`hay ${submit.length} onSubmit: se esperaba exactamente uno (el del formulario)`)
  } else {
    const expresion = codigo.slice(submit[0].inicio + 1, submit[0].fin - 1).trim()
    let cuerpo: { inicio: number; fin: number } | null
    if (/^[A-Za-z_$][\w$]*$/.test(expresion)) {
      nombreManejador = expresion
      cuerpo = cuerpoDeManejador(codigo, expresion)
      if (!cuerpo) violaciones.push(`no se encontró la definición del manejador "${expresion}" del onSubmit`)
    } else {
      cuerpo = { inicio: submit[0].inicio, fin: submit[0].fin }
    }
    if (cuerpo) {
      // Las posiciones se miden sobre `codigo` (con imports), no sobre `sinImports`.
      const dentro = [...codigo.matchAll(/\bbuscarDireccionLugar\s*\(/g)].filter(
        (l) => l.index! >= cuerpo.inicio && l.index! < cuerpo.fin
      )
      if (dentro.length !== 1) violaciones.push('la llamada a buscarDireccionLugar no está adentro del manejador del onSubmit')
    }
  }

  // 3. Ninguna región de escritura o diferida nombra la búsqueda ni el manejador.
  const nombrados = ['buscarDireccionLugar', ...(nombreManejador ? [nombreManejador] : [])]
  const regiones = [
    ...regionesDeAtributo(codigo, ATRIBUTOS_DE_ESCRITURA),
    ...regionesDeLlamada(codigo, LLAMADAS_DIFERIDAS),
  ]
  for (const region of regiones) {
    const texto = codigo.slice(region.inicio, region.fin)
    if (DISPARADORES_DE_SUBMIT.test(texto)) {
      violaciones.push(`${region.nombre} dispara el submit del formulario (requestSubmit/dispatchEvent/submit)`)
    }
    for (const nombre of nombrados) {
      if (new RegExp(`\\b${nombre.replace(/[$]/g, '\\$')}\\b`).test(texto)) {
        violaciones.push(`${region.nombre} nombra ${nombre}: la búsqueda no puede salir de ahí`)
      }
    }
  }

  // 4. El manejador se nombra solo en su definición y en el onSubmit.
  if (nombreManejador) {
    const veces = [...sinImports.matchAll(new RegExp(`\\b${nombreManejador.replace(/[$]/g, '\\$')}\\b`, 'g'))].length
    if (veces !== 2) violaciones.push(`${nombreManejador} aparece ${veces} veces: se esperaban 2 (definición y onSubmit)`)
  }

  return violaciones
}

// ---------------------------------------------------------------------------
// El detector en rojo: fixtures en memoria que lo tienen que poner en rojo.
// ---------------------------------------------------------------------------
const IMPORTS = `
'use client'
import { useEffect, useState } from 'react'
import { buscarDireccionLugar, guardarUbicacionManual } from '@/lib/admin/lugares-actions'
`

const BUENO = `${IMPORTS}
export function C() {
  const [direccion, setDireccion] = useState('')
  const [enfriando, setEnfriando] = useState(false)
  const handleBuscar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const res = await buscarDireccionLugar(direccion)
    setTimeout(() => setEnfriando(false), 1000)
  }
  return (
    <form onSubmit={handleBuscar}>
      <input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
    </form>
  )
}
`

describe('violacionesDeBusqueda: fixtures que lo ponen en verde', () => {
  it('la búsqueda en el manejador del submit, con un setTimeout de enfriamiento que no busca', () => {
    expect(violacionesDeBusqueda(BUENO)).toEqual([])
  })

  it('un onSubmit en línea que busca', () => {
    const fuente = `${IMPORTS}
export function C() {
  return <form onSubmit={async (e) => { e.preventDefault(); await buscarDireccionLugar(texto) }}><input /></form>
}`
    expect(violacionesDeBusqueda(fuente)).toEqual([])
  })

  it('un comentario que nombra la búsqueda en un onChange no cuenta', () => {
    const fuente = BUENO.replace('onChange={(e) => setDireccion(e.target.value)}', 'onChange={(e) => { /* buscarDireccionLugar(x) */ setDireccion(e.target.value) }}')
    expect(violacionesDeBusqueda(fuente)).toEqual([])
  })
})

describe('violacionesDeBusqueda: fixtures que lo ponen en rojo', () => {
  it('un onChange que busca mientras se tipea', () => {
    const fuente = BUENO.replace(
      'onChange={(e) => setDireccion(e.target.value)}',
      'onChange={async (e) => { setDireccion(e.target.value); await buscarDireccionLugar(e.target.value) }}'
    )
    const v = violacionesDeBusqueda(fuente)
    expect(v.length).toBeGreaterThan(0)
    expect(v.join('\n')).toMatch(/onChange nombra buscarDireccionLugar/)
  })

  it('un onChange que dispara el manejador del submit', () => {
    const fuente = BUENO.replace('onChange={(e) => setDireccion(e.target.value)}', 'onChange={(e) => { setDireccion(e.target.value); handleBuscar(e) }}')
    const v = violacionesDeBusqueda(fuente)
    expect(v.join('\n')).toMatch(/onChange nombra handleBuscar/)
  })

  it('un useEffect que depende del texto y busca', () => {
    const fuente = BUENO.replace(
      '  return (',
      '  useEffect(() => {\n    if (direccion.length > 2) void buscarDireccionLugar(direccion)\n  }, [direccion])\n  return ('
    )
    const v = violacionesDeBusqueda(fuente)
    expect(v.length).toBeGreaterThan(0)
    expect(v.join('\n')).toMatch(/useEffect nombra buscarDireccionLugar/)
  })

  it('un useEffect que llama al manejador del submit', () => {
    const fuente = BUENO.replace('  return (', '  useEffect(() => {\n    handleBuscar(null as never)\n  }, [direccion])\n  return (')
    expect(violacionesDeBusqueda(fuente).join('\n')).toMatch(/useEffect nombra handleBuscar/)
  })

  it('un onChange que dispara el submit con requestSubmit()', () => {
    const fuente = BUENO.replace('onChange={(e) => setDireccion(e.target.value)}', 'onChange={() => ref.current?.requestSubmit()}')
    expect(violacionesDeBusqueda(fuente).join('\n')).toMatch(/onChange dispara el submit/)
  })

  it.each([
    ['requestSubmit()', 'ref.current?.requestSubmit()'],
    ["dispatchEvent(new Event('submit'))", "ref.current?.dispatchEvent(new Event('submit'))"],
    ['.submit()', 'ref.current?.submit()'],
  ])('un useEffect que dispara el submit con %s', (_nombre, llamada) => {
    const fuente = BUENO.replace('  return (', `  useEffect(() => {\n    ${llamada}\n  }, [direccion])\n  return (`)
    expect(violacionesDeBusqueda(fuente).join('\n')).toMatch(/useEffect dispara el submit/)
  })

  it.each(['onInput', 'onKeyUp', 'onKeyDown', 'onBlur'])('un %s que busca', (atributo) => {
    const fuente = BUENO.replace(
      'onChange={(e) => setDireccion(e.target.value)}',
      `${atributo}={(e) => { void buscarDireccionLugar(direccion) }}`
    )
    const v = violacionesDeBusqueda(fuente)
    expect(v.length).toBeGreaterThan(0)
    expect(v.join('\n')).toContain(`${atributo} nombra buscarDireccionLugar`)
  })

  it('un debounce: setTimeout que busca', () => {
    const fuente = BUENO.replace(
      'onChange={(e) => setDireccion(e.target.value)}',
      'onChange={(e) => { setDireccion(e.target.value); setTimeout(() => buscarDireccionLugar(e.target.value), 400) }}'
    )
    const v = violacionesDeBusqueda(fuente).join('\n')
    expect(v).toMatch(/setTimeout nombra buscarDireccionLugar/)
  })

  it('un debounce fuera de un onChange: setTimeout suelto que busca', () => {
    const fuente = BUENO.replace('  return (', '  const t = setTimeout(() => { buscarDireccionLugar(direccion) }, 400)\n  return (')
    expect(violacionesDeBusqueda(fuente).join('\n')).toMatch(/setTimeout nombra buscarDireccionLugar/)
  })

  it('un setInterval que busca', () => {
    const fuente = BUENO.replace('  return (', '  setInterval(() => buscarDireccionLugar(direccion), 5000)\n  return (')
    expect(violacionesDeBusqueda(fuente).join('\n')).toMatch(/setInterval nombra buscarDireccionLugar/)
  })

  it('la búsqueda en una función que no es el manejador del submit', () => {
    const fuente = BUENO.replace(
      '    const res = await buscarDireccionLugar(direccion)\n',
      ''
    ).replace('  return (', '  const otra = async () => { await buscarDireccionLugar(direccion) }\n  return (')
    expect(violacionesDeBusqueda(fuente).join('\n')).toMatch(/no está adentro del manejador del onSubmit/)
  })

  it('dos llamadas', () => {
    const fuente = BUENO.replace('    const res = await buscarDireccionLugar(direccion)\n', '    await buscarDireccionLugar(direccion)\n    await buscarDireccionLugar(direccion)\n')
    expect(violacionesDeBusqueda(fuente).join('\n')).toMatch(/aparece 2 veces/)
  })

  it('la acción pasada como callback o guardada en un alias', () => {
    const fuente = BUENO.replace('  return (', '  const alias = buscarDireccionLugar\n  return (')
    expect(violacionesDeBusqueda(fuente).join('\n')).toMatch(/se usa sin llamarla|aparece 2 veces/)
  })

  it('el manejador del submit invocado desde otro lado (aparece más de dos veces)', () => {
    const fuente = BUENO.replace('  return (', '  const reintentar = () => handleBuscar(null as never)\n  return (')
    expect(violacionesDeBusqueda(fuente).join('\n')).toMatch(/handleBuscar aparece 3 veces/)
  })

  it('un onSubmit cuyo manejador no está definido en el archivo', () => {
    const fuente = BUENO.replace(/const handleBuscar[\s\S]*?\n  }\n/, '')
    expect(violacionesDeBusqueda(fuente).join('\n')).toMatch(/no se encontró la definición del manejador/)
  })

  it('un componente que ya no busca', () => {
    expect(violacionesDeBusqueda("'use client'\nexport function C() { return <form onSubmit={() => {}} /> }").join('\n')).toMatch(
      /no aparece/
    )
  })
})

// ---------------------------------------------------------------------------
// El archivo real.
// ---------------------------------------------------------------------------
describe('components/admin/lugar-mapa-ubicar.tsx: Nominatim solo se llama con un click (submit)', () => {
  const fuente = readFileSync(path.join(WEB_ROOT, COMPONENTE), 'utf8')

  it('cordura: es un componente de cliente con un formulario y la búsqueda', () => {
    const codigo = sinComentarios(fuente)
    expect(codigo).toMatch(/^\s*['"]use client['"]/)
    expect(codigo).toMatch(/<form\b/)
    expect(codigo).toMatch(/buscarDireccionLugar/)
  })

  it('buscarDireccionLugar se llama una sola vez, adentro del manejador del onSubmit, y nada la dispara al tipear ni con un debounce', () => {
    expect(violacionesDeBusqueda(fuente)).toEqual([])
  })

  it('el campo de texto no autocompleta (autoComplete="off") y el botón es de tipo submit', () => {
    const codigo = sinComentarios(fuente)
    expect(codigo).toMatch(/<input[\s\S]*?autoComplete="off"/)
    expect(codigo).toMatch(/<Button type="submit"/)
  })
})
