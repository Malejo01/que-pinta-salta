import { metadataNotaLegal, NOTAS_LEGALES, NotaSoloCastellano } from "@/components/i18n/nota-solo-castellano"

// Q4-6: la página legal queda en castellano; acá, solo la nota en inglés.
export const metadata = metadataNotaLegal(NOTAS_LEGALES["/eliminar-cuenta"])

export default function NotaLegalEn() {
  return <NotaSoloCastellano nota={NOTAS_LEGALES["/eliminar-cuenta"]} />
}
