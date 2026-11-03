import type { Metadata } from "next"
import { PaginaLugar, metadataDeLugar, type PaginaLugarProps } from "@/components/lugares/pagina-lugar"

// Q5-5: /lugar/<slug> en inglés (el segmento se traduce: ver SEGMENTOS_TRADUCIDOS en lib/i18n/rutas.ts).
export async function generateMetadata(props: PaginaLugarProps): Promise<Metadata> {
  return metadataDeLugar(props, "en")
}

export default function PlacePage(props: PaginaLugarProps) {
  return PaginaLugar({ ...props, idioma: "en" })
}
