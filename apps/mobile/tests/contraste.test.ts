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
  {
    nombre: 'mutedForeground/background',
    uso: 'texto',
    a: token('mutedForeground'),
    b: token('background'),
    // Ronda 49 (QPS-241, grupo 1): desde esta ronda este par también cubre
    // el texto y el borde del botón "Eliminar mi cuenta para siempre"
    // (`app/eliminar-cuenta.tsx`) cuando está DESHABILITADO — ya no hace
    // falta un par nuevo para eso (ver el comentario de FIJOS más abajo).
    nota: 'desde la ronda 49 también cubre el texto/borde deshabilitado de app/eliminar-cuenta.tsx',
  },
  { nombre: 'mutedForeground/card', uso: 'texto', a: token('mutedForeground'), b: token('card') },
  { nombre: 'mutedForeground/muted', uso: 'texto', a: token('mutedForeground'), b: token('muted') },
  { nombre: 'primaryForeground/primary', uso: 'texto', a: token('primaryForeground'), b: token('primary') },
  // Ronda 49 (QPS-241, grupo 2, decisión de Mauro): `primary` daba 3,83
  // sobre `background` y 3,65 sobre `card` como texto — abajo del mínimo de
  // "texto" (4,5), y es copia del token de la web. En vez de aclararlo,
  // Mauro decidió dejar de usarlo para texto chico ("Ver en Instagram", "Ver
  // todos", el título de la sección del día y "Abrir Ajustes" pasaron a
  // `foreground`; `app/(tabs)/cuenta.tsx` y la pestaña activa, en 49-a/49-c).
  // Lo único que queda es texto GRANDE (si alguna vez aparece uno): el
  // detector `tests/primario-texto.test.ts` es quien hace cumplir que
  // `primary` no se use como texto chico; estos dos pares pasan a
  // `'texto-grande'` (mínimo 3) porque los dos ratios ya lo cumplen, y
  // pierden sus excepciones — no porque hoy haya texto grande de verdad en
  // `primary` (no lo hay), sino porque ese es el único uso que le queda
  // permitido al token como texto.
  { nombre: 'primary (texto grande)/background', uso: 'texto-grande', a: token('primary'), b: token('background') },
  { nombre: 'primary (texto grande)/card', uso: 'texto-grande', a: token('primary'), b: token('card') },
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
// `app/eliminar-cuenta.tsx` (ronda 49, QPS-241 grupo 1): el botón "Eliminar
// mi cuenta para siempre" dejó de tener texto blanco — es un botón con
// contorno, nunca relleno. El texto y el `ActivityIndicator` van en
// `COLOR_ERROR` ('#f87171') cuando está habilitado, y en
// `colores.mutedForeground` cuando no; el borde (no el fondo, que ahora es
// siempre `transparent`) usa los mismos dos colores. Esos tres pares ya
// están cubiertos por FIJOS/PARES de más abajo: `COLOR_ERROR` sobre
// `background` por "#f87171 (texto de error)/background" (que ya incluye
// este archivo) y por "#f87171 (borde del aviso de error)/background" (como
// componente), y `mutedForeground` sobre `background` por el par de arriba,
// `mutedForeground/background`. No hace falta ningún par nuevo (ver el
// reporte de la tarea 49-b).
// ---------------------------------------------------------------------------
const FIJOS: ParContraste[] = [
  {
    // Ronda 49 (QPS-241, grupo 3, decisión de Mauro): `#059669` daba 3,77
    // con blanco, abajo de 4,5 — se oscurece a `#047857`, que da ≈5,48
    // (calculado con la función `contraste` de este mismo archivo): ya
    // cumple, las dos excepciones salen. El `nombre` lleva el hex nuevo.
    // El cambio es SOLO de la app: el botón equivalente de la web sigue en
    // `bg-emerald-600` (`apps/web/app/favoritos/favoritos-list.tsx`), que es
    // este mismo `#059669`, porque los estilos de la web quedaron fuera del
    // alcance de la ronda. O sea que desde acá los dos verdes DIFIEREN a
    // propósito. Después del cambio, `#059669` no queda en ningún otro lugar
    // del código de producción de la app.
    nombre: 'blanco (botón de WhatsApp)/#047857',
    uso: 'texto',
    a: fijo('#ffffff'),
    b: fijo('#047857'),
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
    // Ronda 49 (QPS-241, grupo 1): `app/eliminar-cuenta.tsx` ya estaba en
    // `archivos` desde 46-q (el error de validación, en rojo, arriba del
    // formulario). Desde esta ronda este mismo par también cubre el texto
    // y el `ActivityIndicator` del botón "Eliminar mi cuenta para siempre"
    // cuando está HABILITADO (antes era blanco sobre `COLOR_ERROR`, un par
    // que dejó de existir en pantalla: ver el comentario de abajo, donde
    // estaban los dos FIJOS que se sacaron).
  },
  {
    nombre: '#f87171 (borde del aviso de error)/background',
    uso: 'componente',
    a: fijo('#f87171'),
    b: token('background'),
    archivos: ['components/PantallaRadar.tsx', 'app/eliminar-cuenta.tsx'],
    nota:
      "en PantallaRadar.tsx #f87171 es el borde del aviso (`estilos.aviso`), no el color de texto: " +
      'el encargo lo agrupaba con los otros 4 archivos como "texto de error", pero ahí es un componente. ' +
      'Ronda 49 (QPS-241, grupo 1): desde esta ronda también cubre el borde (`borderColor`, `estilos.boton`) ' +
      'del botón "Eliminar mi cuenta para siempre" cuando está habilitado.',
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
  // 46-q, punto 4 del encargo: acá vivían los dos FIJOS del botón "Eliminar
  // mi cuenta para siempre" (blanco sobre `COLOR_ERROR` habilitado, blanco
  // sobre `colores.border` deshabilitado). Ronda 49 (QPS-241, grupo 1): ese
  // par DEJÓ DE EXISTIR EN PANTALLA — el botón pasó de relleno a contorno y
  // ya no hay texto blanco ahí (ver el comentario de `app/eliminar-cuenta.tsx`
  // y el de los FIJOS "#f87171 (texto de error)/background",
  // "#f87171 (borde del aviso de error)/background" y el PAR
  // "mutedForeground/background", que son los que cubren el botón nuevo).
  // Los dos FIJOS de acá y sus tres excepciones (habilitado en los dos
  // esquemas, deshabilitado en claro) se sacan.
]

const TODOS: ParContraste[] = [...PARES, ...FIJOS]

// ---------------------------------------------------------------------------
// EXCEPCIONES: pares que hoy no llegan a su mínimo, con el ratio (dos
// decimales) y el motivo. Clave: `${nombre}::${esquema}`.
//
// El encargo original (46-q) decía "hoy son tres" (primary como texto en
// oscuro, sobre background y sobre card, y el blanco sobre #059669). Al
// calcular los FIJOS en el esquema claro aparecían otras cuatro: los colores
// decorativos de PantallaRadar (#f87171, #34d399, #f472b6) se eligieron
// mirando solo el fondo oscuro (ver sus comentarios en el código: "nunca
// leído de useColorScheme() — la app arranca siempre oscura") y nunca se
// probaron contra el fondo claro. No es que el plan estuviera mal en los
// números — los ratios que dio coinciden exactamente con los de acá—, sino
// en el conteo: contando también los FIJOS en claro eran siete pares, no
// tres (reportado en el informe de 46-q).
//
// Ronda 49 (QPS-241, decisión de Mauro sobre las 4 recomendaciones de ux-ui
// de la R46): grupos 1 a 3 cerrados, así que de las siete excepciones de
// 46-q quedan cuatro (los decorativos del Radar en claro, grupo 4, "quedan
// como están" hasta que exista el selector de tema). `primary` como texto
// sale de EXCEPCIONES porque sale de PARES como "texto" — pasa a
// "texto-grande" (ver el comentario de PARES), y ahí los dos ratios ya
// cumplen el mínimo de 3, sin necesitar excepción. El blanco sobre WhatsApp
// sale porque `#047857` ya cumple. El botón "Eliminar mi cuenta" no gana
// ninguna excepción nueva: los tres pares que lo cubren ahora
// (`#f87171 (texto de error)/background`, `#f87171 (borde del aviso de
// error)/background`, `mutedForeground/background`) ya cumplían su mínimo
// en los dos esquemas desde antes de esta ronda.
// ---------------------------------------------------------------------------
interface ExcepcionContraste {
  ratio: number
  motivo: string
}

const MOTIVO_FIJO_PENSADO_PARA_OSCURO =
  'Color decorativo fijo, elegido mirando solo el fondo oscuro (D1, la app arranca siempre oscura); decide Mauro.'

const EXCEPCIONES: Record<string, ExcepcionContraste> = {
  '#f87171 (texto de error)/background::claro': { ratio: 2.6, motivo: MOTIVO_FIJO_PENSADO_PARA_OSCURO },
  '#f87171 (borde del aviso de error)/background::claro': { ratio: 2.6, motivo: MOTIVO_FIJO_PENSADO_PARA_OSCURO },
  '#34d399 (texto del chip "Lugar")/background::claro': { ratio: 1.81, motivo: MOTIVO_FIJO_PENSADO_PARA_OSCURO },
  '#f472b6 (texto del chip "Instagram")/background::claro': { ratio: 2.49, motivo: MOTIVO_FIJO_PENSADO_PARA_OSCURO },
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
// de la ronda va a llevar: si el informe cambia, hay que actualizar esto (y
// viceversa).
//
// Ronda 49 (QPS-241): se sacan 'primary (texto)/background',
// 'primary (texto)/card', 'blanco (botón de WhatsApp)/#059669',
// 'blanco/#f87171 (botón "Eliminar mi cuenta", habilitado)' y
// 'blanco/border (botón "Eliminar mi cuenta", deshabilitado)' — los cinco
// dejaron de tener excepciones (ver el comentario de EXCEPCIONES). Quedan
// los cuatro decorativos del Radar en claro (grupo 4, sin cambios).
const PARES_DEL_INFORME_DE_LA_RONDA = [
  '#f87171 (texto de error)/background',
  '#f87171 (borde del aviso de error)/background',
  '#34d399 (texto del chip "Lugar")/background',
  '#f472b6 (texto del chip "Instagram")/background',
]

describe('EXCEPCIONES: los nombres (sin esquema) están todos en la lista que el informe de la ronda le lleva a Mauro', () => {
  const nombresDeExcepciones = new Set([...Object.keys(EXCEPCIONES)].map((clave) => clave.split('::')[0]))
  it.each([...nombresDeExcepciones])('%s', (nombre) => {
    expect(PARES_DEL_INFORME_DE_LA_RONDA, `"${nombre}" está en EXCEPCIONES pero no en PARES_DEL_INFORME_DE_LA_RONDA — sumarlo acá (y al informe)`).toContain(nombre)
  })
})
