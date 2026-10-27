import ModalEventPage from "@/app/@modal/(.)evento/[id]/page"

interface ModalEventPageEnProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ o?: string | string[] }>
}

/**
 * El modal de la ficha en inglés (Q3): intercepta `/en/evento/<id>` desde
 * `/en` (y desde cualquier página), igual que `(.)evento/[id]` intercepta
 * `/evento/<id>`. `(.)en` es el segmento `en` en el mismo nivel que el slot
 * (los `@slot` no cuentan como segmento). Los datos son los mismos que los
 * del modal en castellano; el idioma de la interfaz lo toman los componentes
 * de cliente de la URL (`useIdioma()`).
 */
export default function ModalEventPageEn(props: ModalEventPageEnProps) {
  return <ModalEventPage {...props} />
}
