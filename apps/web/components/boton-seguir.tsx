"use client"

// "+ Seguir" (R47, tarea 47-c, QPS-197): seguir un lugar o una cuenta de
// Instagram desde la ficha de un evento. El texto SIEMPRE sale de core
// (`textoSeguir`/`textoSeguirCuenta`, en `@qps/core/radar/seguimiento`):
// nunca se arma a mano.
//
// Dos exports, mismo motivo que `fila-acciones-evento.tsx`: `BotonSeguirVista`
// es SIN estado y sin hooks, para que un test (QPS-199) la pueda invocar como
// función común y pasarla por `renderToStaticMarkup` en Node puro.
// `BotonSeguir` es el componente con estado, pesimista (espera la respuesta
// de `cambiarSeguimiento` antes de cambiar lo que se ve, como pide el
// encargo), que llama a la server action y delega el dibujado en la vista.
import { useState } from "react"
import { textoSeguir, textoSeguirCuenta } from "@qps/core/radar/seguimiento"
import { cambiarSeguimiento } from "@/lib/actions/radar"
import { Button } from "@/components/ui/button"
import { useAuthModal } from "@/components/auth-modal"
import { useToast } from "@/hooks/use-toast"
import { textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { useIdioma } from "@/lib/i18n/use-idioma"
import { cn } from "@/lib/utils"

export type TipoSeguirBoton = "lugar" | "cuenta"

export interface BotonSeguirVistaProps {
  tipo: TipoSeguirBoton
  /** Nombre del lugar, o `@usuario` (sin el `@`) de la cuenta de Instagram. */
  etiqueta: string
  siguiendo: boolean
  pendiente: boolean
  onClick: () => void
  className?: string
  /** Idioma del texto (por prop: la vista no usa hooks). En castellano, el de core. */
  idioma?: Idioma
}

/** La vista pura del botón de "+ Seguir": sin estado, sin hooks. */
export function BotonSeguirVista({
  tipo,
  etiqueta,
  siguiendo,
  pendiente,
  onClick,
  className,
  idioma = "es",
}: BotonSeguirVistaProps) {
  const t = textosDe(idioma).seguir
  const texto =
    idioma === "es"
      ? tipo === "lugar"
        ? textoSeguir(siguiendo)
        : textoSeguirCuenta(etiqueta, siguiendo)
      : tipo === "lugar"
        ? t.lugar(siguiendo)
        : t.cuenta(etiqueta, siguiendo)

  return (
    <Button
      type="button"
      size="sm"
      variant={siguiendo ? "default" : "outline"}
      className={cn("min-h-9", className)}
      disabled={pendiente}
      aria-pressed={siguiendo}
      aria-label={texto}
      onClick={onClick}
    >
      {texto}
    </Button>
  )
}

export interface BotonSeguirProps {
  tipo: TipoSeguirBoton
  id: string
  /** Nombre del lugar, o `@usuario` (sin el `@`) de la cuenta de Instagram. */
  etiqueta: string
  siguiendoInicial: boolean
  haySesion: boolean
  className?: string
}

/**
 * El componente con estado: pesimista (espera la respuesta de
 * `cambiarSeguimiento` antes de cambiar `siguiendo`). Sin sesión,
 * `openAuthModal()` y no se escribe nada.
 */
export function BotonSeguir({ tipo, id, etiqueta, siguiendoInicial, haySesion, className }: BotonSeguirProps) {
  const [siguiendo, setSiguiendo] = useState(siguiendoInicial)
  const [pendiente, setPendiente] = useState(false)
  const { open: openAuthModal } = useAuthModal()
  const { toast } = useToast()
  const idioma = useIdioma()
  const textos = textosDe(idioma)

  async function alTocar() {
    if (!haySesion) {
      openAuthModal()
      return
    }
    if (pendiente) return

    setPendiente(true)
    try {
      const resultado = await cambiarSeguimiento({ tipo, id, seguir: !siguiendo })

      if (!resultado.ok) {
        if (resultado.error === "AUTH_REQUIRED") {
          openAuthModal()
        } else {
          toast({
            title: textos.asistencia.errorTitulo,
            description: textos.seguir.error,
            variant: "destructive",
          })
        }
        return
      }

      setSiguiendo(resultado.siguiendo)
    } catch {
      toast({
        title: textos.asistencia.errorConexionTitulo,
        description: textos.asistencia.errorConexionTexto,
        variant: "destructive",
      })
    } finally {
      setPendiente(false)
    }
  }

  return (
    <BotonSeguirVista
      tipo={tipo}
      etiqueta={etiqueta}
      siguiendo={siguiendo}
      pendiente={pendiente}
      onClick={alTocar}
      className={className}
      idioma={idioma}
    />
  )
}
