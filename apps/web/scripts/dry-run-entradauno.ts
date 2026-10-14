/**
 * Dry-run del provider de EntradaUno del cron.
 *
 *   npx tsx scripts/dry-run-entradauno.ts
 *
 * Llama a scrapeEntradaUno() tal cual lo hace /api/cron/scrape, pero NO
 * escribe nada: esa función sólo baja la cartelera, filtra y devuelve el
 * array. La escritura la hace upsertScrapedEvents() en la ruta, que acá no
 * se invoca.
 *
 * Sirve para auditar el filtro de Salta Capital sin tocar la base.
 */
import { scrapeEntradaUno } from '../app/api/cron/scrape/providers/entradauno'

async function main() {
const eventos = await scrapeEntradaUno()

console.log('\n' + '='.repeat(72))
console.log(`RESULTADO: ${eventos.length} eventos devueltos (NO se escribió nada)`)
console.log('='.repeat(72))

const porVenue = new Map<string, number>()
for (const e of eventos) porVenue.set(e.rawVenueName, (porVenue.get(e.rawVenueName) ?? 0) + 1)

console.log(`\nEstablecimientos presentes en el resultado: ${porVenue.size}`)
for (const [v, n] of [...porVenue].sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(3)} eventos  ${v}`)
}

const prohibidos = ['cachi', 'vid y el vino']
const colados = [...porVenue.keys()].filter((v) =>
  prohibidos.some((p) => v.toLowerCase().includes(p)),
)
console.log('\n' + '-'.repeat(72))
if (colados.length === 0) {
  console.log('OK  Ni Cachi ni Cafayate aparecen en el resultado.')
} else {
  console.log('FALLA  Se colaron: ' + JSON.stringify(colados))
  process.exit(1)
}
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
