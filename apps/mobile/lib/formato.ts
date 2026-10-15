// Formato de texto para `TarjetaEvento` (R28, 28-f: F1). Puro: sin React ni
// `react-native`.
//
// `textoPrecio` no usa `toLocaleString('es-AR')`: en Hermes el separador de
// miles de un locale depende de los datos ICU que vengan compilados, y no
// está garantizado que `es-AR` esté entre ellos. El agrupado de miles se
// arma a mano, dígito por dígito.
export type PrecioEvento = 'gratis' | 'confirmar' | number

/** "$12.500": miles separados por punto, sin decimales (los precios de la base son enteros). */
function agruparMiles(valor: number): string {
  const entero = Math.round(valor)
  const negativo = entero < 0
  const digitos = Math.abs(entero).toString()

  let agrupado = ''
  for (let i = 0; i < digitos.length; i++) {
    const posicionDesdeElFinal = digitos.length - i
    if (i > 0 && posicionDesdeElFinal % 3 === 0) agrupado += '.'
    agrupado += digitos[i]
  }

  return negativo ? `-${agrupado}` : agrupado
}

/**
 * `'gratis'` -> "Gratis"; un número -> "$12.500"; `'confirmar'`, `null` o
 * `undefined` -> `null` (sin precio para mostrar, igual que la web).
 */
export function textoPrecio(price: PrecioEvento | null | undefined): string | null {
  if (price === 'gratis') return 'Gratis'
  if (price === 'confirmar' || price === null || price === undefined) return null
  return `$${agruparMiles(price)}`
}
