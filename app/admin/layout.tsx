"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Tag, Users, Home } from "lucide-react"
import { cn } from "@/lib/utils"
import { ScraperButton } from "@/components/scraper-button"

const navItems = [
  { href: "/admin/aliases", label: "Aliases", icon: Tag },
  { href: "/admin/users", label: "Usuarios", icon: Users },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Home className="size-4" />
              <span>Inicio</span>
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-semibold text-foreground">Panel Admin</span>
          </div>
          <ScraperButton />
        </div>
      </header>

      <div className="container mx-auto flex gap-8 px-4 py-8">
        {/* Sidebar nav */}
        <aside className="hidden w-44 shrink-0 md:block">
          <nav className="flex flex-col gap-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname === href
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
