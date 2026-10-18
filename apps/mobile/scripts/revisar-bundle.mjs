// check:bundle (R25, fase 0; pesos en 46-e): el bundle de Android lleva UNA
// sola React, la de la app.
//
// La app usa la React que pide el SDK de Expo (apps/mobile/node_modules/react) y la
// web la suya (la de la raíz). Si el bundle trajera la de la web, el renderer de
// react-native fallaría en el teléfono ("Incompatible React versions"). Se corre
// después de `export:android`: busca las dos versiones como texto en el .hbc
// (Hermes guarda las cadenas tal cual). Sin dependencias y sin red.
//
// Además (46-e) imprime cuánto pesa lo que se exportó: el .hbc, el total de
// `dist/assets` y los 5 assets más pesados (con su extensión, que sale de
// `dist/metadata.json`). No falla por tamaño: todavía no hay un tope
// acordado (queda como propuesta en el informe de la ronda).
//
//   npm --prefix <wt>/apps/mobile run check:bundle
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = join(APP, '..', '..')
const version = (dir) => {
  const p = join(dir, 'node_modules', 'react', 'package.json')
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).version : null
}

const deLaApp = version(APP) ?? version(ROOT)
const deLaWeb = version(ROOT)
const carpeta = join(APP, 'dist', '_expo', 'static', 'js', 'android')
if (!existsSync(carpeta)) {
  console.error('No hay bundle: corré antes `export:android`.')
  process.exit(1)
}
const bundles = readdirSync(carpeta).filter((f) => f.endsWith('.hbc') || f.endsWith('.js'))
if (bundles.length !== 1) {
  console.error(`Esperaba un solo bundle de Android en dist/ y hay ${bundles.length}: ${bundles.join(', ')}`)
  process.exit(1)
}

// Tamaño del bundle (el .hbc real, con bytecode de Hermes: `export:android`
// no pasa `--no-bytecode`).
const bytesHbc = statSync(join(carpeta, bundles[0])).size
const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1)
console.log(`Bundle de Android (${bundles[0]}): ${bytesHbc} bytes (${mb(bytesHbc)} MB)`)

// Assets: el total de dist/assets y los 5 más pesados, con extensión. La
// extensión no está en el nombre del archivo (Metro los guarda por hash):
// sale de dist/metadata.json, cuyas rutas en Windows vienen con `\`.
const distDir = join(APP, 'dist')
const assetsDir = join(distDir, 'assets')
const archivosDeAssets = (dir, prefijo = '') => {
  let total = 0
  const archivos = []
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    const info = statSync(ruta)
    if (info.isDirectory()) {
      const sub = archivosDeAssets(ruta, `${prefijo}${nombre}/`)
      total += sub.total
      archivos.push(...sub.archivos)
    } else {
      total += info.size
      archivos.push({ nombre: `${prefijo}${nombre}`, bytes: info.size })
    }
  }
  return { total, archivos }
}

if (existsSync(assetsDir)) {
  const { total: bytesAssets, archivos } = archivosDeAssets(assetsDir)

  const extensionPorHash = new Map()
  const metadataPath = join(distDir, 'metadata.json')
  if (existsSync(metadataPath)) {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
    const assets = metadata.fileMetadata?.android?.assets ?? []
    for (const asset of assets) {
      // Windows: asset.path viene como "assets\<hash>" (path.join del lado del CLI).
      const normalizada = asset.path.replace(/\\/g, '/')
      const hash = normalizada.split('/').pop()
      if (hash) extensionPorHash.set(hash, asset.ext)
    }
  }

  console.log(`Assets (dist/assets): ${bytesAssets} bytes en ${archivos.length} archivos`)
  const top5 = [...archivos].sort((a, b) => b.bytes - a.bytes).slice(0, 5)
  console.log('Los 5 assets más pesados:')
  for (const asset of top5) {
    const ext = extensionPorHash.get(asset.nombre) ?? '?'
    console.log(`  ${asset.bytes} bytes · .${ext} · ${asset.nombre}`)
  }
} else {
  console.log('No hay dist/assets (la app no exportó assets).')
}

const texto = readFileSync(join(carpeta, bundles[0])).toString('latin1')
const cuantas = (v) => (v ? texto.split(v).length - 1 : 0)
const app = cuantas(deLaApp)
const web = deLaWeb && deLaWeb !== deLaApp ? cuantas(deLaWeb) : 0

console.log(`React de la app ${deLaApp}: ${app} · React de la web ${deLaWeb}: ${deLaWeb === deLaApp ? 'la misma' : web}`)
if (app < 1) {
  console.error(`El bundle no trae la React de la app (${deLaApp}).`)
  process.exit(1)
}
if (web > 0) {
  console.error(`El bundle trae la React de la web (${deLaWeb}): habría dos Reacts en el teléfono.`)
  process.exit(1)
}
console.log('Una sola React en el bundle: OK')
