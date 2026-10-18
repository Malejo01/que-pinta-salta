// 46-q (Ronda 46, calidad de la app), punto 2 del encargo: el agujero que
// cruza 46-b/46-c/46-d. El detector estático de `tests/accesibilidad-detector.test.ts`
// marca "area-chica" mirando solo `minHeight`/`minWidth`/`height`/`width`
// numérico del `StyleSheet.create` — no entiende `hitSlop`. 46-c arregló las
// 4 piezas que quedan en `tests/a11y/pendientes-componentes.ts` con
// `hitSlopPara(...)` (el área de toque real llega a 48, aunque el estilo
// siga chico), pero HOY nada verifica que ese `hitSlop` siga ahí y siga
// alcanzando: si alguien lo baja o lo saca, el detector de 46-b sigue en
// verde contra la misma línea de base (el número de "area-chica" no cambia)
// y el arreglo se pierde en silencio.
//
// Este archivo NO reescribe el detector de 46-b: reusa sus piezas
// exportadas (`tocablesDe`, `quitarComentarios`, `extraerAtributoBalanceado`,
// `clavesDeEstiloChicas`, `styleUsaClaveChica`, `hallazgosDeArchivo`,
// `EXCEPCIONES_AREA_CHICA`) importándolas de `./accesibilidad-detector.test`
// — la MEDIDA real del estilo y el `hitSlop` resuelto a números (lo que el
// detector no da, solo dice si una clave es "chica", un booleano) viven en
// `./a11y/hitslop-medidas` (un módulo SIN `.test.ts`, a propósito: ver su
// comentario de cabecera sobre por qué, y el reporte de la tarea).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AREA_TACTIL_MINIMA, hitSlopPara } from '../lib/accesibilidad'
import { medidaDeEje, resolverHitSlop, valorDeClaveDeEstilo, valorDeConstante } from './a11y/hitslop-medidas'
import {
  EXCEPCIONES_AREA_CHICA,
  clavesDeEstiloChicas,
  extraerAtributoBalanceado,
  hallazgosDeArchivo,
  quitarComentarios,
  styleUsaClaveChica,
  tocablesDe,
  type Hallazgo,
} from './accesibilidad-detector.test'
import { PENDIENTES_COMPONENTES } from './a11y/pendientes-componentes'
import { PENDIENTES_PANTALLAS } from './a11y/pendientes-pantallas'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))

function rutaAbsoluta(archivoRelativo: string): string {
  return join(MOBILE_ROOT, ...archivoRelativo.split('/'))
}

describe('valorDeClaveDeEstilo (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('encuentra el valor de una clave de un StyleSheet.create real', () => {
    const archivo = `const estilos = StyleSheet.create({ boton: { minHeight: 44, padding: 8 } })`
    expect(valorDeClaveDeEstilo(archivo, 'boton')).toBe(' minHeight: 44, padding: 8 ')
  })

  it('null si la clave no está', () => {
    const archivo = `const estilos = StyleSheet.create({ boton: { minHeight: 44 } })`
    expect(valorDeClaveDeEstilo(archivo, 'otraClave')).toBeNull()
  })

  it('no confunde una clave anidada (shadowOffset) con una clave de nivel superior', () => {
    const archivo = `const estilos = StyleSheet.create({ caja: { shadowOffset: { width: 0, height: 2 } } })`
    expect(valorDeClaveDeEstilo(archivo, 'caja')).toContain('shadowOffset')
    // "shadowOffset" en sí no es una clave de NIVEL SUPERIOR del
    // StyleSheet: no hay que poder pedirla como si lo fuera.
    expect(valorDeClaveDeEstilo(archivo, 'shadowOffset')).toBeNull()
  })
})

