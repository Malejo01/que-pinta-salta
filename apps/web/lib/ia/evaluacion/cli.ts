/**
 * Q6-4 · La línea de comandos del banco de evaluación de IA
 * (`apps/web/scripts/evaluar-ia.ts`). Lee los archivos de
 * `docs/evaluacion-ia/`, valida, y corre en seco (por defecto) o en real.
 *
 * En seco no toca la red ni el SDK: los pedidos se arman con un proveedor
 * doble (ver `prompts.ts`). Nunca imprime claves ni valores del entorno.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { FetchIA } from '../claude'
import type { EntornoIA } from '../seleccion'
import type { NombreProveedorIA, ProveedorIA } from '../tipos'
import { validarFixtureClasificacion, validarFixtureFlyers, validarFixtureTraduccion } from './fixtures'
import { formatearInformeReal, formatearInformeSeco } from './informe'
import { formatearUsd, parsearPrecios, parsearVolumenes } from './precios'
import {
  ErrorConfiguracionEvaluacion,
  TOPE_MAXIMO,
  TOPE_POR_DEFECTO,
  VARIABLE_CLAVE,
  clavesFaltantes,
  ejecutarReal,
  modeloDe,
} from './real'
import { evaluarEnSeco, type EntradaEvaluacion, type InformeSeco } from './seco'
import type { BancoEvaluacion, UsoEvaluado } from './tipos'
import { USOS_EVALUADOS } from './tipos'

export const AYUDA = `Banco de evaluación de IA (Q6-4). Desde apps/web:

  npx tsx scripts/evaluar-ia.ts                       # EN SECO (por defecto): valida fixtures, arma los
                                                      #   pedidos reales, estima tokens y costo mensual. Gratis.
  npx tsx scripts/evaluar-ia.ts --real --proveedor gemini|claude|ambos --confirmo-costo [--tope 5] [--uso flyers]
                                                      # REAL: llama al modelo (PAGO). Tope por uso y proveedor.

Opciones:
  --real                 llama de verdad (necesita --proveedor y --confirmo-costo)
  --proveedor <p>        gemini | claude | ambos (solo con --real)
  --uso <u>              flyers | traduccion | clasificacion | todos (por defecto todos)
  --tope <n>             llamadas por uso y proveedor, de 1 a ${TOPE_MAXIMO} (por defecto ${TOPE_POR_DEFECTO})
  --confirmo-costo       sin esto, --real solo muestra el costo estimado y no llama
  --salida <archivo>     guarda el informe en JSON
  --dir <carpeta>        otra carpeta de fixtures (por defecto docs/evaluacion-ia)
  --ayuda`

export interface OpcionesCli {
  real: boolean
  proveedores: NombreProveedorIA[] | null
  usos: UsoEvaluado[]
  tope: number
  confirmoCosto: boolean
  salida?: string
  dir?: string
  ayuda: boolean
}

export class ErrorOpciones extends Error {}

export function leerOpciones(argv: string[]): OpcionesCli {
  const o: OpcionesCli = { real: false, proveedores: null, usos: [...USOS_EVALUADOS], tope: TOPE_POR_DEFECTO, confirmoCosto: false, ayuda: false }
  const valor = (i: number, nombre: string) => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new ErrorOpciones(`${nombre} necesita un valor`)
    return v
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--real') o.real = true
    else if (a === '--confirmo-costo') o.confirmoCosto = true
    else if (a === '--ayuda' || a === '--help' || a === '-h') o.ayuda = true
    else if (a === '--proveedor') {
      const v = valor(i++, a)
      if (v === 'ambos') o.proveedores = ['gemini', 'claude']
      else if (v === 'gemini' || v === 'claude') o.proveedores = [v]
      else throw new ErrorOpciones('--proveedor es gemini, claude o ambos')
    } else if (a === '--uso') {
      const v = valor(i++, a)
      if (v === 'todos') o.usos = [...USOS_EVALUADOS]
      else if ((USOS_EVALUADOS as readonly string[]).includes(v)) o.usos = [v as UsoEvaluado]
      else throw new ErrorOpciones('--uso es flyers, traduccion, clasificacion o todos')
    } else if (a === '--tope') {
      const n = Number(valor(i++, a))
      if (!Number.isInteger(n) || n < 1 || n > TOPE_MAXIMO) throw new ErrorOpciones(`--tope va de 1 a ${TOPE_MAXIMO}`)
      o.tope = n
    } else if (a === '--salida') o.salida = valor(i++, a)
    else if (a === '--dir') o.dir = valor(i++, a)
    else throw new ErrorOpciones(`opción desconocida: ${a}`)
  }
  if (!o.real && (o.proveedores || o.confirmoCosto)) throw new ErrorOpciones('--proveedor y --confirmo-costo son solo para --real')
  if (o.real && !o.proveedores) throw new ErrorOpciones('--real necesita --proveedor gemini, claude o ambos')
  return o
}

/** Sube desde `desde` hasta encontrar `docs/evaluacion-ia`. */
export function encontrarDirectorio(desde: string): string {
  let dir = resolve(desde)
  while (true) {
    const candidato = join(dir, 'docs', 'evaluacion-ia')
    if (existsSync(join(candidato, 'precios.md'))) return candidato
    const padre = dirname(dir)
    if (padre === dir) throw new ErrorOpciones('no encontré docs/evaluacion-ia (usá --dir)')
    dir = padre
  }
}

