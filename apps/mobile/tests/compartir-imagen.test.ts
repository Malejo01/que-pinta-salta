// R42, 42-d: el orquestador (`lib/compartir-imagen/compartir.ts`), el
// adaptador `lib/compartir-imagen/dispositivo.ts` (con `react-native-view-shot`
// y `expo-sharing` mockeados — mismo patrón que `tests/calendario-agregar.test.ts`,
// que mockea `expo-calendar` entero con `vi.doMock`), el detector de que esos
// dos paquetes solo se importan ahí, y los detectores de `TarjetaCompartir.tsx`
// y de `alTerminar` en `components/Afiche.tsx`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { compartirTarjeta, type DepsCompartirTarjeta } from '../lib/compartir-imagen/compartir'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_DIR = join(MOBILE_ROOT, 'app')
const COMPONENTS_DIR = join(MOBILE_ROOT, 'components')
const LIB_DIR = join(MOBILE_ROOT, 'lib')
const DISPOSITIVO_RELATIVO = join('lib', 'compartir-imagen', 'dispositivo.ts')

function listarTsxYTs(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...listarTsxYTs(full))
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

function depsBase(overrides: Partial<DepsCompartirTarjeta> = {}): DepsCompartirTarjeta {
  return {
    disponible: vi.fn().mockResolvedValue(true),
    capturar: vi.fn().mockResolvedValue('file:///tmp/tarjeta.png'),
    compartirArchivo: vi.fn().mockResolvedValue(undefined),
    liberar: vi.fn(),
    compartirTexto: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('compartirTarjeta — el orden del orquestador (sin RN, con dobles)', () => {
  it('no disponible: cae al texto, sin llamar a capturar', async () => {
    const capturar = vi.fn()
    const compartirTexto = vi.fn().mockResolvedValue(undefined)
    const deps = depsBase({ disponible: vi.fn().mockResolvedValue(false), capturar, compartirTexto })

    await expect(compartirTarjeta(deps)).resolves.toEqual({ tipo: 'texto' })
    expect(capturar).not.toHaveBeenCalled()
    expect(compartirTexto).toHaveBeenCalledTimes(1)
    expect(deps.liberar).not.toHaveBeenCalled()
  })

  // "Es la rotura del lead": sacar la caída cuando disponible() da false
  // (por ejemplo, devolviendo directo { tipo: 'imagen' } o llamando a
  // capturar igual) tiene que dejar este test en rojo.
  it('"rotura del lead": disponible() en false SIEMPRE cae al texto, nunca llega a "imagen"', async () => {
    const deps = depsBase({ disponible: vi.fn().mockResolvedValue(false) })
    const r = await compartirTarjeta(deps)
    expect(r.tipo).toBe('texto')
    expect(deps.capturar).not.toHaveBeenCalled()
    expect(deps.compartirArchivo).not.toHaveBeenCalled()
  })

  it('la captura falla: texto con motivo "captura", sin tirar, y sin liberar (no hubo URI)', async () => {
    const compartirTexto = vi.fn().mockResolvedValue(undefined)
    const liberar = vi.fn()
    const deps = depsBase({ capturar: vi.fn().mockRejectedValue(new Error('boom')), compartirTexto, liberar })

    await expect(compartirTarjeta(deps)).resolves.toEqual({ tipo: 'texto', motivo: 'captura' })
    expect(compartirTexto).toHaveBeenCalledTimes(1)
    expect(liberar).not.toHaveBeenCalled()
  })

  it('todo bien: compartirArchivo recibe la URI, y liberar se llama una vez con esa URI', async () => {
    const compartirArchivo = vi.fn().mockResolvedValue(undefined)
    const liberar = vi.fn()
    const compartirTexto = vi.fn()
    const deps = depsBase({ capturar: vi.fn().mockResolvedValue('file:///tmp/x.png'), compartirArchivo, liberar, compartirTexto })

    await expect(compartirTarjeta(deps)).resolves.toEqual({ tipo: 'imagen' })
    expect(compartirArchivo).toHaveBeenCalledWith('file:///tmp/x.png')
    expect(liberar).toHaveBeenCalledTimes(1)
    expect(liberar).toHaveBeenCalledWith('file:///tmp/x.png')
    expect(compartirTexto).not.toHaveBeenCalled()
  })

  it('compartirArchivo falla: cae al texto, sin tirar, y liberar igual se llama', async () => {
    const compartirTexto = vi.fn().mockResolvedValue(undefined)
    const liberar = vi.fn()
    const deps = depsBase({
      capturar: vi.fn().mockResolvedValue('file:///tmp/x.png'),
      compartirArchivo: vi.fn().mockRejectedValue(new Error('boom')),
      compartirTexto,
      liberar,
    })

    await expect(compartirTarjeta(deps)).resolves.toEqual({ tipo: 'texto' })
    expect(compartirTexto).toHaveBeenCalledTimes(1)
    expect(liberar).toHaveBeenCalledTimes(1)
    expect(liberar).toHaveBeenCalledWith('file:///tmp/x.png')
  })

  it('liberar(uri) que tira no rompe la promesa — releaseCapture es sincrónica, va en su propio try/catch', async () => {
    const deps = depsBase({
      liberar: vi.fn(() => {
        throw new Error('boom')
      }),
    })
    await expect(compartirTarjeta(deps)).resolves.toEqual({ tipo: 'imagen' })
  })

  it('cerrar el selector de "compartir" sin elegir nada (compartirArchivo rechaza) no es un error: cae al texto', async () => {
    const compartirTexto = vi.fn().mockResolvedValue(undefined)
    const deps = depsBase({
      capturar: vi.fn().mockResolvedValue('file:///tmp/x.png'),
      compartirArchivo: vi.fn().mockRejectedValue(new Error('cancelado')),
      compartirTexto,
    })
    await expect(compartirTarjeta(deps)).resolves.toEqual({ tipo: 'texto' })
  })

  // Bloqueante 1 de la vuelta 1 (42-d): "Nunca tira" tenía que ser cierto de
  // verdad. `disponible()` y las tres caídas a `compartirTexto()` no tenían
  // `catch`, así que una excepción ahí atravesaba el `finally` y rompía la
  // promesa devuelta por `compartirTarjeta`.
  describe('disponible() rechaza: nunca tira, se trata como "no disponible" y cae al texto', () => {
    it('con compartirTexto() que funciona: { tipo: "texto" }, sin llamar a capturar', async () => {
      const capturar = vi.fn()
      const compartirTexto = vi.fn().mockResolvedValue(undefined)
      const deps = depsBase({ disponible: vi.fn().mockRejectedValue(new Error('boom')), capturar, compartirTexto })

      await expect(compartirTarjeta(deps)).resolves.toEqual({ tipo: 'texto' })
      expect(capturar).not.toHaveBeenCalled()
      expect(compartirTexto).toHaveBeenCalledTimes(1)
    })

    it('con compartirTexto() que TAMBIÉN rechaza: no tira, y el resultado no miente con "texto"', async () => {
      const deps = depsBase({
        disponible: vi.fn().mockRejectedValue(new Error('boom')),
        compartirTexto: vi.fn().mockRejectedValue(new Error('también falló')),
      })

      await expect(compartirTarjeta(deps)).resolves.toEqual({ tipo: 'nada' })
    })
  })

  it('capturar() falla y compartirTexto() TAMBIÉN rechaza: no tira, { tipo: "nada", motivo: "captura" }', async () => {
    const deps = depsBase({
      capturar: vi.fn().mockRejectedValue(new Error('captura rota')),
      compartirTexto: vi.fn().mockRejectedValue(new Error('también falló')),
    })

    await expect(compartirTarjeta(deps)).resolves.toEqual({ tipo: 'nada', motivo: 'captura' })
  })

  it('compartirArchivo() falla y compartirTexto() TAMBIÉN rechaza: no tira, { tipo: "nada" }, y liberar igual se llama', async () => {
    const liberar = vi.fn()
    const deps = depsBase({
      capturar: vi.fn().mockResolvedValue('file:///tmp/x.png'),
      compartirArchivo: vi.fn().mockRejectedValue(new Error('boom')),
      compartirTexto: vi.fn().mockRejectedValue(new Error('también falló')),
      liberar,
    })

    await expect(compartirTarjeta(deps)).resolves.toEqual({ tipo: 'nada' })
    expect(liberar).toHaveBeenCalledTimes(1)
    expect(liberar).toHaveBeenCalledWith('file:///tmp/x.png')
  })
})

// `lib/compartir-imagen/dispositivo.ts` es el único archivo que importa
// `react-native-view-shot` y `expo-sharing`; para testear `OPCIONES_CAPTURA`
// y `depsDelDispositivo` sin RN, se mockean los dos módulos enteros.
describe('lib/compartir-imagen/dispositivo.ts — con react-native-view-shot y expo-sharing mockeados', () => {
  it('OPCIONES_CAPTURA: png, tmpfile, calidad 1, 1080×1350', async () => {
    vi.resetModules()
    vi.doMock('react-native-view-shot', () => ({ captureRef: vi.fn(), releaseCapture: vi.fn() }))
    vi.doMock('expo-sharing', () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }))
    const { OPCIONES_CAPTURA } = await import('../lib/compartir-imagen/dispositivo')

    expect(OPCIONES_CAPTURA).toEqual({ format: 'png', quality: 1, result: 'tmpfile', width: 1080, height: 1350 })
    vi.doUnmock('react-native-view-shot')
    vi.doUnmock('expo-sharing')
  })

  it('capturar() llama a captureRef con el ref y OPCIONES_CAPTURA, y devuelve la URI', async () => {
    vi.resetModules()
    const captureRef = vi.fn().mockResolvedValue('file:///tmp/x.png')
    vi.doMock('react-native-view-shot', () => ({ captureRef, releaseCapture: vi.fn() }))
    vi.doMock('expo-sharing', () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }))
    const { depsDelDispositivo, OPCIONES_CAPTURA } = await import('../lib/compartir-imagen/dispositivo')

    const refFalso = { current: null }
    const deps = depsDelDispositivo(refFalso as never, vi.fn())
    await expect(deps.capturar()).resolves.toBe('file:///tmp/x.png')
    expect(captureRef).toHaveBeenCalledWith(refFalso, OPCIONES_CAPTURA)
    vi.doUnmock('react-native-view-shot')
    vi.doUnmock('expo-sharing')
  })

  it('disponible() delega en Sharing.isAvailableAsync', async () => {
    vi.resetModules()
    const isAvailableAsync = vi.fn().mockResolvedValue(true)
    vi.doMock('react-native-view-shot', () => ({ captureRef: vi.fn(), releaseCapture: vi.fn() }))
    vi.doMock('expo-sharing', () => ({ isAvailableAsync, shareAsync: vi.fn() }))
    const { depsDelDispositivo } = await import('../lib/compartir-imagen/dispositivo')

    const deps = depsDelDispositivo({ current: null } as never, vi.fn())
    await expect(deps.disponible()).resolves.toBe(true)
    expect(isAvailableAsync).toHaveBeenCalledTimes(1)
    vi.doUnmock('react-native-view-shot')
    vi.doUnmock('expo-sharing')
  })

  it('compartirArchivo(uri) llama a Sharing.shareAsync con mimeType: "image/png"', async () => {
    vi.resetModules()
    const shareAsync = vi.fn().mockResolvedValue(undefined)
    vi.doMock('react-native-view-shot', () => ({ captureRef: vi.fn(), releaseCapture: vi.fn() }))
    vi.doMock('expo-sharing', () => ({ isAvailableAsync: vi.fn(), shareAsync }))
    const { depsDelDispositivo } = await import('../lib/compartir-imagen/dispositivo')

    const deps = depsDelDispositivo({ current: null } as never, vi.fn())
    await deps.compartirArchivo('file:///tmp/x.png')
    expect(shareAsync).toHaveBeenCalledWith('file:///tmp/x.png', { mimeType: 'image/png', dialogTitle: 'Compartir evento' })
    vi.doUnmock('react-native-view-shot')
    vi.doUnmock('expo-sharing')
  })

  it('liberar(uri) delega en releaseCapture (sincrónica)', async () => {
    vi.resetModules()
    const releaseCapture = vi.fn()
    vi.doMock('react-native-view-shot', () => ({ captureRef: vi.fn(), releaseCapture }))
    vi.doMock('expo-sharing', () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }))
    const { depsDelDispositivo } = await import('../lib/compartir-imagen/dispositivo')

    const deps = depsDelDispositivo({ current: null } as never, vi.fn())
    deps.liberar('file:///tmp/x.png')
    expect(releaseCapture).toHaveBeenCalledWith('file:///tmp/x.png')
    vi.doUnmock('react-native-view-shot')
    vi.doUnmock('expo-sharing')
  })

  it('compartirTexto delega literal en la función que se le pasó (es la caída, no un Share.share propio)', async () => {
    vi.resetModules()
    vi.doMock('react-native-view-shot', () => ({ captureRef: vi.fn(), releaseCapture: vi.fn() }))
    vi.doMock('expo-sharing', () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }))
    const { depsDelDispositivo } = await import('../lib/compartir-imagen/dispositivo')

    const compartirTexto = vi.fn().mockResolvedValue(undefined)
    const deps = depsDelDispositivo({ current: null } as never, compartirTexto)
    await deps.compartirTexto()
    expect(compartirTexto).toHaveBeenCalledTimes(1)
    vi.doUnmock('react-native-view-shot')
    vi.doUnmock('expo-sharing')
  })
})

