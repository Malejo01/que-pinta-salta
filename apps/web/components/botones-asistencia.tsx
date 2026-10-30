"use client"

// El botón de "Voy" (R38, tareas 38-a/38-b; reescrito en la R47, tarea
// 47-c, QPS-197/QPS-199). Antes este archivo tenía `BotonesAsistencia`, con
// DOS botones ("Voy" / "Me interesa", `TIPOS_EN_ORDEN` y un mapeo a mano
// `me_interesa: cantidades.meInteresa`). "Me interesa" desapareció del
// modelo: ahora hay un solo tipo de asistencia (`'voy'`), y el estado y las
// llamadas a la server action viven en `FilaAccionesEvento`
// (`components/fila-acciones-evento.tsx`), que dibuja ♥ Guardar, ✓ Voy y
// Compartir en el orden de `ORDEN_FILA_ACCIONES` (de core).
//
// Lo que queda acá es SOLO la pieza presentacional del botón de Voy: sin
// estado, sin hooks (así `FilaAccionesEventoVista` la puede usar y seguir
// siendo renderizable con `renderToStaticMarkup`, sin dispatcher de React).
// El texto sale siempre de `textoBotonVoy` (de `@qps/core/asistencia`); el
// "✓" es un ícono de lucide-react que dibuja este componente, nunca texto.
import { Check } from "lucide-react"
import { textoBotonVoy } from "@qps/core/asistencia"
import { Button } from "@/components/ui/button"
import { textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { cn } from "@/lib/utils"

export interface BotonVoyProps {
  voy: boolean
  cantidadVoy: number
  /** Hay una acción en vuelo (como el `pendiente` de siempre): el botón queda `disabled`. */
  pendiente: boolean
  onClick: () => void
  /** Para el `aria-label`: no afecta el texto visible (siempre `textoBotonVoy`). */
  titulo?: string
  className?: string
  /**
   * Idioma de los textos (por prop: esta pieza no usa hooks). En castellano
   * el texto visible es `textoBotonVoy` de core, como siempre; en inglés, el
   * del diccionario, con el mismo umbral.
   */
  idioma?: Idioma
}

/** Pieza presentacional del botón de "Voy": sin estado, sin hooks. La usa `FilaAccionesEventoVista`. */
export function BotonVoy({ voy, cantidadVoy, pendiente, onClick, titulo, className, idioma = "es" }: BotonVoyProps) {
  const t = textosDe(idioma).asistencia
  const nombre = titulo ?? t.esteEvento
  return (
    <Button
      type="button"
      size="lg"
      variant={voy ? "default" : "outline"}
      className={cn("min-h-11 flex-1 sm:flex-none", className)}
      disabled={pendiente}
      aria-pressed={voy}
      aria-label={voy ? t.ariaNoVoy(nombre) : t.ariaVoy(nombre)}
      onClick={onClick}
    >
      <Check className="mr-2 size-4" />
      {idioma === "es" ? textoBotonVoy(cantidadVoy) : t.botonVoy(cantidadVoy)}
    </Button>
  )
}
