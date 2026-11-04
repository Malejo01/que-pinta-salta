// Q6-6 · Accesibilidad de lo nuevo de Q5 y Q6 en la app (Lugares para chicos,
// Lugares que seguís, Idioma, Cuenta, Contraseña y Eliminar cuenta). Partes:
//   1. Lógica pura, importada de verdad: el conteo anunciable de Lugares para
//      chicos, el anunciador de avisos (errores y confirmaciones), el anuncio
//      del idioma nuevo, la etiqueta de la tarjeta de un lugar y el idioma del
//      contenido que no se traduce.
//   2. Detectores sobre el fuente sin comentarios (no hay runner de React
//      Native): quién usa cada cosa, botones con ruedita con nombre, contenido
//      en castellano marcado, letra al 200 %. Cada detector tiene su rotura en
//      memoria, para que no pase en vacío.
//   3. Contraste WCAG 2.x de los pares de colores de esas pantallas, en claro
//      y oscuro, con una luminancia calculada ACÁ (no la de lib/accesibilidad,
//      que se usa solo para cruzar el resultado).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { contraste as contrasteDeLaApp } from '../lib/accesibilidad'
import { crearAnunciadorDeAviso } from '../lib/anunciar-aviso'
import { crearAnunciadorDeConteo, DEMORA_TOQUE_ANDROID_MS, estadoAnunciableLugaresChicos } from '../lib/anunciar-conteo'
import { bordeChipInactivo } from '../lib/colores'
import { anuncioCambioDeIdioma } from '../lib/i18n/textos'
import { etiquetaTarjetaLugar, langContenidoLugar, SIN_FILTROS_LUGARES } from '../lib/lugares-chicos'
import { COLORES_CLARO, COLORES_OSCURO, type ColoresQPS } from '../lib/theme'
import type { LugarChicosMapa } from '@qps/core/mapa/lugares-chicos'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const leer = (...partes: string[]) => readFileSync(join(MOBILE_ROOT, ...partes), 'utf8').replace(/\r\n/g, '\n')
const fuente = (...partes: string[]) => quitarComentarios(leer(...partes))

// ---------------------------------------------------------------------------
// 1. Lógica pura
// ---------------------------------------------------------------------------

describe('estadoAnunciableLugaresChicos', () => {
  it('el conteo en el idioma de la app; con barrio, el orden va de detalle', () => {
    const es = estadoAnunciableLugaresChicos({ filtros: SIN_FILTROS_LUGARES, barrio: null, cantidad: 3, idioma: 'es' })
    expect(es.conteo).toBe('3 lugares')
    expect(es.titulo).toBeNull()
    const en = estadoAnunciableLugaresChicos({ filtros: SIN_FILTROS_LUGARES, barrio: 'Tres Cerritos', cantidad: 1, idioma: 'en' })
    expect(en.conteo).toBe('1 place')
    expect(en.titulo).toBe('Sorted by distance from Tres Cerritos')
  })

  it('cada filtro y el barrio cambian la clave (otro resultado, aunque el número sea el mismo)', () => {
    const base = estadoAnunciableLugaresChicos({ filtros: SIN_FILTROS_LUGARES, barrio: null, cantidad: 3 })
    const claves = new Set([
      base.clave,
      estadoAnunciableLugaresChicos({ filtros: { ...SIN_FILTROS_LUGARES, tipo: 'plaza_juegos' }, barrio: null, cantidad: 3 }).clave,
      estadoAnunciableLugaresChicos({ filtros: { ...SIN_FILTROS_LUGARES, gratis: true }, barrio: null, cantidad: 3 }).clave,
      estadoAnunciableLugaresChicos({ filtros: { ...SIN_FILTROS_LUGARES, abiertoAhora: true }, barrio: null, cantidad: 3 }).clave,
      estadoAnunciableLugaresChicos({ filtros: SIN_FILTROS_LUGARES, barrio: 'Centro', cantidad: 3 }).clave,
    ])
    expect(claves.size).toBe(5)
  })

  describe('con el anunciador de siempre, en Android', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('prender «Gratis» con el mismo número se anuncia, a los 400 ms (después del «Seleccionado»)', () => {
      const dichos: string[] = []
      const a = crearAnunciadorDeConteo({ anunciar: (t) => dichos.push(t), reloj: { setTimeout, clearTimeout }, plataforma: 'android' })
      a.observar(null)
      a.observar(estadoAnunciableLugaresChicos({ filtros: SIN_FILTROS_LUGARES, barrio: null, cantidad: 3 }))
      vi.advanceTimersByTime(DEMORA_TOQUE_ANDROID_MS)
      expect(dichos).toEqual(['3 lugares'])
      a.observar(estadoAnunciableLugaresChicos({ filtros: { ...SIN_FILTROS_LUGARES, gratis: true }, barrio: null, cantidad: 3 }))
      vi.advanceTimersByTime(DEMORA_TOQUE_ANDROID_MS - 1)
      expect(dichos).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(dichos).toEqual(['3 lugares', '3 lugares'])
    })
  })
})

