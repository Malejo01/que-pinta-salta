/**
 * Caché de geocodificación: evita volver a pedirle a Nominatim la misma
 * consulta en corridas sucesivas (y respeta así, de paso, el ritmo de 1
 * pedido/segundo de su política de uso).
 *
 * Puro: no toca el sistema de archivos. `leer`/`escribir` (el acceso al
 * archivo de caché) se inyectan; el llamador (el script) es quien decide
 * dónde vive ese archivo y cómo se lee o se escribe.
 */

/** Lo que se guarda por clave: el valor que decide el llamador, más cuándo se guardó. */
export interface EntradaCache<T> {
  valor: T
  guardadoEn: string
}

export interface OpcionesCache {
  /** Lee el contenido crudo del archivo de caché, o `null` si todavía no existe. */
  leer(): string | null
  /** Persiste el contenido crudo del archivo de caché. */
  escribir(texto: string): void
  /**
   * De dónde sale la fecha que se guarda en cada entrada (`guardadoEn`).
   * Inyectada para no depender del reloj global: por defecto, `new
   * Date().toISOString()` (el llamador real, el script, no necesita
   * inyectar nada; los tests sí, si quieren fijar la fecha).
   */
  ahora?: () => string
  /** Si `leer()` no devuelve JSON válido, se avisa por acá en vez de tirar. */
  avisar?: (mensaje: string) => void
}

export interface Cache {
  obtener<T>(clave: string): T | undefined
  guardar<T>(clave: string, valor: T): void
  /** Si la caché arrancó vacía por un problema de lectura, el aviso queda acá (si no se pasó `avisar`). */
  aviso: string | null
}

/**
 * Crea la caché a partir de lo que devuelva `leer()`. Si no es JSON válido o
 * no es un objeto, arranca vacía (nunca tira) y lo avisa: por `avisar`, si se
 * pasó, y siempre en `aviso` del objeto devuelto.
 */
export function crearCache(opciones: OpcionesCache): Cache {
  const { leer, escribir, avisar, ahora = () => new Date().toISOString() } = opciones

  let datos: Record<string, EntradaCache<unknown>> = {}
  let aviso: string | null = null

  const crudo = leer()
  if (crudo !== null) {
    let parsed: unknown
    let esJsonValido = true
    try {
      parsed = JSON.parse(crudo)
    } catch {
      esJsonValido = false
    }

    if (!esJsonValido || typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      aviso = 'La caché de geocodificación no tiene JSON de un objeto válido: arranca vacía.'
      avisar?.(aviso)
    } else {
      datos = parsed as Record<string, EntradaCache<unknown>>
    }
  }

  function obtener<T>(clave: string): T | undefined {
    const entrada = datos[clave]
    return entrada ? (entrada.valor as T) : undefined
  }

  function guardar<T>(clave: string, valor: T): void {
    datos = { ...datos, [clave]: { valor, guardadoEn: ahora() } }
    escribir(JSON.stringify(datos))
  }

  return { obtener, guardar, aviso }
}
