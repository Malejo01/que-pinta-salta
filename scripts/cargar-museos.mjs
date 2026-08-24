/**
 * Genera las fechas futuras del circuito de museos de Salta Capital.
 *
 *   node scripts/cargar-museos.mjs             # DRY-RUN, no escribe nada
 *   node scripts/cargar-museos.mjs --apply     # escribe
 *   node scripts/cargar-museos.mjs --undo      # borra lo que generó este script
 *   node scripts/cargar-museos.mjs --semanas=4 # cambia el horizonte
 *
 * Por qué hace falta
 * ------------------
 * El scraper de EntradaUno está vivo y corre todas las mañanas, pero la
 * fuente publica los museos como "entrada disponible HOY": crea una fila por
 * museo fechada ese mismo día (start_date - created_at = 0 en 303 de 385
 * filas). Nunca produce fechas futuras, así que la categoría Museos aparece
 * vacía en la agenda salvo el rato de la mañana del día en curso.
 *
 * Esto NO reemplaza al scraper: le adelanta las fechas. El scraper sigue
 * corriendo y fusiona sobre estas filas (ver "Convivencia" abajo).
 *
 * De dónde salen los datos
 * ------------------------
 * Todo se replica de las filas que el scraper ya generó: título, hora,
 * categoría, precio, imagen y link. No se inventa nada. Ojo que en 3 de los
 * 6 casos el TÍTULO no coincide con el nombre del venue.
 *
 * Días: martes a domingo, lunes cerrado. Verificado contra los datos — en 35
 * días, los lunes tienen 1 fila contra 5 del resto, y ese único lunes con
 * actividad (2026-08-17) es feriado por el paso a la inmortalidad de San
 * Martín, cuando los museos abren. Coincide con la descripción del propio
 * circuito ("Martes a Domingos").
 *
 * Cachi y Cafayate quedan afuera
 * ------------------------------
 * El Museo Arqueológico de Cachi (84 km) y el Museo de la Vid y el Vino
 * (Cafayate, 154 km) se sacaron de la ingesta por distancia; ver
 * lib/scraper/salta-capital.ts. Regenerarlos acá sería volver a meterlos por
 * la puerta de atrás. Por eso son 6 museos y no 8.
 *
 * Convivencia con el scraper de la mañana
 * ---------------------------------------
 * upsertEventWithDeduplication() busca duplicados por venue_id + mismo día
 * UTC + similitud de título >= 0.65. Las filas de acá usan el mismo venue_id
 * y el título idéntico (similitud 1.0), y las horas (10:00-11:00 de Salta =
 * 13:00-14:00 UTC) caen holgadas dentro del mismo día UTC. Así que el scraper
 * las encuentra y FUSIONA en vez de duplicar. La fusión es aditiva: suma
 * links de compra, baja el precio si el nuevo es menor y mejora la imagen si
 * la actual es nula o miniatura. No pisa título ni descripción.
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------- env
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    if (!process.env[k]) process.env[k] = line.slice(i + 1).trim()
  }
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(URL, KEY)

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const UNDO = args.includes('--undo')
const SEMANAS = Number((args.find((a) => a.startsWith('--semanas=')) || '').split('=')[1]) || 2

const SALTA_OFFSET = '-03:00'
const CAT_MUSEOS = '93cf95bd-d4c3-4d0e-b390-5816029da2f0'
/** Martes(2) a domingo(0). El lunes(1) queda afuera: cierran. */
const DIAS_ABIERTO = [2, 3, 4, 5, 6, 0]

const saltaToUtc = (dia, hhmm) => new Date(`${dia}T${hhmm}:00${SALTA_OFFSET}`).toISOString()
const diaSalta = (d) => new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
const dowSalta = (dia) => new Date(`${dia}T12:00:00${SALTA_OFFSET}`).getUTCDay()
const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** Mismo slug que genera el cron: generateSlug() en app/api/cron/scrape/route.ts */
const slugify = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 100)

/** Los 6 museos de Salta Capital. venue_id y título salen de la base. */
const MUSEOS = [
  { venueId: '48f05894', nombre: 'Museo de Arqueología de Alta Montaña', titulo: 'Museo de Arqueología de Alta Montaña', hora: '11:00' },
  { venueId: 'a6368e1a', nombre: 'Museo Güemes',                         titulo: 'Museo Güemes',                         hora: '11:00' },
  { venueId: '8ee81049', nombre: 'Complejo Museológico Explora Salta',   titulo: 'Explora Salta',                        hora: '10:00' },
  { venueId: '81915a94', nombre: 'Museo de Bellas Artes',                titulo: 'Museo de Bellas Artes LOLA MORA - MBA', hora: '10:00' },
  { venueId: '1d472943', nombre: 'Museo de Arte MAC',                    titulo: 'Museo de Arte MAC',                    hora: '10:00' },
  { venueId: '31a6a4be', nombre: 'Museo Antropologico',                  titulo: 'Museo de Antropologia - MAS',          hora: '10:00' },
]

