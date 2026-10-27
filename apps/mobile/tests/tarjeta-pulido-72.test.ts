// R72, 72-q (QPS-362): pulido de la tarjeta de evento. Detectores sobre el
// fuente (sin comentarios) de TarjetaEvento, BotonCompartir y BotonFavorito, y
// cuentas con las constantes puras de lib/accesibilidad (los componentes
// importan react-native: no se montan). No fijan espacios, saltos de línea ni el
// orden de las props.
//
// Cómo se pone en rojo:
//   - TarjetaEvento: mover <InsigniaDestacado/> adentro del View de `estilos.arriba`     -> "insignia dentro de arriba"
//   - TarjetaEvento: `TOP_INSIGNIA = MARGEN_ARRIBA` (bajo los botones no queda sitio)      -> "TOP_INSIGNIA < …"
//   - TarjetaEvento: `accionesArriba` con `padding: 0` o sin `top: 0`/`right: 0`           -> "padding < slop"
//   - TarjetaEvento: sacar `conVecino={hayCompartir}` del BotonFavorito                    -> "conVecino"
//   - TarjetaEvento: sacar `, destacado` / el precio / `fechas más` de la etiqueta         -> "etiqueta"
//   - BotonCompartir: `accessibilityLabel="Compartir"` pelado                              -> "Compartir ${titulo}"
//   - BotonFavorito: hitSlopBotonAccion que ignore `conVecino` (siempre left/right 3)      -> "48x48 sin vecino"
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import {
  AREA_TACTIL_MINIMA,
  TARJETA_GAP_ACCIONES,
  TARJETA_MARGEN,
  TARJETA_TAMANIO_ACCION,
  hitSlopPara,
  type HitSlop,
} from '../lib/accesibilidad'

function leer(ruta: string): string {
  return readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8')
}

/** Desde el `{` en `desde`, el bloque hasta su `}` par (con las llaves). */
function bloque(texto: string, desde: number): string {
  let nivel = 0
  for (let i = desde; i < texto.length; i++) {
    if (texto[i] === '{') nivel++
    else if (texto[i] === '}') {
      nivel--
      if (nivel === 0) return texto.slice(desde, i + 1)
    }
  }
  throw new Error('Llave sin cerrar')
}

// ---------------------------------------------------------------------------
// Escáner mínimo de etiquetas JSX (View / InsigniaDestacado)
// ---------------------------------------------------------------------------
interface Etiqueta {
  nombre: string
  atributos: string
  padre: number
}
const NOMBRES = ['View', 'InsigniaDestacado', 'Pressable']
const APERTURA = new RegExp(`<(${NOMBRES.join('|')})(?![A-Za-z0-9_])`, 'g')
const CIERRE = new RegExp(`</(${NOMBRES.join('|')})\\s*>`, 'g')

function finDeEtiqueta(texto: string, desde: number): number {
  let llaves = 0
  let comilla: string | null = null
  for (let i = desde; i < texto.length; i++) {
    const c = texto[i]
    if (comilla) {
      if (c === comilla && texto[i - 1] !== '\\') comilla = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') comilla = c
    else if (c === '{') llaves++
    else if (c === '}') llaves--
    else if (c === '>' && llaves === 0) return i
  }
  return -1
}

function escanear(texto: string): Etiqueta[] {
  const eventos: Array<{ pos: number; abre: boolean; nombre: string; largo: number }> = []
  for (const m of texto.matchAll(APERTURA)) eventos.push({ pos: m.index!, abre: true, nombre: m[1], largo: m[0].length })
  for (const m of texto.matchAll(CIERRE)) eventos.push({ pos: m.index!, abre: false, nombre: m[1], largo: m[0].length })
  eventos.sort((a, b) => a.pos - b.pos)
  const et: Etiqueta[] = []
  const pila: number[] = []
  for (const e of eventos) {
    if (e.abre) {
      const fin = finDeEtiqueta(texto, e.pos + e.largo)
      if (fin < 0) throw new Error(`<${e.nombre} sin cerrar`)
      et.push({ nombre: e.nombre, atributos: texto.slice(e.pos + e.largo, fin), padre: pila.length ? pila[pila.length - 1] : -1 })
      if (texto[fin - 1] !== '/') pila.push(et.length - 1)
    } else {
      const arriba = pila.pop()
      if (arriba === undefined || et[arriba].nombre !== e.nombre) throw new Error(`</${e.nombre}> no coincide`)
    }
  }
  if (pila.length) throw new Error('Etiquetas sin cerrar')
  return et
}

function ancestros(et: Etiqueta[], i: number): Etiqueta[] {
  const out: Etiqueta[] = []
  for (let p = et[i].padre; p >= 0; p = et[p].padre) out.push(et[p])
  return out
}

// ---------------------------------------------------------------------------
// Resolución de expresiones numéricas simples (identificadores y sumas)
// ---------------------------------------------------------------------------
const CONSTANTES: Record<string, number> = {
  TARJETA_TAMANIO_ACCION,
  TARJETA_GAP_ACCIONES,
  TARJETA_MARGEN,
}

/** `const X = TARJETA_Y` y `const X = TARJETA_Y + 4 + …` -> valores de X. */
function constantesDelFuente(texto: string): Record<string, number> {
  const vars: Record<string, number> = { ...CONSTANTES }
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    for (const m of texto.matchAll(/\bconst\s+([A-Z_]+)\s*=\s*([A-Za-z0-9_+\s]+?)\s*(?:\n|;|$)/g)) {
      const v = sumar(m[2], vars)
      if (v !== null) vars[m[1]] = v
    }
  }
  return vars
}

