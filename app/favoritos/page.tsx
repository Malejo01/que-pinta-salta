"use client"

import Link from "next/link"
import { ArrowLeft, Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"

export default function FavoritosPage() {
  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" asChild className="mb-4">
            <Link href="/">
              <ArrowLeft className="mr-2 size-4" />
              Volver
            </Link>
          </Button>
          <h1 className="text-3xl font-bold text-foreground">Mis Favoritos</h1>
          <p className="mt-2 text-muted-foreground">
            Los eventos que guardaste para ver despues
          </p>
        </div>

        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-muted">
            <Heart className="size-8 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-foreground">
            No tienes favoritos aun
          </h2>
          <p className="mb-6 max-w-sm text-muted-foreground">
            Explora los eventos y toca el corazon para guardarlos aqui
          </p>
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/">Explorar eventos</Link>
          </Button>
        </div>
      </main>
      
      <MobileNav />
    </div>
  )
}
