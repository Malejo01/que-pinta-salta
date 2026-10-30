// pesos:bundle (46-e): reparte el peso del bundle de Android entre paquetes
// y módulos, usando su source map. No lee `dist` (el export real, con
// bytecode): lee `dist-analisis`, que genera `export:analisis` SIN
// bytecode y CON source maps (un .hbc no tiene mapa de origen posible).
//
// Por eso el total que imprime este script ("JS sin bytecode") es un
// número distinto al tamaño real del .hbc que imprime `check:bundle`: son
// dos cosas diferentes, no se pueden comparar entre sí.
//
//   npm --prefix <wt>/apps/mobile run export:analisis
//   npm --prefix <wt>/apps/mobile run pesos:bundle [--json]
import { Buffer } from 'node:buffer'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bytesPorFuente, paqueteDe, quienMenciona, resumen } from './pesos/analizar.ts'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const CARPETA = join(APP, 'dist-analisis', '_expo', 'static', 'js', 'android')

if (!existsSync(CARPETA)) {
  console.error('No hay export de análisis: corré antes `npm run export:analisis`.')
  process.exit(1)
}

const archivos = readdirSync(CARPETA)
const jsFiles = archivos.filter((f) => f.endsWith('.js'))
if (jsFiles.length === 0) {
  console.error(`No hay ningún .js en ${CARPETA}.`)
  process.exit(1)
}

// --no-bytecode puede dejar más de un archivo .js en la carpeta. El
// criterio: nos quedamos con los que tengan un `.map` al lado (el mapa es
// lo que necesitamos) y, entre esos, el más pesado; si ninguno tiene mapa,
// el más pesado de todos (y después falla más abajo al no encontrar el mapa).
const conMapa = jsFiles.filter((f) => archivos.includes(`${f}.map`))
const candidatos = conMapa.length > 0 ? conMapa : jsFiles
const elegido = candidatos
  .map((nombre) => ({ nombre, bytes: statSync(join(CARPETA, nombre)).size }))
  .sort((a, b) => b.bytes - a.bytes)[0].nombre

const rutaJs = join(CARPETA, elegido)
const rutaMapa = `${rutaJs}.map`
if (!existsSync(rutaMapa)) {
  console.error(`No encontré el source map de ${elegido} (esperaba ${rutaMapa}).`)
  process.exit(1)
}

const textoJs = readFileSync(rutaJs, 'utf8')
const bytesJsSinBytecode = Buffer.byteLength(textoJs, 'utf8')
const mapa = JSON.parse(readFileSync(rutaMapa, 'utf8'))
const largoDeCadaLinea = textoJs.split('\n').map((linea) => linea.length)

const bytesFuente = bytesPorFuente(mapa, largoDeCadaLinea)
const completo = resumen(bytesFuente, Number.MAX_SAFE_INTEGER)
const top15Paquetes = completo.paquetes.slice(0, 15)
const top20Modulos = completo.modulos.slice(0, 20)

const mencionaExpoSymbols = quienMenciona(mapa, 'expo-symbols')
const mencionaMaterialSymbols = quienMenciona(mapa, 'MaterialSymbols')

const lucide = completo.paquetes.find((p) => p.nombre === 'lucide-react-native')
const modulosLucide = Object.keys(bytesFuente).filter((nombre) => paqueteDe(nombre) === 'lucide-react-native')

const resultado = {
  archivo: elegido,
  bytesJsSinBytecode,
  totalRepartido: completo.total,
  top15Paquetes,
  top20Modulos,
  mencionaExpoSymbols,
  mencionaMaterialSymbols,
  lucideReactNative: {
    bytes: lucide?.bytes ?? 0,
    modulos: modulosLucide.length,
  },
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(resultado, null, 2))
  process.exit(0)
}

console.log(`Archivo analizado: ${elegido}`)
console.log(
  `Total del JS sin bytecode: ${bytesJsSinBytecode} bytes (el .hbc real es otro número: lo imprime check:bundle)`
)
console.log(`Total repartido por el source map: ${completo.total} caracteres`)

console.log('\nTop 15 paquetes:')
for (const p of top15Paquetes) {
  console.log(`  ${p.bytes} (${p.porcentaje.toFixed(1)}%) · ${p.nombre}`)
}

console.log('\nTop 20 módulos:')
for (const m of top20Modulos) {
  console.log(`  ${m.bytes} (${m.porcentaje.toFixed(1)}%) · ${m.nombre}`)
}

console.log('\nQuién menciona "expo-symbols" en su sourcesContent:')
if (mencionaExpoSymbols.length === 0) {
  console.log('  (nadie)')
} else {
  for (const fuente of mencionaExpoSymbols) console.log(`  ${fuente}`)
}

console.log('Quién menciona "MaterialSymbols" en su sourcesContent:')
if (mencionaMaterialSymbols.length === 0) {
  console.log('  (nadie)')
} else {
  for (const fuente of mencionaMaterialSymbols) console.log(`  ${fuente}`)
}

console.log(
  `\nlucide-react-native: ${resultado.lucideReactNative.bytes} bytes en ${resultado.lucideReactNative.modulos} módulos`
)