function leerJson(ruta: string, problemas: string[]): unknown {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'))
  } catch (error) {
    problemas.push(`${ruta}: ${error instanceof SyntaxError ? 'JSON inválido' : 'no se pudo leer'}`)
    return undefined
  }
}

/** Lee y valida todo. Si hay problemas, `entrada` no viene. */
export function cargarBanco(dir: string): { entrada?: EntradaEvaluacion; problemas: string[] } {
  const problemas: string[] = []
  const conPrefijo = (archivo: string, lista: string[]) => lista.map((p) => `${archivo}: ${p}`)
  const flyers = validarFixtureFlyers(leerJson(join(dir, 'flyers.json'), problemas))
  const traduccion = validarFixtureTraduccion(leerJson(join(dir, 'traduccion.json'), problemas))
  const clasificacion = validarFixtureClasificacion(leerJson(join(dir, 'clasificacion.json'), problemas))
  problemas.push(...conPrefijo('flyers.json', flyers.problemas), ...conPrefijo('traduccion.json', traduccion.problemas), ...conPrefijo('clasificacion.json', clasificacion.problemas))
  let precios: EntradaEvaluacion['precios'] = []
  let volumenes: EntradaEvaluacion['volumenes'] | undefined
  try {
    precios = parsearPrecios(readFileSync(join(dir, 'precios.md'), 'utf8'))
  } catch (error) {
    problemas.push(error instanceof Error ? error.message : 'precios.md: no se pudo leer')
  }
  try {
    volumenes = parsearVolumenes(leerJson(join(dir, 'volumenes.json'), problemas))
  } catch (error) {
    problemas.push(error instanceof Error ? error.message : 'volumenes.json: no se pudo leer')
  }
  if (problemas.length > 0 || !flyers.archivo || !traduccion.archivo || !clasificacion.archivo || !volumenes) return { problemas }
  const banco: BancoEvaluacion = { flyers: flyers.archivo, traduccion: traduccion.archivo, clasificacion: clasificacion.archivo }
  return { entrada: { banco, precios, volumenes }, problemas }
}

