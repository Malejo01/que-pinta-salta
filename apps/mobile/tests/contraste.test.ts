// 46-a: contraste WCAG 2.x de los colores de la app, sobre los tokens reales
// (`COLORES_CLARO`/`COLORES_OSCURO` de `lib/theme.ts`) y los hex fijos
// escritos a mano en `app/` y `components/` (no son tokens de
// `useColoresQPS()`: ver el comentario de cada uno más abajo).
//
// Se prueban los dos esquemas, aunque la app hoy sea solo oscura (D1,
// 29-g): `COLORES_CLARO` no se renderiza en producción todavía, pero sigue
// siendo la paridad con la web (`apps/web/app/globals.css`, `:root`) y este
// test lo deja documentado para el día que D1 se revise.
//
// `evaluarPar` (la lógica de las tres formas de fallar) está acá, no en
// lib/accesibilidad.ts: es específica de cómo se gobiernan las EXCEPCIONES
// de esta tarea, no algo que vaya a usar un componente.
import { describe, expect, it } from 'vitest'
import { contraste, cumpleContraste, type UsoContraste } from '../lib/accesibilidad'
import { COLORES_CLARO, COLORES_OSCURO, type ColoresQPS } from '../lib/theme'

type Esquema = 'claro' | 'oscuro'

function coloresDelEsquema(esquema: Esquema): ColoresQPS {
  return esquema === 'claro' ? COLORES_CLARO : COLORES_OSCURO
}

/** Un color de un par: un token de `ColoresQPS` (cambia con el esquema) o un
 * hex fijo escrito a mano (igual en los dos esquemas). */
type ColorDePar = { tipo: 'token'; campo: keyof ColoresQPS } | { tipo: 'fijo'; hex: string }

function token(campo: keyof ColoresQPS): ColorDePar {
  return { tipo: 'token', campo }
}
function fijo(hex: string): ColorDePar {
  return { tipo: 'fijo', hex }
}
function resolver(color: ColorDePar, colores: ColoresQPS): string {
  return color.tipo === 'token' ? colores[color.campo] : color.hex
}

interface ParContraste {
  nombre: string
  uso: UsoContraste
  a: ColorDePar
  b: ColorDePar
  /** Solo FIJOS: dónde está escrito el hex a mano. */
  archivos?: string[]
  /** Aclaración libre (p. ej. "escrito como #fff en el código"). */
  nota?: string
}

function ratioDe(par: ParContraste, esquema: Esquema): number {
  const colores = coloresDelEsquema(esquema)
  return contraste(resolver(par.a, colores), resolver(par.b, colores))
}

// ---------------------------------------------------------------------------
// PARES: los tokens de ColoresQPS que se usan como texto/componente sobre
// otro token. `primary` aparece dos veces, con `nombre` distinto para que no
// choquen: como texto (mínimo 4,5) y como componente, contorno y relleno de
// BotonesAsistencia (mínimo 3).
// ---------------------------------------------------------------------------
const PARES: ParContraste[] = [
  { nombre: 'foreground/background', uso: 'texto', a: token('foreground'), b: token('background') },
  { nombre: 'foreground/card', uso: 'texto', a: token('foreground'), b: token('card') },
  { nombre: 'foreground/muted', uso: 'texto', a: token('foreground'), b: token('muted') },
  { nombre: 'mutedForeground/background', uso: 'texto', a: token('mutedForeground'), b: token('background') },
  { nombre: 'mutedForeground/card', uso: 'texto', a: token('mutedForeground'), b: token('card') },
  { nombre: 'mutedForeground/muted', uso: 'texto', a: token('mutedForeground'), b: token('muted') },
  { nombre: 'primaryForeground/primary', uso: 'texto', a: token('primaryForeground'), b: token('primary') },
  { nombre: 'primary (texto)/background', uso: 'texto', a: token('primary'), b: token('background') },
  { nombre: 'primary (texto)/card', uso: 'texto', a: token('primary'), b: token('card') },
  {
    nombre: 'primary (componente: contorno/relleno de botón)/background',
    uso: 'componente',
    a: token('primary'),
    b: token('background'),
  },
]

