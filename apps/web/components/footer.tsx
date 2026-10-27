"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useState } from "react"
import { Github, Linkedin, Globe, MessageCircle, Coffee } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useDonation } from "@/components/donation-context"
import { DONATIONS_ENABLED } from "@/lib/config/monetization"
import { ANUNCIANTES } from "@/lib/config/anunciantes"
import { TEXTO_ANUNCIAR, whatsappUrl } from "@/lib/contacto"
import { dispatchConsentEvent, writeConsent } from "@/lib/consent"
import type { User } from "@supabase/supabase-js"
import { rutaEn } from "@/lib/i18n/rutas"
import { useIdioma, useTextos } from "@/lib/i18n/use-idioma"
import { SelectorIdioma } from "@/components/selector-idioma"

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
  const [user, setUser] = useState<User | null>(null)
  const { openDonationModal } = useDonation()
  const idioma = useIdioma()
  const t = useTextos().pie
  // Las páginas legales existen solo en castellano (y el texto que vale es
  // ese): en inglés el link conserva su nombre en castellano, marcado con
  // `lang`/`hrefLang` para que el lector de pantalla lo pronuncie bien.
  const legalEnCastellano = idioma === "es" ? {} : { lang: "es", hrefLang: "es-AR" }

  // El mensaje de WhatsApp va en castellano en los dos idiomas: lo lee el equipo.
  const anunciarWhatsappUrl = whatsappUrl(TEXTO_ANUNCIAR)

  useEffect(() => {
    const supabase = createClient()
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
    }
    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <footer className="relative border-t border-border/40 bg-card/80 backdrop-blur-sm">
      {/* Subtle gradient accent line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

      <div className="container mx-auto px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-3">
          {/* Brand */}
          <div className="flex flex-col gap-3">
            <Link href={rutaEn(idioma, "/")} className="flex items-center gap-2.5 group">
              <div className="rounded-full dark:ring-2 dark:ring-[#C12026]/70 dark:ring-offset-1 dark:ring-offset-background transition-transform duration-200 group-hover:scale-105">
                <Image
                  src="/brand/logo-circular.png"
                  alt="Que pinta Salta logo"
                  width={40}
                  height={40}
                  className="rounded-full object-contain block"
                />
              </div>
              <div className="leading-none">
                <p
                  className="text-base leading-tight"
                  style={{ fontFamily: 'var(--font-yellowtail)', color: '#C12026' }}
                >
                  Que pinta?
                </p>
                <p
                  className="text-base tracking-normal text-center text-[#232F42] dark:text-zinc-100 uppercase"
                  style={{ fontFamily: 'var(--font-poppins)', fontWeight: 800 }}
                >
                  Salta
                </p>
              </div>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              {t.descripcion}
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground">{t.enlaces}</h3>
            <nav className="flex flex-col gap-2">
              <Link
                href="/privacidad"
                {...legalEnCastellano}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Política de Privacidad
              </Link>
              <Link
                href="/terminos"
                {...legalEnCastellano}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Términos y condiciones
              </Link>
              {/* Oculto mientras haya precios sin completar (decisión de Mauro, 12/10) */}
              {ANUNCIANTES.publicada && (
                <Link
                  href={rutaEn(idioma, "/anunciantes")}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t.anunciantes}
                </Link>
              )}
              <Link
                href={rutaEn(idioma, user ? "/nuevo-evento" : "/auth/login?next=/nuevo-evento")}
                prefetch={user ? undefined : false}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t.agregarEvento}
              </Link>
              <a
                href={anunciarWhatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t.anunciar}
              </a>
              <button
                type="button"
                onClick={() => {
                  writeConsent(window.localStorage, null)
                  dispatchConsentEvent()
                }}
                className="text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t.preferenciasCookies}
              </button>
            </nav>
            {/* Selector de idioma también en el pie: es donde se lo busca al
                terminar de recorrer la página. `-ml-2` alinea el texto con los
                links de arriba (el selector tiene `px-2` para el área táctil). */}
            <SelectorIdioma className="-ml-2 w-fit" />
          </div>

          {/* Social & Contact */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground">{t.conectaConmigo}</h3>
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
              {t.contactame}
            </a>
          </div>
        </div>

        {/* Donation CTA */}
        {DONATIONS_ENABLED && (
        <div className="mt-12 rounded-2xl border border-[#C12026]/20 bg-[#C12026]/5 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
          <div className="max-w-xl space-y-2">
            <h3 className="text-lg font-bold text-foreground flex items-center justify-center sm:justify-start gap-2">
              <Coffee className="size-5 text-[#C12026]" />
              {t.donacionTitulo}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t.donacionTexto}
            </p>
          </div>
          <button
            onClick={() => openDonationModal(t.donacionMensaje)}
            className="shrink-0 rounded-xl bg-[#C12026] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#C12026]/20 transition-all hover:scale-105 hover:bg-[#A0191F]"
          >
            {t.hacerAporte}
          </button>
        </div>
        )}

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col items-center gap-2 border-t border-border/30 pt-6 sm:flex-row sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {t.derechos(new Date().getFullYear())}
          </p>
          <p className="text-xs text-muted-foreground">
            {t.desarrolladoPor}{" "}
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
