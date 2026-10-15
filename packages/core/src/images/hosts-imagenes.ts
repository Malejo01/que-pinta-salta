/**
 * Hosts de terceros (ticketeras y cines) a los que la app y la web les
 * piden flyers e imágenes directamente — la misma lista que el `img-src`
 * de la CSP de la web (`apps/web/next.config.mjs`); un test lo compara.
 * Sin `unsplash` ni los de Google: esos no son fuentes de flyers, son del
 * resto de la CSP de la web.
 *
 * Puro: no hace red.
 */
export const HOSTS_IMAGENES_TERCEROS = [
  'entradauno.com',
  'norteticket.com',
  'norteticket.com.ar',
  'centralticket.com.ar',
  'vamos.gob.ar',
  'alpogo.com',
  'cinemark.com.ar',
  'adro.studio',
] as const

/**
 * `true` si `host` es exactamente uno de `HOSTS_IMAGENES_TERCEROS` o un
 * subdominio suyo (`x.entradauno.com` sí; `entradauno.com.evil.io` y
 * `evilentradauno.com`, no). Comparación en minúsculas.
 */
export function esHostDeImagenPermitido(host: string): boolean {
  const normalizado = host.toLowerCase()
  return HOSTS_IMAGENES_TERCEROS.some(
    (permitido) => normalizado === permitido || normalizado.endsWith(`.${permitido}`)
  )
}