// ---------------------------------------------------------------------------
// FIJOS: hex escritos a mano en app/ y components/ (verificados con Grep
// antes de esta tabla, no copiados del encargo a ciegas — ver el reporte de
// la tarea para las diferencias encontradas).
//
// Los textos blancos sobre la imagen con degradé (tarjeta de evento y Hero
// de portada) no se pueden calcular: el fondo es una foto, no un color
// plano. Van "para el teléfono" (revisión visual, no en esta tabla).
//
// `app/eliminar-cuenta.tsx` también escribe `'#ffffff'` a mano (líneas 129 y
// 131), pero NO está sobre `primary`: el botón "Eliminar mi cuenta para
// siempre" tiene fondo `COLOR_ERROR` ('#f87171') cuando está habilitado, y
// `colores.border` cuando no — nunca `colores.primary`. No se incluye acá
// (ver el reporte de la tarea).
// ---------------------------------------------------------------------------
const FIJOS: ParContraste[] = [
  {
    nombre: 'blanco (botón de WhatsApp)/#059669',
    uso: 'texto',
    a: fijo('#ffffff'),
    b: fijo('#059669'),
    archivos: ['app/(tabs)/favoritos.tsx'],
    nota: "escrito como '#fff' (3 dígitos) en el código, no '#ffffff'",
  },
  {
    nombre: '#f87171 (texto de error)/background',
    uso: 'texto',
    a: fijo('#f87171'),
    b: token('background'),
    archivos: [
      'components/CampoTexto.tsx',
      'app/(tabs)/cuenta.tsx',
      'app/eliminar-cuenta.tsx',
      'components/SeccionNotificaciones.tsx',
    ],
  },
  {
    nombre: '#f87171 (borde del aviso de error)/background',
    uso: 'componente',
    a: fijo('#f87171'),
    b: token('background'),
    archivos: ['components/PantallaRadar.tsx'],
    nota:
      "en PantallaRadar.tsx #f87171 es el borde del aviso (`estilos.aviso`), no el color de texto: " +
      'el encargo lo agrupaba con los otros 4 archivos como "texto de error", pero ahí es un componente',
  },
  {
    nombre: '#34d399 (texto del chip "Lugar")/background',
    uso: 'texto',
    a: fijo('#34d399'),
    b: token('background'),
    archivos: ['components/PantallaRadar.tsx'],
  },
  {
    nombre: '#f472b6 (texto del chip "Instagram")/background',
    uso: 'texto',
    a: fijo('#f472b6'),
    b: token('background'),
    archivos: ['components/PantallaRadar.tsx'],
  },
  {
    nombre: '#000000 (texto del badge "Destacado")/#f59e0b',
    uso: 'texto',
    a: fijo('#000000'),
    b: fijo('#f59e0b'),
    archivos: ['components/TarjetaEvento.tsx'],
    nota: "escrito como '#000' (3 dígitos) en el código, no '#000000'",
  },
  {
    nombre: 'blanco (texto del botón marcado)/primary',
    uso: 'texto',
    a: fijo('#ffffff'),
    b: token('primary'),
    archivos: ['components/BotonesAsistencia.tsx'],
    nota: "escrito como '#fff' (3 dígitos) en el código, no '#ffffff'",
  },
  // 46-q, punto 4 del encargo (el revisor de la tanda 1 lo encontró
  // faltante): el botón "Eliminar mi cuenta para siempre" de
  // `app/eliminar-cuenta.tsx` SÍ es un par real en pantalla, aunque no
  // use `colores.primary` (por eso no estaba en la tabla de arriba, ver el
  // comentario del grupo "#f87171 (texto de error)/background"). Leído el
  // código de verdad (no lo que decía el encargo): el texto siempre es
  // '#ffffff' (ya escrito en 6 dígitos, no abreviado), tanto en
  // `<ActivityIndicator color="#ffffff" />` (mientras envía) como en el
  // `<Texto style={{ color: '#ffffff' }}>` — no cambia de color según el
  // estado. El FONDO sí cambia con `estilos.boton(habilitado, colorDeshabilitado)`:
  // `COLOR_ERROR` ('#f87171') si `habilitado`, `colores.border` (token) si
  // no — los dos son pares reales, se agregan los dos.
  {
    nombre: 'blanco/#f87171 (botón "Eliminar mi cuenta", habilitado)',
    uso: 'texto',
    a: fijo('#ffffff'),
    b: fijo('#f87171'),
    archivos: ['app/eliminar-cuenta.tsx'],
  },
  {
    nombre: 'blanco/border (botón "Eliminar mi cuenta", deshabilitado)',
    uso: 'texto',
    a: fijo('#ffffff'),
    b: token('border'),
    archivos: ['app/eliminar-cuenta.tsx'],
  },
]

