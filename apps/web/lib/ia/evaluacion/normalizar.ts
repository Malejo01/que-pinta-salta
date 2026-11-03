/**
 * Q6-4 · Normalización de lo que devuelve la IA (y de lo esperado) para
 * comparar campo por campo sin castigar diferencias de formato.
 *
 * - Fecha → `YYYY-MM-DD` en hora de Salta (UTC−3 todo el año, sin horario de
 *   verano). Acepta `YYYY-MM-DD`, `DD/MM/YYYY` y fecha-hora ISO (con zona se
 *   pasa a Salta; sin zona se toma como hora de Salta).
 * - Hora → `HH:MM` (24 h). Acepta `21:00`, `9:30`, `21.30`, `21 hs`, `21hs`,
 *   `9 pm`, `9:30 p.m.`, y fecha-hora ISO.
 * - Precio → número (entrada general), `'gratis'` o `null`. 0 es gratis.
 *   Acepta `$18.000`, `18000`, `18,000`, `"gratis"`, `"entrada libre"`.
 * - Lugar → similitud 0..1 contra el nombre del venue y sus alias.
 */
import type { PrecioNormalizado } from './tipos'

const OFFSET_SALTA_MS = -3 * 60 * 60 * 1000

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0')
}

function fechaValida(anio: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1) return false
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  return dia <= ultimo
}

/** Un instante con zona explícita, pasado a la fecha y hora de pared de Salta. */
function aParedSalta(iso: string): { fecha: string; hora: string } | null {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  const d = new Date(ms + OFFSET_SALTA_MS)
  return {
    fecha: `${d.getUTCFullYear()}-${dosDigitos(d.getUTCMonth() + 1)}-${dosDigitos(d.getUTCDate())}`,
    hora: `${dosDigitos(d.getUTCHours())}:${dosDigitos(d.getUTCMinutes())}`,
  }
}

const RE_CON_ZONA = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i

export function normalizarFecha(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const v = valor.trim()
  if (!v || v.toLowerCase() === 'null') return null
  if (RE_CON_ZONA.test(v)) return aParedSalta(v)?.fecha ?? null
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/)
  if (m) {
    const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    return fechaValida(a, me, d) ? `${m[1]}-${m[2]}-${m[3]}` : null
  }
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    const [d, me, a] = [Number(m[1]), Number(m[2]), Number(m[3])]
    return fechaValida(a, me, d) ? `${a}-${dosDigitos(me)}-${dosDigitos(d)}` : null
  }
  return null
}

export function normalizarHora(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const v = valor.trim().toLowerCase()
  if (!v || v === 'null') return null
  if (RE_CON_ZONA.test(valor.trim())) return aParedSalta(valor.trim())?.hora ?? null
  const iso = v.match(/^\d{4}-\d{2}-\d{2}[t ](\d{2}):(\d{2})(?::\d{2})?$/)
  if (iso) return `${iso[1]}:${iso[2]}`
  const m = v.match(/^(\d{1,2})(?:[:.h](\d{2}))?\s*(hs?\.?|horas?|a\.?\s?m\.?|p\.?\s?m\.?)?$/)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] === undefined ? 0 : Number(m[2])
  const sufijo = (m[3] ?? '').replace(/[\s.]/g, '')
  if (sufijo === 'pm' && h < 12) h += 12
  if (sufijo === 'am' && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return `${dosDigitos(h)}:${dosDigitos(min)}`
}

const PALABRAS_GRATIS = /^(gratis|gratuit[oa]|free|libre|entrada libre|entrada gratuita|sin cargo|libre y gratuit[oa])$/i

export function normalizarPrecio(valor: unknown): PrecioNormalizado {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor < 0) return null
    return valor === 0 ? 'gratis' : Math.round(valor)
  }
  if (typeof valor !== 'string') return null
  const v = valor.trim()
  if (!v || v.toLowerCase() === 'null') return null
  if (PALABRAS_GRATIS.test(v)) return 'gratis'
  // $18.000 / 18.000,50 / 18,000 / 18000.00
  const m = v.replace(/^\$\s*/, '').match(/^(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?$/)
  if (!m) return null
  const n = Number(m[1].replace(/[.,]/g, ''))
  return normalizarPrecio(n)
}

const PALABRAS_VACIAS_LUGAR = new Set(['la', 'el', 'los', 'las', 'de', 'del', 'y', 'salta', 'club', 'bar', 'pub', 'pena', 'boliche', 'the'])

/** minúsculas, sin tildes, `&` → `y`, sin puntuación, espacios simples. */
export function normalizarNombreLugar(nombre: string): string {
  return nombre
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function bigramas(s: string): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) {
    const b = s.slice(i, i + 2)
    m.set(b, (m.get(b) ?? 0) + 1)
  }
  return m
}

/** Coeficiente de Dice sobre bigramas de caracteres (0..1). */
export function dice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0
  const ba = bigramas(a)
  const bb = bigramas(b)
  let comunes = 0
  for (const [k, n] of ba) comunes += Math.min(n, bb.get(k) ?? 0)
  return (2 * comunes) / (a.length - 1 + (b.length - 1))
}

function similitudContra(obtenido: string, esperado: string): number {
  const a = normalizarNombreLugar(obtenido)
  const b = normalizarNombreLugar(esperado)
  if (!a || !b) return 0
  if (a === b) return 1
  const ca = a.replace(/ /g, '')
  const cb = b.replace(/ /g, '')
  if (ca === cb) return 1
  const [corto, largo] = ca.length <= cb.length ? [ca, cb] : [cb, ca]
  if (corto.length >= 4 && largo.includes(corto)) return 0.9
  const ta = a.split(' ').filter((t) => !PALABRAS_VACIAS_LUGAR.has(t))
  const tb = b.split(' ').filter((t) => !PALABRAS_VACIAS_LUGAR.has(t))
  if (ta.length > 0 && tb.length > 0) {
    const sa = new Set(ta)
    const sb = new Set(tb)
    const [menor, mayor] = sa.size <= sb.size ? [sa, sb] : [sb, sa]
    if ([...menor].every((t) => mayor.has(t)) && [...menor].join('').length >= 4) return 0.85
  }
  return dice(ca, cb)
}

/** La mejor similitud (0..1) entre lo que dijo la IA y el venue o alguno de sus alias. */
export function similitudLugar(obtenido: unknown, nombres: readonly string[]): number {
  if (typeof obtenido !== 'string' || !obtenido.trim()) return 0
  return Math.max(0, ...nombres.map((n) => similitudContra(obtenido, n)))
}

/** Umbral para dar el lugar por correcto. */
export const UMBRAL_LUGAR = 0.8
