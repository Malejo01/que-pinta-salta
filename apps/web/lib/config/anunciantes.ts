/**
 * Configuración de la página pública `/anunciantes` ("Publicitá tu evento").
 *
 * `publicada` es el interruptor de indexación: con `false` la página responde
 * 200 pero no se indexa ni entra al sitemap, y el link del footer no se
 * muestra (ver app/anunciantes/page.tsx, app/sitemap.ts y
 * components/footer.tsx).
 *
 * Desde el 19/10 (Mauro, 16:10) la página tiene el tarifario final, con
 * precios finales: está publicada. Los precios no viven acá sino en
 * `@qps/core/publicidad/precios` (después, en la tabla `ad_prices` de la R58).
 */
export interface AnunciantesConfig {
  publicada: boolean
}

export const ANUNCIANTES: AnunciantesConfig = {
  publicada: true,
}
