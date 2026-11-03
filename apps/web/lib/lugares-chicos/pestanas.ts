/**
 * Q5-1 · En qué pestaña de /admin/lugares-chicos va cada ficha. «Vencidos»
 * junta las marcadas `vencido` y las publicadas que pasaron su plazo de
 * revisión (siguen visibles en público hasta que un admin decida).
 */
import type { EstadoRevision } from '@qps/core/lugares/permanentes'

export type PestañaLugaresChicos = 'borradores' | 'publicados' | 'vencidos' | 'archivados'

export const PESTAÑAS_LUGARES_CHICOS: { ver: PestañaLugaresChicos; label: string }[] = [
  { ver: 'borradores', label: 'Borradores' },
  { ver: 'publicados', label: 'Publicados' },
  { ver: 'vencidos', label: 'Para volver a verificar' },
  { ver: 'archivados', label: 'Archivados' },
]

export function pestañaDeLugar(estado: string, revision: EstadoRevision): PestañaLugaresChicos {
  if (estado === 'archivado') return 'archivados'
  if (estado === 'vencido') return 'vencidos'
  if (estado === 'publicado') return revision === 'al_dia' ? 'publicados' : 'vencidos'
  return 'borradores'
}
