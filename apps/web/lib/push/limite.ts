/**
 * Límite de tasa en memoria, POR INSTANCIA (decisión 4 de la tanda Q4).
 *
 * **Limitación conocida:** en Vercel corren varias instancias del mismo
 * deployment y cada una tiene su propio mapa; tampoco sobrevive a un arranque
 * en frío. Frena el abuso casual (un script desde una IP, un bucle de la app),
 * no un ataque distribuido. Las defensas que no dependen de la instancia están
 * en la base: formato estricto del token, 3 filas anónimas por `device_id` y la
 * purga de anónimos viejos. Si hace falta un límite global, la opción es una
 * tabla de contadores en la base (ver docs/propuestas/r82/diseno-82-bcd.md).
 *
 * Ventana fija por clave (más simple que deslizante y suficiente acá). El mapa
 * tiene un tope de claves: si se llena, primero barre las vencidas y, si sigue
 * lleno, descarta la más vieja (orden de inserción del `Map`). Reloj inyectable
 * para los tests.
 */

export type ResultadoLimite = { ok: true } | { ok: false; reintentarEnS: number }

export type Limitador = {
  permitir(clave: string, ahora?: number): ResultadoLimite
  /** Cantidad de claves guardadas (para tests). */
  tamanio(): number
}

export function crearLimitador(opciones: { max: number; ventanaMs: number; maxClaves?: number }): Limitador {
  const { max, ventanaMs } = opciones
  const maxClaves = opciones.maxClaves ?? 10_000
  const cubetas = new Map<string, { desde: number; cuenta: number }>()

  function barrer(ahora: number) {
    for (const [clave, c] of cubetas) {
      if (ahora - c.desde >= ventanaMs) cubetas.delete(clave)
    }
  }

  return {
    permitir(clave, ahora = Date.now()) {
      const actual = cubetas.get(clave)
      if (actual && ahora - actual.desde < ventanaMs) {
        if (actual.cuenta >= max) {
          return { ok: false, reintentarEnS: Math.max(1, Math.ceil((actual.desde + ventanaMs - ahora) / 1000)) }
        }
        actual.cuenta += 1
        return { ok: true }
      }
      if (actual) cubetas.delete(clave)
      if (cubetas.size >= maxClaves) {
        barrer(ahora)
        if (cubetas.size >= maxClaves) {
          const masVieja = cubetas.keys().next().value
          if (masVieja !== undefined) cubetas.delete(masVieja)
        }
      }
      cubetas.set(clave, { desde: ahora, cuenta: 1 })
      return { ok: true }
    },
    tamanio: () => cubetas.size,
  }
}

/** IP del pedido: el primer valor de `x-forwarded-for` (lo escribe Vercel). */
export function ipDeRequest(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  const primera = xff?.split(',')[0]?.trim()
  if (primera) return primera.slice(0, 64)
  const real = headers.get('x-real-ip')?.trim()
  return real ? real.slice(0, 64) : 'desconocida'
}
