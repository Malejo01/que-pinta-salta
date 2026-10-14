// check:bundle (R25, fase 0): el bundle de Android lleva UNA sola React, la de la app.
//
// La app usa la React que pide el SDK de Expo (apps/mobile/node_modules/react) y la
// web la suya (la de la raíz). Si el bundle trajera la de la web, el renderer de
// react-native fallaría en el teléfono ("Incompatible React versions"). Se corre
// después de `export:android`: busca las dos versiones como texto en el .hbc
// (Hermes guarda las cadenas tal cual). Sin dependencias y sin red.
//
//   npm --prefix <wt>/apps/mobile run check:bundle
import { existsSync, readdirSync, readFileSync } from 'node:fs'
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
