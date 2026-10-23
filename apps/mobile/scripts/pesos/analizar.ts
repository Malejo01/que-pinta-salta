// 46-e: lógica pura para repartir el peso de un bundle de JS entre sus
// fuentes originales, usando su source map. Sin imports de la app ni alias
// `@/`: solo lo que Node puede tipar y quitar él mismo (sin enum/namespace),
// porque `scripts/pesos-bundle.mjs` importa este archivo con la extensión
// `.ts` directamente (Node 24 recorta los tipos sin flags).
//
// Vocabulario del formato (spec de "source map", versión 3):
// - `mappings` es un string con una línea de texto por cada línea del JS
//   generado, separadas por `;`. Una línea vacía (dos `;` seguidos, o nada
//   después del último `;`) significa "ninguna porción de esta línea está
//   mapeada a ninguna fuente".
// - Cada línea tiene uno o más "segmentos", separados por `,`. Un segmento
//   describe un punto de la línea generada (una columna) y, si tiene más de
//   un campo, a qué fuente/línea/columna/nombre original corresponde.
// - Cada segmento es una lista de 1, 4 o 5 números codificados en Base64 VLQ,
//   pegados sin separador (el formato VLQ es autoterminado: cada "dígito" de
//   6 bits trae un bit de continuación).
//   Campo 0: delta de la columna generada (se reinicia en cada línea).
//   Campo 1: delta del índice de la fuente (acumulado en TODO el archivo,
//            incluso entre líneas).
//   Campo 2: delta de la línea original (acumulado en todo el archivo).
//   Campo 3: delta de la columna original (acumulado en todo el archivo).
//   Campo 4: delta del índice de nombre (acumulado en todo el archivo).
//   Un segmento con un solo campo no tiene fuente: no se atribuye a nadie.

/** Forma mínima de un source map (versión 3) que usamos acá. */
export interface MapaFuente {
  version: number
  sources: string[]
  sourcesContent?: Array<string | null | undefined>
  names: string[]
  mappings: string
}

/** Un paquete o módulo con su peso, listo para mostrar. */
export interface Entrada {
  nombre: string
  bytes: number
  porcentaje: number
}

/** Lo que devuelve `resumen`: el total y los rankings de paquetes y módulos. */
export interface Resumen {
  total: number
  paquetes: Entrada[]
  modulos: Entrada[]
}

const ALFABETO_BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function indiceBase64(caracter: string): number {
  const indice = ALFABETO_BASE64.indexOf(caracter)
  if (indice === -1) {
    throw new Error(`Carácter fuera del alfabeto Base64 VLQ: ${JSON.stringify(caracter)}`)
  }
  return indice
}

/**
 * Decodifica UN valor Base64 VLQ a partir del carácter en `indiceInicial`
 * (0 si no se indica). Devuelve el valor y el índice siguiente al último
 * carácter consumido, para poder encadenar varios campos pegados en el
 * mismo segmento (ver `decodificarCampos`).
 */
function decodificarCampo(cadena: string, indiceInicial = 0): { valor: number; siguiente: number } {
  let resultado = 0
  let desplazamiento = 0
  let indice = indiceInicial
  let continua = true
  while (continua) {
    const bruto = indiceBase64(cadena[indice])
    indice += 1
    continua = (bruto & 32) !== 0
    const digito = bruto & 31
    resultado += digito << desplazamiento
    desplazamiento += 5
  }
  const negativo = (resultado & 1) === 1
  resultado = resultado >>> 1
  return { valor: negativo ? -resultado : resultado, siguiente: indice }
}

/**
 * Decodifica un único valor Base64 VLQ dado por completo en `segmento`
 * (si trajera más caracteres de los necesarios, se ignoran: ver
 * `decodificarCampos` para leer varios valores pegados).
 * Casos conocidos: `decodificarVLQ('A')` es 0, `decodificarVLQ('C')` es 1,
 * `decodificarVLQ('D')` es -1, `decodificarVLQ('gB')` es 16.
 */
export function decodificarVLQ(segmento: string): number {
  return decodificarCampo(segmento, 0).valor
}

/** Decodifica los 1, 4 o 5 campos pegados de un segmento completo de `mappings`. */
function decodificarCampos(segmento: string): number[] {
  const campos: number[] = []
  let indice = 0
  while (indice < segmento.length) {
    const { valor, siguiente } = decodificarCampo(segmento, indice)
    campos.push(valor)
    indice = siguiente
  }
  return campos
}

/**
 * Recorre `mappings` y le atribuye a cada `source` los caracteres generados
 * entre su segmento y el siguiente de la misma línea (o hasta el final de la
 * línea, si es el último). `largoDeCadaLinea[i]` es el largo, en caracteres,
 * de la línea `i` del JS generado (incluida la línea 0).
 *
 * El índice de fuente (campo 1) es acumulado en todo el archivo, así que se
 * arrastra también entre líneas; la columna generada (campo 0) se reinicia
 * en cada línea.
 */