describe('crearAnunciadorDeAviso', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function armar(plataforma: string) {
    const dichos: string[] = []
    const a = crearAnunciadorDeAviso({ anunciar: (t) => dichos.push(t), reloj: { setTimeout, clearTimeout }, plataforma })
    return { a, dichos }
  }

  it('iOS: al aparecer, al toque; el mismo texto en otro render no se repite', () => {
    const { a, dichos } = armar('ios')
    a.observar(null)
    a.observar('Email o contraseña incorrectos.')
    a.observar('Email o contraseña incorrectos.')
    expect(dichos).toEqual(['Email o contraseña incorrectos.'])
  })

  it('Android: espera 400 ms; un texto nuevo dentro de la espera reemplaza al anterior', () => {
    const { a, dichos } = armar('android')
    a.observar('Primero')
    vi.advanceTimersByTime(100)
    a.observar('Segundo')
    vi.advanceTimersByTime(DEMORA_TOQUE_ANDROID_MS - 1)
    expect(dichos).toEqual([])
    vi.advanceTimersByTime(1)
    expect(dichos).toEqual(['Segundo'])
  })

  it('limpiar el error y que vuelva el mismo (otro intento) se vuelve a decir', () => {
    const { a, dichos } = armar('ios')
    a.observar('Sin conexión.')
    a.observar(null)
    a.observar('Sin conexión.')
    expect(dichos).toEqual(['Sin conexión.', 'Sin conexión.'])
  })

  it('volver a null, o un texto vacío, no dice nada y descarta lo pendiente', () => {
    const { a, dichos } = armar('android')
    a.observar('Algo')
    a.observar('   ')
    vi.advanceTimersByTime(DEMORA_TOQUE_ANDROID_MS * 2)
    expect(dichos).toEqual([])
  })

  it('cancelar (desmontar) descarta lo pendiente', () => {
    const { a, dichos } = armar('android')
    a.observar('Algo')
    a.cancelar()
    vi.advanceTimersByTime(DEMORA_TOQUE_ANDROID_MS * 2)
    expect(dichos).toEqual([])
  })
})

describe('anuncioCambioDeIdioma: en el idioma NUEVO', () => {
  it('pasar a inglés se dice en inglés; volver a castellano, en castellano', () => {
    expect(anuncioCambioDeIdioma('en')).toBe('Language: English')
    expect(anuncioCambioDeIdioma('es')).toBe('Idioma: Español')
  })
  it('«Automático» en el idioma del teléfono', () => {
    expect(anuncioCambioDeIdioma('auto', 'en-US')).toBe('Language: Automatic')
    expect(anuncioCambioDeIdioma('auto', 'es-AR')).toBe('Idioma: Automático')
  })
})

describe('etiquetaTarjetaLugar: lee todo lo que se ve', () => {
  const lugar = {
    venueId: 'v1',
    nombre: 'Plaza Alvarado',
    tipo: 'plaza_juegos',
    acceso: 'gratis',
    edadMin: 3,
    edadMax: 10,
    horarios: { version: 1, siempre_abierto: true, semana: {} },
    metros: null,
  } as unknown as LugarChicosMapa & { metros: number | null }
  const ahora = new Date('2026-11-04T15:00:00Z')

  it('castellano: nombre, tipo, horario de hoy, acceso y edades (antes faltaban las edades)', () => {
    const e = etiquetaTarjetaLugar(lugar, ahora, 'es')
    expect(e.startsWith('Plaza Alvarado. ')).toBe(true)
    expect(e).toContain('De 3 a 10 años')
    expect(e).toContain('Gratis')
  })
  it('inglés', () => {
    expect(etiquetaTarjetaLugar(lugar, ahora, 'en')).toContain('Ages 3 to 10')
  })
})