describe('medidaDeEje (fixtures en memoria: tiene que fallar de verdad, los tres avisos del encargo)', () => {
  it('minHeight: 44 numérico: vertical da 44, horizontal undefined (no hay width/minWidth)', () => {
    const valor = ' minHeight: 44, padding: 8 '
    expect(medidaDeEje(valor, 'vertical')).toBe(44)
    expect(medidaDeEje(valor, 'horizontal')).toBeUndefined()
  })

  it('AVISO 1: height: \'100%\' (string) no cuenta como medida numérica', () => {
    const valor = ` height: '100%', width: '100%' `
    expect(medidaDeEje(valor, 'vertical')).toBeUndefined()
    expect(medidaDeEje(valor, 'horizontal')).toBeUndefined()
  })

  it('AVISO 2: un objeto anidado (shadowOffset) no contamina la medida del estilo de afuera', () => {
    const valor = ` flex: 1, shadowOffset: { width: 0, height: 2 } `
    expect(medidaDeEje(valor, 'vertical')).toBeUndefined()
    expect(medidaDeEje(valor, 'horizontal')).toBeUndefined()
  })

  it('AVISO 3: varias medidas en el mismo estilo — width/height (el no-"min") ganan sobre minWidth/minHeight', () => {
    const valor = ` width: 20, minWidth: 10, height: 6, minHeight: 4 `
    expect(medidaDeEje(valor, 'horizontal')).toBe(20)
    expect(medidaDeEje(valor, 'vertical')).toBe(6)
  })

  it('sin width (solo minWidth): usa minWidth', () => {
    expect(medidaDeEje(' minWidth: 44 ', 'horizontal')).toBe(44)
  })
})

describe('valorDeConstante (fixtures en memoria)', () => {
  it('encuentra el valor de una const de una sola línea, sin punto y coma', () => {
    expect(valorDeConstante('const X = hitSlopPara(40)\nconst Y = 1', 'X')).toBe('hitSlopPara(40)')
  })

  it('null si la constante no está', () => {
    expect(valorDeConstante('const X = 1', 'NO_EXISTE')).toBeNull()
  })
})

