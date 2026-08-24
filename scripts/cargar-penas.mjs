/**
 * Carga manual de peñas con show recurrente semanal.
 *
 *   node scripts/cargar-penas.mjs             # DRY-RUN, no escribe nada
 *   node scripts/cargar-penas.mjs --apply     # escribe
 *   node scripts/cargar-penas.mjs --undo      # borra lo que cargó este script
 *   node scripts/cargar-penas.mjs --semanas=8 # cambia el horizonte
 *
 * Por qué N filas y no un evento recurrente
 * -----------------------------------------
 * `events` tiene columnas `is_recurring` y `recurrence_rule`, pero NO son un
 * mecanismo: se escriben siempre en `false`/`null` desde las tres rutas de
 * ingesta y no las lee ninguna consulta ni ningún componente. Hoy hay 0 filas
 * con `is_recurring = true`. Un evento marcado como recurrente aparecería una
 * sola vez, en su `start_date`, y nunca se repetiría — porque la agenda filtra
 * por `start_date >= now()` y no expande ninguna regla.
 *
 * El patrón real del proyecto es una fila por fecha, y lo usan tanto el
 * circuito de museos (385 filas, un registro por día por museo) como la carga
 * manual que ya existía (la "Semana del Cine", 10 filas, una por día).
 *
 * Lo que hay que saber: N filas VENCE, y hay que regenerarlas.
 *
 * (El circuito de museos parece el mismo caso pero NO lo es: sus 385 filas
 * también terminan hoy, pero porque las genera el scraper de entradauno una
 * por día, siempre para el mismo día. Ese proceso está vivo y corre todas las
 * mañanas; no se quedó sin futuro, nunca tuvo futuro. Estas peñas sí dependen
 * de que alguien re-corra este script.)
 *
 * El lugar natural para automatizarlo es un job del scheduler (Ola 4);
 * mientras tanto se re-corre a mano, que es idempotente.
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
const SEMANAS = Number((args.find((a) => a.startsWith('--semanas=')) || '').split('=')[1]) || 4

const CATEGORIA_PENAS = 'f8fa78e3-b961-4fea-9026-8829ca4cc86d'
const SALTA_OFFSET = '-03:00'

/** Espejo de saltaWallClockToUtcISO(): hora de pared de Salta -> instante UTC. */
const saltaToUtc = (yyyyMmDd, hhmm) => new Date(`${yyyyMmDd}T${hhmm}:00${SALTA_OFFSET}`).toISOString()
/** Día calendario en Salta de un Date. */
const diaSalta = (d) => {
  const s = new Date(d.getTime() - 3 * 60 * 60 * 1000)
  return s.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------- datos
// Verificados a mano por el usuario. Los títulos y descripciones son
// redacción propia y genérica: no se copia texto de ningún sitio.
const PENAS = [
  {
    venue: {
      name: 'Balderrama',
      address: 'Av. San Martín 1126, Salta',
      phone: '+54 387 421-1542',
    },
    titulo: 'Peña folklórica en Balderrama',
    descripcion:
      'Peña folklórica con música en vivo en Balderrama, sobre Av. San Martín, en Salta Capital. ' +
      'El show arranca a las 21 hs, de miércoles a domingo. ' +
      'Conviene confirmar la cartelera y los precios directamente con el local antes de ir.',
    resumen: 'Peña con música folklórica en vivo, de miércoles a domingo desde las 21 hs.',
    // 0=domingo … 6=sábado. Miércoles a domingo.
    dias: [3, 4, 5, 6, 0],
    hora: '21:00',
    ticketUrl: null, // no se carga una URL que no fue verificada
  },
  {
    venue: {
      name: 'La Vieja Estación',
      address: 'Balcarce 875, Salta',
      phone: '+54 387 421-7727',
    },
    titulo: 'Peña folklórica en La Vieja Estación',
    descripcion:
      'Peña folklórica con show en vivo en La Vieja Estación, sobre calle Balcarce, en Salta Capital. ' +
      'El espectáculo comienza a las 22 hs, todos los días. ' +
      'Conviene confirmar la cartelera y los precios directamente con el local antes de ir.',
    resumen: 'Peña con show folklórico en vivo, todos los días a las 22 hs.',
    dias: [0, 1, 2, 3, 4, 5, 6],
    hora: '22:00',
    ticketUrl: 'https://www.laviejaestacion.com.ar',
  },
]

const norm = (s) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
const slugify = (s) => norm(s).replace(/ /g, '-').slice(0, 90)

// ---------------------------------------------------------------- undo
if (UNDO) {
  console.log('=== DESHACER ===')
  for (const p of PENAS) {
    const { data: v } = await sb.from('venues').select('id,name').ilike('name', p.venue.name)
    const venue = (v || [])[0]
    if (!venue) { console.log(`  ${p.venue.name}: venue no existe, nada que hacer`); continue }
    const { data: del, error } = await sb.from('events')
      .delete().eq('venue_id', venue.id).eq('title', p.titulo).select('id')
    if (error) { console.error(`  ERROR: ${error.message}`); continue }
    console.log(`  ${p.titulo}: ${del?.length ?? 0} eventos borrados`)
  }
  console.log('\n  Los venues NO se borran (pueden tener otros eventos). Para borrarlos, a mano.')
  process.exit(0)
}

// ---------------------------------------------------------------- plan
console.log('='.repeat(74))
console.log(APPLY ? 'APLICANDO' : 'DRY-RUN (no se escribe nada; usar --apply para escribir)')
console.log(`Horizonte: ${SEMANAS} semanas`)
console.log('='.repeat(74))

const hoy = new Date()
let totalNuevos = 0, totalExistentes = 0

for (const p of PENAS) {
  console.log(`\n### ${p.titulo}`)

  // --- venue: reusar si ya existe (match por clave normalizada) ---
  const { data: todos } = await sb.from('venues').select('id,name,address,phone')
  let venue = (todos || []).find((v) => norm(v.name) === norm(p.venue.name))

  if (venue) {
    console.log(`  venue EXISTENTE: ${JSON.stringify(venue.name)}  id=${venue.id}`)
    console.log(`     address actual: ${JSON.stringify(venue.address)}`)
    console.log(`     phone actual  : ${JSON.stringify(venue.phone)}`)
  } else {
    console.log(`  venue NUEVO: ${JSON.stringify(p.venue.name)}`)
    console.log(`     address: ${JSON.stringify(p.venue.address)}`)
    console.log(`     phone  : ${JSON.stringify(p.venue.phone)}`)
    if (APPLY) {
      const { data, error } = await sb.from('venues')
        .insert({ name: p.venue.name, address: p.venue.address, phone: p.venue.phone })
        .select('id,name,address,phone').single()
      if (error) { console.error(`     ERROR creando venue: ${error.message}`); continue }
      venue = data
      console.log(`     creado id=${venue.id}`)
    } else {
      venue = { id: '(se crearia)', ...p.venue }
    }
  }

  // --- fechas ---
  const fechas = []
  for (let i = 0; i < SEMANAS * 7; i++) {
    const d = new Date(hoy.getTime() + i * 24 * 60 * 60 * 1000)
    const dia = diaSalta(d)
    const dow = new Date(`${dia}T12:00:00${SALTA_OFFSET}`).getUTCDay()
    if (!p.dias.includes(dow)) continue
    const startUtc = saltaToUtc(dia, p.hora)
    if (new Date(startUtc).getTime() <= hoy.getTime()) continue // hoy ya pasó la hora
    fechas.push({ dia, startUtc })
  }

  // --- ya cargadas? ---
  let yaCargadas = new Set()
  if (venue.id !== '(se crearia)') {
    const { data: ya } = await sb.from('events')
      .select('id,start_date').eq('venue_id', venue.id).eq('title', p.titulo)
    for (const e of ya || []) yaCargadas.add(diaSalta(new Date(e.start_date)))
  }

  const nuevas = fechas.filter((f) => !yaCargadas.has(f.dia))
  totalNuevos += nuevas.length
  totalExistentes += fechas.length - nuevas.length

  const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  console.log(`  fechas en ventana: ${fechas.length}   ya cargadas: ${fechas.length - nuevas.length}   a insertar: ${nuevas.length}`)
  if (nuevas.length) {
    const muestra = nuevas.slice(0, 3).concat(nuevas.length > 3 ? [nuevas[nuevas.length - 1]] : [])
    for (const f of muestra) {
      const dw = DOW[new Date(`${f.dia}T12:00:00${SALTA_OFFSET}`).getUTCDay()]
      console.log(`     ${f.dia} ${dw} ${p.hora} Salta  ->  ${f.startUtc} UTC   slug=${slugify(p.titulo)}-${f.dia}`)
    }
    if (nuevas.length > 4) console.log(`     … (${nuevas.length - 4} más en el medio)`)
  }

  if (!APPLY || !nuevas.length) continue

  const filas = nuevas.map((f) => ({
    title: p.titulo,
    slug: `${slugify(p.titulo)}-${f.dia}`,
    description: p.descripcion,
    short_description: p.resumen,
    category_id: CATEGORIA_PENAS,
    venue_id: venue.id,
    image_url: null,          // la UI cae a /placeholder.svg
    gallery_urls: [],
    start_date: f.startUtc,
    end_date: null,           // no se sabe a qué hora termina; omitirlo es correcto
    is_recurring: false,      // la columna no la lee nadie; se deja como el resto
    recurrence_rule: null,
    price_min: 0,             // con is_free=false la UI lo muestra como "confirmar"
    price_max: null,
    is_free: false,
    ticket_url: p.ticketUrl,
    age_restriction: 0,
    tags: [],
    status: 'PUBLISHED',
    is_featured: false,
    view_count: 0,
    created_by: null,         // carga por script, no por el formulario de un usuario
    scrape_source_key: null,  // no es scraping
    classification_source: null,
    ticket_sources: p.ticketUrl ? [{ url: p.ticketUrl, source: 'manual', price_min: 0 }] : [],
    is_commercial: true,      // 'penas' está en las categorías comerciales
  }))

  const { data: ins, error } = await sb.from('events').insert(filas).select('id')
  if (error) console.error(`  ERROR insertando: ${error.message}`)
  else console.log(`  -> ${ins.length} eventos insertados`)
}

console.log('\n' + '='.repeat(74))
console.log(`TOTAL  a insertar: ${totalNuevos}   ya existentes: ${totalExistentes}`)
if (!APPLY) console.log('\nDRY-RUN: no se escribió nada. Para aplicar:  node scripts/cargar-penas.mjs --apply')
console.log('Para deshacer:  node scripts/cargar-penas.mjs --undo')
