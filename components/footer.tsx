"use client"

import Link from "next/link"
import { Github, Linkedin, Globe, MessageCircle } from "lucide-react"

const socialLinks = [
  {
    name: "GitHub",
    href: "https://github.com/Malejo01",
    icon: Github,
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/in/mauro-alejandro-lizarraga-8260711a3/",
    icon: Linkedin,
  },
  {
    name: "Portfolio",
    href: "https://malejoportfolio.netlify.app",
    icon: Globe,
  },
]

const CONTACT_URL = "https://www.linkedin.com/in/mauro-alejandro-lizarraga-8260711a3/"

export function Footer() {
  return (
    <footer className="relative border-t border-border/40 bg-card/80 backdrop-blur-sm">
      {/* Subtle gradient accent line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

      <div className="container mx-auto px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-3">
          {/* Brand */}
          <div className="flex flex-col gap-3">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary transition-transform duration-200 group-hover:scale-105">
                <span className="text-lg font-bold text-primary-foreground">QP</span>
              </div>
              <div>
                <p className="text-sm font-bold leading-tight text-foreground">Que pinta</p>
                <p className="text-[10px] font-semibold tracking-wider text-primary">SALTA</p>
              </div>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Descubrí todos los eventos, peñas, boliches, teatros y más que están pasando en Salta Capital.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground">Enlaces</h3>
            <nav className="flex flex-col gap-2">
              <Link
                href="/privacidad"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Política de Privacidad
              </Link>
              <Link
                href="/nuevo-evento"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Agregar Evento
              </Link>
            </nav>
          </div>

          {/* Social & Contact */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground">Conectá conmigo</h3>
            <div className="flex items-center gap-3">
              {socialLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.name}
                  className="flex size-9 items-center justify-center rounded-lg border border-border/60 bg-background/50 text-muted-foreground transition-all duration-200 hover:border-primary/50 hover:bg-primary/10 hover:text-primary hover:scale-105"
                >
                  <link.icon className="size-4" />
                </a>
              ))}
            </div>

            <a
              href={CONTACT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex w-fit items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-all duration-200 hover:bg-primary/20 hover:scale-[1.02]"
            >
              <MessageCircle className="size-4" />
              Contactame
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col items-center gap-2 border-t border-border/30 pt-6 sm:flex-row sm:justify-between">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Que pinta Salta. Hecho con ❤️ en Salta, Argentina.
          </p>
          <p className="text-xs text-muted-foreground">
            Desarrollado por{" "}
            <a
              href="https://malejoportfolio.netlify.app"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary transition-colors hover:text-primary/80"
            >
              Mauro Lizarraga
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
