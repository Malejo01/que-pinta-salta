// 28-q, puntos 14 y 15 (F4/F5, 28-h): lectura estática de
// `components/CampoTexto.tsx` y `app/(tabs)/cuenta.tsx`. Mismo estilo que
// `tests/iconos.test.ts`: detectores con fixtures en memoria, aplicados
// después a los archivos reales.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const RUTA_CUENTA = fileURLToPath(new URL('../app/(tabs)/cuenta.tsx', import.meta.url))
const RUTA_CAMPO_TEXTO = fileURLToPath(new URL('../components/CampoTexto.tsx', import.meta.url))

const SRC_CUENTA = readFileSync(RUTA_CUENTA, 'utf8')
const SRC_CAMPO_TEXTO = readFileSync(RUTA_CAMPO_TEXTO, 'utf8')

describe('cuenta.tsx: no tiene un TextInput suelto (usa CampoTexto)', () => {
  it('no hay ningún <TextInput directo', () => {
    expect(SRC_CUENTA).not.toMatch(/<TextInput\b/)
  })

  it('sí usa <CampoTexto', () => {
    expect(SRC_CUENTA).toMatch(/<CampoTexto\b/)
  })

  it('importa CampoTexto de @/components/CampoTexto', () => {
    expect(SRC_CUENTA).toMatch(/import\s*\{\s*CampoTexto\s*\}\s*from\s*['"]@\/components\/CampoTexto['"]/)
  })
})

describe('CampoTexto.tsx: define el fondo y el color del placeholder', () => {
  it('define backgroundColor', () => {
    expect(SRC_CAMPO_TEXTO).toMatch(/backgroundColor\s*:/)
  })

  it('define placeholderTextColor en el TextInput', () => {
    expect(SRC_CAMPO_TEXTO).toMatch(/placeholderTextColor\s*=/)
  })
})

describe('CampoTexto.tsx: el "ojito" (F5) tiene los dos accessibilityLabel', () => {
  it('"Mostrar contraseña"', () => {
    expect(SRC_CAMPO_TEXTO).toContain('Mostrar contraseña')
  })

  it('"Ocultar contraseña"', () => {
    expect(SRC_CAMPO_TEXTO).toContain('Ocultar contraseña')
  })
})

// ---------------------------------------------------------------------------
// Extra (no pedido explícitamente por la lista de la tarea, pero señalado
// como importante: fue un bloqueante del revisor): el "ojito" vuelve a
// ocultar la contraseña cuando la app pasa a background/inactive. Sin React
// Native real no se puede montar el componente y disparar un cambio de
// AppState de verdad, así que se fija de forma estática: tiene que
// suscribirse a `AppState.addEventListener('change', ...)` y, dentro del
// handler, volver a ocultar (`setOculto(true)`) cuando el estado sea
// 'background' o 'inactive'.
// ---------------------------------------------------------------------------
export function tieneListenerQueReocultaEnBackground(content: string): boolean {
  const idx = content.search(/AppState\.addEventListener\(\s*['"]change['"]/)
  if (idx === -1) return false
  const tramo = content.slice(idx, idx + 400)
  const comprueba = /['"]background['"]/.test(tramo) && /['"]inactive['"]/.test(tramo)
  const reoculta = /setOculto\s*\(\s*true\s*\)/.test(tramo)
  return comprueba && reoculta
}

describe('tieneListenerQueReocultaEnBackground (fixtures)', () => {
  it('detecta el patrón real', () => {
    const fixture = `
      useEffect(() => {
        const s = AppState.addEventListener('change', (estado) => {
          if (estado === 'background' || estado === 'inactive') {
            setOculto(true)
          }
        })
        return () => s.remove()
      }, [conOjito])
    `
    expect(tieneListenerQueReocultaEnBackground(fixture)).toBe(true)
  })

  it('sin ningún listener de AppState: false', () => {
    expect(tieneListenerQueReocultaEnBackground('export function Foo() { return null }')).toBe(false)
  })

  it('con el listener, pero que no vuelve a ocultar nada: false', () => {
    const fixture = `AppState.addEventListener('change', (estado) => {
      if (estado === 'background' || estado === 'inactive') { console.log('en segundo plano') }
    })`
    expect(tieneListenerQueReocultaEnBackground(fixture)).toBe(false)
  })

  it('con el listener y setOculto(true), pero sin comprobar background/inactive (vuelve a ocultar siempre): false', () => {
    const fixture = `AppState.addEventListener('change', () => { setOculto(true) })`
    expect(tieneListenerQueReocultaEnBackground(fixture)).toBe(false)
  })
})

describe('CampoTexto.tsx: el "ojito" se vuelve a ocultar al pasar a background/inactive', () => {
  it('tiene el listener real', () => {
    expect(tieneListenerQueReocultaEnBackground(SRC_CAMPO_TEXTO)).toBe(true)
  })
})