// ---------------------------------------------------------------- resolver venues + plantilla
const { data: venues } = await sb.from('venues').select('id,name')
for (const m of MUSEOS) {
  const v = venues.find((x) => x.id.startsWith(m.venueId))
  if (!v) { console.error(`Venue no encontrado para ${m.nombre} (${m.venueId})`); process.exit(1) }
  m.venueIdFull = v.id
  if (v.name !== m.nombre) { console.error(`Venue ${v.id} se llama ${JSON.stringify(v.name)}, esperaba ${JSON.stringify(m.nombre)}`); process.exit(1) }
}

// Plantilla: la fila más reciente que el scraper generó para cada museo.
const { data: previas } = await sb.from('events')
  .select('*')
  .in('venue_id', MUSEOS.map((m) => m.venueIdFull))
  .order('start_date', { ascending: false })

for (const m of MUSEOS) {
  m.plantilla = (previas || []).find((e) => e.venue_id === m.venueIdFull && e.title === m.titulo)
  if (!m.plantilla) { console.error(`Sin fila previa para ${m.titulo}; no se puede replicar el patrón`); process.exit(1) }
}

// ---------------------------------------------------------------- undo
if (UNDO) {
  console.log('=== DESHACER ===')
  let total = 0
  for (const m of MUSEOS) {
    const { data: del, error } = await sb.from('events')
      .delete()
      .eq('venue_id', m.venueIdFull).eq('title', m.titulo)
      .gte('start_date', new Date().toISOString())   // sólo lo futuro: las históricas del scraper NO se tocan
      .select('id')
    if (error) { console.error(`  ERROR ${m.titulo}: ${error.message}`); continue }
    total += del?.length ?? 0
    console.log(`  ${m.titulo}: ${del?.length ?? 0} eventos futuros borrados`)
  }
  console.log(`\n  TOTAL: ${total}. Las filas históricas del scraper no se tocaron.`)
  process.exit(0)
}

// ---------------------------------------------------------------- plan
console.log('='.repeat(78))
console.log(APPLY ? 'APLICANDO' : 'DRY-RUN (no se escribe nada; usar --apply)')
console.log(`Horizonte: ${SEMANAS} semanas | Días: martes a domingo (lunes cerrado) | ${MUSEOS.length} museos`)
console.log('='.repeat(78))

const hoy = new Date()
const filas = []
let totalNuevas = 0, totalExistentes = 0

for (const m of MUSEOS) {
  const fechas = []
  for (let i = 0; i < SEMANAS * 7; i++) {
    const dia = diaSalta(new Date(hoy.getTime() + i * 86400000))
    if (!DIAS_ABIERTO.includes(dowSalta(dia))) continue
    const startUtc = saltaToUtc(dia, m.hora)
    if (new Date(startUtc).getTime() <= hoy.getTime()) continue
    fechas.push({ dia, startUtc })
  }

  const { data: ya } = await sb.from('events')
    .select('start_date').eq('venue_id', m.venueIdFull).eq('title', m.titulo)
    .gte('start_date', hoy.toISOString())
  const yaSet = new Set((ya || []).map((e) => diaSalta(new Date(e.start_date))))
  const nuevas = fechas.filter((f) => !yaSet.has(f.dia))

  totalNuevas += nuevas.length
  totalExistentes += fechas.length - nuevas.length

  console.log(`\n  ${m.titulo}`)
  console.log(`     venue: ${m.nombre} (${m.venueIdFull.slice(0, 8)})   hora: ${m.hora} Salta`)
  console.log(`     fechas en ventana: ${fechas.length}   ya cargadas: ${fechas.length - nuevas.length}   a insertar: ${nuevas.length}`)
  if (nuevas.length) {
    const muestra = [nuevas[0], nuevas[nuevas.length - 1]]
    for (const f of muestra) {
      console.log(`       ${f.dia} ${DOW[dowSalta(f.dia)]} ${m.hora} Salta -> ${f.startUtc} UTC   slug=${slugify(m.titulo)}-${f.dia}`)
    }
  }

  const p = m.plantilla
  for (const f of nuevas) {
    filas.push({
      title: m.titulo,
      slug: `${slugify(m.titulo)}-${f.dia}`,
      description: p.description,
      short_description: p.short_description,
      category_id: CAT_MUSEOS,
      venue_id: m.venueIdFull,
      image_url: p.image_url,
      gallery_urls: p.gallery_urls ?? [],
      start_date: f.startUtc,
      end_date: null,
      is_recurring: false,
      recurrence_rule: null,
      price_min: p.price_min,
      price_max: p.price_max,
      is_free: p.is_free,
      ticket_url: p.ticket_url,
      age_restriction: 0,
      tags: p.tags ?? [],
      status: 'PUBLISHED',
      is_featured: false,
      view_count: 0,
      created_by: null,
      scrape_source_key: p.scrape_source_key,
      classification_source: p.classification_source,
      ticket_sources: p.ticket_sources ?? [],
      is_commercial: p.is_commercial,
    })
  }
}

