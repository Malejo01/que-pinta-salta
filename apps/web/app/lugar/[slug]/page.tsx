import type { Metadata } from "next"
import { PaginaLugar, metadataDeLugar, type PaginaLugarProps } from "@/components/lugares/pagina-lugar"

// Q5-5: la ficha pública de un lugar. La página arma todo en el servidor.
export async function generateMetadata(props: PaginaLugarProps): Promise<Metadata> {
  return metadataDeLugar(props, "es")
}

export default function LugarPage(props: PaginaLugarProps) {
  return PaginaLugar({ ...props, idioma: "es" })
}
