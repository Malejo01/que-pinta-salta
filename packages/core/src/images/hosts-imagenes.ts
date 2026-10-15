/**
 * Hosts de terceros (ticketeras y cines) a los que la app y la web les
 * piden flyers e imágenes directamente — la misma lista que el `img-src`
 * de la CSP de la web (`apps/web/next.config.mjs`), **incluida la
 * diferencia entre apex y wildcard**: un test lo compara.
 *
 * El `img-src` real no es simétrico: 6 hosts están en las dos formas
 * (`'https://entradauno.com', 'https://*.entradauno.com'`, etc.), pero
 * `cinemark.com.ar` y `adro.studio` están **solo** como wildcard
 * (`'https://*.cinemark.com.ar'`, `'https://*.adro.studio'`, sin la forma
 * exacta). Un `*.dominio` en CSP exige al menos una etiqueta de subdominio
 * y no matchea el dominio pelado, así que el navegador bajo la CSP de la
 * web bloquearía `https://cinemark.com.ar/...` o `https://adro.studio/...`
 * sin subdominio. Para que lo que la app acepta pedirle a un tercero sea
 * subconjunto de lo que la web ya puede pedir, `esHostDeImagenPermitido`
 * respeta esa misma distinción.
 *
 * Sin `unsplash` ni los de Google: esos no son fuentes de flyers, son del
 * resto de la CSP de la web.
 *
 * Puro: no hace red.
 */

/** Hosts que la CSP de la web acepta tanto en forma exacta (apex) como en cualquier subdominio. */
export const HOSTS_CON_APEX = [
  'entradauno.com',
  'norteticket.com',
  'norteticket.com.ar',
  'centralticket.com.ar',
  'vamos.gob.ar',
  'alpogo.com',
] as const

/**
 * Hosts que la CSP de la web acepta **solo** como subdominio (`*.host`):
 * el dominio pelado (apex) no matchea ese wildcard, y tampoco lo acepta la
 * app.
 */
export const HOSTS_SOLO_SUBDOMINIO = [
  'cinemark.com.ar',
  'adro.studio',
] as const

/**
 * Los 8 hosts, sin distinguir apex/wildcard (para quien solo necesite la
 * lista de nombres, por ejemplo el test que la compara contra el `img-src`
 * de la web).
 */
export const HOSTS_IMAGENES_TERCEROS = [...HOSTS_CON_APEX, ...HOSTS_SOLO_SUBDOMINIO] as const

/**
 * `true` si `host` matchea alguno de los hosts de arriba con la misma
 * regla que su entrada (o entradas) en el `img-src` de la web:
 * - `HOSTS_CON_APEX`: el host exacto o un subdominio (`x.entradauno.com`
 *   sí; `entradauno.com.evil.io` y `evilentradauno.com`, no);
 * - `HOSTS_SOLO_SUBDOMINIO`: **solo** un subdominio (`www.cinemark.com.ar`
 *   sí; `cinemark.com.ar` pelado, no — igual que la CSP de la web).
 *
 * Comparación en minúsculas.
 */
export function esHostDeImagenPermitido(host: string): boolean {
  const normalizado = host.toLowerCase()

  const matchApexOSubdominio = HOSTS_CON_APEX.some(
    (permitido) => normalizado === permitido || normalizado.endsWith(`.${permitido}`)
  )
  if (matchApexOSubdominio) return true

  return HOSTS_SOLO_SUBDOMINIO.some((permitido) => normalizado.endsWith(`.${permitido}`))
}
