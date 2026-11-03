/** Q5-1 · Textos del admin de lugares para chicos (solo castellano: el admin no se traduce). */
import { FUENTES_VERIFICADAS } from '@qps/core/lugares/permanentes'

export const FUENTES_PARA_ELEGIR = FUENTES_VERIFICADAS

export const ETIQUETA_FUENTE: Record<string, string> = {
  visita: 'Visita',
  web_oficial: 'Web oficial del lugar',
  redes_oficiales: 'Redes oficiales del lugar',
  llamado: 'Llamado',
  organismo_publico: 'Organismo público',
  openstreetmap: 'OpenStreetMap (sin verificar)',
  pedido_publico: 'Pedido del formulario público (sin verificar)',
}

export const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: 'Borrador',
  publicado: 'Publicado',
  vencido: 'Vencido',
  archivado: 'Archivado',
}