const TODOS: ParContraste[] = [...PARES, ...FIJOS]

// ---------------------------------------------------------------------------
// EXCEPCIONES: pares que hoy no llegan a su mínimo, con el ratio (dos
// decimales) y el motivo. Clave: `${nombre}::${esquema}`.
//
// El encargo de la tarea decía "hoy son tres" (primary como texto en
// oscuro, sobre background y sobre card, y el blanco sobre #059669). Al
// calcular los FIJOS en el esquema claro aparecen otras cuatro: los colores
// decorativos de PantallaRadar (#f87171, #34d399, #f472b6) se eligieron
// mirando solo el fondo oscuro (ver sus comentarios en el código: "nunca
// leído de useColorScheme() — la app arranca siempre oscura") y nunca se
// probaron contra el fondo claro. No es que el plan esté mal en los
// números — los ratios que dio coinciden exactamente con los de acá—, sino
// en el conteo: contando también los FIJOS en claro son siete pares, no
// tres. Reportado en el informe final de la tarea.
// ---------------------------------------------------------------------------
interface ExcepcionContraste {
  ratio: number
  motivo: string
}

const MOTIVO_TOKEN_WEB = 'El token es copia de los tokens de la web (apps/web/app/globals.css); decide Mauro.'
const MOTIVO_FIJO_PENSADO_PARA_OSCURO =
  'Color decorativo fijo, elegido mirando solo el fondo oscuro (D1, la app arranca siempre oscura); decide Mauro.'

