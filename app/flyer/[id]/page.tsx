import { getFlyerById } from "@/lib/instagram/data"
import { notFound } from "next/navigation"
import Image from "next/image"
import { Instagram, ExternalLink, MapPin, Calendar, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import Link from "next/link"
import type { Metadata } from "next"

interface FlyerPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: FlyerPageProps): Promise<Metadata> {
  const { id } = await params
  const flyer = await getFlyerById(id)

  if (!flyer) return { title: "Flyer no encontrado" }

  return {
    title: `${flyer.account.display_name} — Qué Pinta Salta`,
    description: flyer.caption
      ? flyer.caption.substring(0, 160)
      : `Flyer de ${flyer.account.display_name} en Salta`,
    openGraph: {
      images: [flyer.storage_image_url || flyer.original_image_url || ''],
    },
  }
}

export default async function FlyerPage({ params }: FlyerPageProps) {
  const { id } = await params
  const flyer = await getFlyerById(id)

  if (!flyer) {
    notFound()
  }

  const imageUrl =
    flyer.storage_image_url ||
    flyer.original_image_url ||
    "/placeholder.svg?height=600&width=600"

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Navbar />

      <main className="container mx-auto max-w-2xl px-4 py-8">
        {/* Botón volver */}
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver al inicio
        </Link>

        {/* Card del flyer */}
        <div className="overflow-hidden rounded-2xl bg-card shadow-xl">
          {/* Imagen */}
          <div className="relative aspect-square w-full">
            <Image
              src={imageUrl}
              alt={`Flyer de ${flyer.account.display_name}`}
              fill
              className="object-cover"
              priority
            />
          </div>

          {/* Info */}
          <div className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <MapPin className="size-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">
                {flyer.account.display_name}
              </h1>
            </div>

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

            {flyer.caption && (
              <p className="mb-6 whitespace-pre-line text-sm text-muted-foreground">
                {flyer.caption}
              </p>
            )}

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
        </div>
      </main>

      <MobileNav />
    </div>
  )
}
