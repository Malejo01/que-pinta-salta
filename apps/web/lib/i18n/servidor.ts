import { headers } from "next/headers"
import { ENCABEZADO_IDIOMA, esIdioma, type Idioma } from "./idiomas"

/**
 * El idioma del pedido actual, para Server Components que no saben en qué
 * ruta están (el layout raíz). Lo pone el middleware (`middleware.ts`), que
 * lo pisa siempre: no se puede mandar falseado desde el cliente.
 *
 * Ojo: leer `headers()` hace dinámica a la página que lo usa.
 */
export async function idiomaDelPedido(): Promise<Idioma> {
  const valor = (await headers()).get(ENCABEZADO_IDIOMA)
  return esIdioma(valor) ? valor : "es"
}
