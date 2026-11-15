import { topeProgramado } from './programado'

/**
 * Línea de comandos de `scripts/geocodificar-lugares.ts`: qué banderas
 * acepta y a qué opciones se traducen.
 *
 * Puro: no lee `process.argv` (el script le pasa `process.argv.slice(2)`),
 * no toca el sistema de archivos ni la red.
 */

export interface Opciones {
  /** Si guarda en la base los lugares de confianza alta (`--apply` o `--aplicar`). Sin esta bandera, el script solo consulta y arma el reporte. */
  apply: boolean
  /** Cuántos lugares elegibles, como máximo, procesa esta corrida (por defecto 200). */
  limite: number
  /** Si vuelve a pedirle a Nominatim los lugares que ya tienen coordenadas de Nominatim (nunca las cargadas a mano). */
  rehacerNominatim: boolean
  /** Si no lee ni escribe la caché de geocodificación (cada consulta se le pide de nuevo a Nominatim). */
  sinCache: boolean
  /** Si mira todos los elegibles. Por defecto (`false`) solo los que tienen al menos un evento próximo. */
  todos: boolean
  /** Carpeta donde escribir el reporte (`<AAAA-MM-DD-HHMM>.json`/`.csv`). Por defecto, `ops/geocodificacion/` de la raíz del repo. */
  salida?: string
  /** Archivo de la caché de geocodificación. Por defecto, `ops/geocodificacion/cache-nominatim.json` de la raíz del repo. */
  cache?: string
  /**
   * Q4-3: corrida diaria del workflow (`--programado`). Implica `apply`
   * (salvo con `--seco`) y `--prioridad-eventos`; como mucho el tope de
   * `GEOCODIFICACION_TOPE` (Q7-2, ver `topeProgramado`), sin `--todos` ni
   * `--rehacer-nominatim`, a menos de 4 pedidos por minuto y sin repetir un
   * lugar intentado hace menos de 30 días (ver `./programado`).
   */
  programado: boolean
  /**
   * Q7-2: `--seco`. No le pide NADA a Nominatim ni escribe en la base: lista
   * qué haría la corrida (qué lugares, en qué orden, con qué consultas y qué
   * links de Google Maps encontró). Se combina con `--programado` para ver la
   * corrida de mañana.
   */
  seco: boolean
  /**
   * Q7-2: `--prioridad-eventos`. Mira todos los elegibles, primero los que
   * tienen eventos próximos publicados (de más a menos) y después el resto.
   * `--programado` lo implica.
   */
  prioridadEventos: boolean
}

/** Las banderas que entiende el script, en el orden en que se listan en los mensajes de error. */
const BANDERAS_VALIDAS = [
  '--apply',
  '--aplicar',
  '--rehacer-nominatim',
  '--sin-cache',
  '--todos',
  '--programado',
  '--seco',
  '--prioridad-eventos',
  '--limite',
  '--salida',
  '--cache',
] as const

/** Banderas que no llevan valor (su sola presencia alcanza). */
const BANDERAS_BOOLEANAS = new Set([
  '--apply',
  '--aplicar',
  '--rehacer-nominatim',
  '--sin-cache',
  '--todos',
  '--programado',
  '--seco',
  '--prioridad-eventos',
])

/** Banderas que necesitan un valor, como `--limite 20` o `--limite=20`. */
const BANDERAS_DE_VALOR = new Set(['--limite', '--salida', '--cache'])

function listaDeBanderas(): string {
  return BANDERAS_VALIDAS.join(', ')
}

