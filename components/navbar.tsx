"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Moon, Sun, Plus, LogIn, LogOut, User, Settings, SearchCheck, Tags, Heart, Radio } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import type { User as SupabaseUser } from "@supabase/supabase-js"

export function Navbar() {
  const { resolvedTheme, setTheme } = useTheme()
  const router = useRouter()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

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

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary">
            <span className="text-xl font-bold text-primary-foreground">QP</span>
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg font-bold leading-tight text-foreground">Que pinta</h1>
            <p className="text-xs font-medium text-primary">SALTA</p>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            <Sun className="size-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
          
          {user && (
            <>
              <Button asChild variant="ghost" className="hidden sm:inline-flex text-muted-foreground hover:text-red-500 transition-colors mr-1 gap-2 font-semibold text-sm">
                <Link href="/favoritos">
                  <span>Agrega tus favoritos</span>
                  <Heart className="size-4.5 text-red-500 fill-red-500/10" />
                </Link>
              </Button>
              <Button asChild variant="ghost" className="hidden sm:inline-flex text-muted-foreground hover:text-primary transition-colors mr-1 gap-2 font-semibold text-sm" title="Mi Radar">
                <Link href="/radar">
                  <span>Radar Salteño</span>
                  <Radio className="size-4.5 text-primary" />
                </Link>
              </Button>
            </>
          )}

          {isAdmin && (
            <Button asChild variant="outline" className="hidden sm:inline-flex">
              <Link href="/nuevo-evento">
                <Plus className="mr-2 size-4" />
                Agregar Evento
              </Link>
            </Button>
          )}

          {!loading && (
            <>
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
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
                    <DropdownMenuItem asChild>
                      <Link href="/favoritos">
                        <Heart className="mr-2 size-4 text-red-500" />
                        Mis Favoritos
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/radar">
                        <Radio className="mr-2 size-4 text-primary" />
                        Mi Radar Salteño
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/perfil">
                        <User className="mr-2 size-4" />
                        Mi Perfil
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
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
                    <DropdownMenuItem onClick={handleSignOut}>
                      <LogOut className="mr-2 size-4" />
                      Cerrar sesión
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button asChild variant="default">
                  <Link href="/auth/login">
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
