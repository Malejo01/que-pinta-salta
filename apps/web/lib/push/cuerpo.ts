/**
 * Lectura defensiva del cuerpo de las rutas públicas de push (R82 / Q4-2).
 *
 * 1. `Content-Type` con esencia exacta `application/json` (415). No es CSRF (no
 *    hay sesión en juego), pero saca del medio a los `<form>` cross-site y a
 *    los `text/plain` sin preflight.
 * 2. Tamaño: se rechaza por `Content-Length` declarado y, además, se mide el
 *    texto leído (un cliente puede mentir o mandar chunked) (413).
 * 3. JSON válido (400).
 */

export const TAMANIO_MAXIMO_CUERPO = 2048

export type CuerpoLeido = { ok: true; cuerpo: unknown } | { ok: false; status: 400 | 413 | 415 }

export async function leerCuerpoJson(request: Request, maximo = TAMANIO_MAXIMO_CUERPO): Promise<CuerpoLeido> {
  const tipo = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (tipo !== 'application/json') return { ok: false, status: 415 }

  const declarado = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declarado) && declarado > maximo) return { ok: false, status: 413 }

  let texto: string
  try {
    texto = await request.text()
  } catch {
    return { ok: false, status: 400 }
  }
  if (new TextEncoder().encode(texto).length > maximo) return { ok: false, status: 413 }

  try {
    return { ok: true, cuerpo: JSON.parse(texto) }
  } catch {
    return { ok: false, status: 400 }
  }
}
