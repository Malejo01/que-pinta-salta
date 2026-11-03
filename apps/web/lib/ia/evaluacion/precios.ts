/**
 * Q6-4 · Precios (tabla de `docs/evaluacion-ia/precios.md`), volúmenes
 * mensuales (`volumenes.json`) y cuentas de costo. Puro.
 */
import type { PrecioModelo, UsoEvaluado, Volumenes } from './tipos'
import { USOS_EVALUADOS } from './tipos'

export const MARCA_INICIO = '<!-- precios:inicio -->'
export const MARCA_FIN = '<!-- precios:fin -->'
const COLUMNAS = ['clave', 'proveedor', 'entrada_usd_mtok', 'salida_usd_mtok', 'tokens_por_imagen', 'fuente', 'consultado', 'estado'] as const
const ESTADOS = new Set(['verificar', 'confirmado', 'referencia'])

function celdas(fila: string): string[] {
  return fila
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

function numero(valor: string, donde: string): number {
  const n = Number(valor.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) throw new Error(`precios.md: ${donde} no es un número válido`)
  return n
}

/** Lee la tabla entre las marcas. Tira con un mensaje claro si está mal armada. */
export function parsearPrecios(markdown: string): PrecioModelo[] {
  const inicio = markdown.indexOf(MARCA_INICIO)
  const fin = markdown.indexOf(MARCA_FIN)
  if (inicio < 0 || fin < 0 || fin < inicio) throw new Error('precios.md: faltan las marcas precios:inicio / precios:fin')
  const filas = markdown
    .slice(inicio + MARCA_INICIO.length, fin)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'))
  if (filas.length < 3) throw new Error('precios.md: la tabla no tiene filas de datos')
  const encabezado = celdas(filas[0])
  if (encabezado.join('|') !== COLUMNAS.join('|')) {
    throw new Error(`precios.md: las columnas tienen que ser ${COLUMNAS.join(', ')}`)
  }
  const precios = filas.slice(2).map((fila, i) => {
    const c = celdas(fila)
    const donde = `fila ${i + 1}`
    if (c.length !== COLUMNAS.length) throw new Error(`precios.md: la ${donde} tiene ${c.length} columnas`)
    const [clave, proveedor, entrada, salida, imagen, fuente, consultado, estado] = c
    if (!clave) throw new Error(`precios.md: la ${donde} no tiene clave`)
    if (proveedor !== 'gemini' && proveedor !== 'claude') throw new Error(`precios.md: proveedor inválido en ${clave}`)
    if (!ESTADOS.has(estado)) throw new Error(`precios.md: estado inválido en ${clave} (verificar | confirmado | referencia)`)
    if (!/^https:\/\//.test(fuente)) throw new Error(`precios.md: ${clave} necesita la URL de la fuente`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(consultado)) throw new Error(`precios.md: ${clave} necesita la fecha de consulta (YYYY-MM-DD)`)
    return {
      clave,
      proveedor,
      entradaUsdMtok: numero(entrada, `${clave} entrada`),
      salidaUsdMtok: numero(salida, `${clave} salida`),
      tokensPorImagen: Math.round(numero(imagen, `${clave} tokens_por_imagen`)),
      fuente,
      consultado,
      estado: estado as PrecioModelo['estado'],
    } satisfies PrecioModelo
  })
  const claves = new Set<string>()
  for (const p of precios) {
    if (claves.has(p.clave)) throw new Error(`precios.md: ${p.clave} está repetido`)
    claves.add(p.clave)
  }
  return precios
}

/** USD de una llamada. */
export function costoUsd(tokensEntrada: number, tokensSalida: number, precio: Pick<PrecioModelo, 'entradaUsdMtok' | 'salidaUsdMtok'>): number {
  return (tokensEntrada * precio.entradaUsdMtok + tokensSalida * precio.salidaUsdMtok) / 1_000_000
}

export function parsearVolumenes(json: unknown): Volumenes {
  const v = json as Record<string, unknown> | null
  if (!v || typeof v !== 'object') throw new Error('volumenes.json: no es un objeto')
  const porMes = v.por_mes as Record<string, unknown> | undefined
  if (!porMes || typeof porMes !== 'object') throw new Error('volumenes.json: falta por_mes')
  const salida = {} as Record<UsoEvaluado, number>
  for (const uso of USOS_EVALUADOS) {
    const n = porMes[uso]
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) throw new Error(`volumenes.json: por_mes.${uso} tiene que ser un entero ≥ 0`)
    salida[uso] = n
  }
  if (typeof v.consultado !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.consultado)) throw new Error('volumenes.json: falta consultado (YYYY-MM-DD)')
  const ventana = v.ventana_dias
  if (typeof ventana !== 'number' || ventana <= 0) throw new Error('volumenes.json: falta ventana_dias')
  const notas = (v.notas && typeof v.notas === 'object' ? v.notas : {}) as Volumenes['notas']
  return { consultado: v.consultado, ventanaDias: ventana, porMes: salida, notas }
}

/** «USD 1,23» con la precisión que hace falta para montos chicos. */
export function formatearUsd(usd: number): string {
  const decimales = usd === 0 ? 2 : usd < 0.01 ? 5 : usd < 1 ? 4 : 2
  return `USD ${usd.toFixed(decimales).replace('.', ',')}`
}
