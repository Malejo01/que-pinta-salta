/**
 * Q6-4 · Banco de evaluación de IA: los tipos de los fixtures
 * (`docs/evaluacion-ia/*.json`) y de los resultados.
 */
import type { NombreProveedorIA } from '../tipos'

export type UsoEvaluado = 'flyers' | 'traduccion' | 'clasificacion'
export const USOS_EVALUADOS: readonly UsoEvaluado[] = ['flyers', 'traduccion', 'clasificacion']

/** Precio esperado: número de la entrada general, `'gratis'` o `null` (no se sabe). */
export type PrecioNormalizado = number | 'gratis' | null

export interface EsperadoFlyer {
  /** YYYY-MM-DD en hora de Salta. */
  fecha: string
  /** HH:MM en hora de Salta, o null si el evento no tiene hora (00:00 en la base). */
  hora: string | null
  lugar: string
  lugar_alias: string[]
  precio: PrecioNormalizado
  categoria: string
}

/** Lo que extrajo la IA de producción en su momento (línea de base sin gasto). */
export interface IaProduccionFlyer {
  modelo: string
  procesado: string
  fecha: string | null
  hora: string | null
  lugar: string | null
  precio: number | null
  categoria: string | null
}

export interface CasoFlyer {
  id: string
  origen: { tabla: 'instagram_flyers'; id: string }
  cuenta: string
  /** Fecha y hora del posteo, en hora de Salta (YYYY-MM-DDTHH:MM). */
  publicado: string
  caption: string | null
  imagen: 'no-descargada' | 'descargada'
  imagen_url: string
  esperado: EsperadoFlyer
  ia_produccion?: IaProduccionFlyer
  nota?: string
}

export interface CasoTraduccion {
  id: string
  origen: { tabla: 'events'; id: string }
  titulo: string
  descripcion: string | null
  descripcion_recortada?: boolean
  lugar: string | null
  artistas: string[]
  nombres_a_conservar: string[]
  referencia: 'agente' | 'revisada'
  esperado: { title_en: string; description_en: string | null }
}

export interface CasoClasificacion {
  id: string
  origen: { tabla: 'events'; id: string }
  titulo: string
  descripcion: string
  esperado: { categoria: string }
  fuente_categoria: 'manual' | 'scraper' | 'alias' | 'sin-dato'
}

export interface ArchivoFixtures<C> {
  version: 1
  uso: UsoEvaluado
  descripcion: string
  extraido: string
  criterio: string
  consulta: string
  cuentas_publicas?: string[]
  categorias?: string[]
  casos: C[]
}

export interface BancoEvaluacion {
  flyers: ArchivoFixtures<CasoFlyer>
  traduccion: ArchivoFixtures<CasoTraduccion>
  clasificacion: ArchivoFixtures<CasoClasificacion>
}

export interface PrecioModelo {
  clave: string
  proveedor: NombreProveedorIA
  entradaUsdMtok: number
  salidaUsdMtok: number
  tokensPorImagen: number
  fuente: string
  consultado: string
  estado: 'verificar' | 'confirmado' | 'referencia'
}

export interface Volumenes {
  consultado: string
  ventanaDias: number
  porMes: Record<UsoEvaluado, number>
  notas: Partial<Record<UsoEvaluado, string>>
}
