/**
 * El `<html lang>` de las páginas en inglés, sin volver dinámico el sitio.
 *
 * El layout raíz es uno solo para `/` y para `/en/...` y no puede saber la
 * ruta sin leer `headers()`, lo que haría dinámicas a todas las páginas (las
 * legales, las de auth y `/anunciantes`, que perdería su ISR y consultaría
 * Supabase en cada visita). Por eso el servidor siempre escribe `es-AR` y
 * este script, que va en el `<head>` como el del tema, lo pasa a `en` antes
 * del primer pintado si la ruta es `/en` o `/en/...` (la misma regla que
 * `separarIdioma`). En las navegaciones del cliente lo mantiene
 * `IdiomaDocumento`. `<html>` ya tiene `suppressHydrationWarning`.
 */
import { LANG_HTML } from './idiomas'

export const IDIOMA_INIT_SCRIPT = `(function(){try{var p=location.pathname;if(p==='/en'||p.indexOf('/en/')===0)document.documentElement.lang=${JSON.stringify(LANG_HTML.en)}}catch(e){}})();`
