"use client"

/**
 * Q6-5 · Lo del navbar que solo aparece con la sesión iniciada: los accesos a
 * «Mis eventos» y «Radar» (con Tooltip) y el menú de usuario (DropdownMenu).
 * Radix Tooltip/DropdownMenu (con floating-ui) pesan ~65 KB sin comprimir y
 * viajaban en el JavaScript inicial de todas las páginas; `navbar.tsx` carga
 * este módulo con `next/dynamic` recién cuando hay usuario. Mismo marcado que
 * antes, movido sin cambios.
 */
import Link from "next/link"
import { LogOut, User, Settings, SearchCheck, Tags, Heart, Radio, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { hrefLangDestino, rutaEn } from "@/lib/i18n/rutas"
import { useIdioma, useTextos } from "@/lib/i18n/use-idioma"

/** Favoritos y Radar: ocultos en celular (están en la barra inferior, mobile-nav.tsx). */
export function AccesosConSesion() {
  const idioma = useIdioma()
  const t = useTextos().nav

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" className="hidden sm:inline-flex text-muted-foreground hover:text-red-500 transition-colors mr-1 gap-2 font-semibold text-sm">
            <Link href={rutaEn(idioma, "/favoritos")} hrefLang={hrefLangDestino(idioma, "/favoritos")}>
              <Heart aria-hidden="true" className="size-4.5 text-red-500 fill-red-500/10" />
              {/* El link ya es `hidden` debajo de `sm`; el texto no se oculta nunca,
                  así el nombre accesible siempre coincide con lo visible. */}
              <span>{t.misEventos}</span>
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t.misEventos}</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" className="hidden sm:inline-flex text-muted-foreground hover:text-primary transition-colors mr-1 gap-2 font-semibold text-sm">
            <Link href={rutaEn(idioma, "/radar")} hrefLang={hrefLangDestino(idioma, "/radar")}>
              <Radio aria-hidden="true" className="size-4.5 text-primary" />
              <span>{t.radarSalteno}</span>
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t.radarSalteno}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function MenuUsuario({ email, isAdmin, onSignOut }: { email: string | undefined; isAdmin: boolean; onSignOut: () => void }) {
  const idioma = useIdioma()
  const t = useTextos().nav

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t.menuUsuario}>
          <User aria-hidden="true" className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{email}</p>
          {isAdmin && (
            <p className="text-xs text-primary">{t.administrador}</p>
          )}
        </div>
        <DropdownMenuSeparator />
        {/* Grupo 1: Perfil, Favoritos, Radar */}
        <DropdownMenuItem asChild>
          <Link href={rutaEn(idioma, "/perfil")} hrefLang={hrefLangDestino(idioma, "/perfil")}>
            <User className="mr-2 size-4" />
            {t.miPerfil}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={rutaEn(idioma, "/favoritos")} hrefLang={hrefLangDestino(idioma, "/favoritos")}>
            <Heart className="mr-2 size-4 text-red-500" />
            {t.misEventos}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={rutaEn(idioma, "/radar")} hrefLang={hrefLangDestino(idioma, "/radar")}>
            <Radio className="mr-2 size-4 text-primary" />
            {t.miRadarSalteno}
          </Link>
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        {/* Grupo 2: Mis Eventos */}
        <DropdownMenuItem asChild>
          <Link href={rutaEn(idioma, "/mis-eventos")} hrefLang={hrefLangDestino(idioma, "/mis-eventos")}>
            <Calendar className="mr-2 size-4" />
            {t.eventosQueCargaste}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Grupo 3: Admin (herramienta interna, solo en castellano: sin traducir) */}
        {isAdmin && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <Settings className="mr-2 size-4" />
                Panel Admin
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin/scrape">
                <SearchCheck className="mr-2 size-4" />
                Scrapers
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin/clasificacion">
                <Tags className="mr-2 size-4" />
                Clasificación
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        
        {/* Grupo 4: Logout */}
        <DropdownMenuItem onClick={onSignOut}>
          <LogOut className="mr-2 size-4" />
          {t.cerrarSesion}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