/** `true` si `content` importa (o hace `require` de) `modulo`, de cualquier
 * forma, incluidas subrutas (`modulo/legacy`). Mismo patrón que
 * `importaExpoCalendar` de `tests/calendario-agregar.test.ts`. */
export function importaModuloNativo(content: string, modulo: string): boolean {
  const escapado = modulo.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')
  return (
    new RegExp(`\\bfrom\\s+['"]${escapado}(/[^'"]*)?['"]`).test(content) ||
    new RegExp(`\\brequire\\(\\s*['"]${escapado}(/[^'"]*)?['"]\\s*\\)`).test(content)
  )
}

describe('importaModuloNativo (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta un import de react-native-view-shot', () => {
    expect(importaModuloNativo(`import { captureRef } from 'react-native-view-shot'`, 'react-native-view-shot')).toBe(true)
  })

  it('detecta un import de expo-sharing (import * as)', () => {
    expect(importaModuloNativo(`import * as Sharing from 'expo-sharing'`, 'expo-sharing')).toBe(true)
  })

  it('detecta un require', () => {
    expect(importaModuloNativo(`const Sharing = require('expo-sharing')`, 'expo-sharing')).toBe(true)
  })

  it('no confunde otro paquete', () => {
    expect(importaModuloNativo(`import { Share } from 'react-native'`, 'expo-sharing')).toBe(false)
  })

  it('sin ningún import: false', () => {
    expect(importaModuloNativo(`export function Foo() { return null }`, 'react-native-view-shot')).toBe(false)
  })
})

