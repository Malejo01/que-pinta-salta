// Genera los íconos de la app a partir de assets/logo-circular.png (QPS-143).
// Se corre a mano y se versiona la salida: `node apps/mobile/scripts/generar-iconos.mjs`.
//
// Sin dependencias nuevas: usa `sharp`, que ya está en el node_modules de la
// raíz porque lo trae Next (apps/web). No es una dependencia de la app y no
// llega al bundle.
//
// - assets/icon.png (1024×1024): el logo a sangre (el original es opaco, con fondo crema).
// - assets/adaptive-icon.png (1024×1024, fondo transparente): el logo al 62 %,
//   centrado. Android recorta el ícono adaptativo con la máscara del launcher
//   (círculo, gota, cuadrado redondeado) y solo garantiza la zona segura de
//   66/108 del lado: el logo entero tiene que entrar ahí. El fondo es el crema
//   del logo (android.adaptiveIcon.backgroundColor en app.config.ts).
//
// El original mide 160×160: los íconos salen agrandados y un poco blandos.
// Para el build de producción hace falta el logo en 1024 o en vector.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const LADO = 1024
const PROPORCION_ADAPTATIVO = 0.62

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets')
const origen = path.join(assets, 'logo-circular.png')

await sharp(origen).resize(LADO, LADO, { kernel: 'lanczos3' }).png({ palette: true }).toFile(path.join(assets, 'icon.png'))

const ladoLogo = Math.round(LADO * PROPORCION_ADAPTATIVO)
const margen = Math.round((LADO - ladoLogo) / 2)
const logo = await sharp(origen).resize(ladoLogo, ladoLogo, { kernel: 'lanczos3' }).png().toBuffer()
await sharp({ create: { width: LADO, height: LADO, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: logo, left: margen, top: margen }])
  .png({ palette: true })
  .toFile(path.join(assets, 'adaptive-icon.png'))

console.log('icon.png y adaptive-icon.png generados en', assets)
