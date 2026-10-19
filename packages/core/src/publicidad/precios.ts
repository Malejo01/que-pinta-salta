/**
 * Tarifario de "Publicitá tu evento" (decisión de Mauro del 19/10, 16:10).
 *
 * Sale de la "Tabla final" de `ops/estudio-precios-publicidad.md`, vigente
 * noviembre 2026. Son **precios finales** (no se les suma IVA). Mientras no
 * exista la R58 (precios automáticos en la tabla `ad_prices`), esta constante
 * es la única fuente: la web la importa de `@qps/core/publicidad/precios`.
 *
 * Los montos del precio fundador están redondeados a $500, como en la tabla:
 * no son exactamente el 30% del precio de lista.
 */

export type PrecioPublicidad =
  /** Sin cargo (la publicación básica). */
  | { tipo: 'gratis' }
  /** Precio en pesos. `periodo: 'mes'` para los planes mensuales; `null` es un pago único. */
  | { tipo: 'pesos'; listaArs: number; fundadorArs: number; usdLista: number; periodo: 'mes' | null }
  /** Todavía no se vende (el push, hasta que lance la app). */
  | { tipo: 'proximamente' }

export interface ProductoPublicidad {
  id: string
  nombre: string
  /** Qué incluye, como en la tabla final. */
  queIncluye: string
  precio: PrecioPublicidad
  /** Resalta la tarjeta (el producto que más se vende). */
  destacado?: boolean
}

/** Mes de vigencia del tarifario. */
export const VIGENCIA_TARIFARIO = 'noviembre 2026'

/** Descuento "Anunciante Fundador" (primeros 10 anunciantes o hasta el 31/01/2027). */
export const DESCUENTO_FUNDADOR = 0.3

export const TARIFARIO: readonly ProductoPublicidad[] = [
  {
    id: 'basica',
    nombre: 'Publicación básica',
    queIncluye: 'Tu evento en la agenda, ficha con link a entradas y "cómo llegar".',
    precio: { tipo: 'gratis' },
  },
  {
    id: 'destacado-3',
    nombre: 'Destacado fin de semana (3 días)',
    queIncluye: 'Hero de la home + sello "Destacado" en la agenda.',
    precio: { tipo: 'pesos', listaArs: 8500, fundadorArs: 6000, usdLista: 5.6, periodo: null },
  },
  {
    id: 'destacado-7',
    nombre: 'Destacado semana (7 días)',
    queIncluye: 'Igual al anterior, 7 días + reporte de clics.',
    precio: { tipo: 'pesos', listaArs: 14000, fundadorArs: 10000, usdLista: 9.2, periodo: null },
    destacado: true,
  },
  {
    id: 'destacado-14',
    nombre: 'Destacado hasta tu fecha (hasta 14 días)',
    queIncluye: 'Igual, hasta el día del evento + reporte de clics.',
    precio: { tipo: 'pesos', listaArs: 24000, fundadorArs: 17000, usdLista: 15.7, periodo: null },
  },
  {
    id: 'pack-lanzamiento',
    nombre: 'Pack Lanzamiento de Evento',
    queIncluye: 'Destacado hasta la fecha + push patrocinado (cuando lance la app).',
    precio: { tipo: 'pesos', listaArs: 20000, fundadorArs: 14000, usdLista: 13.1, periodo: null },
  },
  {
    id: 'plan-mensual',
    nombre: 'Plan Mensual Organizador/Venue',
    queIncluye: '4 destacados de 7 días por mes + 1 push por mes (con la app).',
    precio: { tipo: 'pesos', listaArs: 42000, fundadorArs: 29500, usdLista: 27.5, periodo: 'mes' },
  },
  {
    id: 'plan-rrpp',
    nombre: 'Plan RRPP',
    queIncluye: '2 destacados de finde por mes + botón "Anotate en la lista" a tu WhatsApp con seguimiento.',
    precio: { tipo: 'pesos', listaArs: 14500, fundadorArs: 10000, usdLista: 9.5, periodo: 'mes' },
  },
  {
    id: 'push',
    nombre: 'Push patrocinado',
    queIncluye: '1 notificación a usuarios de la app (1 cupo por semana).',
    precio: { tipo: 'proximamente' },
  },
]

/** Texto de pie de la tabla, tal como lo fijó Mauro. */
export const PIE_TARIFARIO =
  'Precios en pesos al dólar BNA del 1/11/2026. Se actualizan el 1° de cada mes según la audiencia del sitio y el tipo de cambio; ' +
  'los cambios de tramo se anuncian con 30 días de anticipación. Plan mensual prepago 3 meses: 10% off adicional. ' +
  'Precio fundador para los primeros 10 anunciantes o hasta el 31/01/2027, congelado por 90 días. ' +
  'Pago por transferencia o Mercado Pago antes de la publicación.'

/** "$ 14.000" (formato es-AR, sin decimales). */
export function formatearPesos(monto: number): string {
  return `$ ${Math.round(monto).toLocaleString('es-AR')}`
}

/** El precio de lista como se muestra: "Gratis", "Próximamente", "$ 14.000" o "$ 42.000/mes". */
export function textoPrecioLista(precio: PrecioPublicidad): string {
  if (precio.tipo === 'gratis') return 'Gratis'
  if (precio.tipo === 'proximamente') return 'Próximamente'
  return `${formatearPesos(precio.listaArs)}${precio.periodo === 'mes' ? '/mes' : ''}`
}

/** El precio fundador como se muestra: "Gratis", "Reservá prioridad", "$ 10.000" o "$ 29.500/mes". */
export function textoPrecioFundador(precio: PrecioPublicidad): string {
  if (precio.tipo === 'gratis') return 'Gratis'
  if (precio.tipo === 'proximamente') return 'Reservá prioridad'
  return `${formatearPesos(precio.fundadorArs)}${precio.periodo === 'mes' ? '/mes' : ''}`
}

/** "USD 9,2" aproximado del precio de lista, o `null` si no tiene precio en pesos. */
export function textoUsdAprox(precio: PrecioPublicidad): string | null {
  if (precio.tipo !== 'pesos') return null
  return `USD ${precio.usdLista.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
}