describe('app/, components/ y lib/: react-native-view-shot y expo-sharing solo se importan en lib/compartir-imagen/dispositivo.ts', () => {
  const archivos = [...listarTsxYTs(APP_DIR), ...listarTsxYTs(COMPONENTS_DIR), ...listarTsxYTs(LIB_DIR)]

  it('encuentra al menos un archivo para analizar, incluido dispositivo.ts', () => {
    expect(archivos.length).toBeGreaterThan(0)
    expect(archivos.some((f) => relative(MOBILE_ROOT, f) === DISPOSITIVO_RELATIVO)).toBe(true)
  })

  it('dispositivo.ts sí importa los dos (es el adaptador aprobado)', () => {
    const content = readFileSync(join(MOBILE_ROOT, DISPOSITIVO_RELATIVO), 'utf8')
    expect(importaModuloNativo(content, 'react-native-view-shot')).toBe(true)
    expect(importaModuloNativo(content, 'expo-sharing')).toBe(true)
  })

  it.each(
    archivos
      .map((file) => [relative(MOBILE_ROOT, file), file] as const)
      .filter(([label]) => label !== DISPOSITIVO_RELATIVO),
  )('%s: no importa react-native-view-shot ni expo-sharing directo', (label, file) => {
    const content = readFileSync(file, 'utf8')
    const violaciones: string[] = []
    if (importaModuloNativo(content, 'react-native-view-shot')) violaciones.push('react-native-view-shot')
    if (importaModuloNativo(content, 'expo-sharing')) violaciones.push('expo-sharing')
    if (violaciones.length > 0) {
      throw new Error(`${label}: importa directo ${violaciones.join(', ')} (el único adaptador aprobado es lib/compartir-imagen/dispositivo.ts)`)
    }
    expect(violaciones).toEqual([])
  })
})

