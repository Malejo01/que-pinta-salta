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
}

/** Pieza presentacional del botón de "Voy": sin estado, sin hooks. La usa `FilaAccionesEventoVista`. */
export function BotonVoy({ voy, cantidadVoy, pendiente, onClick, titulo, className }: BotonVoyProps) {
  const texto = textoBotonVoy(cantidadVoy)
  return (
    <Button
      type="button"
      size="lg"
      variant={voy ? "default" : "outline"}
      className={cn("min-h-11 flex-1 sm:flex-none", className)}
      disabled={pendiente}
      aria-pressed={voy}
      // B4 (label-content-name-mismatch): el nombre accesible arranca con el
      // texto visible ("Voy" o "Voy · 12 van") y después suma la acción con
      // el título del evento. Antes era solo "Marcar que vas a …", sin la
      // palabra que se ve en el botón: quien usa control por voz dice "Voy" y
      // no le encontraba el botón.
      aria-label={`${texto}: ${
        voy ? `marcar que no vas a ${titulo ?? "este evento"}` : `marcar que vas a ${titulo ?? "este evento"}`
      }`}
      onClick={onClick}
    >
      <Check className="mr-2 size-4" />
      {texto}
    </Button>
  )
}