describe('langContenidoLugar', () => {
  it('es-AR con la app en inglés; nada en castellano', () => {
    expect(langContenidoLugar('en')).toBe('es-AR')
    expect(langContenidoLugar('es')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 2. Detectores
// ---------------------------------------------------------------------------

/** El hook de avisos: habla por `anunciar`, con la plataforma y el reloj reales, y limpia al desmontar. */
export function violacionesHookAviso(c: string): string[] {
  const v: string[] = []
  if (!/import \{ anunciar \} from '@\/lib\/anunciar'/.test(c)) v.push('no habla a través de anunciar')
  if (/AccessibilityInfo/.test(c)) v.push('usa AccessibilityInfo directo')
  if (!/plataforma: Platform\.OS/.test(c)) v.push('no le pasa la plataforma al anunciador')
  if (!/useEffect\(\(\) => \(\) => anunciador\.cancelar\(\), \[anunciador\]\)/.test(c)) v.push('no cancela al desmontar')
  return v
}

describe('detector: lib/anunciar-aviso-hook.ts', () => {
  const real = fuente('lib', 'anunciar-aviso-hook.ts')
  it('el fuente real no tiene violaciones', () => expect(violacionesHookAviso(real)).toEqual([]))
  it.each([
    ['sin cancelar', (s: string) => s.replace('useEffect(() => () => anunciador.cancelar(), [anunciador])', ''), 'no cancela al desmontar'],
    ['AccessibilityInfo', (s: string) => `${s}\nAccessibilityInfo.announceForAccessibility('x')`, 'usa AccessibilityInfo directo'],
    ['sin plataforma', (s: string) => s.replace('plataforma: Platform.OS', "plataforma: 'ios'"), 'no le pasa la plataforma al anunciador'],
  ])('rotura en memoria: %s -> detectada', (_n, romper, esperada) => {
    const roto = romper(real)
    expect(roto).not.toBe(real)
    expect(violacionesHookAviso(roto)).toContain(esperada)
  })
})

/** Las pantallas que muestran un error después de un toque lo anuncian con el hook. */
const PANTALLAS_CON_AVISO: { ruta: string[]; llamada: RegExp }[] = [
  { ruta: ['app', '(tabs)', 'cuenta.tsx'], llamada: /useAnunciarAviso\(\s*error\s*\?\s*t\.errores\.traducir\(error\)/ },
  { ruta: ['app', 'contrasena.tsx'], llamada: /useAnunciarAviso\(error \? t\.errores\.traducir\(error\) : guardada \? tc\.guardada : null\)/ },
  { ruta: ['app', 'eliminar-cuenta.tsx'], llamada: /useAnunciarAviso\(error \? textos\.errores\.traducir\(error\) : null\)/ },
  { ruta: ['components', 'SelectorIdioma.tsx'], llamada: /useAnunciarAviso\(anuncio\)/ },
]

export function violacionesAviso(c: string, llamada: RegExp): string[] {
  const v: string[] = []
  if (!/import \{ useAnunciarAviso \} from '@\/lib\/anunciar-aviso-hook'/.test(c)) v.push('no importa useAnunciarAviso')
  if (!llamada.test(c)) v.push('no anuncia su aviso con useAnunciarAviso')
  if (/\banunciar\(/.test(c)) v.push('anuncia a mano en el toque (sin la espera de Android)')
  return v
}

describe('detector: los avisos de Cuenta, Contraseña, Eliminar cuenta e Idioma se anuncian', () => {
  for (const { ruta, llamada } of PANTALLAS_CON_AVISO) {
    const nombre = ruta.join('/')
    const real = fuente(...ruta)
    it(`${nombre}: el fuente real no tiene violaciones`, () => expect(violacionesAviso(real, llamada)).toEqual([]))
    it(`${nombre}: rotura en memoria: sin la llamada -> detectada`, () => {
      const roto = real.replace(/useAnunciarAviso\(/, 'void (')
      expect(violacionesAviso(roto, llamada)).toContain('no anuncia su aviso con useAnunciarAviso')
    })
  }

  it('SelectorIdioma arma el anuncio en el idioma nuevo, no con el diccionario del render anterior', () => {
    const c = fuente('components', 'SelectorIdioma.tsx')
    expect(c).toMatch(/setAnuncio\(anuncioCambioDeIdioma\(o\.valor\)\)/)
    expect(c).not.toMatch(/t\.idioma\.cambiadoA\(/)
  })

  it('Lugares para chicos ya no anuncia a mano (lo hace useAnunciarConteo, ver tests/anunciar-conteos.test.ts)', () => {
    expect(fuente('app', 'lugares-chicos', 'index.tsx')).not.toMatch(/\banunciar\(/)
  })
})

/**
 * Un `Pressable` que muestra un `ActivityIndicator` en lugar de su texto
 * necesita `accessibilityLabel`: si no, mientras carga TalkBack dice solo
 * «botón, ocupado». Recorre las aperturas de `<Pressable` contando llaves.
 */
export function pressablesConRuedaSinNombre(c: string): number {
  let faltan = 0
  const re = /<Pressable\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(c))) {
    let prof = 0
    let i = m.index
    for (; i < c.length; i++) {
      if (c[i] === '{') prof++
      else if (c[i] === '}') prof--
      else if (c[i] === '>' && prof <= 0) break
    }
    const apertura = c.slice(m.index, i + 1)
    const cierre = c.indexOf('</Pressable>', i)
    const cuerpo = cierre === -1 ? '' : c.slice(i + 1, cierre)
    if (/<ActivityIndicator\b/.test(cuerpo) && !/accessibilityLabel=/.test(apertura)) faltan++
  }
  return faltan
}

describe('detector: botones con ruedita tienen nombre (Cuenta, Contraseña, Eliminar cuenta)', () => {
  it.each([
    [['app', '(tabs)', 'cuenta.tsx']],
    [['app', 'contrasena.tsx']],
    [['app', 'eliminar-cuenta.tsx']],
  ])('%s', (ruta) => {
    expect(pressablesConRuedaSinNombre(fuente(...ruta))).toBe(0)
  })
  it('rotura en memoria: sacar el nombre de «Entrar» -> detectada', () => {
    const roto = fuente('app', '(tabs)', 'cuenta.tsx').replace('accessibilityLabel={tc.entrar}', '')
    expect(pressablesConRuedaSinNombre(roto)).toBe(1)
  })
  it('eliminar-cuenta: «ocupado» mientras borra', () => {
    expect(fuente('app', 'eliminar-cuenta.tsx')).toMatch(/accessibilityState=\{\{ busy: enviando \}\}/)
  })
})

describe('detector: la ficha de un lugar marca lo que queda en castellano', () => {
  const c = fuente('app', 'lugares-chicos', '[id].tsx')
  it('dirección, descripción y nota de horarios con accessibilityLanguage={langContenido}', () => {
    expect(c).toMatch(/const langContenido = langContenidoLugar\(idioma\)/)
    expect(c.match(/accessibilityLanguage=\{langContenido\}/g)?.length ?? 0).toBe(3)
    expect(c).toMatch(/<Texto tono="secundario" accessibilityLanguage=\{langContenido\}>\s*\{lugar\.direccion\}/)
    expect(c).toMatch(/<Texto accessibilityLanguage=\{langContenido\}>\s*\{lugar\.descripcion\}/)
    expect(c).toMatch(/accessibilityLanguage=\{langContenido\}>\s*\{lugar\.horarios\.nota\}/)
  })
  it('la descripción en inglés lleva «(in Spanish)», como la ficha de un evento', () => {
    expect(c).toMatch(/\{langContenido \? ` \$\{textos\.ficha\.contenidoEnCastellano\}` : ''\}/)
  })
})

describe('detector: letra al 200 % en Lugares para chicos', () => {
  it('las franjas de horario y el botón del barrio envuelven (flexShrink), no se salen', () => {
    const ficha = fuente('app', 'lugares-chicos', '[id].tsx')
    expect(ficha).toMatch(/textoHorario: \{ flexShrink: 1/)
    expect(ficha).toMatch(/style=\{estilos\.textoHorario\}/)
    const lista = fuente('app', 'lugares-chicos', 'index.tsx')
    expect(lista).toMatch(/textoBarrio: \{ flexShrink: 1 \}/)
    expect(lista).toMatch(/maxWidth: '100%'/)
  })
  it('la tarjeta del lugar usa etiquetaTarjetaLugar (con las edades)', () => {
    expect(fuente('app', 'lugares-chicos', 'index.tsx')).toMatch(/accessibilityLabel=\{etiquetaTarjetaLugar\(item, ahora, idioma\)\}/)
  })
})

// ---------------------------------------------------------------------------
// 3. Contraste (WCAG 2.x), luminancia calculada acá
// ---------------------------------------------------------------------------

function canal(c8: number): number {
  const c = c8 / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
function luminancia(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) throw new Error(`hex inválido: ${hex}`)
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => canal(parseInt(x, 16)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function razon(a: string, b: string): number {
  const [la, lb] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (la + 0.05) / (lb + 0.05)
}

type Par = { nombre: string; minimo: 4.5 | 3; a: (c: ColoresQPS) => string; b: (c: ColoresQPS) => string }

/** Los pares de las pantallas nuevas de Q5/Q6 (texto 4,5; íconos y bordes de controles 3). */
const PARES_Q6: Par[] = [
  { nombre: 'chip prendido: texto y tilde (primaryForeground) / primary', minimo: 4.5, a: (c) => c.primaryForeground, b: (c) => c.primary },
  { nombre: 'chip apagado: texto (foreground) / card', minimo: 4.5, a: (c) => c.foreground, b: (c) => c.card },
  { nombre: 'chip apagado: borde / background (lo que rodea al chip)', minimo: 3, a: (c) => bordeChipInactivo(c), b: (c) => c.background },
  { nombre: 'chip apagado: borde / card (el relleno del chip)', minimo: 3, a: (c) => bordeChipInactivo(c), b: (c) => c.card },
  { nombre: 'chip prendido: relleno primary / background', minimo: 3, a: (c) => c.primary, b: (c) => c.background },
  { nombre: 'tarjeta de lugar: texto secundario (mutedForeground) / card', minimo: 4.5, a: (c) => c.mutedForeground, b: (c) => c.card },
  { nombre: 'notas y leyenda (mutedForeground, 12–13 dp) / background', minimo: 4.5, a: (c) => c.mutedForeground, b: (c) => c.background },
  { nombre: '«Cómo llegar»: texto e ícono / primary', minimo: 4.5, a: (c) => c.primaryForeground, b: (c) => c.primary },
  { nombre: 'Lugares que seguís: ícono MapPin (primary) / card', minimo: 3, a: (c) => c.primary, b: (c) => c.card },
  { nombre: 'Lugares que seguís: ícono ExternalLink (mutedForeground) / card', minimo: 3, a: (c) => c.mutedForeground, b: (c) => c.card },
  { nombre: 'Acceso «Lugares para chicos»: ícono (foreground) / card', minimo: 3, a: (c) => c.foreground, b: (c) => c.card },
]

describe.each([
  ['claro', COLORES_CLARO],
  ['oscuro', COLORES_OSCURO],
] as const)('contraste de lo nuevo de Q5/Q6, esquema %s', (_esquema, colores) => {
  it.each(PARES_Q6.map((p) => [p.nombre, p] as const))('%s', (_nombre, par) => {
    const r = razon(par.a(colores), par.b(colores))
    // La misma cuenta que lib/accesibilidad.ts: si se separan, alguna de las dos está mal.
    expect(Math.abs(r - contrasteDeLaApp(par.a(colores), par.b(colores)))).toBeLessThan(1e-9)
    expect(r, `${par.nombre}: ${r.toFixed(2)}`).toBeGreaterThanOrEqual(par.minimo)
  })
})

describe('la luminancia de este test (anclas)', () => {
  it('negro/blanco = 21; gris medio ~ 0,216', () => {
    expect(razon('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(luminancia('#808080')).toBeCloseTo(0.2159, 3)
  })
})
