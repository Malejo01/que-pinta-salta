"use client"

import { useRouter } from "next/navigation"
import Image from "next/image"
import { Instagram, ExternalLink, MapPin, Calendar } from "lucide-react"
import type { FlyerWithAccount } from "@/lib/instagram-config"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface FlyerModalProps {
  flyer: FlyerWithAccount
}

export function FlyerModal({ flyer }: FlyerModalProps) {
  const router = useRouter()

  const handleClose = (open: boolean) => {
    if (!open) router.back()
  }

  const imageUrl =
    flyer.storage_image_url ||
    flyer.original_image_url ||
    "/placeholder.svg?height=600&width=600"

  return (
    <Dialog open onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto p-0">
        {/* Imagen del flyer */}
        <div className="relative aspect-square w-full">
          <Image
            src={imageUrl}
            alt={`Flyer de ${flyer.account.display_name}`}
            fill
            className="object-cover"
            priority
          />
        </div>

        {/* Contenido del modal */}
        <div className="p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <MapPin className="size-5 text-primary" />
              {flyer.account.display_name}
            </DialogTitle>
          </DialogHeader>

          {/* Fecha de publicación */}
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="size-4" />
            <span>
              Publicado el{" "}
              {new Date(flyer.published_at).toLocaleDateString("es-AR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
          </div>

          {/* Caption (si existe) */}
          {flyer.caption && (
            <p className="mb-6 max-h-32 overflow-y-auto whitespace-pre-line text-sm text-muted-foreground">
              {flyer.caption}
            </p>
          )}

          {/* Botones CTA */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              className="flex-1 bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 text-white hover:from-purple-700 hover:via-pink-600 hover:to-orange-500"
              asChild
            >
              <a
                href={flyer.ig_post_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Instagram className="mr-2 size-4" />
                Ver en Instagram
              </a>
            </Button>

            <Button variant="outline" className="flex-1" asChild>
              <a
                href={flyer.account.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 size-4" />
                Perfil de {flyer.account.display_name}
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
