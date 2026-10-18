// 46-q2 (Ronda 46, calidad de la app): el agujero que encontró ux-ui en
// `components/PantallaRadar.tsx` — un `accessibilityRole="radio"` (o
// `"checkbox"`) con `accessibilityState={{ selected: … }}` en vez de
// `{{ checked: … }}`. `checked` es la clave que mapea a
// `AccessibilityNodeInfo.isChecked` en Android y la que hace que TalkBack
// diga "marcado"/"no marcado"; con `selected`, la persona no se entera de
// qué opción eligió. Ya está arreglado (commit `1d12a71`), pero nada en el
// repo miraba la correspondencia entre `accessibilityRole` y la clave de
// `accessibilityState` — volviendo a poner el bug a mano, la suite completa
// (2073 tests) seguía en verde. Este archivo es el detector que faltaba.
//
// NO reescribe el detector de 46-b ni copia sus funciones: reusa, de
// `./accesibilidad-detector.test` (el ÚNICO *.test.ts que importa — no se
// encadena ningún otro, ver `tests/a11y/hitslop-medidas.ts` sobre por qué
// importar un *.test.ts desde OTRO *.test.ts duplica sus `describe`),
// `tocablesDe`, `quitarComentarios`, `valorAccessibilityRole` y
// `extraerAtributoBalanceado`. La regla rol↔estado en sí (pura, sin JSX)
// vive en `./a11y/rol-estado` — un módulo SIN `.test.ts`, a propósito, mismo
// motivo que `tests/a11y/hitslop-medidas.ts`.
//
// Línea de base: 0, sin lista de pendientes — hoy no hay ningún caso real
// (confirmado por el barrido de más abajo).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CLAVE_ESPERADA_POR_ROL,
  clavesDeEstadoPresentes,
  esObjetoLiteralDeEstado,
  hallazgoRolEstadoDe,
} from './a11y/rol-estado'
import { extraerAtributoBalanceado, quitarComentarios, tocablesDe, valorAccessibilityRole } from './accesibilidad-detector.test'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_DIR = join(MOBILE_ROOT, 'app')
const COMPONENTS_DIR = join(MOBILE_ROOT, 'components')

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

function archivoRelativo(file: string): string {
  return relative(MOBILE_ROOT, file).replace(/\\/g, '/')
}

// ===========================================================================
// Fixtures en memoria: cada función, probada a que "falle de verdad" antes
// de aplicarse a los archivos reales.
// ===========================================================================

describe('esObjetoLiteralDeEstado (fixtures en memoria)', () => {
  it('un objeto literal, como lo devuelve extraerAtributoBalanceado para accessibilityState={{ checked: x }}: true', () => {
    const apertura = `<Pressable accessibilityRole="radio" accessibilityState={{ checked: x }}>`
    const texto = extraerAtributoBalanceado(apertura, 'accessibilityState')
    expect(texto).not.toBeNull()
    expect(esObjetoLiteralDeEstado(texto)).toBe(true)
  })

  it('LÍMITE CONOCIDO: una variable (accessibilityState={estadoDelBoton}) no es un objeto literal: false, no se adivina', () => {
    const apertura = `<Pressable accessibilityRole="radio" accessibilityState={estadoDelBoton}>`
    const texto = extraerAtributoBalanceado(apertura, 'accessibilityState')
    expect(texto).toBe('estadoDelBoton')
    expect(esObjetoLiteralDeEstado(texto)).toBe(false)
  })

  it('null (sin accessibilityState): false', () => {
    expect(esObjetoLiteralDeEstado(null)).toBe(false)
  })
})

describe('clavesDeEstadoPresentes (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta "checked" sola', () => {
    expect(clavesDeEstadoPresentes('{ checked: x }')).toEqual(new Set(['checked']))
  })

  it('detecta "selected" sola', () => {
    expect(clavesDeEstadoPresentes('{ selected: x }')).toEqual(new Set(['selected']))
  })

  it('no confunde "busy"/"disabled"/"expanded" (válidas con cualquier rol) con checked/selected', () => {
    expect(clavesDeEstadoPresentes('{ busy: x, disabled: y, expanded: z }')).toEqual(new Set())
  })

  it('varias claves a la vez: checked + busy — solo cuenta checked', () => {
    expect(clavesDeEstadoPresentes('{ checked: x, busy: y }')).toEqual(new Set(['checked']))
  })

  it('varias claves a la vez: selected + disabled — solo cuenta selected', () => {
    expect(clavesDeEstadoPresentes('{ selected: x, disabled: y }')).toEqual(new Set(['selected']))
  })

  it('las dos a la vez (caso raro, pero no se confunde ninguna con la otra)', () => {
    expect(clavesDeEstadoPresentes('{ checked: x, selected: y }')).toEqual(new Set(['checked', 'selected']))
  })
})

