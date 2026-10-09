/**
 * Número de WhatsApp de contacto comercial del sitio: la misma variable y el
 * mismo valor por defecto que ya usan components/adsense-banner.tsx,
 * components/footer.tsx y app/privacidad/page.tsx. Si cambia el número,
 * cambia acá y en esos tres lugares (no se tocan en esta tarea).
 */
export const CONTACT_WHATSAPP = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP || "5493875813233"

/**
 * Arma el link de wa.me con el texto ya codificado para abrir WhatsApp con
 * un mensaje precargado.
 */
export function whatsappUrl(texto: string): string {
  return `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(texto)}`
}
