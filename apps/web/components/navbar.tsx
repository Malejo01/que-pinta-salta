"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Image from "next/image"
import { Moon, Sun, Plus, LogIn, LogOut, User, Settings, SearchCheck, Tags, Heart, Radio, Coffee, Search, Calendar, Map } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { useDonation } from "@/components/donation-context"
import { DONATIONS_ENABLED } from "@/lib/config/monetization"
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
import { createClient } from "@/lib/supabase/client"
import { asegurarDestino, ID_CONTENIDO, saltarAlContenido } from "@/lib/accesibilidad/saltar-al-contenido"
import type { User as SupabaseUser } from "@supabase/supabase-js"

export function Navbar() {
  const { resolvedTheme, setTheme } = useTheme()
  const router = useRouter()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const { openDonationModal } = useDonation()

  useEffect(() => {
    const supabase = createClient()
    
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        
        setIsAdmin(profile?.role === 'ADMIN')
      }
      setLoading(false)
    }
    
    getUser()
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) {
        setIsAdmin(false)
      }
    })
    
    return () => subscription.unsubscribe()
  }, [])

  // B4: en las páginas cuyo <main> no trae `id="contenido"` (mapa, buscar,
  // legales: otras zonas), se lo pone al montar, para que el "Saltar al
  // contenido" tenga destino también para axe/Lighthouse. Ver
  // lib/accesibilidad/saltar-al-contenido.ts.
  useEffect(() => {
    asegurarDestino(document)
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/*
        B4: "Saltar al contenido", el primer elemento con foco de toda página
        que monta la Navbar (el layout es de otra zona, así que vive acá).
        Oculto (sr-only) hasta que recibe foco con el teclado; ahí aparece
        arriba a la izquierda, con los colores del tema y anillo de foco.
        `absolute` y no `fixed`: el `backdrop-blur` del header lo vuelve el
        bloque contenedor de los `fixed`, así que daría lo mismo, y el header
        ya es `sticky` (posicionado). El destino y el plan B (páginas sin
        `#contenido`) están en `lib/accesibilidad/saltar-al-contenido.ts`.
      */}
      <a
        href={`#${ID_CONTENIDO}`}
        onClick={(e) => {
          if (saltarAlContenido(document)) e.preventDefault()
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:shadow-lg focus:outline-hidden focus:ring-2 focus:ring-ring"
      >
        Saltar al contenido
      </a>
      {/* B4: dos <nav> en la misma página (esta y la barra inferior de
          celular) necesitan nombres distintos para los lectores de pantalla. */}
      <nav aria-label="Principal" className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5">
          {/* Wrapper con ring rojo en dark mode para reemplazar el halo crema */}
          <div className="rounded-full dark:ring-2 dark:ring-[#C12026]/70 dark:ring-offset-1 dark:ring-offset-background">
            <Image
              src="/brand/logo-circular.png"
              alt="Que pinta Salta logo"
              width={44}
              height={44}
              className="rounded-full object-contain block"
              priority
            />
          </div>
          <div className="hidden sm:block leading-none">
            {/* B4: el rojo de marca (#C12026) da 3,3:1 sobre el fondo
                oscuro; en oscuro va un rojo más claro (#E8555A, más de 5:1).
                En claro queda el de marca (más de 5:1). */}
            <span
              className="block text-lg leading-tight text-[#C12026] dark:text-[#E8555A]"
              style={{ fontFamily: 'var(--font-yellowtail)' }}
              suppressHydrationWarning
            >
              Que pinta?
            </span>
            <span
              className="block text-base tracking-normal text-center text-[#232F42] dark:text-zinc-100 uppercase"
              style={{ fontFamily: 'var(--font-poppins)', fontWeight: 800 }}
              suppressHydrationWarning
            >
              Salta
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex text-muted-foreground hover:text-primary transition-colors">
            <Link href="/buscar" aria-label="Buscar eventos" prefetch={false}>
              <Search className="size-5" />
            </Link>
          </Button>

          <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex text-muted-foreground hover:text-primary transition-colors">
            <Link href="/mapa" aria-label="Ver el mapa" prefetch={false}>
              <Map className="size-5" />
            </Link>
          </Button>

          {DONATIONS_ENABLED && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openDonationModal()}
              className="flex items-center justify-center border-[#C12026]/30 text-[#C12026] hover:bg-[#C12026]/10 hover:text-[#C12026] transition-colors p-2 sm:px-3"
              title="Apoyar a Qué Pinta Salta"
            >
              <Coffee className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">Apoyar</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            // B4: en castellano y fijo. Un texto que dependa de
            // `resolvedTheme` no coincide entre el servidor y la hidratación.
            aria-label="Cambiar tema"
          >
            <Sun className="size-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
          
          {user && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="ghost" className="text-muted-foreground hover:text-red-500 transition-colors mr-1 gap-2 font-semibold text-sm">
                    {/* B4: a 375 px el texto está oculto (`hidden sm:inline`)
                        y el link se quedaba sin nombre; el aria-label es el
                        mismo texto visible, así que vale en todos los anchos. */}
                    <Link href="/favoritos" aria-label="Mis eventos">
                      <Heart className="size-4.5 text-red-500 fill-red-500/10" />
                      <span className="hidden sm:inline">Mis eventos</span>
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Mis eventos</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="ghost" className="text-muted-foreground hover:text-primary transition-colors mr-1 gap-2 font-semibold text-sm">
                    <Link href="/radar" aria-label="Radar Salteño">
                      <Radio className="size-4.5 text-primary" />
                      <span className="hidden sm:inline">Radar Salteño</span>
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Radar Salteño</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {isAdmin && (
            <Button asChild variant="outline" className="hidden sm:inline-flex">
              <Link href="/nuevo-evento">
                <Plus className="mr-2 size-4" />
                Agregar Evento
              </Link>
            </Button>
          )}

          {loading && <div aria-hidden className="h-9 min-w-[115px]" />}
          {!loading && (
            <>
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    {/* B4: botón de ícono sin texto: necesita nombre propio. */}
                    <Button variant="ghost" size="icon" aria-label="Menú de tu cuenta">
                      <User className="size-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-medium">{user.email}</p>
                      {isAdmin && (
                        <p className="text-xs text-primary">Administrador</p>
                      )}
                    </div>
                    <DropdownMenuSeparator />
                    {/* Grupo 1: Perfil, Favoritos, Radar */}
                    <DropdownMenuItem asChild>
                      <Link href="/perfil">
                        <User className="mr-2 size-4" />
                        Mi Perfil
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/favoritos">
                        <Heart className="mr-2 size-4 text-red-500" />
                        Mis eventos
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/radar">
                        <Radio className="mr-2 size-4 text-primary" />
                        Mi Radar Salteño
                      </Link>
                    </DropdownMenuItem>
                    
                    <DropdownMenuSeparator />
                    
                    {/* Grupo 2: Mis Eventos */}
                    <DropdownMenuItem asChild>
                      <Link href="/mis-eventos">
                        <Calendar className="mr-2 size-4" />
                        Eventos que cargaste
                      </Link>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    {/* Grupo 3: Admin */}
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
                    <DropdownMenuItem onClick={handleSignOut}>
                      <LogOut className="mr-2 size-4" />
                      Cerrar sesión
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button asChild variant="default" className="min-w-[115px]">
                  <Link href="/auth/login" prefetch={false}>
                    <LogIn className="mr-2 size-4" />
                    Ingresar
                  </Link>
                </Button>
              )}
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
