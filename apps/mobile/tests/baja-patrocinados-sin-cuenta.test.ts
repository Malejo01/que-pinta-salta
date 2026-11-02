// R-4 (R82): el botón de baja rápida de un aviso patrocinado también funciona
// sin cuenta: apaga los patrocinados de la fila de este teléfono. Estático.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { quitarComentarios } from '@qps/core/tests/convencion-entorno'

const codigo = quitarComentarios(readFileSync(join(__dirname, '../components/ManejadorTapPush.tsx'), 'utf8'))

describe('ManejadorTapPush: baja de patrocinados sin sesión', () => {
  it('en pedir-sesion apaga los patrocinados de este teléfono (y ya no solo avisa)', () => {
    const rama = /if \(decision\.accion === 'pedir-sesion'\) \{([\s\S]*?)\n  \}/.exec(codigo)?.[1] ?? ''
    expect(rama).toMatch(/cambiarAvisosDeEsteTelefono\(\{ avisosPatrocinados: false \}\)/)
    expect(rama).toMatch(/avisar\(/)
    expect(rama).not.toMatch(/Entrá a tu cuenta para apagar/)
  })

  it('con sesión sigue guardando en las preferencias de la cuenta', () => {
    expect(codigo).toMatch(/cambiarPatrocinados\(decision\.userId, false\)/)
  })
})
