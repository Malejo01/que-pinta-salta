// R46-h: `lib/imagenes/tamanio.ts` decide dos cosas puras sobre el tamaño de
// las imágenes de `components/Afiche.tsx` — `resizeMethod` para la `<Image>`
// remota (nativa, Android) y `dimensionesPng` para leer el IHDR de un PNG
// local sin decodificarlo entero. Esta suite prueba las dos funciones, un
// detector de que `Afiche.tsx` usa `metodoDeRedimension` en la `<Image>`
// remota (y sigue sin importar `expo-image`), y deja, leyendo los `.png`
// reales de `apps/mobile/assets/`, la tabla de tamaños para el informe.
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { dimensionesPng, metodoDeRedimension } from '../lib/imagenes/tamanio'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))

describe('metodoDeRedimension', () => {
  it('sin llenar (la miniatura de 64×64): resize', () => {
    expect(metodoDeRedimension({})).toBe('resize')
  })

  it('llenar sin ancho: resize', () => {
    expect(metodoDeRedimension({ llenar: true })).toBe('resize')
  })

  it('llenar con ancho 400 (tarjetas): resize', () => {
    expect(metodoDeRedimension({ llenar: true, ancho: 400 })).toBe('resize')
  })

  it('llenar con ancho 800 (ficha y Hero): auto', () => {
    expect(metodoDeRedimension({ llenar: true, ancho: 800 })).toBe('auto')
  })
})

describe('dimensionesPng', () => {
  // Firma (8 bytes) + longitud del chunk (4) + tipo "IHDR" (4) + ancho (4) +
  // alto (4) = 24 bytes: un PNG de 1×1 inventado, sin el resto del archivo
  // (bit depth, color type, CRC, IDAT, IEND) porque `dimensionesPng` nunca
  // los mira.
  const PNG_1X1 = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // firma PNG
    0x00, 0x00, 0x00, 0x0d, // longitud del chunk IHDR (13)
    0x49, 0x48, 0x44, 0x52, // "IHDR"
    0x00, 0x00, 0x00, 0x01, // ancho = 1
    0x00, 0x00, 0x00, 0x01, // alto = 1
  ])

  it('un PNG de 1×1 da { ancho: 1, alto: 1 }', () => {
    expect(dimensionesPng(PNG_1X1)).toEqual({ ancho: 1, alto: 1 })
  })

  it('tira si la firma no es de un PNG', () => {
    const noEsPng = new Uint8Array(24) // 24 bytes en cero: ni la firma arranca igual
    expect(() => dimensionesPng(noEsPng)).toThrow(/firma/)
  })

  it('tira si el buffer es más corto que el bloque IHDR (24 bytes)', () => {
    const corto = PNG_1X1.slice(0, 16) // firma + longitud + tipo, sin ancho/alto
    expect(() => dimensionesPng(corto)).toThrow(/24/)
  })
})

describe('components/Afiche.tsx: la Image remota usa metodoDeRedimension, y Afiche sigue sin importar expo-image', () => {
  const content = readFileSync(join(MOBILE_ROOT, 'components', 'Afiche.tsx'), 'utf8')

  it('importa metodoDeRedimension de lib/imagenes/tamanio', () => {
    expect(content).toMatch(/import\s*\{\s*metodoDeRedimension\s*\}\s*from\s*'@\/lib\/imagenes\/tamanio'/)
  })

  it('la Image remota (source de fuenteActual) fija resizeMethod con metodoDeRedimension', () => {
    const bloqueImagenRemota = content.match(/<Image\s+source=\{\{\s*uri:\s*fuenteActual\s*\}\}[\s\S]*?\/>/)
    expect(bloqueImagenRemota).not.toBeNull()
    expect(bloqueImagenRemota![0]).toMatch(/resizeMethod=\{metodoDeRedimension\(\{\s*llenar,\s*ancho\s*\}\)\}/)
  })

  it('el logo local (LOGO_MARCA) no lleva resizeMethod: no se toca', () => {
    const bloqueLogo = content.match(/<Image\s+source=\{LOGO_MARCA\}[\s\S]*?\/>/)
    expect(bloqueLogo).not.toBeNull()
    expect(bloqueLogo![0]).not.toMatch(/resizeMethod/)
  })

  it('sigue sin importar expo-image (el comentario del encabezado SÍ puede nombrarlo)', () => {
    expect(content).not.toMatch(/from\s+['"]expo-image['"]/)
  })
})

// ---------------------------------------------------------------------------
// Tabla de los PNG de apps/mobile/assets/ que usan app/ y components/ (sin
// red, sin `node -e`: se lee el archivo real con node:fs y se verifica
// `dimensionesPng` contra un PNG de verdad, no solo el inventado de arriba).
// adaptive-icon.png e icon.png quedan afuera: no los importa ningún archivo
// de app/ ni de components/ (son el ícono de la app, vía app.json).
// ---------------------------------------------------------------------------
describe('PNG reales de apps/mobile/assets/ usados por app/ y components/', () => {
  function leerPng(nombre: string) {
    const ruta = join(MOBILE_ROOT, 'assets', nombre)
    const bytes = readFileSync(ruta)
    const bytesEnDisco = statSync(ruta).size
    return { ...dimensionesPng(bytes), bytes: bytesEnDisco }
  }

  // logo-circular.png: el logo de marca, en 7 archivos de app/ y
  // components/; 120×120 en app/bienvenida.tsx es el uso más grande (32 a
  // 96 en el resto).
  it('logo-circular.png: 160×160, 20358 bytes (el uso más grande, 120×120 en bienvenida.tsx: ~1,3×)', () => {
    expect(leerPng('logo-circular.png')).toEqual({ ancho: 160, alto: 160, bytes: 20358 })
  })

  // titulo-horizontal.png: el wordmark, solo en app/(tabs)/cuenta.tsx, a
  // 180×44 (estilos.wordmark).
  it('titulo-horizontal.png: 972×234, 296191 bytes (se dibuja a 180×44: ~5,4× de ancho, ~5,3× de alto)', () => {
    expect(leerPng('titulo-horizontal.png')).toEqual({ ancho: 972, alto: 234, bytes: 296191 })
  })

  // patron-claro.png: el fondo de marca de app/(tabs)/cuenta.tsx, con
  // `resizeMode="repeat"`: se repite a su tamaño nativo (sin escalar a dp),
  // no hay un único "tamaño en pantalla" para compararlo.
  it('patron-claro.png: 717×333, 387895 bytes (resizeMode="repeat": se tila sin escalar, no hay un tamaño en dp de referencia)', () => {
    expect(leerPng('patron-claro.png')).toEqual({ ancho: 717, alto: 333, bytes: 387895 })
  })
})
