/**
 * Carga la imagen de portada de las peñas cargadas por cargar-penas.mjs.
 *
 *   node scripts/imagen-penas.mjs                              # DRY-RUN
 *   node scripts/imagen-penas.mjs --apply                      # re-aplica lo que ya esta en el bucket
 *   node scripts/imagen-penas.mjs --balderrama=./foto.jpg --apply   # sube una foto nueva
 *   node scripts/imagen-penas.mjs --undo --apply               # vuelve image_url a null
 *
 * Por qué existe
 * -------------
 * `cargar-penas.mjs` inserta `image_url: null` a propósito, porque en el
 * momento de la carga no había ninguna imagen de estos dos locales en el
 * sistema: los venues se crearon con nombre/dirección/teléfono nada más,
 * `venues` no tiene columna de imagen, y ninguno de los dos tiene cuenta en
 * `instagram_accounts`, así que tampoco hay flyers suyos en los buckets.
 *
 * Con `image_url` en null la UI cae a `/placeholder.svg` (home-content.tsx),
 * que es el gris con el ícono roto. Este script cierra ese hueco: sube una
 * foto por peña al bucket `flyers` y la aplica a TODAS las fechas de esa peña,
 * que son una fila por día (14 y 9 al momento de escribir esto).
 *
 * Es idempotente: `upsert: true` en el storage y un update por título+venue,
 * así que re-correrlo con la misma foto no duplica nada.
 *
 * Sin argumentos de archivo no hace falta tener las fotos a mano: si el objeto
 * ya está en el bucket, reutiliza su URL pública. Eso importa porque
 * `cargar-penas.mjs --apply` inserta las fechas nuevas de la ventana semanal
 * con `image_url` en null, y entonces alcanza con `imagen-penas.mjs --apply`
 * para volver a taparlas. Pasá un `--<flag>=<archivo>` solo cuando quieras
 * cambiar la foto.
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
const arg = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=')

/**
 * Las peñas que este script sabe manejar. El título tiene que coincidir exacto
 * con el que inserta cargar-penas.mjs; si allá se renombra una peña, hay que
 * cambiarlo acá también o el update no matchea nada (y el script lo avisa).
 */
const PENAS = [
  { flag: 'vieja-estacion', titulo: 'Peña folklórica en La Vieja Estación', slug: 'vieja-estacion' },
  { flag: 'balderrama',     titulo: 'Peña folklórica en Balderrama',        slug: 'balderrama' },
]

const BUCKET = 'flyers'
const PREFIJO = 'penas'

/**
 * sharp entra por Next, no está declarado en package.json. Si algún día se va,
 * el script sigue sirviendo: sube el archivo tal cual y lo avisa.
 */
let sharp = null
try { sharp = (await import('sharp')).default } catch { /* opcional */ }

/**
 * Las cards son aspect-[2/3] a 200px CSS y la ficha aspect-[3/4] a ~360px, o
 * sea ~720px en pantallas 2x. 900x1200 cubre las dos con margen sin subir un
 * original de cámara de varios MB. `fit: inside` no recorta: del recorte se
 * encarga el object-cover de la UI, que es lo que ya hace con los flyers.
 */
