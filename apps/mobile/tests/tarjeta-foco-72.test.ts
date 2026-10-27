// R72, 72-q (QPS-360): el corazón y Compartir de la tarjeta tienen foco propio
// para TalkBack/VoiceOver. Un lector agrupa un elemento accesible con todos sus
// hijos: si los botones están DENTRO del `Pressable` de la tarjeta, no reciben
// foco. Detector de estructura sobre el fuente (sin comentarios) con un
// escáner de etiquetas JSX propio: no fija literales de medidas, estilos ni
// formato (saltos de línea, orden de props), solo el árbol.
//
// Cómo se pone en rojo:
//   - mover <BotonFavorito/> o <BotonCompartir/> adentro del <Pressable> de la tarjeta -> "hermanos, no hijos"
//   - sacar `pointerEvents="box-none"` del View de acciones (taparía el toque)        -> "View de acciones con box-none"
//   - sacar accessibilityRole="button" o accessibilityLabel del Pressable de la tarjeta -> "el Pressable es un botón con etiqueta"
//   - poner <BotonFavorito antes que <BotonCompartir en el fuente (cambia el orden de foco) -> "Compartir antes que el corazón"
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'

interface Etiqueta {
  nombre: string
  atributos: string
  inicio: number
  /** Índice del padre en la lista (o -1). */
  padre: number
  autocierre: boolean
}

const NOMBRES = ['Pressable', 'View', 'BotonFavorito', 'BotonCompartir']
const APERTURA = new RegExp(`<(${NOMBRES.join('|')})(?![A-Za-z0-9_])`, 'g')
const CIERRE = new RegExp(`</(${NOMBRES.join('|')})\\s*>`, 'g')

/** Desde `desde` (justo después del nombre) hasta el `>` que cierra la etiqueta, respetando llaves y strings. */
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

function escanear(fuenteCruda: string): Etiqueta[] {
  const texto = quitarComentarios(fuenteCruda)
  const eventos: Array<{ pos: number; tipo: 'abre' | 'cierra'; nombre: string; fin?: number }> = []
  for (const m of texto.matchAll(APERTURA)) {
    eventos.push({ pos: m.index!, tipo: 'abre', nombre: m[1], fin: finDeEtiqueta(texto, m.index! + m[0].length) })
  }
  for (const m of texto.matchAll(CIERRE)) eventos.push({ pos: m.index!, tipo: 'cierra', nombre: m[1] })
  eventos.sort((a, b) => a.pos - b.pos)

  const etiquetas: Etiqueta[] = []
  const pila: number[] = []
  for (const e of eventos) {
    if (e.tipo === 'abre') {
      const fin = e.fin ?? -1
      if (fin < 0) throw new Error(`Etiqueta <${e.nombre}> sin cerrar el '>'`)
      const atributos = texto.slice(e.pos + e.nombre.length + 1, fin)
      const autocierre = texto[fin - 1] === '/'
      etiquetas.push({ nombre: e.nombre, atributos, inicio: e.pos, padre: pila.length ? pila[pila.length - 1] : -1, autocierre })
      if (!autocierre) pila.push(etiquetas.length - 1)
    } else {
      const arriba = pila.pop()
      if (arriba === undefined || etiquetas[arriba].nombre !== e.nombre) {
        throw new Error(`</${e.nombre}> no coincide con la apertura`)
      }
    }
  }
  if (pila.length) throw new Error('Etiquetas sin cerrar')
  return etiquetas
}

function ancestros(etiquetas: Etiqueta[], indice: number): Etiqueta[] {
  const salida: Etiqueta[] = []
  for (let p = etiquetas[indice].padre; p >= 0; p = etiquetas[p].padre) salida.push(etiquetas[p])
  return salida
}

