/**
 * Número de WhatsApp de contacto comercial del sitio: único lugar del repo
 * donde aparece el número literal. Si cambia, cambia solo acá.
 */
export const CONTACT_WHATSAPP = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP || "5493875813233"

/**
 * Texto precargado para el botón de "Anunciar / Publicidad" del footer y
 * para el CTA de WhatsApp del banner promocional (components/footer.tsx y
 * components/adsense-banner.tsx).
 */
export const TEXTO_ANUNCIAR = "Hola! Me interesa anunciar mi negocio o evento en Que Pinta Salta."

/**
 * Arma el link de wa.me con el texto ya codificado para abrir WhatsApp con
 * un mensaje precargado.
 */
export function whatsappUrl(texto: string): string {
  return `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(texto)}`
}
