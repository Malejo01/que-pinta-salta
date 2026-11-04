/**
 * Q6-3 · Esquemas de respuesta JSON: normalización y validación, sin
 * dependencias.
 *
 * Los esquemas del repo vienen en el dialecto de Gemini (`type: 'OBJECT'`,
 * `nullable: true`) o en JSON Schema común (`type: 'object'`). Para Claude
 * (`input_schema` de una herramienta) y para validar se pasan a JSON Schema
 * común: tipos en minúscula y `nullable` como `type: [t, 'null']`.
 *
 * La validación cubre lo que usan los esquemas del repo: type (object,
 * string, integer, number, boolean, array, null), properties, required,
 * enum, items. Lo demás (description, etc.) se ignora.
 */
import type { EsquemaJson } from './tipos'

type Esquema = Record<string, unknown>

const TIPOS = new Set(['object', 'string', 'integer', 'number', 'boolean', 'array', 'null'])

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Devuelve una copia en JSON Schema común. No modifica el original. */
export function normalizarEsquema(esquema: EsquemaJson): Esquema {
  const salida: Esquema = {}
  const nullable = esquema.nullable === true
  for (const [clave, valor] of Object.entries(esquema)) {
    if (clave === 'nullable') continue
    if (clave === 'type') {
      const tipos = (Array.isArray(valor) ? valor : [valor]).map((t) => String(t).toLowerCase())
      if (nullable && !tipos.includes('null')) tipos.push('null')
      salida.type = tipos.length === 1 ? tipos[0] : tipos
    } else if (clave === 'properties' && esObjeto(valor)) {
      salida.properties = Object.fromEntries(
        Object.entries(valor).map(([k, v]) => [k, esObjeto(v) ? normalizarEsquema(v) : v]),
      )
    } else if (clave === 'items' && esObjeto(valor)) {
      salida.items = normalizarEsquema(valor)
    } else if (clave === 'enum' && Array.isArray(valor)) {
      salida.enum = nullable && !valor.includes(null) ? [...valor, null] : [...valor]
    } else {
      salida[clave] = valor
    }
  }
  return salida
}

function tipoDe(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

function cumpleTipo(valor: unknown, tipo: string): boolean {
  switch (tipo) {
    case 'null':
      return valor === null
    case 'object':
      return esObjeto(valor)
    case 'array':
      return Array.isArray(valor)
    case 'integer':
      return typeof valor === 'number' && Number.isInteger(valor)
    case 'number':
      return typeof valor === 'number' && Number.isFinite(valor)
    case 'string':
      return typeof valor === 'string'
    case 'boolean':
      return typeof valor === 'boolean'
    default:
      return true
  }
}

/**
 * Valida `valor` contra el esquema (en cualquiera de los dos dialectos).
 * Devuelve la lista de problemas, con la ruta y sin el valor (puede traer
 * texto del evento): vacía si cumple.
 */
export function validarContraEsquema(valor: unknown, esquema: EsquemaJson, ruta = '$'): string[] {
  const e = normalizarEsquema(esquema)
  return validarNormalizado(valor, e, ruta)
}

function validarNormalizado(valor: unknown, e: Esquema, ruta: string): string[] {
  const problemas: string[] = []
  const tipos = e.type === undefined ? [] : (Array.isArray(e.type) ? e.type : [e.type]).map(String).filter((t) => TIPOS.has(t))
  if (tipos.length > 0 && !tipos.some((t) => cumpleTipo(valor, t))) {
    problemas.push(`${ruta}: se esperaba ${tipos.join(' o ')} y vino ${tipoDe(valor)}`)
    return problemas
  }
  if (Array.isArray(e.enum) && !e.enum.some((opcion) => opcion === valor)) {
    problemas.push(`${ruta}: fuera de los valores permitidos`)
  }
  if (esObjeto(valor)) {
    const propiedades = esObjeto(e.properties) ? e.properties : {}
    const requeridos = Array.isArray(e.required) ? e.required.filter((r): r is string => typeof r === 'string') : []
    for (const r of requeridos) {
      if (!(r in valor)) problemas.push(`${ruta}.${r}: falta`)
    }
    for (const [clave, sub] of Object.entries(propiedades)) {
      if (clave in valor && esObjeto(sub)) problemas.push(...validarNormalizado(valor[clave], sub, `${ruta}.${clave}`))
    }
  }
  if (Array.isArray(valor) && esObjeto(e.items)) {
    const items = e.items
    valor.forEach((item, i) => problemas.push(...validarNormalizado(item, items, `${ruta}[${i}]`)))
  }
  return problemas
}

/** ¿La raíz del esquema es un objeto? (Claude lo exige para `input_schema`.) */
export function raizEsObjeto(esquema: EsquemaJson): boolean {
  const tipo = normalizarEsquema(esquema).type
  return tipo === 'object' || (Array.isArray(tipo) && tipo.length === 1 && tipo[0] === 'object')
}

/**
 * Controla la respuesta ya parseada según `validacion` (`estricta` por
 * defecto). Devuelve un detalle corto y sin contenido si no sirve.
 */
export function controlarRespuesta(
  valor: unknown,
  esquema: EsquemaJson,
  validacion: 'estricta' | 'forma' = 'estricta',
): { ok: true } | { ok: false; detalle: string } {
  if (!esObjeto(valor)) return { ok: false, detalle: `se esperaba un objeto y vino ${tipoDe(valor)}` }
  if (validacion === 'forma') return { ok: true }
  const problemas = validarContraEsquema(valor, esquema)
  if (problemas.length === 0) return { ok: true }
  const resto = problemas.length > 3 ? ` (y ${problemas.length - 3} más)` : ''
  return { ok: false, detalle: problemas.slice(0, 3).join('; ') + resto }
}
