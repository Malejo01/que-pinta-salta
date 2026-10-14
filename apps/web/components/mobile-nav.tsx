"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Search, Radio, Heart } from "lucide-react"
import { cn } from "@/lib/utils"

// Nota (12-f): se dejó el prefetch por defecto (no se puso `prefetch={false}`)
// en estos 4 ítems, incluido /buscar, porque son las pestañas fijas de la
// barra inferior en celular: precargarlas es lo que hace sentir rápida la
// navegación entre ellas. Lo que sí se desactivó en otros componentes fue
// /auth/login, que se pedía 7 veces con hashes distintos en la home.
const navItems = [
  { href: "/", icon: Home, label: "Inicio" },
  { href: "/buscar", icon: Search, label: "Buscar" },
  { href: "/radar", icon: Radio, label: "Radar" },
  { href: "/favoritos", icon: Heart, label: "Favoritos" },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    // `pb-[env(safe-area-inset-bottom)]` va junto con el `viewportFit: 'cover'` de
    // app/layout.tsx: con `cover`, la página pinta hasta el borde físico y esta barra
    // quedaría debajo de la barra de gestos de Android o del home indicator de iOS.
    // El padding la levanta solo en los teléfonos que lo necesitan (en el resto el
    // valor es 0 y nada cambia).
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:hidden">
      <div className="flex h-16 items-center justify-around">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className={cn("size-5", isActive && "fill-primary/20")} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
