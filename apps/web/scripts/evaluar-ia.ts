/**
 * Q6-4 · Banco de evaluación de IA (flyers, traducción y clasificación).
 *
 *   npx tsx scripts/evaluar-ia.ts                       # EN SECO (por defecto): valida los fixtures de
 *                                                       #   docs/evaluacion-ia, arma los pedidos reales con
 *                                                       #   lib/ai (sin llamar a nadie), estima tokens y el costo
 *                                                       #   mensual por modelo. Gratis: no usa red ni claves.
 *   npx tsx scripts/evaluar-ia.ts --real --proveedor gemini|claude|ambos --confirmo-costo [--tope 5] [--uso flyers]
 *                                                       # REAL: PAGO. Pide --confirmo-costo (antes muestra el
 *                                                       #   costo máximo estimado), tope por uso y proveedor, y
 *                                                       #   falla claro si falta GEMINI_API_KEY / ANTHROPIC_API_KEY.
 *
 * Se corre a mano desde `apps/web`; no está programado. La lógica está en
 * `lib/ia/evaluacion/` (con tests en `tests/ia/evaluacion*.test.ts`). Qué mide
 * y cómo leer el informe: `docs/evaluacion-ia/README.md`. No imprime ningún
 * valor de entorno ni datos personales.
 */
import { ejecutarCli } from '../lib/ia/evaluacion/cli'

ejecutarCli(process.argv.slice(2), {
  cwd: process.cwd(),
  entorno: process.env,
  fetch: (url, init) => fetch(url, init),
  log: (linea) => console.log(linea),
  error: (linea) => console.error(linea),
})
  .then((codigo) => process.exit(codigo))
  .catch(() => {
    console.error('[evaluar-ia] falló')
    process.exit(1)
  })