describe('hallazgoRolEstadoDe (fixtures en memoria: tiene que fallar de verdad — es la regla completa)', () => {
  it('EL BUG REAL (fixture exacto del JSX de PantallaRadar.tsx antes del arreglo 1d12a71): radio + selected → hallazgo', () => {
    const h = hallazgoRolEstadoDe('radio', '{ selected: seleccionada }')
    expect(h).toEqual({ rol: 'radio', claveEncontrada: 'selected', claveEsperada: 'checked' })
  })

  it('el mismo caso, YA arreglado (radio + checked): sin hallazgo', () => {
    expect(hallazgoRolEstadoDe('radio', '{ checked: seleccionada }')).toBeNull()
  })

  it('checkbox + selected (la otra mitad del mismo bug, el otro Pressable de PantallaRadar.tsx): hallazgo', () => {
    const h = hallazgoRolEstadoDe('checkbox', '{ selected: seleccionada }')
    expect(h).toEqual({ rol: 'checkbox', claveEncontrada: 'selected', claveEsperada: 'checked' })
  })

  it('checkbox + checked: sin hallazgo', () => {
    expect(hallazgoRolEstadoDe('checkbox', '{ checked: seleccionada }')).toBeNull()
  })

  it('AL REVÉS: button + checked (un chip/pill que usara "checked" en vez de "selected"): también es un hallazgo', () => {
    const h = hallazgoRolEstadoDe('button', '{ checked: activo }')
    expect(h).toEqual({ rol: 'button', claveEncontrada: 'checked', claveEsperada: 'selected' })
  })

  it('button + selected (el patrón real y correcto de PillsAtajos.tsx/SeccionNotificaciones.tsx/BotonesAsistencia.tsx/buscar.tsx): sin hallazgo, no se toca', () => {
    expect(hallazgoRolEstadoDe('button', '{ selected: activo }')).toBeNull()
  })

  it('button con busy + selected (BotonesAsistencia.tsx: { selected: marcado, busy: marcando === tipo }): sin hallazgo', () => {
    expect(hallazgoRolEstadoDe('button', '{ selected: marcado, busy: marcando === tipo }')).toBeNull()
  })

  it('radio con disabled + selected: el "disabled" no tapa el hallazgo de "selected"', () => {
    const h = hallazgoRolEstadoDe('radio', '{ selected: x, disabled: y }')
    expect(h).toEqual({ rol: 'radio', claveEncontrada: 'selected', claveEsperada: 'checked' })
  })

  it('un rol fuera del mapa (header, link, un button plano sin selected/checked): sin hallazgo, la regla no aplica', () => {
    expect(hallazgoRolEstadoDe('header', '{ selected: x }')).toBeNull()
    expect(hallazgoRolEstadoDe('link', '{ checked: x }')).toBeNull()
    expect(hallazgoRolEstadoDe('button', '{ expanded: x }')).toBeNull() // cines.tsx/pelicula/[id].tsx: button + expanded, no es asunto de esta regla
  })

  it('rol null (sin accessibilityRole): sin hallazgo — es asunto de la regla "sin-rol" de 46-b, no de esta', () => {
    expect(hallazgoRolEstadoDe(null, '{ selected: x }')).toBeNull()
  })

  it('sin accessibilityState (null): sin hallazgo, aunque el rol sea radio/checkbox/button', () => {
    expect(hallazgoRolEstadoDe('radio', null)).toBeNull()
    expect(hallazgoRolEstadoDe('button', null)).toBeNull()
  })

  it('LÍMITE CONOCIDO: accessibilityState por variable (accessibilityState={estadoDelBoton}) — no se adivina, aunque el rol sea radio/checkbox: sin hallazgo', () => {
    // El valor real de esa variable podría traer "selected" y sería el bug
    // real — pero esta heurística (igual que el resto del detector de 46-b)
    // no es un parser de JS: no evalúa variables. Documentado, no cubierto.
    expect(hallazgoRolEstadoDe('radio', 'estadoDelBoton')).toBeNull()
  })

  it('un spread con override literal (accessibilityState={{ ...base, checked: x }}) en un checkbox: SÍ se detecta la clave literal, aunque venga con spread', () => {
    expect(hallazgoRolEstadoDe('checkbox', '{ ...base, checked: x }')).toBeNull()
    const h = hallazgoRolEstadoDe('checkbox', '{ ...base, selected: x }')
    expect(h).toEqual({ rol: 'checkbox', claveEncontrada: 'selected', claveEsperada: 'checked' })
  })
})

describe('CLAVE_ESPERADA_POR_ROL (sanity: el mapa que pide el encargo, ni más ni menos)', () => {
  it('radio y checkbox → checked; button → selected', () => {
    expect(CLAVE_ESPERADA_POR_ROL.radio).toBe('checked')
    expect(CLAVE_ESPERADA_POR_ROL.checkbox).toBe('checked')
    expect(CLAVE_ESPERADA_POR_ROL.button).toBe('selected')
  })

  it('header y link no están en el mapa (no son asunto de esta regla)', () => {
    expect(CLAVE_ESPERADA_POR_ROL.header).toBeUndefined()
    expect(CLAVE_ESPERADA_POR_ROL.link).toBeUndefined()
  })
})

