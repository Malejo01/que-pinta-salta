// 46-g (arranque en frío): `scripts/metro/inline-requires.js` es CommonJS
// puro y no pasa por el typecheck (`tsconfig.json` solo incluye `**/*.ts` y
// `**/*.tsx`; `expo/tsconfig.base` además excluye `metro.config.js` a mano).
// Por eso este archivo lo carga con `createRequire`, como pide el encargo, y
// prueba la función envoltorio en runtime.
//
// La firma real de `getTransformOptions` (node_modules/metro-config/src/
// types.js.flow, líneas 46-59) es:
//   type GetTransformOptionsOpts = { dev: boolean, hot: true, platform: ?string }
//   type GetTransformOptions = (
//     entryPoints: ReadonlyArray<string>,
//     options: GetTransformOptionsOpts,
//     getDependenciesOf: (absoluteFilePath: string) => Promise<Array<string>>,
//   ) => Promise<Partial<ExtraTransformOptions>>
// y es asíncrona (@expo/metro-config/build/ExpoMetroConfig.js, líneas
// 343-348: `getTransformOptions: async () => ({...})`).
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const METRO_CONFIG_PATH = join(MOBILE_ROOT, 'metro.config.js')
const INLINE_REQUIRES_PATH = join(MOBILE_ROOT, 'scripts', 'metro', 'inline-requires.js')

type GetTransformOptionsOpts = { dev: boolean; hot: true; platform: string | null }
type GetTransformOptions = (
  entryPoints: readonly string[],
  options: GetTransformOptionsOpts,
  getDependenciesOf: (absoluteFilePath: string) => Promise<string[]>
) => Promise<Record<string, unknown>>

const requerirDesdeAca = createRequire(import.meta.url)
const { conInlineRequires } = requerirDesdeAca(INLINE_REQUIRES_PATH) as {
  conInlineRequires: (getTransformOptions: GetTransformOptions) => GetTransformOptions
}

const OPCIONES: GetTransformOptionsOpts = { dev: true, hot: true, platform: 'android' }
const SIN_DEPENDENCIAS = async () => []

describe('conInlineRequires', () => {
  it('cuando la original devuelve transform con cosas adentro: pisa solo inlineRequires, deja el resto igual', async () => {
    const original: GetTransformOptions = async () => ({
      transform: { experimentalImportSupport: true, inlineRequires: false },
      otra: 1,
    })

    const resultado = await conInlineRequires(original)([], OPCIONES, SIN_DEPENDENCIAS)

    expect(resultado).toEqual({
      transform: { experimentalImportSupport: true, inlineRequires: true },
      otra: 1,
    })
  })

  it('cuando la original devuelve transform vacío: agrega inlineRequires sin romper nada', async () => {
    const original: GetTransformOptions = async () => ({ transform: {} })

    const resultado = await conInlineRequires(original)([], OPCIONES, SIN_DEPENDENCIAS)

    expect(resultado).toEqual({ transform: { inlineRequires: true } })
  })

  it('cuando la original no devuelve transform en absoluto: no explota, agrega transform.inlineRequires y deja el resto', async () => {
    const original: GetTransformOptions = async () => ({ preloadedModules: false, ramGroups: [] })

    const resultado = await conInlineRequires(original)([], OPCIONES, SIN_DEPENDENCIAS)

    expect(resultado).toEqual({
      preloadedModules: false,
      ramGroups: [],
      transform: { inlineRequires: true },
    })
  })

  it('espera la promesa de la original (Metro la llama async): no la trata como sincrónica', async () => {
    let resuelta = false
    const original: GetTransformOptions = () =>
      new Promise((resolve) => {
        setTimeout(() => {
          resuelta = true
          resolve({ transform: { inlineRequires: false } })
        }, 10)
      })

    const promesa = conInlineRequires(original)([], OPCIONES, SIN_DEPENDENCIAS)
    // Si conInlineRequires no hiciera `await` de la original, este `expect`
    // correría antes de que el `setTimeout` de arriba dispare.
    expect(resuelta).toBe(false)

    const resultado = await promesa

    expect(resuelta).toBe(true)
    expect(resultado.transform).toEqual({ inlineRequires: true })
  })

  it('le pasa los tres argumentos a la original sin tocarlos', async () => {
    const llamadas: unknown[][] = []
    const original: GetTransformOptions = async (...args) => {
      llamadas.push(args)
      return { transform: {} }
    }
    const entryPoints = ['a.js', 'b.js']
    const getDependenciesOf = async () => []

    await conInlineRequires(original)(entryPoints, OPCIONES, getDependenciesOf)

    expect(llamadas).toEqual([[entryPoints, OPCIONES, getDependenciesOf]])
  })
})

/** `true` si `contenido` llama a `conInlineRequires(`, el envoltorio que
 * fuerza `transform.inlineRequires = true` sin tocar el resto. */
export function usaConInlineRequires(contenido: string): boolean {
  return /\bconInlineRequires\s*\(/.test(contenido)
}

/** `true` si `contenido` sigue llamando a `getDefaultConfig(__dirname)` —
 * la base de la que sale toda la config de Metro de Expo (resolución del
 * monorepo, `react` desde `apps/mobile`, etc.). */
export function llamaAGetDefaultConfig(contenido: string): boolean {
  return /\bgetDefaultConfig\(\s*__dirname\s*\)/.test(contenido)
}

describe('usaConInlineRequires (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta la llamada', () => {
    expect(usaConInlineRequires('config.transformer.getTransformOptions = conInlineRequires(x)')).toBe(true)
  })

  it('el caso de la rotura (se sacó el envoltorio, queda la config sin tocar): false', () => {
    expect(usaConInlineRequires('module.exports = getDefaultConfig(__dirname)')).toBe(false)
  })

  it('no confunde el nombre de la función si aparece sin llamarla', () => {
    expect(usaConInlineRequires('// conInlineRequires explica por qué existe este archivo')).toBe(false)
  })
})

describe('llamaAGetDefaultConfig (fixtures en memoria: tiene que fallar de verdad)', () => {
  it('detecta la llamada con __dirname', () => {
    expect(llamaAGetDefaultConfig('const config = getDefaultConfig(__dirname)')).toBe(true)
  })

  it('no confunde una llamada con otro argumento', () => {
    expect(llamaAGetDefaultConfig('const config = getDefaultConfig(projectRoot)')).toBe(false)
  })

  it('sin ninguna llamada: false', () => {
    expect(llamaAGetDefaultConfig('module.exports = {}')).toBe(false)
  })
})

describe('metro.config.js: usa conInlineRequires y sigue llamando a getDefaultConfig(__dirname)', () => {
  const contenido = readFileSync(METRO_CONFIG_PATH, 'utf8')

  it('usa conInlineRequires', () => {
    expect(usaConInlineRequires(contenido)).toBe(true)
  })

  it('sigue llamando a getDefaultConfig(__dirname)', () => {
    expect(llamaAGetDefaultConfig(contenido)).toBe(true)
  })
})