async function optimizar(buf, nombre) {
  if (!sharp) return { buf, ext: path.extname(nombre).slice(1) || 'jpg', tipo: null, nota: 'sin sharp: se sube tal cual' }
  const m = await sharp(buf).metadata()
  const out = await sharp(buf).rotate().resize(900, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
  const m2 = await sharp(out).metadata()
  return { buf: out, ext: 'webp', tipo: 'image/webp', nota: `${m.width}x${m.height} ${m.format} ${(buf.length/1024).toFixed(0)} KB  ->  ${m2.width}x${m2.height} webp ${(out.length/1024).toFixed(0)} KB` }
}

console.log(`\nmodo: ${UNDO ? 'UNDO' : APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe nada)'}\n${'='.repeat(74)}`)

let totalFilas = 0

for (const p of PENAS) {
  const { data: evs, error } = await sb.from('events')
    .select('id,title,venue_id,image_url,start_date')
    .eq('title', p.titulo).order('start_date')
  if (error) { console.error(`ERROR consultando "${p.titulo}": ${error.message}`); continue }

  console.log(`\n### ${p.titulo}`)
  if (!evs.length) { console.log('  no hay eventos con ese título exacto — ¿lo renombraron en cargar-penas.mjs?'); continue }

  const venues = [...new Set(evs.map((e) => e.venue_id))]
  const sinImagen = evs.filter((e) => !e.image_url).length
  console.log(`  fechas: ${evs.length}   sin imagen: ${sinImagen}   venue_id: ${venues.join(', ')}`)
  console.log(`  rango: ${evs[0].start_date}  ->  ${evs[evs.length - 1].start_date}`)
  if (venues.length > 1) console.log('  OJO: hay más de un venue con este título; el update los toca a todos')

  if (UNDO) {
    if (!APPLY) { console.log(`  [dry-run] pondría image_url = null en ${evs.length} filas`); continue }
    const { data: upd, error: e2 } = await sb.from('events').update({ image_url: null }).eq('title', p.titulo).select('id')
    if (e2) console.error(`  ERROR: ${e2.message}`)
    else { console.log(`  -> ${upd.length} filas con image_url = null`); totalFilas += upd.length }
    continue
  }

  const ruta = arg(p.flag)
  let destino = null

  if (ruta) {
    // Foto nueva: se optimiza y se sube pisando la anterior.
    if (!fs.existsSync(ruta)) { console.error(`  ERROR: no existe el archivo ${ruta}`); continue }
    const original = fs.readFileSync(ruta)
    const { buf, ext, tipo, nota } = await optimizar(original, ruta)
    destino = `${PREFIJO}/${p.slug}.${ext}`
    console.log(`  archivo: ${ruta}`)
    console.log(`  ${nota}`)
    console.log(`  destino: ${BUCKET}/${destino}`)
    if (!APPLY) { console.log(`  [dry-run] subiría la imagen y pondría su URL en ${evs.length} filas`); continue }
    const { error: e3 } = await sb.storage.from(BUCKET).upload(destino, buf, {
      cacheControl: '3600', upsert: true, contentType: tipo || undefined,
    })
    if (e3) { console.error(`  ERROR subiendo: ${e3.message}`); continue }
  } else {
    // Sin archivo: reutiliza la que ya esté subida para esta peña. Es el caso
    // de after `cargar-penas.mjs --apply`, que mete fechas nuevas en null.
    const { data: objs } = await sb.storage.from(BUCKET).list(PREFIJO)
    const ya = (objs || []).find((o) => o.name.startsWith(`${p.slug}.`))
    if (!ya) { console.log(`  sin --${p.flag}=<archivo> y no hay nada en ${BUCKET}/${PREFIJO}/${p.slug}.*, se saltea`); continue }
    destino = `${PREFIJO}/${ya.name}`
    console.log(`  reutiliza la imagen ya subida: ${BUCKET}/${destino}`)
    if (!APPLY) { console.log(`  [dry-run] pondría esa URL en ${evs.length} filas (${sinImagen} en null hoy)`); continue }
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(destino)
  console.log(`  url: ${pub.publicUrl}`)

  const { data: upd, error: e4 } = await sb.from('events').update({ image_url: pub.publicUrl }).eq('title', p.titulo).select('id')
  if (e4) console.error(`  ERROR actualizando: ${e4.message}`)
  else { console.log(`  -> ${upd.length} filas actualizadas`); totalFilas += upd.length }
}

console.log('\n' + '='.repeat(74))
console.log(`TOTAL filas ${UNDO ? 'limpiadas' : 'actualizadas'}: ${totalFilas}`)
if (!APPLY) console.log('DRY-RUN: no se escribió nada. Agregá --apply para aplicar.')
