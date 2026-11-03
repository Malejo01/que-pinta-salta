/**
 * Q5-1 · Importa lugares para chicos de Salta Capital desde OpenStreetMap
 * (Overpass) como BORRADORES de `lugares_permanentes`, para que un admin los
 * verifique en /admin/lugares-chicos. Nada se publica solo.
 *
 *   npx tsx scripts/importar-lugares-chicos.ts               # consulta y muestra el plan; NO escribe
 *   npx tsx scripts/importar-lugares-chicos.ts --aplicar     # además crea venues y fichas en borrador
 *   npx tsx scripts/importar-lugares-chicos.ts --sin-cache   # vuelve a pedirle a Overpass aunque haya caché
 *
 * Se corre desde apps/web, a mano (nunca programado, nunca desde el
 * navegador). Hace UN pedido a Overpass por corrida, con User-Agent propio y
 * caché de 7 días en ops/lugares-chicos/overpass-cache.json; si hiciera falta
 * más de uno, espera 1 segundo entre pedidos.
 *
 * Datos © colaboradores de OpenStreetMap, licencia ODbL
 * (https://www.openstreetmap.org/copyright): cada ficha guarda su `osm_ref` y
 * la interfaz muestra la atribución donde se usen.
 *
 * Necesita NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno
 * (o en .env.local). No imprime ningún valor de entorno.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { traerTodasLasFilas } from '../lib/images/paginar-filas'
import { slugDeLugar } from '../lib/lugares-chicos/slug'
import {
  INTERVALO_MIN_MS,
  URL_OVERPASS,
  USER_AGENT_OVERPASS,
  VIGENCIA_CACHE_MS,
  candidatosDesdeOverpass,
  consultaOverpass,
  planDeImportacion,
  resumenDelPlan,
  urlOsm,
  type VenueExistente,
} from '../lib/lugares-chicos/osm'

function loadEnvLocal() {
  for (const file of ['.env.local', '.env']) {
    let raw: string
    try {
      raw = readFileSync(join(process.cwd(), file), 'utf8')
    } catch {
      continue
    }
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i)
      if (!match) continue
      const [, key, rawValue] = match
      if (process.env[key] !== undefined) continue
      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '')
    }
  }
}

const ARCHIVO_CACHE = fileURLToPath(new URL('../../../ops/lugares-chicos/overpass-cache.json', import.meta.url))

let ultimoPedido = 0
async function pedirOverpass(consulta: string): Promise<unknown> {
  const espera = ultimoPedido + INTERVALO_MIN_MS - Date.now()
  if (espera > 0) await new Promise((r) => setTimeout(r, espera))
  ultimoPedido = Date.now()
  const respuesta = await fetch(URL_OVERPASS, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT_OVERPASS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(consulta)}`,
  })
  if (!respuesta.ok) throw new Error(`Overpass respondió ${respuesta.status}`)
  return respuesta.json()
}

async function datosOverpass(sinCache: boolean): Promise<unknown> {
  const consulta = consultaOverpass()
  if (!sinCache) {
    try {
      const cache = JSON.parse(readFileSync(ARCHIVO_CACHE, 'utf8')) as { guardadoEn: string; consulta: string; datos: unknown }
      if (cache.consulta === consulta && Date.now() - new Date(cache.guardadoEn).getTime() < VIGENCIA_CACHE_MS) {
        console.log(`[importar-lugares-chicos] uso la caché del ${cache.guardadoEn}`)
        return cache.datos
      }
    } catch {
      // sin caché
    }
  }
  console.log('[importar-lugares-chicos] consulto Overpass (1 pedido)…')
  const datos = await pedirOverpass(consulta)
  mkdirSync(dirname(ARCHIVO_CACHE), { recursive: true })
  writeFileSync(ARCHIVO_CACHE, JSON.stringify({ guardadoEn: new Date().toISOString(), consulta, datos }))
  return datos
}

async function main() {
  loadEnvLocal()
  const args = new Set(process.argv.slice(2))
  const aplicar = args.has('--aplicar') || args.has('--apply')
  const sinCache = args.has('--sin-cache')
  for (const a of args) {
    if (!['--aplicar', '--apply', '--sin-cache'].includes(a)) {
      console.error(`[importar-lugares-chicos] opción desconocida: ${a}`)
      process.exit(1)
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) {
    console.error('[importar-lugares-chicos] faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const supabase = createClient(url, clave, { auth: { persistSession: false } })

  const { candidatos, descartados } = candidatosDesdeOverpass(await datosOverpass(sinCache))
  console.log(`[importar-lugares-chicos] ${candidatos.length} candidatos con nombre en Capital (${descartados} descartados)`)

  const [venues, fichas] = await Promise.all([
    traerTodasLasFilas<{ id: string; name: string; latitude: number | null; longitude: number | null }>((desde, hasta) =>
      supabase
        .from('venues')
        .select('id, name, latitude, longitude')
        .is('canonical_venue_id', null)
        .eq('is_placeholder', false)
        .order('id')
        .range(desde, hasta),
    ),
    traerTodasLasFilas<{ venue_id: string; osm_ref: string | null }>((desde, hasta) =>
      supabase.from('lugares_permanentes').select('venue_id, osm_ref').order('id').range(desde, hasta),
    ),
  ])
  const conFicha = new Set(fichas.map((f) => f.venue_id))
  const osmRefs = new Set(fichas.map((f) => f.osm_ref).filter((r): r is string => !!r))
  const existentes: VenueExistente[] = venues.map((v) => ({ ...v, tieneFicha: conFicha.has(v.id) }))

  const plan = planDeImportacion(candidatos, existentes, osmRefs)
  console.table(
    plan.map((d) => ({
      accion: d.accion,
      tipo: d.candidato.tipo,
      nombre: d.candidato.nombre,
      venue: 'venueNombre' in d ? d.venueNombre : '',
      osm: urlOsm(d.candidato.osmRef),
    })),
  )
  console.log('[importar-lugares-chicos] resumen', resumenDelPlan(plan))

  if (!aplicar) {
    console.log('[importar-lugares-chicos] modo consulta: no se escribió nada. Con --aplicar se crean los borradores.')
    return
  }

  let creadas = 0
  let errores = 0
  for (const d of plan) {
    if (d.accion !== 'crear_venue' && d.accion !== 'usar_venue') continue
    let venueId = d.accion === 'usar_venue' ? d.venueId : null
    if (!venueId) {
      // Coordenadas de OSM sin geocode_source: quedan en «Para revisar» de
      // /admin/lugares y el admin confirma el pin antes de publicar.
      const { data, error } = await supabase
        .from('venues')
        .insert({
          name: d.candidato.nombre,
          address: d.candidato.direccion,
          slug: slugDeLugar(d.candidato.nombre),
          latitude: d.candidato.lat,
          longitude: d.candidato.lng,
        })
        .select('id')
        .single()
      if (error || !data) {
        errores++
        console.error('[importar-lugares-chicos] no se pudo crear el venue', d.candidato.osmRef, error?.code ?? 'sin-codigo')
        continue
      }
      venueId = data.id
    }
    const { error } = await supabase.from('lugares_permanentes').insert({
      venue_id: venueId,
      tipo: d.candidato.tipo,
      estado: 'borrador',
      fuente: 'openstreetmap',
      fuente_detalle: urlOsm(d.candidato.osmRef),
      osm_ref: d.candidato.osmRef,
      acceso: d.candidato.tipo === 'plaza_juegos' ? 'gratis' : 'consultar',
      horarios: d.candidato.tipo === 'plaza_juegos' ? { version: 1, siempre_abierto: true, semana: {} } : { version: 1, semana: {} },
    })
    if (error) {
      errores++
      console.error('[importar-lugares-chicos] no se pudo crear la ficha', d.candidato.osmRef, error.code ?? 'sin-codigo')
      continue
    }
    creadas++
  }
  console.log(`[importar-lugares-chicos] ${creadas} borradores creados, ${errores} errores. Verificalos en /admin/lugares-chicos.`)
}

main().catch((error) => {
  console.error('[importar-lugares-chicos] falló:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
