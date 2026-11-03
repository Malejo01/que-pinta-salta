/**
 * Q5-3 · «Sumá un lugar para chicos»: validación del pedido y anti-spam sin
 * dependencias (puro, testeable).
 *
 *  - Honeypot: un campo `sitio` que una persona no ve ni completa (oculto,
 *    fuera del orden de tabulación). Si viene con algo, es un bot: se le
 *    contesta «gracias» igual y no se guarda nada (no le enseñamos qué falló).
 *  - Tiempo mínimo: la página manda `iniciado` (ms) al dibujar el formulario.
 *    Menos de 4 segundos hasta enviar es un bot; más de 2 horas, un formulario
 *    viejo (se pide recargar). Un bot que no carga la página no lo tiene.
 *  - Límite por IP en memoria (lib/push/limite.ts): lo aplica la server action.
 *
 * Los errores salen como CÓDIGOS: el texto lo elige la interfaz según el idioma.
 */
import { esTipoLugar, type TipoLugarPermanente } from '@qps/core/lugares/permanentes'

/** La marca de «formulario dibujado» (la hora del servidor al armar la página). */
export function marcaDeInicio(): number {
  return Date.now()
}

export const TIEMPO_MINIMO_MS = 4_000
export const TIEMPO_MAXIMO_MS = 2 * 60 * 60 * 1000

export type CodigoPedido =
  | 'nombre'
  | 'direccion'
  | 'tipo'
  | 'link'
  | 'contacto'
  | 'comentario'
  | 'vencido'
  | 'limite'
  | 'servidor'

export type DatosPedido = {
  nombre: string
  direccion: string
  tipo: TipoLugarPermanente | null
  comentario: string | null
  link: string | null
  contacto: string | null
}

export type Leer = (clave: string) => string | null

/**
 * Q6-7: caracteres de control (U+0000, que Postgres rechaza en un `text`) y
 * los de dirección del texto (U+202A–U+202E, U+2066–U+2069, que dan vuelta lo
 * que ve el admin) se sacan antes de guardar.
 */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g

/** Recorta a `max` caracteres como los cuenta Postgres (puntos de código): nunca parte un emoji. */
function recortar(valor: string, max: number): string {
  const caracteres = Array.from(valor)
  return caracteres.length <= max ? valor : caracteres.slice(0, max).join('')
}

function limpio(valor: string | null, max: number): string {
  return recortar((valor ?? '').replace(CONTROL, '').replace(/\s+/g, ' ').trim(), max).trim()
}

/** El comentario conserva los renglones (el admin lo ve con `whitespace-pre-line`). */
function comentarioLimpio(valor: string | null): string {
  return (valor ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, '').trim()
}

/** Largo máximo del link (el check de la base). */
export const MAX_LINK = 300

export type ResultadoAntiSpam = 'ok' | 'bot' | 'vencido'

export function evaluarAntiSpam(leer: Leer, ahora: number): ResultadoAntiSpam {
  if ((leer('sitio') ?? '').trim() !== '') return 'bot'
  const iniciado = Number(leer('iniciado'))
  if (!Number.isFinite(iniciado) || iniciado <= 0) return 'bot'
  const pasaron = ahora - iniciado
  if (pasaron < TIEMPO_MINIMO_MS) return 'bot'
  if (pasaron > TIEMPO_MAXIMO_MS) return 'vencido'
  return 'ok'
}

export function validarPedido(leer: Leer): { ok: true; datos: DatosPedido } | { ok: false; codigo: CodigoPedido } {
  const nombre = limpio(leer('nombre'), 200)
  if (nombre.length < 3) return { ok: false, codigo: 'nombre' }
  const direccion = limpio(leer('direccion'), 300)
  if (direccion.length < 3) return { ok: false, codigo: 'direccion' }
  const tipoCrudo = leer('tipo') ?? ''
  if (tipoCrudo !== '' && !esTipoLugar(tipoCrudo)) return { ok: false, codigo: 'tipo' }
  const comentarioCrudo = comentarioLimpio(leer('comentario'))
  if (Array.from(comentarioCrudo).length > 1000) return { ok: false, codigo: 'comentario' }
  const linkCrudo = limpio(leer('link'), MAX_LINK)
  let link: string | null = null
  if (linkCrudo) {
    try {
      const u = new URL(/^https?:\/\//i.test(linkCrudo) ? linkCrudo : `https://${linkCrudo}`)
      if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) return { ok: false, codigo: 'link' }
      // Q6-7: un link con usuario y clave (https://a:b@…) no es el de un lugar.
      if (u.username || u.password) return { ok: false, codigo: 'link' }
      link = u.toString()
      // Q6-7: al normalizar (acentos, espacios) puede pasarse del check de la
      // base, que contestaría «no pudimos guardar»: mejor decir que el link no sirve.
      if (link.length > MAX_LINK) return { ok: false, codigo: 'link' }
    } catch {
      return { ok: false, codigo: 'link' }
    }
  }
  const contacto = limpio(leer('contacto'), 200)
  if (contacto && contacto.length < 5) return { ok: false, codigo: 'contacto' }
  return {
    ok: true,
    datos: {
      nombre,
      direccion,
      tipo: tipoCrudo === '' ? null : (tipoCrudo as TipoLugarPermanente),
      comentario: comentarioCrudo || null,
      link,
      contacto: contacto || null,
    },
  }
}
