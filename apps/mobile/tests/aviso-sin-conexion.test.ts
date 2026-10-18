// R43, 43-a: `textoGuardadoEn` y `TITULO_SIN_CONEXION`
// (lib/sin-conexion/aviso.ts). Todas las fechas se construyen con el offset
// de Salta explícito (`-03:00`) para no depender de la zona de la máquina
// que corre el test, y los casos de "hoy"/"ayer" están pegados a la
// medianoche de Salta (23:59 y 00:01) a propósito: son los que fallarían si
// alguien usara `Date.getHours()`/`getDay()` de la máquina (en UTC) en vez
// de los helpers de `@qps/core`.
//
// 43-c2: el componente `components/AvisoSinConexion.tsx` no se puede montar
// acá (no hay `@testing-library/react-native` en el repo, mismo motivo que
// `tests/pantallas-sin-conexion.test.ts`), así que el `accessibilityLabel`
// se fija con un detector estático sobre el código fuente.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TEXTO_GUARDADO_INVALIDO, TITULO_SIN_CONEXION, textoGuardadoEn } from '../lib/sin-conexion/aviso'

const COMPONENTE_PATH = fileURLToPath(new URL('../components/AvisoSinConexion.tsx', import.meta.url))
const contenidoComponente = readFileSync(COMPONENTE_PATH, 'utf8')

describe('TITULO_SIN_CONEXION', () => {
  it('es el texto fijo del plan', () => {
    expect(TITULO_SIN_CONEXION).toBe('Sin conexión, mostrando lo último guardado')
  })
})

describe('textoGuardadoEn', () => {
  it('hoy: ahora a las 23:59 de Salta, guardado el mismo día a las 14:32', () => {
    const ahora = new Date('2026-10-14T23:59:00-03:00')
    const guardadoEn = new Date('2026-10-14T14:32:00-03:00')
    expect(textoGuardadoEn(guardadoEn, ahora)).toBe('Guardado hoy a las 14:32')
  })

  it('ayer: ahora recién pasada la medianoche de Salta (00:01), guardado el día anterior a las 21:05', () => {
    const ahora = new Date('2026-10-15T00:01:00-03:00')
    const guardadoEn = new Date('2026-10-14T21:05:00-03:00')
    expect(textoGuardadoEn(guardadoEn, ahora)).toBe('Guardado ayer a las 21:05')
  })

  it('otro día (incluso de otro mes): "el DD/MM"', () => {
    const ahora = new Date('2026-10-15T10:00:00-03:00')
    const guardadoEn = new Date('2026-09-20T10:00:00-03:00')
    expect(textoGuardadoEn(guardadoEn, ahora)).toBe('Guardado el 20/09 a las 10:00')
  })

  it('justo en el límite: lo guardado a las 00:00:00.001 de Salta del día de "ahora" cuenta como "hoy", no "ayer"', () => {
    const ahora = new Date('2026-10-15T12:00:00-03:00')
    const guardadoEn = new Date('2026-10-15T00:00:00.001-03:00')
    expect(textoGuardadoEn(guardadoEn, ahora)).toBe('Guardado hoy a las 00:00')
  })

  it('con guardadoEn inválido, no tira: devuelve el texto neutro', () => {
    expect(textoGuardadoEn(new Date('fecha-que-no-existe'), new Date())).toBe(TEXTO_GUARDADO_INVALIDO)
  })

  it('con ahora inválido, no tira: devuelve el texto neutro', () => {
    expect(textoGuardadoEn(new Date(), new Date('fecha-que-no-existe'))).toBe(TEXTO_GUARDADO_INVALIDO)
  })
})

// ---------------------------------------------------------------------------
// 43-c2, arreglo 3: TalkBack/VoiceOver anuncian el aviso como un solo bloque
// (`accessible` + `accessibilityLiveRegion="polite"` + `accessibilityLabel`),
// no dos `Text` sueltos con un `accessibilityRole="alert"` que no mapea
// igual en las dos plataformas.
// ---------------------------------------------------------------------------
describe('AvisoSinConexion: se anuncia como un solo bloque (detector estático)', () => {
  it('el archivo se leyó (no está vacío)', () => {
    expect(contenidoComponente.length).toBeGreaterThan(200)
  })

  it('el contenedor es `accessible` y tiene accessibilityLiveRegion="polite"', () => {
    expect(contenidoComponente).toMatch(/\baccessible\b(?!\w)/)
    expect(contenidoComponente).toMatch(/accessibilityLiveRegion=["']polite["']/)
  })

  it('ya no usa accessibilityRole="alert" (el reemplazo de arriba)', () => {
    expect(contenidoComponente).not.toMatch(/accessibilityRole=["']alert["']/)
  })

  it('textoGuardadoEn se llama una sola vez (el mismo resultado se usa en el texto visible y en el label)', () => {
    const llamadas = contenidoComponente.match(/\btextoGuardadoEn\s*\(/g) ?? []
    expect(llamadas.length).toBe(1)
  })

  it('el accessibilityLabel une TITULO_SIN_CONEXION con la variable de textoGuardadoEn, no con una llamada nueva', () => {
    const idxLabel = contenidoComponente.indexOf('accessibilityLabel=')
    expect(idxLabel).toBeGreaterThan(-1)

    // El label está en la misma etiqueta <View ...>, antes del primer '>'.
    const idxCierre = contenidoComponente.indexOf('>', idxLabel)
    const fragmentoLabel = contenidoComponente.slice(idxLabel, idxCierre)

    expect(fragmentoLabel).toMatch(/\$\{TITULO_SIN_CONEXION\}/)
    // La variable que guarda el resultado de textoGuardadoEn (no una llamada
    // directa: eso duplicaría el cálculo de `new Date()`).
    expect(fragmentoLabel).not.toMatch(/textoGuardadoEn\s*\(/)

    const idxDeclaracion = contenidoComponente.indexOf('textoGuardadoEn(')
    const match = contenidoComponente.slice(0, idxDeclaracion).match(/const\s+(\w+)\s*=\s*$/)
    expect(match).not.toBeNull()
    const nombreVariable = match?.[1] ?? ''
    expect(nombreVariable.length).toBeGreaterThan(0)
    expect(fragmentoLabel).toMatch(new RegExp(`\\$\\{${nombreVariable}\\}`))
  })

  it('usa Texto (@/components/Texto) para el título y el subtítulo, no Text de react-native', () => {
    expect(contenidoComponente).toMatch(/import\s*\{\s*Texto\s*\}\s*from\s*['"]@\/components\/Texto['"]/)
    expect(contenidoComponente).not.toMatch(/from\s*['"]react-native['"][^;]*\bText\b/)
  })

  it('el contenedor tiene un corte visual que no depende del fondo (borderBottomWidth) y separación con lo de abajo (marginBottom)', () => {
    expect(contenidoComponente).toMatch(/borderBottomWidth:\s*1/)
    expect(contenidoComponente).toMatch(/borderBottomColor:\s*colores\.border/)
    expect(contenidoComponente).toMatch(/marginBottom:\s*8/)
  })
})