const EXCEPCIONES: Record<string, ExcepcionContraste> = {
  'primary (texto)/background::oscuro': { ratio: 3.83, motivo: MOTIVO_TOKEN_WEB },
  'primary (texto)/card::oscuro': { ratio: 3.65, motivo: MOTIVO_TOKEN_WEB },
  'blanco (botón de WhatsApp)/#059669::claro': { ratio: 3.77, motivo: MOTIVO_TOKEN_WEB },
  'blanco (botón de WhatsApp)/#059669::oscuro': { ratio: 3.77, motivo: MOTIVO_TOKEN_WEB },
  '#f87171 (texto de error)/background::claro': { ratio: 2.6, motivo: MOTIVO_FIJO_PENSADO_PARA_OSCURO },
  '#f87171 (borde del aviso de error)/background::claro': { ratio: 2.6, motivo: MOTIVO_FIJO_PENSADO_PARA_OSCURO },
  '#34d399 (texto del chip "Lugar")/background::claro': { ratio: 1.81, motivo: MOTIVO_FIJO_PENSADO_PARA_OSCURO },
  '#f472b6 (texto del chip "Instagram")/background::claro': { ratio: 2.49, motivo: MOTIVO_FIJO_PENSADO_PARA_OSCURO },
  // 46-q, punto 4 del encargo: el par que faltaba (revisor de la tanda 1).
  // El texto es SIEMPRE '#ffffff' (no cambia con el esquema ni con
  // habilitado/deshabilitado): lo que cambia es el FONDO. `COLOR_ERROR`
  // ('#f87171', igual en los dos esquemas — ver su comentario en
  // app/eliminar-cuenta.tsx) da 2.77, abajo de 4,5 en los dos esquemas.
  'blanco/#f87171 (botón "Eliminar mi cuenta", habilitado)::claro': { ratio: 2.77, motivo: MOTIVO_FIJO_PENSADO_PARA_OSCURO },
  'blanco/#f87171 (botón "Eliminar mi cuenta", habilitado)::oscuro': { ratio: 2.77, motivo: MOTIVO_FIJO_PENSADO_PARA_OSCURO },
  // El fondo deshabilitado es `colores.border` (token, varía con el
  // esquema): en claro (`oklch(0.9 0 0)`, gris muy claro) el blanco casi no
  // contrasta — 1.35. Mismo motivo que el resto de esta tabla: decide
  // Mauro si corresponde un color de texto distinto para el estado
  // deshabilitado, o si no importa (el botón deshabilitado no es
  // interactivo).
  'blanco/border (botón "Eliminar mi cuenta", deshabilitado)::claro': { ratio: 1.35, motivo: MOTIVO_TOKEN_WEB },
}

type VeredictoPar = { ok: true } | { ok: false; motivo: string }

/**
 * Las tres formas en que un par puede fallar:
 * 1. no está en EXCEPCIONES y no llega al mínimo de `uso`;
 * 2. está en EXCEPCIONES pero ya llega al mínimo (hay que sacarlo de la lista);
 * 3. está en EXCEPCIONES y su ratio real se alejó más de 0,05 del documentado
 *    (se movió un token sin que nadie lo mirara).
 */
function evaluarPar(ratioReal: number, uso: UsoContraste, excepcion: ExcepcionContraste | undefined): VeredictoPar {
  const cumple = cumpleContraste(ratioReal, uso)

  if (excepcion === undefined) {
    if (!cumple) {
      return { ok: false, motivo: `no llega al mínimo de "${uso}" (da ${ratioReal.toFixed(2)}) y no está en EXCEPCIONES` }
    }
    return { ok: true }
  }

  if (cumple) {
    return {
      ok: false,
      motivo: `está en EXCEPCIONES pero ya llega al mínimo de "${uso}" (da ${ratioReal.toFixed(2)}): sacarla de la lista`,
    }
  }

  const diferencia = Math.abs(ratioReal - excepcion.ratio)
  if (diferencia > 0.05) {
    return {
      ok: false,
      motivo: `el ratio (${ratioReal.toFixed(2)}) se alejó ${diferencia.toFixed(2)} del documentado en EXCEPCIONES (${excepcion.ratio})`,
    }
  }
  return { ok: true }
}