export function bytesPorFuente(mapa: MapaFuente, largoDeCadaLinea: number[]): Record<string, number> {
  const resultado: Record<string, number> = {}
  let indiceFuente = 0
  let lineaOriginal = 0
  let columnaOriginal = 0
  let indiceNombre = 0

  const lineas = mapa.mappings.split(';')
  for (let numeroLinea = 0; numeroLinea < lineas.length; numeroLinea++) {
    const lineaCruda = lineas[numeroLinea]
    let columnaGenerada = 0
    const inicios: Array<{ columna: number; fuente: string | null }> = []

    if (lineaCruda.length > 0) {
      for (const segmento of lineaCruda.split(',')) {
        if (segmento.length === 0) continue
        const campos = decodificarCampos(segmento)
        if (campos.length === 0) continue

        columnaGenerada += campos[0]
        let fuente: string | null = null
        if (campos.length > 1) {
          indiceFuente += campos[1]
          if (campos.length > 2) lineaOriginal += campos[2]
          if (campos.length > 3) columnaOriginal += campos[3]
          if (campos.length > 4) indiceNombre += campos[4]
          fuente = mapa.sources[indiceFuente] ?? null
        }
        inicios.push({ columna: columnaGenerada, fuente })
      }
    }

    const largoLinea = largoDeCadaLinea[numeroLinea] ?? 0
    for (let i = 0; i < inicios.length; i++) {
      const actual = inicios[i]
      const siguiente = inicios[i + 1]
      const fin = siguiente ? siguiente.columna : largoLinea
      const bytes = fin - actual.columna
      if (actual.fuente !== null && bytes > 0) {
        resultado[actual.fuente] = (resultado[actual.fuente] ?? 0) + bytes
      }
    }
  }

  return resultado
}

/**
 * De qué paquete viene una ruta de `sources`. Toma el ÚLTIMO
 * `node_modules` de la ruta (por los anidados): `node_modules/<pkg>` o
 * `node_modules/@scope/pkg`. Si no pasa por `node_modules`, `apps/mobile/…`
 * es `app`, `packages/core/…` es `@qps/core`, y el resto, `(otro)`.
 */
export function paqueteDe(ruta: string): string {
  const normalizada = ruta.replace(/\\/g, '/')
  const marca = 'node_modules/'
  const ultimoIndice = normalizada.lastIndexOf(marca)
  if (ultimoIndice !== -1) {
    const resto = normalizada.slice(ultimoIndice + marca.length).split('/')
    if (resto[0]?.startsWith('@') && resto.length > 1) {
      return `${resto[0]}/${resto[1]}`
    }
    return resto[0] ?? '(otro)'
  }
  if (normalizada.includes('apps/mobile/')) return 'app'
  if (normalizada.includes('packages/core/')) return '@qps/core'
  return '(otro)'
}

function aEntradas(bytesPorNombre: Record<string, number>, total: number): Entrada[] {
  return Object.entries(bytesPorNombre)
    .map(([nombre, bytes]) => ({ nombre, bytes, porcentaje: total > 0 ? (bytes / total) * 100 : 0 }))
    .sort((a, b) => b.bytes - a.bytes)
}

/**
 * El total de bytes repartidos y los `n` paquetes y `n` módulos más
 * pesados, con su porcentaje sobre el total. Si `n` cubre todas las
 * entradas, los porcentajes de la lista completa suman 100 (± redondeo).
 */
export function resumen(bytesPorNombre: Record<string, number>, n: number): Resumen {
  const total = Object.values(bytesPorNombre).reduce((acumulado, bytes) => acumulado + bytes, 0)

  const modulos = aEntradas(bytesPorNombre, total)

  const bytesPorPaquete: Record<string, number> = {}
  for (const [nombre, bytes] of Object.entries(bytesPorNombre)) {
    const paquete = paqueteDe(nombre)
    bytesPorPaquete[paquete] = (bytesPorPaquete[paquete] ?? 0) + bytes
  }
  const paquetes = aEntradas(bytesPorPaquete, total)

  return { total, paquetes: paquetes.slice(0, n), modulos: modulos.slice(0, n) }
}

/** Los `sources` cuyo `sourcesContent` contiene `texto` (busca en el contenido, no en el nombre). */
export function quienMenciona(mapa: MapaFuente, texto: string): string[] {
  const contenidos = mapa.sourcesContent ?? []
  const resultado: string[] = []
  for (let i = 0; i < mapa.sources.length; i++) {
    const contenido = contenidos[i]
    if (typeof contenido === 'string' && contenido.includes(texto)) {
      resultado.push(mapa.sources[i])
    }
  }
  return resultado
}
