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
