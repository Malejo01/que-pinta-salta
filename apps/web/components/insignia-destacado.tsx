import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface InsigniaDestacadoProps {
  /**
   * Ya resuelto por quien llama: este componente no sabe nada de
   * `featured_until` ni de `is_featured`. La única regla de si un evento
   * está destacado vive en `estaDestacado()` (`@qps/core/events/destacados`,
   * compara `featured_until` contra "ahora") — acá solo se dibuja o no.
   */
  visible: boolean
  className?: string
}

/**
 * Insignia "★ Destacado" (R50, QPS-239/-240, tarea 50-c): mismo aspecto que
 * la insignia de siempre en `event-card.tsx` (gradiente ámbar, texto negro).
 * Esta es la ÚNICA copia del JSX: `event-card.tsx`, `hero-carousel.tsx`,
 * `event-detail-page.tsx`, `event-modal-wrapper.tsx` y `event-modal.tsx`
 * importan este componente en vez de redibujar el badge a mano.
 *
 * Las clases de posición (p. ej. `absolute left-2 top-8` en la tarjeta) NO
 * van acá adentro: cada llamador las manda por `className`, porque el lugar
 * donde "va al lado de la categoría" cambia según el layout de cada uno.
 *
 * Sin "use client": es presentación pura (sin estado, sin hooks), la puede
 * montar tanto un Server Component (la ficha) como uno de cliente (la
 * tarjeta, el carrusel, los modales).
 */
export function InsigniaDestacado({ visible, className }: InsigniaDestacadoProps) {
  if (!visible) return null

  return (
    <Badge
      aria-label="Evento destacado"
      className={cn(
        "bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold flex items-center gap-0.5 shadow-md border-none text-[10px] py-0 px-1.5",
        className
      )}
    >
      ★ Destacado
    </Badge>
  )
}
