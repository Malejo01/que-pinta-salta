import type { Metadata } from "next"
import { permanentRedirect } from "next/navigation"
// Los mismos helpers que usa `permanentRedirect()` por dentro (lógica pura
// sobre el `digest` del error); también los usa tests/events/evento-merged-308.test.ts.
import { getRedirectStatusCodeFromError, getURLFromRedirectError } from "next/dist/client/components/redirect"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import EventPage from "@/app/evento/[id]/page"
import { getEventById } from "@/lib/data"
import { idiomasAlternos } from "@/lib/i18n/seo"
import { rutaEn, separarIdioma } from "@/lib/i18n/rutas"
import { descripcionParaMeta } from "@/lib/seo/descripcion"
import { SITE_NAME, SITE_URL, tituloConMarca } from "@/lib/seo/sitio"

interface EventPageEnProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ o?: string | string[] }>
}

// La ficha en inglés (Q3). Metadata propia: el título y la descripción son
// los del evento (vienen en castellano, como en la ficha de siempre); lo que
// cambia es la canónica, el hreflang y el locale del openGraph. La ficha en
// castellano no declara `revalidate`, `dynamic` ni `generateStaticParams`:
// no hay nada que repetir acá.
export async function generateMetadata({ params }: EventPageEnProps): Promise<Metadata> {
  const { id } = await params
  const event = await getEventById(id)

  if (!event) {
    return {
      title: "Event not found",
    }
  }

  // Igual que la ficha en castellano (B2): el `title` va sin marca porque la
  // plantilla del layout ya la agrega; Open Graph y Twitter llevan la marca a mano.
  const title = event.title
  const socialTitle = tituloConMarca(event.title)
  const description =
    descripcionParaMeta(event.short_description) ??
    descripcionParaMeta(event.description) ??
    `Discover ${event.title} in Salta, Argentina.`
  const imageUrl = event.image_url || "/og-image.png"

  return {
    title,
    description,
    // Canónica sin ?o= (el origen de la métrica), igual que en castellano.
    alternates: { canonical: `/en/evento/${id}`, languages: idiomasAlternos(`/evento/${id}`) },
    openGraph: {
      title: socialTitle,
      description,
      type: "article",
      siteName: SITE_NAME,
      locale: "en_US",
      alternateLocale: ["es_AR"],
      url: `${SITE_URL}/en/evento/${id}`,
      images: [
        {
          url: imageUrl,
          alt: event.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [imageUrl],
    },
  }
}

/**
 * El cuerpo es el de `app/evento/[id]/page.tsx`, tal cual (datos, JSON-LD y
 * `EventDetailPage`, salvo las migas, que solo van en castellano): no se movió a un componente aparte para no tocar ese
 * archivo más que en su hreflang. El idioma de la interfaz lo toman los
 * componentes de cliente de la URL (`useIdioma()`).
 *
 * Lo único que cambia es la redirección de un evento fusionado: la ficha en
 * castellano hace `permanentRedirect("/evento/<el que quedó>")`, y desde acá
 * tiene que ir a `/en/evento/<el que quedó>` (con el mismo `?o=`). El 308 se
 * conserva; cualquier otra cosa (el 404, un error) sigue de largo.
 */
export default async function EventPageEn(props: EventPageEnProps) {
  try {
    // "en": sin las migas en castellano (revisión de Gemini del #125, hallazgo 3).
    return await EventPage({ ...props, idioma: "en" })
  } catch (err) {
    if (isRedirectError(err) && getRedirectStatusCodeFromError(err) === 308) {
      const destino = getURLFromRedirectError(err)
      if (separarIdioma(destino).idioma === "es") {
        const enIngles = rutaEn("en", destino)
        if (enIngles !== destino) permanentRedirect(enIngles)
      }
    }
    throw err
  }
}
