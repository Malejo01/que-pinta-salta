/**
 * Interruptor de monetización: anuncios de AdSense y donaciones con Mercado
 * Pago. Solo se prende con NEXT_PUBLIC_ADS_ENABLED=true; si la variable falta
 * o tiene otro valor, queda apagado.
 *
 * Apagado:
 * - no se carga el script de AdSense (app/layout.tsx) ni se renderizan los
 *   slots, tampoco el cartel de "Anunciá por WhatsApp" (AdSenseBanner);
 * - next.config.mjs quita los dominios de anuncios de la CSP;
 * - se ocultan los botones de donación y openDonationModal no hace nada.
 *
 * Es NEXT_PUBLIC_*: se inyecta en el build, así que cambiarla en Vercel exige
 * redeployar. next.config.mjs la lee por su cuenta (no puede importar TS).
 */
export const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED === "true"

export const ADSENSE_CLIENT_ID = ADS_ENABLED
  ? process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID
  : undefined

export const DONATIONS_ENABLED = ADS_ENABLED

/**
 * Un slot de AdSense es el ID numérico de un bloque de anuncios (no un
 * nombre como el "home-middle-banner" de hoy, que nunca llena el espacio:
 * ver components/adsense-banner.tsx). `null` si falta la variable, si no es
 * solo dígitos o si la monetización está apagada.
 */
function parseAdsenseSlot(raw: string | undefined): string | null {
  if (!ADS_ENABLED) return null
  if (!raw || !/^\d+$/.test(raw)) return null
  return raw
}

/** Slot de AdSense por lugar (52-b los usa en cada página). */
export const ADSENSE_SLOTS = {
  portada: parseAdsenseSlot(process.env.NEXT_PUBLIC_ADSENSE_SLOT_PORTADA),
  ficha: parseAdsenseSlot(process.env.NEXT_PUBLIC_ADSENSE_SLOT_FICHA),
  buscar: parseAdsenseSlot(process.env.NEXT_PUBLIC_ADSENSE_SLOT_BUSCAR),
}

/**
 * Alto reservado (en px) para el contenedor del anuncio en cada lugar, ANTES
 * de que AdSense lo llene: sin esto, el bloque mide 0px hasta que carga y
 * después empuja el resto de la página (CLS).
 *
 * Un bloque *responsive* (`data-ad-format="auto"`, `data-full-width-responsive`)
 * elige el formato según el ancho disponible, no lo fija el código: en
 * celular (columna única, ~320-420px) suele tocarle un rectángulo mediano o
 * una variante vertical, más alto; en computadora (columna más ancha,
 * convive con otro contenido al costado) suele tocarle un formato más
 * ancho y más bajo, tipo banner horizontal. 280px/250px son una estimación
 * razonable para no reservar de más (desperdicia espacio en la mayoría de
 * los casos) ni de menos (el salto sigue pasando, aunque más chico); los
 * tres lugares comparten el mismo componente de banner (AdSenseBanner) con
 * el mismo ancho de columna, así que comparten el mismo valor. La tarea
 * 52-b los usa para el `min-height` del contenedor.
 */
export const ALTO_RESERVADO_ANUNCIO = {
  portada: { mobile: 280, desktop: 250 },
  ficha: { mobile: 280, desktop: 250 },
  buscar: { mobile: 280, desktop: 250 },
} as const