const BOX_NONE = /pointerEvents\s*=\s*(?:"box-none"|'box-none'|\{\s*['"]box-none['"]\s*\})/
const ROL_BOTON = /accessibilityRole\s*=\s*(?:"button"|'button'|\{\s*['"]button['"]\s*\})/
const ETIQUETA = /accessibilityLabel\s*=/

/** Todos los problemas de estructura encontrados; vacío = válido. */
function problemas(fuente: string): string[] {
  const et = escanear(fuente)
  const out: string[] = []

  const botones = et.map((e, i) => ({ e, i })).filter(({ e }) => e.nombre === 'BotonFavorito' || e.nombre === 'BotonCompartir')
  const favorito = botones.filter(({ e }) => e.nombre === 'BotonFavorito')
  const compartir = botones.filter(({ e }) => e.nombre === 'BotonCompartir')
  if (favorito.length !== 1) out.push(`se esperaba un <BotonFavorito, hay ${favorito.length}`)
  if (compartir.length !== 1) out.push(`se esperaba un <BotonCompartir, hay ${compartir.length}`)

  for (const { e, i } of botones) {
    const arriba = ancestros(et, i)
    if (arriba.some((a) => a.nombre === 'Pressable')) out.push(`<${e.nombre} está dentro de un <Pressable`)
    const contenedor = arriba.find((a) => a.nombre === 'View')
    if (!contenedor) out.push(`<${e.nombre} no está dentro de ningún <View`)
    else if (!BOX_NONE.test(contenedor.atributos)) out.push(`el <View que contiene a <${e.nombre} no tiene pointerEvents="box-none"`)
  }

  // El Pressable de la tarjeta: el que NO está dentro de otro Pressable y lleva onPress.
  const tarjetas = et.filter((e) => e.nombre === 'Pressable' && /\bonPress\b/.test(e.atributos))
  if (tarjetas.length !== 1) out.push(`se esperaba un <Pressable con onPress (la tarjeta), hay ${tarjetas.length}`)
  for (const t of tarjetas) {
    if (!ROL_BOTON.test(t.atributos)) out.push('el <Pressable de la tarjeta no tiene accessibilityRole="button"')
    if (!ETIQUETA.test(t.atributos)) out.push('el <Pressable de la tarjeta no tiene accessibilityLabel')
  }

  if (favorito.length === 1 && compartir.length === 1 && compartir[0].e.inicio > favorito[0].e.inicio) {
    out.push('Compartir va después del corazón en el fuente (el orden del árbol es el del foco)')
  }
  return out
}

// ---------------------------------------------------------------------------
// El archivo real
// ---------------------------------------------------------------------------
const FUENTE_REAL = readFileSync(fileURLToPath(new URL('../components/TarjetaEvento.tsx', import.meta.url)), 'utf8')

describe('components/TarjetaEvento.tsx (real)', () => {
  it('sin problemas de estructura', () => {
    expect(problemas(FUENTE_REAL)).toEqual([])
  })

  it('el corazón y Compartir son hermanos del Pressable de la tarjeta, no hijos', () => {
    const et = escanear(FUENTE_REAL)
    for (const nombre of ['BotonFavorito', 'BotonCompartir']) {
      const i = et.findIndex((e) => e.nombre === nombre)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(ancestros(et, i).map((a) => a.nombre)).not.toContain('Pressable')
    }
  })

  it('los dos están dentro del mismo View de acciones con pointerEvents="box-none"', () => {
    const et = escanear(FUENTE_REAL)
    const iF = et.findIndex((e) => e.nombre === 'BotonFavorito')
    const iC = et.findIndex((e) => e.nombre === 'BotonCompartir')
    expect(et[et[iF].padre].nombre).toBe('View')
    expect(et[iF].padre).toBe(et[iC].padre)
    expect(et[et[iF].padre].atributos).toMatch(BOX_NONE)
  })

  it('el Pressable de la tarjeta es un botón con etiqueta', () => {
    const tarjeta = escanear(FUENTE_REAL).find((e) => e.nombre === 'Pressable' && /\bonPress\b/.test(e.atributos))
    expect(tarjeta).toBeDefined()
    expect(tarjeta!.atributos).toMatch(ROL_BOTON)
    expect(tarjeta!.atributos).toMatch(ETIQUETA)
  })

  it('Compartir va antes que el corazón en el fuente', () => {
    const et = escanear(FUENTE_REAL)
    const c = et.find((e) => e.nombre === 'BotonCompartir')!
    const f = et.find((e) => e.nombre === 'BotonFavorito')!
    expect(c.inicio).toBeLessThan(f.inicio)
  })
})

// ---------------------------------------------------------------------------
// Fixtures inventados: el detector tiene que poder fallar.
// ---------------------------------------------------------------------------
const VALIDO = `
  <View style={a}>
    <Pressable onPress={() => router.push(ruta)} accessibilityRole="button" accessibilityLabel={etiqueta}>
      <View pointerEvents="none"><Text>Evento de Prueba</Text></View>
    </Pressable>
    {n > 0 ? (
      <View pointerEvents="box-none" style={b}>
        <BotonCompartir eventId="x" />
        <BotonFavorito objetivo={o} />
      </View>
    ) : null}
  </View>
`

const ANIDADO_VIEJO = `
  <Pressable onPress={() => router.push(ruta)} accessibilityRole="button" accessibilityLabel={etiqueta}>
    <View pointerEvents="none"><Text>Evento de Prueba</Text></View>
    <View style={acciones}>
      <BotonCompartir eventId="x" />
      <BotonFavorito objetivo={o} />
    </View>
  </Pressable>
`

describe('el detector (fixtures inventados)', () => {
  it('acepta la estructura válida', () => {
    expect(problemas(VALIDO)).toEqual([])
  })

  it('marca el anidado viejo (botones dentro del Pressable, sin box-none)', () => {
    const p = problemas(ANIDADO_VIEJO)
    expect(p.length).toBeGreaterThan(0)
    expect(p.some((x) => x.includes('BotonFavorito') && x.includes('dentro de un <Pressable'))).toBe(true)
    expect(p.some((x) => x.includes('BotonCompartir') && x.includes('dentro de un <Pressable'))).toBe(true)
    expect(p.some((x) => x.includes('box-none'))).toBe(true)
  })

  it('marca hermanos pero sin box-none en el View de acciones', () => {
    const p = problemas(VALIDO.replace('pointerEvents="box-none"', 'pointerEvents="auto"'))
    expect(p.some((x) => x.includes('box-none'))).toBe(true)
  })

  it('marca un Pressable sin rol o sin etiqueta', () => {
    expect(problemas(VALIDO.replace('accessibilityRole="button" ', '')).some((x) => x.includes('accessibilityRole'))).toBe(true)
    expect(problemas(VALIDO.replace('accessibilityLabel={etiqueta}', '')).some((x) => x.includes('accessibilityLabel'))).toBe(true)
  })

  it('marca el corazón antes que Compartir', () => {
    const invertido = VALIDO.replace('<BotonCompartir eventId="x" />', '@@').replace('<BotonFavorito objetivo={o} />', '<BotonFavorito objetivo={o} />\n<BotonCompartir eventId="x" />').replace('@@', '')
    expect(problemas(invertido).some((x) => x.includes('orden'))).toBe(true)
  })

  it('una mención en un comentario no cuenta como etiqueta', () => {
    const conComentario = `{/* <BotonFavorito dentro del <Pressable> */}\n// <BotonCompartir\n${VALIDO}`
    expect(problemas(conComentario)).toEqual([])
  })

  it('no se confunde con = > dentro de las props ni con etiquetas autocerradas', () => {
    const et = escanear(VALIDO)
    expect(et.map((e) => e.nombre)).toEqual(['View', 'Pressable', 'View', 'View', 'BotonCompartir', 'BotonFavorito'])
    expect(et.find((e) => e.nombre === 'BotonCompartir')!.autocierre).toBe(true)
  })
})
