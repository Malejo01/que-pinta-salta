"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import Image from "next/image"
import { Moon, Sun, Plus, LogIn, Coffee, Search, Map } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { useDonation } from "@/components/donation-context"
import { DONATIONS_ENABLED } from "@/lib/config/monetization"
import { Button } from "@/components/ui/button"
import { clienteSupabase, cuandoEsteLibre, type ClienteSupabaseNavegador } from "@/lib/supabase/cliente-diferido"
import { hrefLangDestino, rutaEn } from "@/lib/i18n/rutas"
import { useIdioma, useTextos } from "@/lib/i18n/use-idioma"
import { SelectorIdioma } from "@/components/selector-idioma"
import type { User as SupabaseUser } from "@supabase/supabase-js"

// Q6-5: solo con sesión (ver navbar-usuario.tsx). Sin SSR: la sesión se lee
// en el navegador, así que en el servidor `user` siempre es null. Mientras se
// descarga, el lugar del botón de usuario queda reservado (sin salto).
const AccesosConSesion = dynamic(() => import("@/components/navbar-usuario").then((m) => m.AccesosConSesion), { ssr: false })
const MenuUsuario = dynamic(() => import("@/components/navbar-usuario").then((m) => m.MenuUsuario), {
  ssr: false,
  loading: () => <div aria-hidden className="size-9" />,
})

export function Navbar() {
  const { resolvedTheme, setTheme } = useTheme()
  const router = useRouter()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const { openDonationModal } = useDonation()
  const idioma = useIdioma()
  const textos = useTextos()
  const t = textos.nav

  // Q6-5: supabase-js no viaja en el JavaScript inicial (ver
  // lib/supabase/cliente-diferido.ts): la sesión se lee cuando el navegador
  // queda libre después de hidratar. Mientras tanto `loading` sigue en true.
  useEffect(() => {
    let cancelado = false
    let desuscribir = () => {}

    const getUser = async (supabase: ClienteSupabaseNavegador) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelado) return
      setUser(user)
      
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        
        if (cancelado) return
        setIsAdmin(profile?.role === 'ADMIN')
      }
      setLoading(false)
    }

    const cancelarEspera = cuandoEsteLibre(() => {
      clienteSupabase()
        .then((supabase) => {
          if (cancelado) return
          getUser(supabase)

          const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null)
            if (!session?.user) {
              setIsAdmin(false)
            }
          })
          desuscribir = () => subscription.unsubscribe()
        })
        // Sin red no hay sesión que mostrar: queda el botón de ingresar.
        .catch(() => {
          if (!cancelado) setLoading(false)
        })
    })
    
    return () => {
      cancelado = true
      cancelarEspera()
      desuscribir()
    }
  }, [])

  const handleSignOut = async () => {
    const supabase = await clienteSupabase()
    await supabase.auth.signOut()
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav aria-label={t.navPrincipal} className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* `shrink-0`: a 320 px el logo no se aplasta cuando el lado derecho se llena. */}
        <Link href={rutaEn(idioma, "/")} className="flex shrink-0 items-center gap-2.5">
          {/* Wrapper con ring rojo en dark mode para reemplazar el halo crema */}
          <div className="rounded-full dark:ring-2 dark:ring-[#C12026]/70 dark:ring-offset-1 dark:ring-offset-background">
            {/* Q6-5: WebP de 128 px (7 KB; el PNG de 160 px pesa 20 KB) y sin
                `priority`: el logo no es el LCP y su precarga competía con el
                CSS y la imagen del LCP. Va `eager` igual (está arriba de todo). */}
            <Image
              src="/brand/logo-circular-128.webp"
              alt="Que pinta Salta logo"
              width={44}
              height={44}
              className="rounded-full object-contain block"
              loading="eager"
            />
          </div>
          <div className="hidden sm:block leading-none">
            <span
              className="block text-lg leading-tight text-[#C12026] dark:text-[#F0585D]"
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

        {/* `gap-1` solo por debajo de 360 px (antes, `gap-2` en todos lados): a
            320 px, sin sesión y con «Apoyar» + el selector de idioma + «Ingresar»
            (115 px), no entraba por 7 px. Desde 360 px queda como siempre.
            Medido con Playwright a 320 y 360 px, con y sin sesión. */}
        <div className="flex items-center gap-1 min-[360px]:gap-2">
          <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex text-muted-foreground hover:text-primary transition-colors">
            <Link href={rutaEn(idioma, "/buscar")} hrefLang={hrefLangDestino(idioma, "/buscar")} aria-label={t.buscarEventos} prefetch={false}>
              <Search aria-hidden="true" className="size-5" />
            </Link>
          </Button>

          <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex text-muted-foreground hover:text-primary transition-colors">
            <Link href={rutaEn(idioma, "/mapa")} hrefLang={hrefLangDestino(idioma, "/mapa")} aria-label={t.verMapa} prefetch={false}>
              <Map aria-hidden="true" className="size-5" />
            </Link>
          </Button>

          {DONATIONS_ENABLED && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openDonationModal()}
              className="flex items-center justify-center border-[#C12026]/30 text-[#C12026] dark:text-[#F0585D] hover:bg-[#C12026]/10 hover:text-[#C12026] dark:hover:text-[#F0585D] transition-colors p-2 sm:px-3"
              title={t.apoyarTitulo}
            >
              <Coffee aria-hidden="true" className="size-4 sm:mr-2" />
              {/* Debajo de `sm` el texto queda solo para lectores de pantalla. */}
              <span className="sr-only sm:not-sr-only">{t.apoyar}</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label={t.cambiarTema}
          >
            <Sun aria-hidden="true" className="size-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon aria-hidden="true" className="absolute size-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
          
          {/* Favoritos y Radar: ocultos en celular (están en la barra inferior,
              mobile-nav.tsx); así el header con sesión entra en 320 px. */}
          {/* Q6-5: lo que solo se ve con sesión (estos accesos y el menú de
              usuario, con Radix Tooltip/DropdownMenu) se carga diferido desde
              navbar-usuario.tsx: casi todas las visitas son sin sesión. */}
          {user && <AccesosConSesion />}

          {isAdmin && (
            <Button asChild variant="outline" className="hidden sm:inline-flex">
              <Link href={rutaEn(idioma, "/nuevo-evento")} hrefLang={hrefLangDestino(idioma, "/nuevo-evento")}>
                <Plus aria-hidden="true" className="mr-2 size-4" />
                {t.agregarEvento}
              </Link>
            </Button>
          )}

          <SelectorIdioma compacto />

          {loading && <div aria-hidden className="h-9 min-w-[115px]" />}
          {!loading && (
            <>
              {user ? (
                <MenuUsuario email={user.email} isAdmin={isAdmin} onSignOut={handleSignOut} />
              ) : (
                <Button asChild variant="default" className="min-w-[115px]">
                  <Link href={rutaEn(idioma, "/auth/login")} hrefLang={hrefLangDestino(idioma, "/auth/login")} prefetch={false}>
                    <LogIn aria-hidden="true" className="mr-2 size-4" />
                    {t.ingresar}
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
