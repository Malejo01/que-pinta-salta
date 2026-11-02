import type { Metadata } from "next"
import { PaginaDeError } from "@/components/pagina-de-error"

// Q4-6: la 404 de /en/... en inglés. La dispara `app/en/[...resto]/page.tsx`
// (cualquier ruta /en/<algo> que no existe) y cualquier `notFound()` de una
// página en inglés. Mismo noindex que la 404 en castellano.
export const metadata: Metadata = {
  title: "Page not found",
  robots: {
    index: false,
    follow: true,
    googleBot: { index: false, follow: true },
  },
}

export default function NotFoundEn() {
  return (
    <PaginaDeError
      idioma="en"
      titulo="We couldn't find that page"
      texto="The link may be wrong or the event is no longer listed. See what's on today or search for something else."
    />
  )
}