/**
 * Lee las opciones de `argv` (ya sin `node` ni el nombre del script: el
 * script le pasa `process.argv.slice(2)`).
 *
 * Tira un `Error` con un mensaje en voseo, listo para `console.error`, si:
 *   - hay una bandera desconocida o un argumento que no empieza con `--`
 *     (un `--aply` mal escrito no puede correr en modo consulta haciéndole
 *     creer a quien lo corre que guardó, ni al revés: el mensaje nombra las
 *     banderas válidas);
 *   - una bandera booleana (`--apply`, `--rehacer-nominatim`, `--sin-cache`)
 *     viene con un valor (`--apply=algo`);
 *   - una bandera de valor (`--limite`, `--salida`, `--cache`) no tiene valor
 *     (ni como `--limite=20` ni como el siguiente argumento, o el siguiente
 *     argumento es otra bandera);
 *   - `--limite` no es un entero mayor que 0.
 */
export function leerOpciones(argv: string[], entorno: { GEOCODIFICACION_TOPE?: string } = {}): Opciones {
  let apply = false
  let seco = false
  let prioridadEventos = false
  let rehacerNominatim = false
  let sinCache = false
  let todos = false
  let programado = false
  let limiteTexto: string | undefined
  let salida: string | undefined
  let cache: string | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const igualIdx = arg.indexOf('=')
    const nombre = igualIdx !== -1 ? arg.slice(0, igualIdx) : arg
    const valorInline = igualIdx !== -1 ? arg.slice(igualIdx + 1) : undefined

    if (!nombre.startsWith('--') || (!BANDERAS_BOOLEANAS.has(nombre) && !BANDERAS_DE_VALOR.has(nombre))) {
      throw new Error(`Bandera desconocida "${arg}". Las banderas válidas son: ${listaDeBanderas()}.`)
    }

    if (BANDERAS_BOOLEANAS.has(nombre)) {
      if (valorInline !== undefined) {
        throw new Error(`La bandera "${nombre}" no lleva valor: escribila sola, sin "=...".`)
      }
      if (nombre === '--apply' || nombre === '--aplicar') apply = true
      else if (nombre === '--rehacer-nominatim') rehacerNominatim = true
      else if (nombre === '--todos') todos = true
      else if (nombre === '--programado') programado = true
      else if (nombre === '--seco') seco = true
      else if (nombre === '--prioridad-eventos') prioridadEventos = true
      else sinCache = true
      continue
    }

    // Bandera de valor: --limite, --salida o --cache.
    let valor = valorInline
    if (valor === undefined) {
      const siguiente = argv[i + 1]
      if (siguiente === undefined || siguiente.startsWith('--')) {
        throw new Error(`La bandera "${nombre}" necesita un valor, por ejemplo "${nombre} 20" o "${nombre}=20".`)
      }
      valor = siguiente
      i++
    }

    if (nombre === '--limite') limiteTexto = valor
    else if (nombre === '--salida') salida = valor
    else cache = valor
  }

  let limite = 200
  if (limiteTexto !== undefined) {
    const numero = Number(limiteTexto)
    if (!Number.isFinite(numero) || !Number.isInteger(numero) || numero <= 0) {
      throw new Error(`--limite necesita un número entero mayor que 0 (recibí "${limiteTexto}").`)
    }
    limite = numero
  }

  if (seco && apply) {
    throw new Error('--seco no se combina con --apply/--aplicar: en seco no se escribe nada.')
  }

  if (programado) {
    // La corrida programada tiene reglas fijas: nada de lo que las afloja.
    if (todos || rehacerNominatim) {
      throw new Error('--programado no se combina con --todos ni con --rehacer-nominatim.')
    }
    // Q7-2: el tope sale de GEOCODIFICACION_TOPE (por defecto 20, hasta 30); --limite solo puede bajarlo.
    const tope = topeProgramado(entorno.GEOCODIFICACION_TOPE)
    return {
      apply: !seco,
      limite: limiteTexto !== undefined ? Math.min(limite, tope) : tope,
      rehacerNominatim: false,
      sinCache,
      todos: false,
      salida,
      cache,
      programado,
      seco,
      prioridadEventos: true,
    }
  }

  return { apply, limite, rehacerNominatim, sinCache, todos, salida, cache, programado, seco, prioridadEventos }
}
