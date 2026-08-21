/**
 * Auditoría de venues — SOLO LECTURA.
 *
 *   node scripts/venue-audit.mjs          # audita + simula la consolidación
 *   node scripts/venue-audit.mjs --check  # sólo los criterios de aceptación
 *
 * Antes de aplicar la migración: simula el plan de
 * supabase/migrations/20260821_venue_canonical_data.sql y muestra qué se
 * fusionaría, sin escribir nada.
 *
 * Después de aplicarla: detecta el esquema nuevo y verifica contra la base
 * real, resolviendo por RPC (resolve_venue_id) en vez de simular.
 *
 * No hace ni un INSERT/UPDATE/DELETE. Es seguro correrlo contra producción.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

// --- env -------------------------------------------------------------------
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

// --- espejo de venue_normalize / venue_core_key ----------------------------
const norm = (s) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
const core = (s) =>
  norm(s).replace(/^(el|la|los|las) /, '')
    .replace(/ (salta salta|salta capital|salta|oficial salta|oficial|argentina)$/, '')
    .replace(/^salta /, '').replace(/\s+/g, ' ').trim()

// --- pares que DEBEN resolver al mismo venue -------------------------------
const MUST_MATCH = [
  ['Amnesia', 'Amnesia Salta'],
  ['Autódromo de Salta', 'Autodromo de Salta'],
  ['AMNESIA', 'amnesia salta'],
  ['Amnesia Pub & Music', 'Amnesia Pub & Música'],
  ['LA ROKA', 'El Patio de la Roka'],
  ['Salta Roka', 'Saltaroka'],
  ['JP', 'juandelospalotes.jp'],
  ['Babylon', 'Babylon Salta'],
  ['Teatro Provincial JCS', 'Teatro Provincial Juan Carlos Saravia'],
  ['Fabrica de Musica', 'Fábrica de Música'],
  ['Teatro del Huerto, Salta, Salta', 'Teatro del Huerto'],
]

// --- pares que NO deben unificarse (lugares distintos) ---------------------
const MUST_DIFFER = [
  ['Amnesia', 'Amnesia Ibiza'],
  ['Balcarce 935', 'Balcarce 980'],
  ['Museo de Arte MAC', 'Museo de Bellas Artes'],
  ['Casona del Sur', 'La Casona del Molino'],
  ['Museo Arqueológico de Cachi', 'Museo de Arqueología de Alta Montaña'],
  ['Baby', 'Babylon'],
]

const { data: venues, error } = await sb.from('venues').select('*').order('name')
if (error) { console.error('Error leyendo venues:', error.message); process.exit(1) }

const { data: events } = await sb.from('events').select('id, venue_id')
const evCount = new Map()
for (const e of events || []) evCount.set(e.venue_id, (evCount.get(e.venue_id) || 0) + 1)
const nEv = (id) => evCount.get(id) || 0

const migrated = Object.prototype.hasOwnProperty.call(venues[0] || {}, 'canonical_venue_id')

console.log('='.repeat(64))
console.log(migrated ? 'ESQUEMA CANÓNICO APLICADO' : 'ESQUEMA VIEJO (migración sin aplicar)')
console.log('='.repeat(64))
console.log('Venues totales    :', venues.length)
console.log('Eventos totales   :', (events || []).length)

if (migrated) {
  const canon = venues.filter((v) => !v.canonical_venue_id && !v.is_placeholder)
  const absorbed = venues.filter((v) => v.canonical_venue_id)
  console.log('Venues canónicos  :', canon.length)
  console.log('  con actividad   :', canon.filter((v) => nEv(v.id) > 0).length)
  console.log('  sin actividad   :', canon.filter((v) => nEv(v.id) === 0).length)
  console.log('Absorbidos        :', absorbed.length)
  console.log('Centinelas        :', venues.filter((v) => v.is_placeholder).length)
  console.log('Sin slug          :', canon.filter((v) => !v.slug).length)

  const { count: nAliases } = await sb.from('venue_aliases').select('*', { count: 'exact', head: true })
  const { count: nPending } = await sb.from('venue_review_queue')
    .select('*', { count: 'exact', head: true }).eq('status', 'pending')
  console.log('Aliases           :', nAliases ?? '?')
  console.log('En revisión manual:', nPending ?? '?')

  // integridad: ninguna cadena de más de un salto
  const byId = new Map(venues.map((v) => [v.id, v]))
  const chains = absorbed.filter((v) => byId.get(v.canonical_venue_id)?.canonical_venue_id)
  console.log('Cadenas 2+ saltos :', chains.length, chains.length ? '<-- REVISAR' : '(ok)')
} else {
  // Dry-run: agrupa por las mismas claves que usa la migración.
  const bucket = (fn) => {
    const m = new Map()
    for (const v of venues) {
      const k = fn(v.name)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(v)
    }
    return [...m.values()].filter((g) => g.length > 1)
  }
  console.log('\nColisiones por clave normalizada (tilde/mayúscula/puntuación):')
  for (const g of bucket(norm)) console.log('  ' + g.map((v) => `${JSON.stringify(v.name)}(${nEv(v.id)})`).join(' + '))
  console.log('\nColisiones por core key (artículo + sufijo de ciudad):')
  for (const g of bucket(core)) {
    if (new Set(g.map((v) => norm(v.name))).size < 2) continue
    console.log('  ' + g.map((v) => `${JSON.stringify(v.name)}(${nEv(v.id)})`).join(' + '))
  }
  console.log('\n(La consolidación completa incluye además el plan curado de la migración.)')
}

// --- criterios de aceptación ----------------------------------------------
console.log('\n' + '='.repeat(64))
console.log('CRITERIOS DE ACEPTACIÓN')
console.log('='.repeat(64))

async function resolve(raw) {
  if (!migrated) return null
  const { data, error: e } = await sb.rpc('resolve_venue_id', {
    p_raw: raw, p_source: 'audit', p_autocreate: false, p_threshold: 0.62,
  })
  if (e) { console.error('  rpc error:', e.message); return null }
  return data
}

if (!migrated) {
  console.log('Migración sin aplicar: no se puede verificar contra la base.')
  console.log('Aplicar 20260821_venue_canonical.sql + _data.sql y volver a correr.')
  process.exit(0)
}

const nameOf = (id) => (id ? venues.find((v) => v.id === id)?.name ?? id : 'NULL (→ revisión manual)')
let pass = 0, fail = 0

for (const [a, b] of MUST_MATCH) {
  const [ra, rb] = [await resolve(a), await resolve(b)]
  const ok = !!ra && ra === rb
  console.log(`  ${ok ? 'PASS ' : 'FALLA'}  ${JSON.stringify(a)} == ${JSON.stringify(b)}  →  ${nameOf(ra)}`)
  ok ? pass++ : fail++
}
console.log('\n  -- no deben unificarse --')
for (const [a, b] of MUST_DIFFER) {
  const [ra, rb] = [await resolve(a), await resolve(b)]
  const ok = !ra || !rb || ra !== rb
  console.log(`  ${ok ? 'PASS ' : 'FALLA'}  ${JSON.stringify(a)} != ${JSON.stringify(b)}  →  ${nameOf(ra)} / ${nameOf(rb)}`)
  ok ? pass++ : fail++
}

console.log(`\nTOTAL: ${pass} pass, ${fail} falla`)
process.exit(fail ? 1 : 0)