// ===========================================================================
// El fixture completo del bug: el JSX real de PantallaRadar.tsx (ANTES del
// arreglo 1d12a71), reproducido a mano en memoria — NO se toca
// components/PantallaRadar.tsx, que no es de esta tarea.
// ===========================================================================

describe('el pipeline completo (tocablesDe + valorAccessibilityRole + extraerAtributoBalanceado + hallazgoRolEstadoDe) sobre un fixture idéntico al bug real', () => {
  it('CON el bug (accessibilityState={{ selected: seleccionada }}): el pipeline lo encuentra', () => {
    const fixtureConBug = `
      <Pressable
        key={opcion.valor}
        onPress={() => actualizarOk((previo) => ({ ...previo, frecuencia: opcion.valor }))}
        accessibilityRole="radio"
        accessibilityState={{ selected: seleccionada }}
        style={[estilos.filaFrecuencia]}
      >
        <Texto style={estilos.textoFrecuencia}>{opcion.etiqueta}</Texto>
      </Pressable>
    `
    const tocable = tocablesDe(quitarComentarios(fixtureConBug))[0]
    const rol = valorAccessibilityRole(tocable.apertura)
    const estado = extraerAtributoBalanceado(tocable.apertura, 'accessibilityState')
    const hallazgo = hallazgoRolEstadoDe(rol, estado)
    expect(hallazgo).toEqual({ rol: 'radio', claveEncontrada: 'selected', claveEsperada: 'checked' })
  })

  it('SIN el bug (accessibilityState={{ checked: seleccionada }}, el estado real post-1d12a71): el pipeline no encuentra nada', () => {
    const fixtureArreglado = `
      <Pressable
        key={opcion.valor}
        onPress={() => actualizarOk((previo) => ({ ...previo, frecuencia: opcion.valor }))}
        accessibilityRole="radio"
        accessibilityState={{ checked: seleccionada }}
        style={[estilos.filaFrecuencia]}
      >
        <Texto style={estilos.textoFrecuencia}>{opcion.etiqueta}</Texto>
      </Pressable>
    `
    const tocable = tocablesDe(quitarComentarios(fixtureArreglado))[0]
    const rol = valorAccessibilityRole(tocable.apertura)
    const estado = extraerAtributoBalanceado(tocable.apertura, 'accessibilityState')
    expect(hallazgoRolEstadoDe(rol, estado)).toBeNull()
  })
})

// ===========================================================================
// app/ y components/ reales: línea de base 0, sin lista de pendientes.
// ===========================================================================

interface HallazgoConUbicacion {
  archivo: string
  linea: number
  rol: string
  claveEncontrada: string
  claveEsperada: string
}

function hallazgosRolEstadoDeArchivo(contenidoOriginal: string, archivoRel: string): HallazgoConUbicacion[] {
  const limpio = quitarComentarios(contenidoOriginal)
  const resultado: HallazgoConUbicacion[] = []
  for (const tocable of tocablesDe(limpio)) {
    const rol = valorAccessibilityRole(tocable.apertura)
    const estado = extraerAtributoBalanceado(tocable.apertura, 'accessibilityState')
    const hallazgo = hallazgoRolEstadoDe(rol, estado)
    if (hallazgo) {
      resultado.push({
        archivo: archivoRel,
        linea: tocable.linea,
        rol: hallazgo.rol,
        claveEncontrada: hallazgo.claveEncontrada,
        claveEsperada: hallazgo.claveEsperada,
      })
    }
  }
  return resultado
}

describe('app/ y components/: rol↔estado en 0, sin línea de base (46-q2 — si esto falla alguna vez, hay un rol con la clave equivocada)', () => {
  const archivos = [...listarTsxYTs(APP_DIR), ...listarTsxYTs(COMPONENTS_DIR)]

  it('encuentra archivos para analizar', () => {
    expect(archivos.length).toBeGreaterThan(0)
  })

  it.each(archivos.map((file) => [archivoRelativo(file), file] as const))('%s', (label, file) => {
    const contenido = readFileSync(file, 'utf8')
    const hallazgos = hallazgosRolEstadoDeArchivo(contenido, label)
    if (hallazgos.length > 0) {
      const detalle = hallazgos
        .map(
          (h) =>
            `  ${h.archivo}:${h.linea} — accessibilityRole="${h.rol}" con accessibilityState.${h.claveEncontrada} (tiene que ser accessibilityState.${h.claveEsperada})`,
        )
        .join('\n')
      throw new Error(`se esperaba 0 hallazgos de rol↔estado, hay ${hallazgos.length}:\n${detalle}`)
    }
    expect(hallazgos).toEqual([])
  })
})
