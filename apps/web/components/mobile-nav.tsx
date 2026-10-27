"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Search, Radio, Heart, Map } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Diccionario } from "@/lib/i18n"
import { rutaEn, separarIdioma } from "@/lib/i18n/rutas"
import { useTextos } from "@/lib/i18n/use-idioma"

// Nota (12-f): se dejó el prefetch por defecto (no se puso `prefetch={false}`)
// en estos 4 ítems, incluido /buscar, porque son las pestañas fijas de la
// barra inferior en celular: precargarlas es lo que hace sentir rápida la
// navegación entre ellas. Lo que sí se desactivó en otros componentes fue
// /auth/login, que se pedía 7 veces con hashes distintos en la home.
// Nota (54-c): /mapa es la excepción a lo de arriba, el único con
// `prefetch: false`: esa página carga MapLibre de forma diferida recién
// cuando el mapa entra en pantalla, así que no tiene sentido precargarla
// como si fuera una pestaña liviana más.
//
// `href` es la ruta en castellano; el link usa `rutaEn(idioma, href)`, que la
// pasa a /en solo si esa página existe en inglés. `etiqueta` es la clave del
// texto en el diccionario (`nav`).
const navItems: { href: string; icon: typeof Home; etiqueta: keyof Diccionario["nav"]; prefetch?: false }[] = [
  { href: "/", icon: Home, etiqueta: "inicio" },
  { href: "/buscar", icon: Search, etiqueta: "buscar" },
  { href: "/mapa", icon: Map, etiqueta: "mapa", prefetch: false },
  { href: "/radar", icon: Radio, etiqueta: "radar" },
  { href: "/favoritos", icon: Heart, etiqueta: "misEventos" },
]

export function MobileNav() {
  const pathname = usePathname()
  // En /en y /en/cines el ítem activo se compara con la ruta sin el /en.
  const { idioma, ruta } = separarIdioma(pathname ?? "/")
  const textos = useTextos()

  return (
    // `pb-[env(safe-area-inset-bottom)]` va junto con el `viewportFit: 'cover'` de
    // app/layout.tsx: con `cover`, la página pinta hasta el borde físico y esta barra
    // quedaría debajo de la barra de gestos de Android o del home indicator de iOS.
    // El padding la levanta solo en los teléfonos que lo necesitan (en el resto el
    // valor es 0 y nada cambia).
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:hidden">
      <div className="flex h-16 items-center justify-around">
        {navItems.map((item) => {
          const isActive = ruta === item.href
          return (
            <Link
              key={item.href}
              href={rutaEn(idioma, item.href)}
              prefetch={item.prefetch}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                // Con 5 ítems (desde que entró "Mapa", 54-c) el padding y la
                // letra bajaron un poco respecto de los 4 de antes, para que
                // "Mis eventos" (el texto más largo) entre sin cortarse en
                // 360px de ancho, sin tocar la altura de la barra (`h-16`).
                //
                // `min-w-[48px]`: el ancho de cada ítem lo define su texto, y
                // con el padding chico "Mapa" (4 letras) quedaba en ~36px, por
                // debajo de los 48 que el repo ya fija como área táctil mínima
                // (`AREA_TACTIL_MINIMA` de apps/mobile/lib/accesibilidad.ts,
                // guía de Android). Los cinco con piso de 48 suman 240px:
                // entran hasta en 320px de ancho.
                //
                // El cuerpo de letra va en `rem` (0.6875rem = 11px) y no en
                // `px`: un `text-[11px]` literal no escala si la persona
                // agrandó la letra del sistema, y ese texto quedaría más chico
                // que todo el resto del sitio (la R49 trabajó justo esto).
                //
                // Nota (73-b): foco visible con teclado. El anillo va `inset`
                // (adentro del ítem) para que no lo recorte la barra ni pise al
                // vecino, y no cambia el tamaño de nada: un anillo es sombra.
                // `outline-hidden` y no `outline-none`: en alto contraste de
                // Windows la sombra no se pinta y el contorno transparente sí.
                "flex min-w-[48px] flex-col items-center gap-0.5 rounded-md px-1.5 py-2 text-[0.6875rem] whitespace-nowrap transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className={cn("size-5", isActive && "fill-primary/20")} />
              <span>{textos.nav[item.etiqueta]}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