describe('resolverHitSlop (fixtures en memoria: tiene que fallar de verdad, usa el hitSlopPara REAL)', () => {
  it('número literal: mismo valor en los 4 lados (el caso hitSlop={8} de buscar.tsx)', () => {
    expect(resolverHitSlop('8', '')).toEqual({ top: 8, bottom: 8, left: 8, right: 8 })
  })

  it('hitSlopPara(44) directo (el caso del "ojito" de CampoTexto.tsx)', () => {
    expect(resolverHitSlop('hitSlopPara(44)', '')).toEqual(hitSlopPara(44))
  })

  it('AVISO: hitSlopPara(AREA_TACTIL_MINIMA, 44) — el primer argumento es un IDENTIFICADOR, no un número (el caso de PillsAtajos.tsx)', () => {
    expect(resolverHitSlop('hitSlopPara(AREA_TACTIL_MINIMA, 44)', '')).toEqual(hitSlopPara(AREA_TACTIL_MINIMA, 44))
    expect(resolverHitSlop('hitSlopPara(AREA_TACTIL_MINIMA, 44)', '')).toEqual({ top: 2, bottom: 2, left: 0, right: 0 })
  })

  it('un identificador que referencia una const del archivo con una llamada directa', () => {
    const archivo = `const X = hitSlopPara(40)\nconst estilos = {}`
    expect(resolverHitSlop('X', archivo)).toEqual(hitSlopPara(40))
  })

  it('un identificador que referencia una const con un objeto { ...hitSlopPara(...), left: N, right: N } (el caso de HIT_SLOP_PUNTO de Hero.tsx)', () => {
    const archivo = `const Y = { ...hitSlopPara(AREA_TACTIL_MINIMA, 6), left: 3, right: 3 }\nconst ATAJOS = []`
    const resultado = resolverHitSlop('Y', archivo)
    expect(resultado).toEqual({ top: 21, bottom: 21, left: 3, right: 3 })
  })

  it('el objeto con spread + overrides, directo (sin pasar por un identificador)', () => {
    expect(resolverHitSlop('{ ...hitSlopPara(48, 6), left: 3, right: 3 }', '')).toEqual({
      top: 21,
      bottom: 21,
      left: 3,
      right: 3,
    })
  })

  it('tira si no reconoce la forma', () => {
    expect(() => resolverHitSlop('algoRaro(1, 2, 3)', '')).toThrow()
  })

  it('tira si el identificador no se encuentra en el archivo', () => {
    expect(() => resolverHitSlop('NO_EXISTE', '')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// El chequeo real: para cada tocable "area-chica" (pendiente, o ya
// excepcionado en EXCEPCIONES_AREA_CHICA), el hitSlop real tiene que estar y
// tiene que alcanzar AREA_TACTIL_MINIMA en el eje (o los ejes) que el
// estilo del StyleSheet marca como numérico.
// ---------------------------------------------------------------------------

function hallazgosAreaChicaDe(archivoRelativo: string): Hallazgo[] {
  const contenido = readFileSync(rutaAbsoluta(archivoRelativo), 'utf8')
  return hallazgosDeArchivo(contenido, archivoRelativo).filter((h) => h.regla === 'area-chica')
}

const ARCHIVOS_CON_AREA_CHICA = new Set([...Object.keys(PENDIENTES_COMPONENTES), ...Object.keys(PENDIENTES_PANTALLAS)])

interface PuntoAVerificar {
  archivo: string
  linea: number
  origen: 'pendiente' | 'excepcion'
}

const PUNTOS_A_VERIFICAR: PuntoAVerificar[] = [
  ...[...ARCHIVOS_CON_AREA_CHICA].flatMap((archivo) =>
    hallazgosAreaChicaDe(archivo).map((h) => ({ archivo, linea: h.linea, origen: 'pendiente' as const })),
  ),
  ...EXCEPCIONES_AREA_CHICA.map((e) => ({ archivo: e.archivo, linea: e.linea, origen: 'excepcion' as const })),
]

describe('sanity check: hay al menos un punto a verificar (si da 0, algo se desalineó con la línea de base)', () => {
  it('encuentra puntos', () => {
    expect(PUNTOS_A_VERIFICAR.length).toBeGreaterThan(0)
  })
})

describe('El hitSlop real de cada tocable "area-chica" alcanza AREA_TACTIL_MINIMA en el/los eje(s) numérico(s) del estilo (el agujero de 46-b/46-c/46-d: el detector no ve hitSlop, esto sí lo mide)', () => {
  it.each(PUNTOS_A_VERIFICAR.map((p) => [`${p.archivo}:${p.linea} (${p.origen})`, p] as const))('%s', (_label, punto) => {
    const contenidoOriginal = readFileSync(rutaAbsoluta(punto.archivo), 'utf8')
    const contenido = quitarComentarios(contenidoOriginal)

    const tocable = tocablesDe(contenido).find((t) => t.linea === punto.linea)
    if (!tocable) throw new Error(`no se encontró un tocable en ${punto.archivo}:${punto.linea}`)

    const clavesChicas = clavesDeEstiloChicas(contenido)
    const styleTexto = extraerAtributoBalanceado(tocable.apertura, 'style')
    if (!styleTexto) throw new Error(`${punto.archivo}:${punto.linea} no tiene style=`)
    if (!styleUsaClaveChica(styleTexto, clavesChicas)) {
      throw new Error(
        `${punto.archivo}:${punto.linea}: su style no usa ninguna clave "chica" (¿la línea de base está mal, o el tocable ya no es el mismo?)`,
      )
    }

    const clave = [...clavesChicas].find((c) => new RegExp(`\\.${c}\\b`).test(styleTexto))
    if (!clave) throw new Error(`${punto.archivo}:${punto.linea}: no se pudo identificar qué clave "chica" usa (inesperado)`)

    const hitSlopTexto = extraerAtributoBalanceado(tocable.apertura, 'hitSlop')
    if (!hitSlopTexto) {
      throw new Error(
        `${punto.archivo}:${punto.linea}: el tocable NO tiene hitSlop — si el comentario de pendientes-*.ts/EXCEPCIONES_AREA_CHICA dice que lo tiene, el arreglo de 46-c se perdió (reportar, no tocar el componente)`,
      )
    }
    const hitSlop = resolverHitSlop(hitSlopTexto, contenido)

    const valorEstilo = valorDeClaveDeEstilo(contenido, clave)
    if (!valorEstilo) throw new Error(`${punto.archivo}:${punto.linea}: no se encontró el valor de estilos.${clave}`)

    const vertical = medidaDeEje(valorEstilo, 'vertical')
    const horizontal = medidaDeEje(valorEstilo, 'horizontal')

    if (vertical === undefined && horizontal === undefined) {
      throw new Error(
        `${punto.archivo}:${punto.linea}: estilos.${clave} no tiene ninguna medida numérica (ni width/minWidth ni height/minHeight) — revisar a mano`,
      )
    }

    if (vertical !== undefined) {
      const total = vertical + hitSlop.top + hitSlop.bottom
      expect(
        total,
        `${punto.archivo}:${punto.linea}: vertical ${vertical} + hitSlop top/bottom (${hitSlop.top}/${hitSlop.bottom}) = ${total}, no llega a ${AREA_TACTIL_MINIMA}`,
      ).toBeGreaterThanOrEqual(AREA_TACTIL_MINIMA)
    }
    if (horizontal !== undefined) {
      const total = horizontal + hitSlop.left + hitSlop.right
      expect(
        total,
        `${punto.archivo}:${punto.linea}: horizontal ${horizontal} + hitSlop left/right (${hitSlop.left}/${hitSlop.right}) = ${total}, no llega a ${AREA_TACTIL_MINIMA}`,
      ).toBeGreaterThanOrEqual(AREA_TACTIL_MINIMA)
    }
  })
})

// ---------------------------------------------------------------------------
// EXCEPCIÓN NOMBRADA: los puntos de paginación del Hero (components/Hero.tsx,
// estilos.punto). El ancho real en pantalla NO está en el StyleSheet (es
// inline: 20 el punto activo, 6 los demás, ver DiapositivaHero/el array de
// puntos) — así que el chequeo genérico de arriba, que solo mide lo que hay
// en el StyleSheet, no lo ve y pasa igual (el eje vertical, que SÍ está en
// el StyleSheet con height: 6, llega a 48 con HIT_SLOP_PUNTO). Pero ninguno
// de los dos anchos llega a 48 ni con el hitSlop real: autorizado
// explícitamente (el motivo está en el comentario de HIT_SLOP_PUNTO en
// Hero.tsx y en la entrada de Hero.tsx en tests/a11y/pendientes-componentes.ts:
// el gesto principal para cambiar de diapositiva es deslizar, no tocar el
// punto). Esta excepción es la que pide el encargo: "eje exacto que no
// llega", con motivo escrito.
// ---------------------------------------------------------------------------

const EXCEPCIONES_EJE_NO_ALCANZA: ReadonlyArray<{
  archivo: string
  clave: string
  eje: 'horizontal' | 'vertical'
  motivo: string
}> = [
  {
    archivo: 'components/Hero.tsx',
    clave: 'punto',
    eje: 'horizontal',
    motivo:
      'El ancho real de estilos.punto no está en el StyleSheet (es inline: 20 el punto activo, 6 los demás, components/Hero.tsx). ' +
      'Ni con HIT_SLOP_PUNTO (left/right 3) llega a 48: 20+3+3=26, 6+3+3=12. El gesto principal para cambiar de diapositiva es deslizar, no tocar el punto (autorizado por el plan de 46-c).',
  },
]

describe('components/Hero.tsx: excepción nombrada para el eje horizontal de estilos.punto (ver EXCEPCIONES_EJE_NO_ALCANZA)', () => {
  const archivoHero = readFileSync(join(MOBILE_ROOT, 'components', 'Hero.tsx'), 'utf8')
  const sinComentarios = quitarComentarios(archivoHero)

  it('el archivo real sigue usando width: 20 (punto activo) y width: 6 (los demás) para estilos.punto — si cambia, hay que revisar esta excepción', () => {
    expect(archivoHero).toMatch(/\{\s*width:\s*20,\s*backgroundColor:\s*colores\.primary\s*\}/)
    expect(archivoHero).toMatch(/\{\s*width:\s*6,\s*backgroundColor:\s*'rgba\(255,255,255,0\.4\)'\s*\}/)
  })

  it('ninguno de los dos anchos (20, 6) llega a AREA_TACTIL_MINIMA con el hitSlop real de HIT_SLOP_PUNTO: excepción aceptada', () => {
    const hitSlop = resolverHitSlop('HIT_SLOP_PUNTO', sinComentarios)
    for (const ancho of [20, 6]) {
      const total = ancho + hitSlop.left + hitSlop.right
      expect(total, `ancho ${ancho} + hitSlop left/right (${hitSlop.left}/${hitSlop.right}) = ${total}`).toBeLessThan(AREA_TACTIL_MINIMA)
    }
  })

  it('en cambio el eje VERTICAL (el que marca "area-chica" en la línea de base) SÍ llega a 48 — si esto deja de cumplirse, es una regresión real de 46-c, no la excepción de este bloque', () => {
    const hitSlop = resolverHitSlop('HIT_SLOP_PUNTO', sinComentarios)
    const valorEstilo = valorDeClaveDeEstilo(sinComentarios, 'punto')
    expect(valorEstilo).not.toBeNull()
    const vertical = medidaDeEje(valorEstilo as string, 'vertical')
    expect(vertical).toBe(6)
    expect((vertical as number) + hitSlop.top + hitSlop.bottom).toBeGreaterThanOrEqual(AREA_TACTIL_MINIMA)
  })

  it('EXCEPCIONES_EJE_NO_ALCANZA tiene un motivo no vacío para cada entrada (si se agrega una sin motivo, esto falla)', () => {
    for (const e of EXCEPCIONES_EJE_NO_ALCANZA) {
      expect(e.motivo.length).toBeGreaterThan(20)
    }
  })
})
