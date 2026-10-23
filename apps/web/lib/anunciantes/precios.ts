import {
  PIE_TARIFARIO,
  TARIFARIO,
  VIGENCIA_TARIFARIO,
  type ProductoPublicidad,
} from "@qps/core/publicidad/precios"

/**
 * Los precios que muestra "Publicitá tu evento" (R58): por producto, el precio
 * aprobado más reciente de `ad_prices` con `vigente_desde <= hoy`. El tarifario
 * de `@qps/core/publicidad/precios` sigue siendo el respaldo (sin filas, o si
 * cualquier lectura falla). El nombre, el orden, `queIncluye`, `destacado` y el
 * período salen siempre de ese tarifario; de la base, solo los montos.
 *
 * El cliente es el de la service key (saltea la RLS): por eso el filtro
 * `estado = 'aprobado'` va en la consulta y no se confía en las políticas.
 */

export interface TarifarioVigente {
  productos: ProductoPublicidad[]
  /** "diciembre 2026" */
  vigencia: string
  /** El pie de `PIE_TARIFARIO`, con la fecha del dólar del ciclo vigente. */
  pie: string
  /** Aviso de cambio de tramo, o `null`. */
  aviso: string | null
}

/**
 * Cliente mínimo (solo `.from(tabla)` con el encadenado sin tipar), como en
 * `metricas.ts`: no ata el módulo al cliente de Supabase y simplifica los dobles.
 */
export interface ClientePrecios {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

const DIA = /^\d{4}-\d{2}-\d{2}$/

function respaldo(): TarifarioVigente {
  return { productos: [...TARIFARIO], vigencia: VIGENCIA_TARIFARIO, pie: PIE_TARIFARIO, aviso: null }
}

function numeroPositivo(valor: unknown): number | null {
  const n = typeof valor === "string" && valor.trim() !== "" ? Number(valor) : valor
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null
}

/** "2026-12-01" -> { d: 1, m: 12, a: 2026 } */
function partesDelDia(dia: string): { d: number; m: number; a: number } {
  const [a, m, d] = dia.split("-").map(Number)
  return { d, m, a }
}

function mesDeVigencia(dia: string): string {
  const texto = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${dia}T00:00:00Z`),
  )
  return texto.replace(/\s+de\s+/i, " ").toLowerCase()
}

function codigoDeError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string" && /^[\w-]{1,20}$/.test(code)) return code
  }
  return "desconocido"
}

interface FilaPrecio {
  producto: unknown
  precio_usd: unknown
  precio_ars: unknown
  precio_fundador_ars: unknown
  vigente_desde: unknown
}

export async function cargarTarifarioVigente(cliente: ClientePrecios, hoy: string): Promise<TarifarioVigente> {
  try {
    if (!DIA.test(hoy)) return respaldo()

    const precios = await cliente
      .from("ad_prices")
      .select("producto, precio_usd, precio_ars, precio_fundador_ars, tipo_cambio, vigente_desde")
      .eq("estado", "aprobado")
      .lte("vigente_desde", hoy)
      .order("vigente_desde", { ascending: false })
    if (precios.error) {
      console.error("[anunciantes] No se pudieron leer los precios:", codigoDeError(precios.error))
      return respaldo()
    }

    const ciclos = await cliente
      .from("ad_price_cycles")
      .select("ciclo, cambio_tramo_desde, tramo_calculado")
      .in("estado", ["aprobado", "automatico"])
      .lte("ciclo", hoy)
      .order("ciclo", { ascending: false })
      .limit(1)
    if (ciclos.error) {
      console.error("[anunciantes] No se pudo leer el ciclo de precios:", codigoDeError(ciclos.error))
      return respaldo()
    }

    // El más reciente por producto (las filas ya vienen de la más nueva a la más vieja;
    // se ordena igual por si el cliente no respetó el orden).
    const filas = ((precios.data ?? []) as FilaPrecio[])
      .filter((f) => typeof f.vigente_desde === "string" && DIA.test(f.vigente_desde) && f.vigente_desde <= hoy)
      .sort((a, b) => (a.vigente_desde as string) < (b.vigente_desde as string) ? 1 : -1)
    const porProducto = new Map<string, FilaPrecio>()
    for (const fila of filas) {
      if (typeof fila.producto !== "string" || porProducto.has(fila.producto)) continue
      porProducto.set(fila.producto, fila)
    }

    let masReciente: string | null = null
    const productos = TARIFARIO.map((base): ProductoPublicidad => {
      if (base.id === "basica") return base
      const fila = porProducto.get(base.id)
      if (!fila) return base
      const listaArs = numeroPositivo(fila.precio_ars)
      const fundadorArs = numeroPositivo(fila.precio_fundador_ars)
      const usdLista = numeroPositivo(fila.precio_usd)
      if (listaArs === null || fundadorArs === null || usdLista === null) return base
      const dia = fila.vigente_desde as string
      if (masReciente === null || dia > masReciente) masReciente = dia
      const periodo = base.precio.tipo === "pesos" ? base.precio.periodo : null
      return { ...base, precio: { tipo: "pesos", listaArs, fundadorArs, usdLista, periodo } }
    })

    const vigenteDesde: string | null = masReciente
    let vigencia = VIGENCIA_TARIFARIO
    let pie = PIE_TARIFARIO
    if (vigenteDesde !== null) {
      vigencia = mesDeVigencia(vigenteDesde)
      const { d, m, a } = partesDelDia(vigenteDesde)
      pie = PIE_TARIFARIO.replace(/(dólar BNA del )\d{1,2}\/\d{1,2}\/\d{4}/, `$1${d}/${m}/${a}`)
    }

    let aviso: string | null = null
    const ciclo = ((ciclos.data ?? []) as Array<{ cambio_tramo_desde?: unknown; tramo_calculado?: unknown }>)[0]
    if (ciclo && typeof ciclo.cambio_tramo_desde === "string" && DIA.test(ciclo.cambio_tramo_desde)) {
      const tramo = numeroPositivo(ciclo.tramo_calculado)
      if (ciclo.cambio_tramo_desde > hoy && tramo !== null) {
        const { d, m } = partesDelDia(ciclo.cambio_tramo_desde)
        aviso = `Desde el ${d}/${m}, los precios pasan al tramo de ${Math.round(tramo).toLocaleString("es-AR")} personas.`
      }
    }

    return { productos, vigencia, pie, aviso }
  } catch (error) {
    console.error("[anunciantes] Error leyendo los precios vigentes:", codigoDeError(error))
    return respaldo()
  }
}
