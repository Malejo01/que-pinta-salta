"use client"

import { useState } from "react"
import { Heart } from "lucide-react"
import { toggleFavorite } from "@/lib/actions/favorites"
import { useAuthModal } from "./auth-modal"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { useDonation } from "@/components/donation-context"
import { DONATIONS_ENABLED } from "@/lib/config/monetization"
import { useTextos } from "@/lib/i18n/use-idioma"

interface FavoriteButtonProps {
  itemId: string
  type: 'event' | 'cinema' | 'flyer'
  initialIsFavorite: boolean
  className?: string
  /**
   * Se llama cuando el servidor confirma el cambio, con el estado nuevo. Lo
   * usa `/buscar` para que el corazón de la tarjeta y el del modal del mismo
   * evento muestren lo mismo (QPS-158).
   */
  onChange?: (favorited: boolean) => void
}

export function FavoriteButton({
  itemId,
  type,
  initialIsFavorite,
  className,
  onChange
}: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite)
  const [isPending, setIsPending] = useState(false)
  // Si el padre cambia initialIsFavorite (otro corazón del mismo evento lo
  // cambió), se sigue al padre. Ajuste durante el render, no en un efecto
  // (https://react.dev/learn/you-might-not-need-an-effect).
  const [initialPrevio, setInitialPrevio] = useState(initialIsFavorite)
  if (initialIsFavorite !== initialPrevio) {
    setInitialPrevio(initialIsFavorite)
    setIsFavorite(initialIsFavorite)
  }
  const { open: openAuthModal } = useAuthModal()
  const { toast } = useToast()
  const { openDonationModal } = useDonation()
  // Textos en el idioma de la página (lib/i18n/diccionarios, sección `favorito`).
  const t = useTextos().favorito

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (isPending) return

    // Optimistic Update
    const previousState = isFavorite
    const nextState = !isFavorite
    setIsFavorite(nextState)
    setIsPending(true)

    try {
      const result = await toggleFavorite(itemId, type)
      
      if (result.error === "AUTH_REQUIRED") {
        // Revert optimistic update
        setIsFavorite(previousState)
        openAuthModal()
        return
      }

      if (result.error) {
        setIsFavorite(previousState)
        toast({
          title: t.errorTitulo,
          description: result.message || t.errorTexto,
          variant: "destructive",
        })
        return
      }

      onChange?.(!!result.favorited)

      if (result.favorited) {
        let count = parseInt(sessionStorage.getItem('favorite_toast_count') || '0', 10);
        count++;
        sessionStorage.setItem('favorite_toast_count', count.toString());
        
        const shouldShowDonation = DONATIONS_ENABLED && count % 2 !== 0; // 1, 3, 5, etc.

        toast({
          title: t.guardadoTitulo,
          description: shouldShowDonation 
            ? t.pedidoCafecito
            : t.guardadoTexto,
          action: shouldShowDonation ? (
            <ToastAction
              altText={t.donarAhora}
              onClick={() => openDonationModal(t.pedidoCafecito)}
              className="bg-[#C12026] text-white hover:bg-[#A0191F] border-none"
            >
              {t.donarAhora}
            </ToastAction>
          ) : undefined,
        })
      } else if (result.voyQuitado) {
        // Sacar el ♥ de un evento con Voy también saca el Voy (QPS-197):
        // avisar con el texto único de core, no "Favorito eliminado".
        toast({ description: t.sacasteGuardadoConVoy })
      } else {
        toast({
          title: t.eliminadoTitulo,
          description: t.eliminadoTexto,
        })
      }
    } catch (err) {
      setIsFavorite(previousState)
      toast({
        title: t.errorConexionTitulo,
        description: t.errorConexionTexto,
        variant: "destructive",
      })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <button
      onClick={handleToggle}
      className={cn(
        // Área de toque ampliada con un pseudo-elemento invisible (after:-inset-*):
        // no cambia el tamaño visible (size-8 = 32x32), solo la zona que recibe el click/tap.
        // A la izquierda queda capada a 4px (after:-left-1) por el botón de compartir de la
        // card (event-card.tsx). Medido en px desde el borde derecho de la card: este botón
        // vive a right-2 con size-8 (32px), así que su zona llega hasta los 44px; el de
        // compartir vive a right-12 y su zona arranca justo en 44px. Las dos se tocan en el
        // borde y ninguna pisa a la otra: si se cambia una, hay que recalcular la otra.
        // Arriba/abajo/derecha no tienen un vecino tan cerca, así que se compensa ahí para
        // llegar a 44x44 (32 + 4 izq + 8 der = 44 de ancho; 32 + 6 + 6 = 44 de alto).
        "relative flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-all hover:scale-110 active:scale-95 cursor-pointer z-10 after:absolute after:content-[''] after:-left-1 after:-right-2 after:-top-1.5 after:-bottom-1.5",
        className
      )}
      aria-label={isFavorite ? t.quitar : t.guardar}
    >
      <Heart
        className={cn(
          "size-4.5 transition-all duration-200",
          isFavorite 
            ? "fill-red-500 text-red-500 scale-110" 
            : "text-white hover:text-red-500"
        )}
      />
    </button>
  )
}
