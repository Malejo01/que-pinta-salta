/**
 * Datos de la portada en el idioma de la página (Q3). Los títulos y las
 * descripciones de los eventos quedan como vienen (en castellano); lo que se
 * traduce es lo que arma el sitio: el nombre de la categoría (por slug) y los
 * dos textos que pone `packages/core/src/home/transform.ts` en `venue`.
 * En castellano no se toca nada. Puro: sin React ni next/*.
 */
import type { Category } from '@/lib/types'
import type { DisplayEvent } from '@/lib/home/types'
import { es } from './diccionarios/es'
import { nombreCategoria, textosDe } from './index'
import type { Idioma } from './idiomas'

export function localizarCategorias(categorias: Category[], idioma: Idioma): Category[] {
  if (idioma === 'es') return categorias
  const textos = textosDe(idioma)
  return categorias.map((c) => ({ ...c, name: nombreCategoria(textos, c.slug, c.name) }))
}

export function localizarEventos(eventos: DisplayEvent[], idioma: Idioma): DisplayEvent[] {
  if (idioma === 'es') return eventos
  const textos = textosDe(idioma)
  return eventos.map((evento) => {
    let venue = evento.venue
    if (evento.isCinemaMovie) venue = textos.portada.cinesDeSalta(Object.keys(evento.showings ?? {}).length)
    else if (venue === es.portada.lugarPorConfirmar) venue = textos.portada.lugarPorConfirmar
    return {
      ...evento,
      venue,
      categoryName: nombreCategoria(textos, evento.category, evento.categoryName),
    }
  })
}