// ------------------------------------------------- chequeo de convivencia con el scraper
console.log('\n' + '-'.repeat(78))
console.log('CHEQUEO: ¿el scraper de la mañana fusionaría en vez de duplicar?')
let okDedup = true
for (const m of MUSEOS) {
  const ejemplo = filas.find((f) => f.title === m.titulo)
  if (!ejemplo) continue
  const d = new Date(ejemplo.start_date)
  const ini = new Date(d); ini.setUTCHours(0, 0, 0, 0)
  const fin = new Date(d); fin.setUTCHours(23, 59, 59, 999)
  const dentro = d >= ini && d <= fin
  if (!dentro) okDedup = false
  console.log(`  ${dentro ? 'OK  ' : 'FALLA'} ${m.titulo.slice(0, 40).padEnd(41)} ${ejemplo.start_date} dentro del dia UTC [${ini.toISOString().slice(0, 10)}]`)
}
console.log(`  ${okDedup ? 'OK  ' : 'FALLA'} venue_id identico + titulo identico (similitud 1.0 >= umbral 0.65)`)

console.log('\n' + '='.repeat(78))
console.log(`TOTAL a insertar: ${totalNuevas}   ya existentes: ${totalExistentes}`)

if (!APPLY) {
  // Proyección del conteo por categoría
  const { data: all } = await sb.from('events').select('start_date,category_id').eq('status', 'PUBLISHED')
  const { data: cats } = await sb.from('categories').select('id,name')
  const ahora = Date.now()
  const fut = {}
  for (const e of all) if (new Date(e.start_date).getTime() >= ahora) fut[e.category_id] = (fut[e.category_id] || 0) + 1
  const proy = { ...fut, [CAT_MUSEOS]: (fut[CAT_MUSEOS] || 0) + totalNuevas }
  console.log('\nEVENTOS FUTUROS POR CATEGORIA (antes -> despues)')
  const filasCat = cats.map((c) => ({ n: c.name, a: fut[c.id] || 0, d: proy[c.id] || 0 }))
    .filter((r) => r.a > 0 || r.d > 0).sort((x, y) => y.d - x.d)
  for (const r of filasCat) {
    console.log(`  ${r.n.padEnd(16)} ${String(r.a).padStart(4)} -> ${String(r.d).padStart(4)}${r.d !== r.a ? '   (+' + (r.d - r.a) + ')' : ''}`)
  }
  const totA = filasCat.reduce((s, r) => s + r.a, 0), totD = filasCat.reduce((s, r) => s + r.d, 0)
  console.log(`  ${'TOTAL'.padEnd(16)} ${String(totA).padStart(4)} -> ${String(totD).padStart(4)}`)
  console.log(`\n  Museos pasaria a ser el ${Math.round((proy[CAT_MUSEOS] / totD) * 100)}% de la agenda futura.`)
  console.log('\nDRY-RUN: no se escribió nada. Para aplicar:  node scripts/cargar-museos.mjs --apply')
  process.exit(0)
}

// ---------------------------------------------------------------- aplicar
if (!filas.length) { console.log('Nada para insertar.'); process.exit(0) }
const { data: ins, error } = await sb.from('events').insert(filas).select('id')
if (error) { console.error(`ERROR insertando: ${error.message}`); process.exit(1) }
console.log(`\n-> ${ins.length} eventos insertados`)
console.log('Para deshacer:  node scripts/cargar-museos.mjs --undo')
