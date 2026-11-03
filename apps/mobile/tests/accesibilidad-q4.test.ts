// R-2: accesibilidad de lo nuevo de la tanda Q4 en la app (avisos sin sesión,
// recordatorios y «Este finde pinta»). Detectores estáticos sobre el código.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'
import { en } from '../lib/i18n/diccionarios/en'
import { es } from '../lib/i18n/diccionarios/es'
import { AVISO_SIN_PERMISO, PISTA_PIDE_PERMISO } from '../lib/push/textos-interruptores'

const leer = (archivo: string) => quitarComentarios(readFileSync(join(__dirname, '..', archivo), 'utf8'))
const INTERRUPTORES = ['components/AvisosSinSesion.tsx', 'components/InterruptorRecordatorios.tsx', 'components/InterruptorFinde.tsx']

describe.each(INTERRUPTORES)('%s', (archivo) => {
  const codigo = leer(archivo)
  const switches = codigo.match(/<Switch[\s\S]*?\/>/g) ?? []

  it('tiene interruptores', () => {
    expect(switches.length).toBeGreaterThan(0)
  })

  it('cada Switch tiene nombre, pista y estado (checked + busy)', () => {
    for (const s of switches) {
      expect(s).toMatch(/accessibilityLabel=/)
      expect(s).toMatch(/accessibilityHint=/)
      expect(s).toMatch(/accessibilityState=\{\{\s*checked:/)
      expect(s).toMatch(/busy:/)
    }
  })

  // Q6-1: los dos textos salen del diccionario (`notificaciones.pidePermiso` /
  // `notificaciones.sinPermiso`), que en castellano son las constantes de siempre.
  it('sin permiso, la pista avisa que se va a pedir', () => {
    expect(codigo).toMatch(/t\.pidePermiso/)
    expect(es.notificaciones.pidePermiso).toBe(PISTA_PIDE_PERMISO)
    expect(en.notificaciones.pidePermiso).not.toBe(PISTA_PIDE_PERMISO)
  })

  it('si el permiso se niega, se dice (no vuelve a apagado en silencio)', () => {
    expect(codigo).toMatch(/if \(resultado !== 'activo'\) \{\s*(?:\/\/[^\n]*\n\s*)?avisar\(t\.sinPermiso\)/)
    expect(es.notificaciones.sinPermiso).toBe(AVISO_SIN_PERMISO)
    expect(en.notificaciones.sinPermiso).not.toBe(AVISO_SIN_PERMISO)
  })

  it('las filas llegan a 48 dp de alto (área táctil)', () => {
    expect(codigo).toMatch(/minHeight: 48/)
  })
})

describe('AvisosSinSesion: el botón de estado', () => {
  it('lleva rol, nombre y estado disabled/busy', () => {
    const codigo = leer('components/AvisosSinSesion.tsx')
    const boton = /<Pressable[\s\S]*?>/.exec(codigo)?.[0] ?? ''
    expect(boton).toMatch(/accessibilityRole="button"/)
    expect(boton).toMatch(/accessibilityLabel=\{boton\.etiqueta\}/)
    expect(boton).toMatch(/accessibilityState=\{\{ disabled: boton\.accion === null, busy: estado === 'pidiendo' \}\}/)
  })

  it('el título de la sección es un encabezado', () => {
    expect(leer('components/AvisosSinSesion.tsx')).toMatch(/accessibilityRole="header"/)
  })
})
