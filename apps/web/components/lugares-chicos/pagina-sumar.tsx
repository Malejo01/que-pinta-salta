import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"
import { FormularioSumarLugar } from "@/components/lugares-chicos/formulario-sumar"
import { textosDe } from "@/lib/i18n"
import type { Idioma } from "@/lib/i18n/idiomas"
import { marcaDeInicio } from "@/lib/lugares-chicos/pedido"

/**
 * Q5-3 · /lugares-chicos/sumar y /en/lugares-chicos/sumar (compartida; cada
 * una pone su metadata). Dinámica: `iniciado` (la hora del servidor al
 * dibujar el formulario) es el «tiempo mínimo» del anti-spam.
 */
export function PaginaSumarLugar({ idioma }: { idioma: Idioma }) {
  const t = textosDe(idioma).sumarLugar
  return (
    <div className="min-h-screen bg-background pb-page sm:pb-0">
      <Navbar />
      <main id="contenido" tabIndex={-1} className="container mx-auto max-w-2xl px-4 py-6 sm:py-10 focus:outline-none">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{t.titulo}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.bajada}</p>
        <div className="mt-6">
          <FormularioSumarLugar idioma={idioma} iniciado={marcaDeInicio()} />
        </div>
      </main>
      <MobileNav />
    </div>
  )
}