describe('components/TarjetaCompartir.tsx: las reglas de la tarjeta (lectura del archivo)', () => {
  const content = readFileSync(join(COMPONENTS_DIR, 'TarjetaCompartir.tsx'), 'utf8')

  it('tiene collapsable={false} en la vista raíz (Android lo necesita para capturar)', () => {
    expect(content).toMatch(/collapsable=\{false\}/)
  })

  it('muestra datos.linkVisible', () => {
    expect(content).toMatch(/datos\.linkVisible/)
  })

  it('no usa session ni useSession (sin datos de sesión en la tarjeta)', () => {
    expect(content).not.toMatch(/\bsession\b/)
    expect(content).not.toMatch(/\buseSession\b/)
  })

  it('no usa Dimensions (QPS-132): el ancho llega por prop', () => {
    expect(content).not.toMatch(/\bDimensions\b/)
  })

  it('declara las tres constantes de color con nombre, y las usa (no un hex suelto)', () => {
    expect(content).toMatch(/const\s+ROJO_MARCA\s*=\s*'#a30419'/)
    expect(content).toMatch(/const\s+TEXTO_TARJETA\s*=\s*'#ffffff'/)
    expect(content).toMatch(/const\s+OSCURO_TARJETA\s*=\s*'#0a0a0a'/)
  })
})

