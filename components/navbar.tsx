"use client"

import Link from "next/link"
import { useTheme } from "next-themes"
import { Moon, Sun, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Navbar() {
  const { theme, setTheme } = useTheme()

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
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            <Sun className="size-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/nuevo-evento">
              <Plus className="mr-2 size-4" />
              Agregar Evento
            </Link>
          </Button>
        </div>
      </nav>
    </header>
  )
}
