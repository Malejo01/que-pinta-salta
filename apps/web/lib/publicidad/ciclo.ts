import type { SupabaseClient } from '@supabase/supabase-js'
import { formatSaltaDayKey } from '@qps/core/date-format'
import {
  armarPropuesta,
  PRODUCTOS_CON_PRECIO,
  type CicloAnterior,
  type PrecioVigente,
  type ProductoConPrecio,
} from '@qps/core/publicidad/formula'
import { cargarOcupacion2Meses } from './ocupacion'
import { obtenerTipoCambio } from './fuentes'

/**
 * El ciclo de precios del mes (R58). Idempotente: si ya existe el ciclo del mes
 * (en cualquier estado) no escribe nada, así cualquier día del mes recupera un
 * día 1 que falló. No manda nada hacia afuera: el único `fetch` es el de las
 * fuentes externas (el tipo de cambio).
 */

export type ResultadoCiclo = 'creado' | 'ya-existia' | 'sin-tipo-de-cambio'

export interface OpcionesCiclo {
  ahora: Date
  fetch: typeof fetch
}

/** El día 1 del mes de Salta de `ahora`, como `'AAAA-MM-01'`. */
export function cicloDeLaFecha(ahora: Date): string {
  return `${formatSaltaDayKey(ahora).slice(0, 7)}-01`
}

/**
 * Desvío máximo (en cualquier dirección) del dólar de la fuente respecto del del
 * ciclo anterior. Más que eso se trata como dato anómalo: se usa el anterior,
 * marcado 'anterior', y el admin puede cargarlo a mano.
 */
export const DESVIO_MAXIMO_TIPO_CAMBIO = 0.3

const PRODUCTOS = new Set<string>(PRODUCTOS_CON_PRECIO)

async function cargarAnterior(admin: SupabaseClient, ciclo: string): Promise<(CicloAnterior & { tipoCambio: number; audienciaWeb28d: number }) | null> {
  const { data, error } = await admin
    .from('ad_price_cycles')
    .select(
      'ciclo, audiencia_web_28d, audiencia, tramo_vigente, tramo_calculado, cambio_tramo_desde, factor_hero, factor_push, tipo_cambio',
    )
    .in('estado', ['aprobado', 'automatico'])
    .lt('ciclo', ciclo)
    .order('ciclo', { ascending: false })
    .limit(1)
  if (error) throw new Error('ciclo: no se pudo leer el ciclo anterior')
  const fila = (data ?? [])[0] as Record<string, unknown> | undefined
  if (!fila) return null

  const precios = await admin
    .from('ad_prices')
    .select('producto, precio_ars, precio_usd, tipo_cambio')
    .eq('ciclo', fila.ciclo as string)
    .eq('estado', 'aprobado')
  if (precios.error) throw new Error('ciclo: no se pudieron leer los precios del ciclo anterior')

  const vigentes: Partial<Record<ProductoConPrecio, PrecioVigente>> = {}
  for (const p of (precios.data ?? []) as Array<Record<string, unknown>>) {
    if (!PRODUCTOS.has(p.producto as string)) continue
    vigentes[p.producto as ProductoConPrecio] = {
      precioArs: Number(p.precio_ars),
      precioUsd: Number(p.precio_usd),
      tipoCambio: Number(p.tipo_cambio),
    }
  }

  return {
    ciclo: fila.ciclo as string,
    audiencia: Number(fila.audiencia),
    tramoVigente: Number(fila.tramo_vigente),
    tramoCalculado: Number(fila.tramo_calculado),
    cambioTramoDesde: (fila.cambio_tramo_desde as string | null) ?? null,
    factorHero: Number(fila.factor_hero),
    factorPush: Number(fila.factor_push),
    precios: vigentes,
    audienciaWeb28d: Number(fila.audiencia_web_28d),
    tipoCambio: Number(fila.tipo_cambio),
  }
}