describe('evaluarPar (fixtures inventadas, no los tokens reales: tiene que fallar de verdad)', () => {
  it('pasa cuando no está en EXCEPCIONES y llega al mínimo', () => {
    expect(evaluarPar(5, 'texto', undefined)).toEqual({ ok: true })
  })

  it('falla cuando NO está en EXCEPCIONES y NO llega al mínimo', () => {
    const veredicto = evaluarPar(3.2, 'texto', undefined)
    expect(veredicto.ok).toBe(false)
  })

  it('falla cuando un par de EXCEPCIONES YA llega al mínimo (hay que sacarlo de la lista)', () => {
    // 5 >= 4.5 (mínimo de 'texto'): ya cumple, no debería seguir en EXCEPCIONES.
    const veredicto = evaluarPar(5, 'texto', { ratio: 3, motivo: 'excepción vieja, ya resuelta' })
    expect(veredicto.ok).toBe(false)
  })

  it('falla cuando el ratio de una excepción se movió más de 0,05 del documentado', () => {
    // 3.95 < 4.5: sigue sin cumplir, pero se alejó 0,12 de los 3,83 documentados.
    const veredicto = evaluarPar(3.95, 'texto', { ratio: 3.83, motivo: 'x' })
    expect(veredicto.ok).toBe(false)
  })

  it('pasa cuando la excepción documentada sigue siendo exacta', () => {
    expect(evaluarPar(3.83, 'texto', { ratio: 3.83, motivo: 'x' })).toEqual({ ok: true })
  })

  it('pasa cuando la excepción se movió, pero no más de 0,05 (tolerancia)', () => {
    // 3.86 sigue sin cumplir 'texto' (4.5) y está a solo 0,03 de 3,83.
    expect(evaluarPar(3.86, 'texto', { ratio: 3.83, motivo: 'x' })).toEqual({ ok: true })
  })
})

describe.each(['claro', 'oscuro'] as const)('contraste, esquema %s', (esquema) => {
  it.each(TODOS.map((par) => [par.nombre, par] as const))('%s', (_nombre, par) => {
    const ratio = ratioDe(par, esquema)
    const excepcion = EXCEPCIONES[`${par.nombre}::${esquema}`]
    const veredicto = evaluarPar(ratio, par.uso, excepcion)
    if (!veredicto.ok) {
      throw new Error(`${par.nombre} (${esquema}, uso "${par.uso}", ratio ${ratio.toFixed(2)}): ${veredicto.motivo}`)
    }
    expect(veredicto.ok).toBe(true)
  })
})

// Todas las claves de EXCEPCIONES corresponden a un par real: si se borra un
// par de PARES/FIJOS hay que borrar también su excepción (o el test de
// arriba ya la habría marcado como "ya cumple" con un ratio de NaN, pero
// este chequeo lo deja explícito).
describe('EXCEPCIONES: todas las claves corresponden a un par declarado', () => {
  const nombres = new Set(TODOS.map((par) => par.nombre))
  it.each(Object.keys(EXCEPCIONES))('%s', (clave) => {
    const [nombre] = clave.split('::')
    expect(nombres.has(nombre)).toBe(true)
  })
})

// 46-q, punto 4 del encargo: el informe de la ronda (el que se lleva a
// Mauro) tiene que reflejar TODOS los pares de EXCEPCIONES — si se agrega
// una excepción nueva sin sumarla también a esta lista (y, de verdad, al
// informe), este test falla. La lista de abajo es la misma que el informe
// de 46-q va a llevar: si el informe cambia, hay que actualizar esto (y
// viceversa).
const PARES_DEL_INFORME_DE_LA_RONDA = [
  'primary (texto)/background',
  'primary (texto)/card',
  'blanco (botón de WhatsApp)/#059669',
  '#f87171 (texto de error)/background',
  '#f87171 (borde del aviso de error)/background',
  '#34d399 (texto del chip "Lugar")/background',
  '#f472b6 (texto del chip "Instagram")/background',
  'blanco/#f87171 (botón "Eliminar mi cuenta", habilitado)',
  'blanco/border (botón "Eliminar mi cuenta", deshabilitado)',
]

describe('EXCEPCIONES: los nombres (sin esquema) están todos en la lista que el informe de la ronda le lleva a Mauro', () => {
  const nombresDeExcepciones = new Set([...Object.keys(EXCEPCIONES)].map((clave) => clave.split('::')[0]))
  it.each([...nombresDeExcepciones])('%s', (nombre) => {
    expect(PARES_DEL_INFORME_DE_LA_RONDA, `"${nombre}" está en EXCEPCIONES pero no en PARES_DEL_INFORME_DE_LA_RONDA — sumarlo acá (y al informe)`).toContain(nombre)
  })
})