describe('components/HojaCompartirTarjeta.tsx: useWindowDimensions, y no llama a Share.share directo', () => {
  const content = readFileSync(join(COMPONENTS_DIR, 'HojaCompartirTarjeta.tsx'), 'utf8')

  it('usa useWindowDimensions (QPS-132), no Dimensions', () => {
    expect(content).toMatch(/\buseWindowDimensions\(\)/)
  })

  // Corrección del lead (17/10, ver el comentario de cabecera del archivo
  // real): esta hoja NO llama a Share.share — el detector de
  // tests/compartir-ficha.test.ts no tiene ninguna violación que reportar
  // porque no hay ningún Share.share que mirar.
  it('no llama a Share.share directo (la caída y "Compartir link" van por compartirTexto, la prop)', () => {
    expect(content).not.toMatch(/Share\.share\s*\(/)
  })

  it('recibe compartirTexto como prop y la usa en "Compartir link"', () => {
    expect(content).toMatch(/compartirTexto\s*:\s*\(\)\s*=>\s*Promise<void>/)
    expect(content).toMatch(/onPress=\{compartirTexto\}/)
  })
})

describe('components/Afiche.tsx: alTerminar (42-d)', () => {
  const content = readFileSync(join(COMPONENTS_DIR, 'Afiche.tsx'), 'utf8')

  it('declara alTerminar como prop opcional, con los dos resultados posibles', () => {
    expect(content).toMatch(/alTerminar\?\s*:\s*\(resultado:\s*'imagen'\s*\|\s*'marca'\)\s*=>\s*void/)
  })

  it('el wrapper Afiche() le pasa alTerminar a AficheInterno (las dos listas de props, QPS-132-style trampa)', () => {
    const idxAficheInterno = content.indexOf('<AficheInterno')
    expect(idxAficheInterno).toBeGreaterThan(-1)
    const tramo = content.slice(idxAficheInterno, idxAficheInterno + 400)
    expect(tramo).toMatch(/alTerminar=\{alTerminar\}/)
  })

  it('se llama en el onLoad del <Image>, con \'imagen\'', () => {
    const idxOnLoad = content.indexOf('onLoad=')
    expect(idxOnLoad).toBeGreaterThan(-1)
    const tramo = content.slice(idxOnLoad, idxOnLoad + 60)
    expect(tramo).toMatch(/alTerminar\?\.\('imagen'\)/)
  })

  it('se llama en la rama del onError que ya no tiene otra fuente, con \'marca\' — no en la que sí tiene siguiente', () => {
    const idxOnError = content.indexOf('onError=')
    expect(idxOnError).toBeGreaterThan(-1)
    const tramo = content.slice(idxOnError, idxOnError + 500)

    const idxSiguiente = tramo.indexOf('siguiente !== null')
    const idxSetIndiceSiguiente = tramo.indexOf('setIndice(indice + 1)')
    const idxLlamadaATerminar = tramo.indexOf(`alTerminar?.('marca')`)

    expect(idxSiguiente).toBeGreaterThan(-1)
    expect(idxSetIndiceSiguiente).toBeGreaterThan(-1)
    expect(idxLlamadaATerminar).toBeGreaterThan(-1)
    // La rama CON siguiente fuente va antes y no llama a alTerminar.
    expect(idxSetIndiceSiguiente).toBeLessThan(idxLlamadaATerminar)
  })

  it('sin la prop, el comportamiento no cambia: las llamadas a alTerminar siempre usan optional chaining, nunca una llamada directa', () => {
    const llamadasDirectas = content.match(/\balTerminar\(/g) ?? []
    expect(llamadasDirectas).toEqual([])
    expect(content).toMatch(/alTerminar\?\.\('imagen'\)/)
    expect(content).toMatch(/alTerminar\?\.\('marca'\)/)
  })
})
