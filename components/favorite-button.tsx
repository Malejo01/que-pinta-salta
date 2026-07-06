"use client"

import { useState } from "react"
import { Heart } from "lucide-react"
import { toggleFavorite } from "@/lib/actions/favorites"
import { useAuthModal } from "./auth-modal"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

interface FavoriteButtonProps {
  itemId: string
  type: 'event' | 'cinema' | 'flyer'
  initialIsFavorite: boolean
  className?: string
}

export function FavoriteButton({
  itemId,
  type,
  initialIsFavorite,
  className
}: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite)
  const [isPending, setIsPending] = useState(false)
  const { open: openAuthModal } = useAuthModal()
  const { toast } = useToast()

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
          title: "Error",
          description: result.message || "No se pudo actualizar el favorito.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: result.favorited ? "Favorito guardado" : "Favorito eliminado",
        description: result.favorited 
          ? "El elemento se agregó a tu agenda."
          : "El elemento se quitó de tu agenda.",
      })
    } catch (err) {
      setIsFavorite(previousState)
      toast({
        title: "Error de conexión",
        description: "No pudimos conectarnos al servidor. Inténtalo de nuevo.",
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
        "flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-all hover:scale-110 active:scale-95 cursor-pointer z-10",
        className
      )}
      aria-label={isFavorite ? "Quitar de favoritos" : "Guardar en favoritos"}
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
