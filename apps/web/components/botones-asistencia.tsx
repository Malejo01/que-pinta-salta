"use client"

// "Voy" / "Me interesa" de la ficha de un evento (R38, tarea 38-b). Las
// cantidades y la marca propia iniciales las trae el servidor
// (`app/evento/[id]/page.tsx`); el texto de cada botón y el umbral del
// contador salen de `@qps/core/asistencia`, nunca de una copia local.
//
// Sin sesión, tocar un botón abre el `AuthModal` (sin escribir nada); con
// sesión, llama a la server action (`@/lib/asistencia`), que lee la marca
// actual de la base antes de decidir qué hacer — este componente nunca
// manda su propio estado como si fuera la verdad.
import { useState } from "react"
import { TEXTO_ENTRAR_PARA_MARCAR, textoBoton, type TipoAsistencia } from "@qps/core/asistencia"
import { marcarAsistencia, type CantidadesAsistencia } from "@/lib/asistencia"
import { Button } from "@/components/ui/button"
import { useAuthModal } from "@/components/auth-modal"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export interface BotonesAsistenciaProps {
  eventId: string
  cantidadesIniciales: CantidadesAsistencia
  marcaInicial: TipoAsistencia | null
  haySesion: boolean
  className?: string
}

const TIPOS_EN_ORDEN: readonly TipoAsistencia[] = ["voy", "me_interesa"]

export function BotonesAsistencia({
  eventId,
  cantidadesIniciales,
  marcaInicial,
  haySesion,
  className,
}: BotonesAsistenciaProps) {
  const [cantidades, setCantidades] = useState<CantidadesAsistencia>(cantidadesIniciales)
  const [marca, setMarca] = useState<TipoAsistencia | null>(marcaInicial)
  const [pendiente, setPendiente] = useState<TipoAsistencia | null>(null)
  const { open: openAuthModal } = useAuthModal()
  const { toast } = useToast()

  async function alTocar(tipo: TipoAsistencia) {
    if (!haySesion) {
      openAuthModal()
      return
    }
    if (pendiente) return

    setPendiente(tipo)
    try {
      const resultado = await marcarAsistencia(eventId, tipo)

      if (!resultado.ok) {
        if (resultado.error === "AUTH_REQUIRED") {
          openAuthModal()
        } else {
          toast({
            title: "Error",
            description: "No pudimos guardar tu marca. Probá de nuevo.",
            variant: "destructive",
          })
        }
        return
      }

      setCantidades(resultado.cantidades)
      setMarca(resultado.propia)
    } catch {
      toast({
        title: "Error de conexión",
        description: "No pudimos conectarnos al servidor. Inténtalo de nuevo.",
        variant: "destructive",
      })
    } finally {
      setPendiente(null)
    }
  }

  const cantidadPorTipo: Record<TipoAsistencia, number> = {
    voy: cantidades.voy,
    me_interesa: cantidades.meInteresa,
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap gap-3">
        {TIPOS_EN_ORDEN.map((tipo) => {
          const marcado = marca === tipo
          const texto = textoBoton(tipo, cantidadPorTipo[tipo])
          return (
            <Button
              key={tipo}
              type="button"
              size="lg"
              variant={marcado ? "default" : "outline"}
              className="min-h-11 flex-1 sm:flex-none"
              disabled={pendiente !== null}
              aria-pressed={marcado}
              aria-label={marcado ? `Quitar la marca ${texto}` : `Marcar ${texto}`}
              onClick={() => alTocar(tipo)}
            >
              {texto}
            </Button>
          )
        })}
      </div>
      {!haySesion && <p className="text-sm text-muted-foreground">{TEXTO_ENTRAR_PARA_MARCAR}</p>}
    </div>
  )
}