export async function proponerCicloDelMes(admin: SupabaseClient, opciones: OpcionesCiclo): Promise<ResultadoCiclo> {
  const { ahora } = opciones
  const ciclo = cicloDeLaFecha(ahora)

  // 2. Si ya existe el del mes, no se escribe nada.
  const existente = await admin.from('ad_price_cycles').select('ciclo').eq('ciclo', ciclo).limit(1)
  if (existente.error) throw new Error('ciclo: no se pudo buscar el ciclo del mes')
  if ((existente.data ?? []).length > 0) return 'ya-existia'

  // 3. El anterior aprobado (para el trinquete, la histéresis y los factores).
  const anterior = await cargarAnterior(admin, ciclo)

  // 4. El tipo de cambio: la fuente, o el del anterior (marcado), o nada.
  const tc = await obtenerTipoCambio({
    fetch: opciones.fetch,
    ahora,
    alFallar: (codigo) => console.warn(`[CronPublicidad] tipo de cambio: ${codigo}`),
  })
  const anteriorValido = anterior && Number.isFinite(anterior.tipoCambio) && anterior.tipoCambio > 0 ? anterior.tipoCambio : null
  // Con la aprobación automática, un valor erróneo de la fuente llegaría a precios
  // públicos sin revisión: si se desvía de más respecto del ciclo anterior, no se usa.
  const tcAnomalo =
    tc !== null && tc !== undefined && anteriorValido !== null && Math.abs(tc.valor - anteriorValido) / anteriorValido > DESVIO_MAXIMO_TIPO_CAMBIO
  let tipoCambio: number
  let fuenteTipoCambio: string
  if (tc && !tcAnomalo) {
    tipoCambio = tc.valor
    fuenteTipoCambio = 'dolarapi'
  } else if (anteriorValido !== null) {
    tipoCambio = anteriorValido
    fuenteTipoCambio = 'anterior'
  } else {
    return 'sin-tipo-de-cambio'
  }

  // 5. La audiencia (decisión 1, default manual): la del anterior, o 0. Mauro
  // carga el número en el admin antes de aprobar.
  // [COMPLETAR: con VERCEL_ANALYTICS_TOKEN y el endpoint verificado, 'vercel'.]
  const audienciaWeb28d = anterior && Number.isFinite(anterior.audienciaWeb28d) ? Math.max(0, anterior.audienciaWeb28d) : 0

  const ocupacion = await cargarOcupacion2Meses(admin, ciclo)

  // 6. mau_app_28d y dispositivos_push en null: sin fuente definida, el push no
  // se vende y no se escribe su fila.
  // [COMPLETAR: de dónde salen el MAU de la app y los dispositivos con push activo.]
  const { ciclo: filaCiclo, precios } = armarPropuesta({
    ciclo,
    audienciaWeb28d,
    mauApp28d: null,
    dispositivosPush: null,
    fuenteAudiencia: 'manual',
    tipoCambio,
    fuenteTipoCambio,
    ocupacionHero: ocupacion.hero,
    ocupacionPush: ocupacion.push,
    anterior,
  })

  // 8. El estado.
  const ajustes = await admin.from('ad_settings').select('aprobacion_automatica').eq('id', true).limit(1)
  if (ajustes.error) throw new Error('ciclo: no se pudo leer ad_settings')
  const automatico = ((ajustes.data ?? [])[0] as { aprobacion_automatica?: boolean } | undefined)?.aprobacion_automatica === true

  const insertCiclo = await admin.from('ad_price_cycles').insert({
    ...filaCiclo,
    estado: automatico ? 'automatico' : 'propuesto',
    approved_at: automatico ? ahora.toISOString() : null,
    approved_by: null,
  })
  if (insertCiclo.error) throw new Error('ciclo: no se pudo crear el ciclo')

  // 9. Los precios; si fallan, se borra el ciclo para no dar el mes por hecho.
  const insertPrecios = await admin
    .from('ad_prices')
    .insert(precios.map((p) => ({ ...p, ciclo, estado: automatico ? 'aprobado' : 'propuesto' })))
  if (insertPrecios.error) {
    const borrado = await admin.from('ad_price_cycles').delete().eq('ciclo', ciclo)
    throw new Error(
      borrado.error
        ? 'ciclo: fallaron los precios y tampoco se pudo borrar el ciclo recién creado'
        : 'ciclo: fallaron los precios; se borró el ciclo recién creado',
    )
  }

  return 'creado'
}
