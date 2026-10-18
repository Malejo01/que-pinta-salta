import type { Metadata } from "next"
import Link from "next/link"
import { Trash2 } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { whatsappUrl } from "@/lib/contacto"
import { CONTACTO_EMAIL, mailtoContacto } from "@qps/core/contacto"

export const metadata: Metadata = {
  title: "Eliminar mi cuenta | Qué Pinta Salta",
  description: "Cómo pedir la eliminación de tu cuenta y tus datos en Qué Pinta Salta.",
  alternates: { canonical: "/eliminar-cuenta" },
}

const contactoWhatsappUrl = whatsappUrl("Hola! Quiero eliminar mi cuenta de Que Pinta Salta.")

const linkClass = "text-primary underline underline-offset-4 hover:text-primary/80"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

export default function EliminarCuentaPublicaPage() {
  return (
    <div className="min-h-screen bg-background pb-page sm:pb-0">
      <Navbar />

      <main className="container mx-auto max-w-3xl px-4 py-12">
        <div className="mb-10 flex flex-col items-center space-y-3 text-center">
          <div className="mb-1 flex size-14 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">
            <Trash2 className="size-7" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Eliminar mi cuenta</h1>
        </div>

        <div className="space-y-10">
          <Section title="Cómo pedirlo">
            <p>Tenés dos caminos para pedir que eliminemos tu cuenta de Qué Pinta Salta:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-foreground">Desde la app o el sitio, con tu cuenta:</strong> iniciá sesión y
                entrá a{" "}
                <Link href="/perfil/eliminar-cuenta" className={linkClass}>
                  Mi perfil → Eliminar mi cuenta
                </Link>
                . Ahí te pedimos que escribas una palabra de confirmación y, al aceptar, la cuenta se elimina en el
                momento.
              </li>
              <li>
                <strong className="text-foreground">Sin iniciar sesión, por contacto:</strong> escribinos por{" "}
                <a href={contactoWhatsappUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  WhatsApp
                </a>{" "}
                o por mail a{" "}
                <a href={mailtoContacto("Eliminar mi cuenta de Qué Pinta Salta")} className={linkClass}>
                  {CONTACTO_EMAIL}
                </a>{" "}
                pidiendo la eliminación de tu cuenta. En este caso puede demorar hasta 30 días.
              </li>
            </ul>
          </Section>

          <Section title="Qué se borra">
            <ul className="list-disc space-y-2 pl-5">
              <li>Tus favoritos.</li>
              <li>Tus marcas de &quot;Voy&quot; y &quot;Me interesa&quot;.</li>
              <li>Las preferencias de Mi Radar y de notificaciones.</li>
              <li>Los avisos que tenés activados.</li>
              <li>El historial de los avisos que te mandamos.</li>
              <li>Los tokens de aviso de tu celular.</li>
              <li>La cuenta misma, con tu email y tu contraseña.</li>
            </ul>
          </Section>

          <Section title="Qué no se borra">
            <p>
              Los eventos que cargaste siguen publicados en el sitio, pero quedan sin tu nombre: pasan a figurar sin
              autor.
            </p>
          </Section>

          <Section title="Cuánto tarda">
            <p>
              Si lo pedís con sesión iniciada desde{" "}
              <Link href="/perfil/eliminar-cuenta" className={linkClass}>
                Mi perfil
              </Link>
              , la eliminación es en el momento. Si lo pedís por WhatsApp o mail, puede demorar hasta 30 días.
            </p>
            <p>En los dos casos la eliminación es para siempre y no se puede deshacer.</p>
          </Section>
        </div>
      </main>

      <MobileNav />
    </div>
  )
}