/** Lee apps/web/.env.local y .env (como los otros scripts). Lo del entorno gana. */
export function leerEnvLocal(dir: string): EntornoIA {
  const salida: EntornoIA = {}
  for (const archivo of ['.env.local', '.env']) {
    let crudo: string
    try {
      crudo = readFileSync(join(dir, archivo), 'utf8')
    } catch {
      continue
    }
    for (const linea of crudo.split(/\r?\n/)) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i)
      if (m && salida[m[1]] === undefined) salida[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
  return salida
}

/** Lo máximo que puede costar la corrida real, con la estimación en seco. */
export function costoMaximoEstimado(
  seco: InformeSeco,
  opciones: Pick<OpcionesCli, 'usos' | 'tope'> & { proveedores: NombreProveedorIA[] },
  entorno: EntornoIA,
): { usd: number; sinPrecio: string[] } {
  let usd = 0
  const sinPrecio: string[] = []
  for (const p of opciones.proveedores) {
    const modelo = modeloDe(p, entorno)
    for (const uso of opciones.usos) {
      const fila = seco.costos.find((c) => c.uso === uso && c.modelo === modelo)
      if (!fila) {
        if (!sinPrecio.includes(modelo)) sinPrecio.push(modelo)
        continue
      }
      usd += fila.usdPorLlamada * Math.min(opciones.tope, fila.casos)
    }
  }
  return { usd, sinPrecio }
}

export interface DependenciasCli {
  cwd: string
  entorno: EntornoIA
  fetch: FetchIA
  log: (linea: string) => void
  error: (linea: string) => void
  /** Por defecto lee .env.local/.env de `cwd` (solo en --real). */
  leerEnvLocal?: (dir: string) => EntornoIA
  escribirArchivo?: (ruta: string, contenido: string) => void
  crearProveedor?: (nombre: NombreProveedorIA, modelo: string) => ProveedorIA
}

/** Corre el banco. Devuelve el código de salida: 0 bien, 1 error, 2 falta confirmar el costo. */
export async function ejecutarCli(argv: string[], deps: DependenciasCli): Promise<number> {
  let opciones: OpcionesCli
  try {
    opciones = leerOpciones(argv)
  } catch (error) {
    deps.error(`[evaluar-ia] ${error instanceof Error ? error.message : String(error)}`)
    deps.error(AYUDA)
    return 1
  }
  if (opciones.ayuda) {
    deps.log(AYUDA)
    return 0
  }
  let dir: string
  try {
    dir = opciones.dir ? resolve(deps.cwd, opciones.dir) : encontrarDirectorio(deps.cwd)
  } catch (error) {
    deps.error(`[evaluar-ia] ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
  const { entrada, problemas } = cargarBanco(dir)
  if (!entrada) {
    deps.error(`[evaluar-ia] los fixtures no pasan la validación (${problemas.length} problemas):`)
    for (const p of problemas) deps.error(`  - ${p}`)
    return 1
  }
  const seco = await evaluarEnSeco(entrada)
  const escribir = deps.escribirArchivo ?? ((ruta: string, contenido: string) => writeFileSync(ruta, contenido))

  if (!opciones.real) {
    deps.log(formatearInformeSeco(seco))
    if (opciones.salida) escribir(resolve(deps.cwd, opciones.salida), JSON.stringify(seco, null, 2))
    return 0
  }

  const proveedores = opciones.proveedores ?? []
  const entorno: EntornoIA = { ...(deps.leerEnvLocal ?? leerEnvLocal)(deps.cwd), ...deps.entorno }
  const maximo = costoMaximoEstimado(seco, { ...opciones, proveedores }, entorno)
  deps.log(
    `[evaluar-ia] modo REAL: ${proveedores.map((p) => `${p} (${modeloDe(p, entorno)})`).join(' y ')}, ` +
      `usos ${opciones.usos.join(', ')}, hasta ${opciones.tope} llamadas por uso y proveedor. ` +
      `Costo estimado máximo: ${formatearUsd(maximo.usd)}` +
      (maximo.sinPrecio.length ? ` (sin precio en precios.md: ${maximo.sinPrecio.join(', ')})` : ''),
  )
  if (!opciones.confirmoCosto) {
    deps.error('[evaluar-ia] no se llamó a ningún modelo: agregá --confirmo-costo para correrlo de verdad.')
    return 2
  }
  const faltan = clavesFaltantes(proveedores, entorno)
  if (faltan.length > 0) {
    deps.error(
      `[evaluar-ia] faltan ${faltan.join(' y ')}: configurala(s) en el entorno o en apps/web/.env.local. ` +
        `No se hizo ninguna llamada. (${proveedores.map((p) => `${p} usa ${VARIABLE_CLAVE[p]}`).join('; ')})`,
    )
    return 1
  }
  try {
    const real = await ejecutarReal(entrada.banco, entrada.precios, { proveedores, usos: opciones.usos, tope: opciones.tope }, {
      entorno,
      fetch: deps.fetch,
      crearProveedor: deps.crearProveedor,
      log: deps.log,
    })
    deps.log(formatearInformeReal(real))
    if (opciones.salida) escribir(resolve(deps.cwd, opciones.salida), JSON.stringify({ seco, real }, null, 2))
    return 0
  } catch (error) {
    if (error instanceof ErrorConfiguracionEvaluacion) {
      deps.error(`[evaluar-ia] ${error.message}`)
      return 1
    }
    // Sin el detalle: puede repetir el pedido o datos del proveedor.
    deps.error('[evaluar-ia] la corrida real falló')
    return 1
  }
}