function sumar(expr: string, vars: Record<string, number>): number | null {
  let total = 0
  for (const parte of expr.split('+').map((s) => s.trim())) {
    if (/^\d+$/.test(parte)) total += Number(parte)
    else if (parte in vars) total += vars[parte]
    else return null
  }
  return total
}

function valorDe(obj: string, clave: string, vars: Record<string, number>): number | null {
  const m = new RegExp(`\\b${clave}\\s*:\\s*([A-Za-z0-9_+\\s]+?)\\s*(?:,|\\}|$)`).exec(obj)
  return m ? sumar(m[1], vars) : null
}

function maxSlop(s: HitSlop): number {
  return Math.max(s.top, s.bottom, s.left, s.right)
}

// ---------------------------------------------------------------------------
// TarjetaEvento
// ---------------------------------------------------------------------------
function problemasTarjeta(fuenteCruda: string): string[] {
  const texto = quitarComentarios(fuenteCruda)
  const out: string[] = []
  const vars = constantesDelFuente(texto)

  // 1. La insignia en su fila, fuera de `estilos.arriba`.
  const et = escanear(texto)
  const iInsignia = et.findIndex((e) => e.nombre === 'InsigniaDestacado')
  if (iInsignia < 0) out.push('no hay <InsigniaDestacado')
  else {
    const arriba = ancestros(et, iInsignia)
    if (arriba.some((a) => /\bestilos\.arriba\b/.test(a.atributos))) out.push('insignia dentro de arriba (se trunca en 2 columnas)')
    const view = arriba.find((a) => a.nombre === 'View')
    if (!view || !/\bestilos\.filaInsignia\b/.test(view.atributos)) out.push('la insignia no está en su View estilos.filaInsignia')
  }

  // 2. Fila de la insignia: debajo de donde terminan los botones.
  const topInsignia = vars.TOP_INSIGNIA
  if (topInsignia === undefined) out.push('no se pudo resolver TOP_INSIGNIA')
  else if (topInsignia < TARJETA_MARGEN + TARJETA_TAMANIO_ACCION) {
    out.push(`TOP_INSIGNIA (${topInsignia}) < ${TARJETA_MARGEN + TARJETA_TAMANIO_ACCION}: queda bajo los botones`)
  }
  const fila = /\bfilaInsignia\s*:\s*\{/.exec(texto)
  if (!fila) out.push('no hay estilos.filaInsignia')
  else if (!/\btop\s*:\s*TOP_INSIGNIA\b/.test(bloque(texto, fila.index + fila[0].length - 1))) out.push('filaInsignia no usa top: TOP_INSIGNIA')

  // 3. El contenedor de las acciones abarca el hitSlop.
  const acc = /\baccionesArriba\s*:\s*\{/.exec(texto)
  if (!acc) out.push('no hay estilos.accionesArriba')
  else {
    const obj = bloque(texto, acc.index + acc[0].length - 1)
    const slop = maxSlop(hitSlopPara(TARJETA_TAMANIO_ACCION))
    const padding = valorDe(obj, 'padding', vars)
    if (padding === null) out.push('accionesArriba sin padding')
    else if (padding < slop) out.push(`padding (${padding}) < slop máximo (${slop}): el hitSlop sobresale del contenedor`)
    if (valorDe(obj, 'top', vars) !== 0) out.push('accionesArriba sin top: 0')
    if (valorDe(obj, 'right', vars) !== 0) out.push('accionesArriba sin right: 0')
  }

  // 4. El corazón sabe si tiene vecino.
  const fav = /<BotonFavorito\b[\s\S]*?\/>/.exec(texto)
  if (!fav) out.push('no hay <BotonFavorito')
  else if (!/\bconVecino\s*=\s*\{\s*hayCompartir\s*\}/.test(fav[0])) out.push('BotonFavorito sin conVecino={hayCompartir}')

  // 5. La etiqueta accesible suma destacado, precio y fechas más.
  const iExtras = texto.search(/\bconst\s+extras\b/)
  const iEtiqueta = texto.search(/\bconst\s+etiqueta\b/)
  const fin = texto.indexOf('return (', iEtiqueta)
  const calculo = iExtras >= 0 && iEtiqueta > iExtras && fin > iEtiqueta ? texto.slice(iExtras, fin) : ''
  if (!calculo) out.push('etiqueta: no se encontró el cálculo (extras y etiqueta)')
  else {
    const extras = texto.slice(iExtras, iEtiqueta)
    if (!/destacado/.test(extras) || !/\bisFeatured\b/.test(extras)) out.push('etiqueta: no menciona destacado')
    if (!/\bprecio\b/.test(extras)) out.push('etiqueta: no menciona el precio')
    if (!/fechas? más/.test(extras) || !/\botrasFechas\b/.test(extras)) out.push('etiqueta: no menciona las fechas más')
    // Las películas en cartel (rama aparte) también dicen destacado y precio.
    const desde = calculo.indexOf('en cartel')
    const hasta = calculo.indexOf('evento.venue', desde)
    const cartel = desde >= 0 && hasta > desde ? calculo.slice(desde, hasta) : ''
    if (!/destacado/.test(cartel) || !/\bprecio\b/.test(cartel)) out.push('etiqueta: la rama en cartel no dice destacado/precio')
  }
  const tarjeta = et.find((e) => e.nombre === 'Pressable' && /\bonPress\b/.test(e.atributos))
  if (!tarjeta || !/accessibilityLabel\s*=\s*\{\s*etiqueta\s*\}/.test(tarjeta.atributos)) out.push('el Pressable no usa accessibilityLabel={etiqueta}')
  return out
}

const TARJETA_VALIDA = `
  import { TARJETA_GAP_ACCIONES, TARJETA_MARGEN, TARJETA_TAMANIO_ACCION } from '@/lib/accesibilidad'
  const TAMANIO_ACCION = TARJETA_TAMANIO_ACCION
  const MARGEN_ARRIBA = TARJETA_MARGEN
  const TOP_INSIGNIA = MARGEN_ARRIBA + TAMANIO_ACCION + 4
  export function TarjetaEvento() {
    const hayCompartir = esEventoReal(evento)
    // const extras = 'destacado precio fechas más'
    const extras =
      (evento.isFeatured ? ', destacado' : '') +
      (precio ? \`, \${precio}\` : '') +
      (otrasFechas > 0 ? \`, \${otrasFechas} fechas más\` : '')
    const etiqueta = evento.isCinemaMovie
      ? \`\${evento.title}, en cartel\${evento.isFeatured ? ', destacado' : ''}\${precio ? \`, \${precio}\` : ''}\`
      : \`\${evento.title}, en \${evento.venue}\${extras}\`
    return (
      <View>
        <Pressable onPress={() => router.push(ruta)} accessibilityRole="button" accessibilityLabel={etiqueta} style={estilos.tarjeta}>
          <View style={[estilos.arriba, { right: derecha }]} pointerEvents="none">
            <View style={estilos.badge}><Text>x</Text></View>
          </View>
          <View style={estilos.filaInsignia} pointerEvents="none">
            <InsigniaDestacado visible={evento.isFeatured} />
          </View>
        </Pressable>
        <View style={estilos.accionesArriba} pointerEvents="box-none">
          <BotonCompartir eventId="x" tamanio={TAMANIO_ACCION} />
          <BotonFavorito objetivo={o} tamanio={TAMANIO_ACCION} conVecino={hayCompartir} />
        </View>
      </View>
    )
  }
  const estilos = StyleSheet.create({
    arriba: { position: 'absolute', left: MARGEN_ARRIBA, top: MARGEN_ARRIBA },
    filaInsignia: { position: 'absolute', left: MARGEN_ARRIBA, right: MARGEN_ARRIBA, top: TOP_INSIGNIA },
    accionesArriba: { position: 'absolute', top: 0, right: 0, padding: MARGEN_ARRIBA, flexDirection: 'row', gap: 6 },
  })
`

describe('components/TarjetaEvento.tsx (real)', () => {
  const fuente = leer('../components/TarjetaEvento.tsx')

  it('sin problemas', () => {
    expect(problemasTarjeta(fuente)).toEqual([])
  })

  it('TOP_INSIGNIA queda por debajo de donde terminan los botones', () => {
    const vars = constantesDelFuente(quitarComentarios(fuente))
    expect(vars.TOP_INSIGNIA).toBeGreaterThanOrEqual(TARJETA_MARGEN + TARJETA_TAMANIO_ACCION)
  })

  it('el padding de accionesArriba cubre el slop máximo y el área del corazón solo cabe (8 + 32 + 8 = 48)', () => {
    const slop = maxSlop(hitSlopPara(TARJETA_TAMANIO_ACCION))
    expect(TARJETA_MARGEN).toBeGreaterThanOrEqual(slop)
    expect(TARJETA_MARGEN + TARJETA_TAMANIO_ACCION + TARJETA_MARGEN).toBe(AREA_TACTIL_MINIMA)
  })

  it('las medidas se toman de lib/accesibilidad, sin literales repetidos', () => {
    const texto = quitarComentarios(fuente)
    expect(texto).toMatch(/import\s*\{[^}]*\bTARJETA_TAMANIO_ACCION\b[^}]*\}\s*from\s*['"]@\/lib\/accesibilidad['"]/)
    expect(texto).not.toMatch(/tamanio\s*=\s*\{\s*32\s*\}/)
  })
})

describe('detector de TarjetaEvento (fixtures inventados)', () => {
  it('acepta el válido (y no lee comentarios)', () => {
    expect(problemasTarjeta(TARJETA_VALIDA)).toEqual([])
  })

  it('marca la insignia dentro de estilos.arriba', () => {
    const f = TARJETA_VALIDA.replace(
      `<View style={estilos.badge}><Text>x</Text></View>`,
      `<View style={estilos.badge}><Text>x</Text></View><InsigniaDestacado visible={evento.isFeatured} />`,
    ).replace(
      `<View style={estilos.filaInsignia} pointerEvents="none">
            <InsigniaDestacado visible={evento.isFeatured} />
          </View>`,
      '',
    )
    const p = problemasTarjeta(f)
    expect(p.some((x) => x.includes('dentro de arriba'))).toBe(true)
  })

  it('marca TOP_INSIGNIA que no pasa los botones', () => {
    const p = problemasTarjeta(TARJETA_VALIDA.replace('MARGEN_ARRIBA + TAMANIO_ACCION + 4', 'MARGEN_ARRIBA + 4'))
    expect(p.some((x) => x.startsWith('TOP_INSIGNIA'))).toBe(true)
  })

  it('marca un padding menor al slop y los anclajes que faltan', () => {
    const chico = problemasTarjeta(TARJETA_VALIDA.replace('padding: MARGEN_ARRIBA', 'padding: 4'))
    expect(chico.some((x) => x.startsWith('padding'))).toBe(true)
    const sinAnclas = problemasTarjeta(TARJETA_VALIDA.replace('top: 0, right: 0, ', ''))
    expect(sinAnclas.some((x) => x.includes('top: 0'))).toBe(true)
    expect(sinAnclas.some((x) => x.includes('right: 0'))).toBe(true)
  })

  it('marca el corazón sin conVecino={hayCompartir}', () => {
    const p = problemasTarjeta(TARJETA_VALIDA.replace(' conVecino={hayCompartir}', ''))
    expect(p.some((x) => x.includes('conVecino'))).toBe(true)
  })

  it('marca la etiqueta sin destacado, sin precio o sin fechas más', () => {
    const sinDestacadoEnExtras = TARJETA_VALIDA.replace(`(evento.isFeatured ? ', destacado' : '') +`, '')
    expect(problemasTarjeta(sinDestacadoEnExtras).some((x) => x.includes('destacado'))).toBe(true)
    const sinFechas = TARJETA_VALIDA.replace(/\(otrasFechas[^\n]*\n/, "''\n")
    expect(problemasTarjeta(sinFechas).some((x) => x.includes('fechas más'))).toBe(true)
    const sinPrecio = TARJETA_VALIDA.split('precio').join('p')
    expect(problemasTarjeta(sinPrecio).some((x) => x.includes('precio'))).toBe(true)
    const sinFeatured = TARJETA_VALIDA.split('isFeatured').join('x')
    expect(problemasTarjeta(sinFeatured).some((x) => x.includes('destacado'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// BotonCompartir: la etiqueta dice qué se comparte
// ---------------------------------------------------------------------------
function etiquetaCompartirOk(fuenteCruda: string): boolean {
  const texto = quitarComentarios(fuenteCruda)
  return /accessibilityLabel\s*=\s*\{\s*`Compartir\s+\$\{\s*titulo\s*\}`\s*\}/.test(texto)
}

describe('components/BotonCompartir.tsx', () => {
  it('real: accessibilityLabel incluye el título', () => {
    expect(etiquetaCompartirOk(leer('../components/BotonCompartir.tsx'))).toBe(true)
  })

  it('el detector acepta el válido y marca "Compartir" pelado', () => {
    expect(etiquetaCompartirOk('<Pressable accessibilityLabel={`Compartir ${titulo}`} />')).toBe(true)
    expect(etiquetaCompartirOk('<Pressable accessibilityLabel="Compartir" />')).toBe(false)
    expect(etiquetaCompartirOk('<Pressable accessibilityLabel={`Compartir`} />')).toBe(false)
    expect(etiquetaCompartirOk('// accessibilityLabel={`Compartir ${titulo}`}\n<Pressable accessibilityLabel="Compartir" />')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// hitSlopBotonAccion (BotonFavorito y BotonCompartir): se evalúa la función
// real del fuente (no se exporta y el módulo importa react-native).
// ---------------------------------------------------------------------------
type FnSlop = (tamanio: number, conVecino?: boolean) => HitSlop

function cargarHitSlop(fuenteCruda: string): FnSlop {
  const texto = quitarComentarios(fuenteCruda)
  const m = /function\s+hitSlopBotonAccion\s*\(([^)]*)\)\s*\{/.exec(texto)
  if (!m) throw new Error('no hay hitSlopBotonAccion')
  const cuerpo = bloque(texto, m.index + m[0].length - 1)
  const params = m[1].replace(/:\s*[A-Za-z]+/g, '')
  const js = `function hitSlopBotonAccion(${params}) ${cuerpo}; return hitSlopBotonAccion`
  return new Function('hitSlopPara', js)(hitSlopPara) as FnSlop
}

const ancho = (s: HitSlop, t: number) => t + s.left + s.right
const alto = (s: HitSlop, t: number) => t + s.top + s.bottom

describe('hitSlopBotonAccion del corazón', () => {
  const fuenteFav = leer('../components/BotonFavorito.tsx')
  const fav = cargarHitSlop(fuenteFav)
  const compartir = cargarHitSlop(leer('../components/BotonCompartir.tsx'))
  const T = TARJETA_TAMANIO_ACCION

  it('sin vecino: 48x48', () => {
    const s = fav(T, false)
    expect(ancho(s, T)).toBe(AREA_TACTIL_MINIMA)
    expect(alto(s, T)).toBe(AREA_TACTIL_MINIMA)
  })

  it('con vecino (y por defecto): no se pisa con Compartir dentro del gap', () => {
    for (const s of [fav(T, true), fav(T)]) {
      const g = compartir(T)
      expect(s.left + g.right).toBeLessThanOrEqual(TARJETA_GAP_ACCIONES)
      expect(alto(s, T)).toBe(AREA_TACTIL_MINIMA)
    }
    expect(fav(T)).toEqual(fav(T, true))
  })

  it('sin vecino el área no sale del contenedor: el slop cabe en el padding (margen)', () => {
    expect(maxSlop(fav(T, false))).toBeLessThanOrEqual(TARJETA_MARGEN)
  })

  it('en la ficha (tamaño 40) no cambia con ni sin vecino', () => {
    expect(fav(40, false)).toEqual(fav(40, true))
  })

  it('el componente declara conVecino = true por defecto y se lo pasa al cálculo', () => {
    const texto = quitarComentarios(fuenteFav)
    expect(texto).toMatch(/\bconVecino\s*=\s*true\b/)
    expect(texto).toMatch(/hitSlop\s*=\s*\{\s*hitSlopBotonAccion\(\s*tamanio\s*,\s*conVecino\s*\)\s*\}/)
  })

  it('el cargador falla bien y el chequeo puede ponerse en rojo (fixture inventado que ignora conVecino)', () => {
    const roto = cargarHitSlop(`function hitSlopBotonAccion(tamanio: number, conVecino: boolean = true) {
      const base = hitSlopPara(tamanio)
      return tamanio <= 32 ? { ...base, left: 3, right: 3 } : base
    }`)
    expect(ancho(roto(T, false), T)).toBe(38)
    expect(ancho(roto(T, false), T)).not.toBe(AREA_TACTIL_MINIMA)
    expect(() => cargarHitSlop('const x = 1')).toThrow()
  })
})
