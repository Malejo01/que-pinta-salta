// Hotfix 13/10: "Ya pasó" en /admin/revision. Tiene que coincidir con la
// guarda 5 de publishDraftEvent (isVigente de lib/events/vigencia.ts): si el
// panel dice "se puede publicar" y el servidor dice "ya pasó", vuelve el botón
// que no hace nada. Sin red ni base.
import { describe, expect, it } from 'vitest'
import { draftExpiry, expiredReason, unmergeMessage } from '@/lib/admin/draft-status'
import { isVigente } from '@/lib/events/vigencia'
import { saltaWallClockToUtcISO } from '@/lib/date-format'

const NOW = new Date(saltaWallClockToUtcISO('2026-10-13T10:00:00'))

describe('draftExpiry', () => {
  it('borrador del 11/10 a las 21:00 (fecha del posteo): ya pasó', () => {
    const e = draftExpiry({ start_date: saltaWallClockToUtcISO('2026-10-11T21:00:00') }, NOW)
    expect(e.expired).toBe(true)
    expect(e.byEndDate).toBe(false)
  })

  it('con hora: vigente hasta inicio + 4 h', () => {
    const start = saltaWallClockToUtcISO('2026-10-13T07:00:00')
    expect(draftExpiry({ start_date: start }, NOW).expired).toBe(false)
    const antes = saltaWallClockToUtcISO('2026-10-13T05:59:00')
    expect(draftExpiry({ start_date: antes }, NOW).expired).toBe(true)
  })

  it('sin hora (00:00 de Salta): vigente todo el día', () => {
    const hoy = saltaWallClockToUtcISO('2026-10-13')
    expect(draftExpiry({ start_date: hoy }, NOW).expired).toBe(false)
    const ayer = saltaWallClockToUtcISO('2026-10-12')
    expect(draftExpiry({ start_date: ayer }, NOW).expired).toBe(true)
  })

  it('con end_date vencido, cambiar el inicio no alcanza (byEndDate)', () => {
    const e = draftExpiry(
      { start_date: saltaWallClockToUtcISO('2026-10-31T22:00:00'), end_date: saltaWallClockToUtcISO('2026-10-12T23:00:00') },
      NOW
    )
    expect(e.expired).toBe(true)
    expect(e.byEndDate).toBe(true)
    expect(expiredReason(e)).toContain('fecha de fin cargada')
  })

  it('sin fecha de inicio no marca nada', () => {
    expect(draftExpiry({ start_date: null }, NOW)).toEqual({ expired: false, endsAt: null, byEndDate: false })
  })

  it('fecha inválida: vencido (como isVigente) y el motivo lo dice', () => {
    const e = draftExpiry({ start_date: 'no-es-fecha' }, NOW)
    expect(e.expired).toBe(true)
    expect(expiredReason(e)).toContain('la fecha no es válida')
  })

  it('coincide con isVigente (la guarda 5) en una grilla de casos', () => {
    const starts = ['2026-10-11', '2026-10-12T23:30:00', '2026-10-13', '2026-10-13T05:00:00', '2026-10-13T06:00:00',
      '2026-10-13T06:01:00', '2026-10-13T10:00:00', '2026-10-14T21:00:00', '2026-10-31']
    const ends = [null, '2026-10-12T23:00:00', '2026-10-13T09:59:00', '2026-10-13T10:00:00', '2026-11-01T02:00:00']
    for (const s of starts) {
      for (const e of ends) {
        const row = { start_date: saltaWallClockToUtcISO(s), end_date: e ? saltaWallClockToUtcISO(e) : null }
        expect(draftExpiry(row, NOW).expired, `${s} / ${e}`).toBe(!isVigente(row, NOW))
      }
    }
  })
})

describe('expiredReason', () => {
  it('dice cuándo terminó, en hora de Salta', () => {
    const e = draftExpiry({ start_date: saltaWallClockToUtcISO('2026-10-11T21:00:00') }, NOW)
    expect(expiredReason(e)).toBe('Ya pasó: terminó el 12/10 a las 01:00. Si es otra edición, cambiá la fecha; si no, rechazalo.')
  })

  it('vacío si no está vencido', () => {
    expect(expiredReason({ expired: false, endsAt: null, byEndDate: false })).toBe('')
  })
})

describe('unmergeMessage', () => {
  const base = { keep_id: 'k', audit_found: true, previous_status: 'DRAFT', flyers_restored: 0, ticket_sources_removed: 0, favorites_moved: 0 }

  it('fusión con registro: cuenta flyers y links', () => {
    const m = unmergeMessage({ ...base, flyers_restored: 2, ticket_sources_removed: 1 })
    expect(m).toContain('Volvieron 2 flyers')
    expect(m).toContain('Se sacaron 1 links')
    expect(m).not.toContain('fusión vieja')
  })

  it('fusión vieja sin registro: avisa que los links no se tocaron', () => {
    expect(unmergeMessage({ ...base, audit_found: false, favorites_moved: null, flyers_restored: 1 })).toContain('fusión vieja sin registro')
  })

  it('favoritos movidos y estado publicado antes: los dos se avisan', () => {
    const m = unmergeMessage({ ...base, favorites_moved: 3, previous_status: 'PUBLISHED' })
    expect(m).toContain('3 favorito(s) quedan')
    expect(m).toContain('estaba publicado')
  })
})
