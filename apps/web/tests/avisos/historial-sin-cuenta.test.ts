// Q5-14 · /admin/avisos: el historial de avisos del equipo muestra los
// teléfonos SIN cuenta aparte.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { agruparHistorialAvisoEquipo } from '@/lib/admin/historial-avisos'

describe('agruparHistorialAvisoEquipo', () => {
  it('cuenta por día de Salta y separa los sin cuenta (user_id nulo)', () => {
    expect(
      agruparHistorialAvisoEquipo([
        { sent_at: '2026-11-09T14:00:00Z', user_id: 'u1' },
        { sent_at: '2026-11-09T14:01:00Z', user_id: null },
        { sent_at: '2026-11-10T02:30:00Z', user_id: null }, // 23:30 del 9 en Salta
        { sent_at: '2026-11-05T14:00:00Z', user_id: 'u2' },
      ]),
    ).toEqual([
      { dia: '2026-11-09', personas: 3, sinCuenta: 2 },
      { dia: '2026-11-05', personas: 1, sinCuenta: 0 },
    ])
  })
  it('la página lo muestra aparte, solo si hay', () => {
    const s = readFileSync(join(process.cwd(), 'app', 'admin', 'avisos', 'page.tsx'), 'utf8')
    expect(s).toContain("{fila.sinCuenta > 0 ? ` (${fila.sinCuenta} sin cuenta)` : ''}")
  })
})
