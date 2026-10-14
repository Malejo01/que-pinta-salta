// Tarea 19-f: funciones puras y el reducer de lib/admin/date-confirmation.ts (QPS-065/073/077).
// Sin red, sin base, sin testing-library: el reducer y las funciones puras se prueban
// directamente, sin montar el componente.
import { describe, expect, it } from 'vitest'
import {
  dateConfirmFormReducer,
  dateConfirmation,
  dateConfirmationText,
  initialDateConfirmFormState,
  isDateConfirmed,
  type DateConfirmationResult,
} from '@/lib/admin/date-confirmation'

describe('dateConfirmation', () => {
  it('ai_metadata.is_fallback === true: hace falta confirmar, reason "fallback"', () => {
    const result = dateConfirmation({ ai_metadata: { is_fallback: true } }, [])
    expect(result).toEqual({ needed: true, reason: 'fallback', postedAt: null })
  })

  it('ai_metadata.is_fallback === true con flyers: postedAt es el published_at del primer flyer', () => {
    const result = dateConfirmation(
      { ai_metadata: { is_fallback: true } },
      [{ published_at: '2029-01-01T00:00:00.000Z' }],
    )
    expect(result).toEqual({ needed: true, reason: 'fallback', postedAt: '2029-01-01T00:00:00.000Z' })
  })

  it('ai_metadata.date_source === "published_at": hace falta confirmar, reason "published_at"', () => {
    const result = dateConfirmation({ ai_metadata: { date_source: 'published_at' } }, [])
    expect(result).toEqual({ needed: true, reason: 'published_at', postedAt: null })
  })

  it('ai_metadata.date_source === "flyer": no hace falta confirmar', () => {
    const result = dateConfirmation({ ai_metadata: { date_source: 'flyer' } }, [])
    expect(result).toEqual({ needed: false, reason: null, postedAt: null })
  })

  describe('borrador viejo (sin date_source) del pipeline instagram-ai', () => {
    const row = {
      scrape_source_key: 'instagram-ai',
      ai_metadata: null,
      start_date: '2029-05-10T03:00:00.000Z', // 00:00 del 10/05 en Salta
    }

    it('un flyer del mismo día de Salta que start_date: reason "legacy"', () => {
      const result = dateConfirmation(row, [{ published_at: '2029-05-10T23:30:00.000Z' }]) // 20:30 del 10/05 en Salta
      expect(result).toEqual({ needed: true, reason: 'legacy', postedAt: '2029-05-10T23:30:00.000Z' })
    })

    it('un flyer de otro día: no hace falta confirmar', () => {
      const result = dateConfirmation(row, [{ published_at: '2029-04-01T03:00:00.000Z' }])
      expect(result).toEqual({ needed: false, reason: null, postedAt: null })
    })

    it('varios flyers, uno coincide (la segunda fila, no la primera): reason "legacy" con el que coincide', () => {
      const result = dateConfirmation(row, [
        { published_at: '2029-01-01T03:00:00.000Z' }, // no coincide
        { published_at: '2029-05-10T03:00:00.000Z' }, // coincide
      ])
      expect(result).toEqual({ needed: true, reason: 'legacy', postedAt: '2029-05-10T03:00:00.000Z' })
    })

    it('borde de día en Salta: posteo 23:30 del 10/10 en Salta (02:30 UTC del 11) contra un evento del 10/10: coincide igual', () => {
      const legacyRow = {
        scrape_source_key: 'instagram-ai',
        ai_metadata: null,
        start_date: '2025-10-10T03:00:00.000Z', // 00:00 del 10/10 en Salta
      }
      const result = dateConfirmation(legacyRow, [{ published_at: '2025-10-11T02:30:00.000Z' }]) // 23:30 del 10/10 en Salta, cruza la medianoche UTC
      expect(result).toEqual({ needed: true, reason: 'legacy', postedAt: '2025-10-11T02:30:00.000Z' })
    })
  })

  it('no viene del pipeline instagram-ai (otra fuente o borrador manual): no hace falta confirmar, ni mirando flyers', () => {
    const result = dateConfirmation(
      { scrape_source_key: 'ticketera-prueba', ai_metadata: null, start_date: '2029-05-10T03:00:00.000Z' },
      [{ published_at: '2029-05-10T03:00:00.000Z' }],
    )
    expect(result).toEqual({ needed: false, reason: null, postedAt: null })
  })

  it('no se pudieron leer los flyers de origen (flyers === null): falla cerrada, reason "unreadable"', () => {
    const result = dateConfirmation(
      { scrape_source_key: 'instagram-ai', ai_metadata: null, start_date: '2029-05-10T03:00:00.000Z' },
      null,
    )
    expect(result).toEqual({ needed: true, reason: 'unreadable', postedAt: null })
  })
})

describe('dateConfirmationText', () => {
  const POSTED_AT = '2029-05-10T03:00:00.000Z' // 00:00 del 10/05 en Salta -> "10/05"

  it('reason "published_at" con postedAt: menciona el día del posteo', () => {
    const result: DateConfirmationResult = { needed: true, reason: 'published_at', postedAt: POSTED_AT }
    expect(dateConfirmationText(result)).toBe('El flyer no dice fecha; se usó el día del posteo, 10/05.')
  })

  it('reason "published_at" sin postedAt: el texto no menciona ninguna fecha', () => {
    const result: DateConfirmationResult = { needed: true, reason: 'published_at', postedAt: null }
    expect(dateConfirmationText(result)).toBe('El flyer no dice fecha; se usó el día del posteo.')
  })

  it('reason "fallback" con postedAt', () => {
    const result: DateConfirmationResult = { needed: true, reason: 'fallback', postedAt: POSTED_AT }
    expect(dateConfirmationText(result)).toBe('No se pudo leer el flyer; se usó el día del posteo, 10/05.')
  })

  it('reason "fallback" sin postedAt', () => {
    const result: DateConfirmationResult = { needed: true, reason: 'fallback', postedAt: null }
    expect(dateConfirmationText(result)).toBe('No se pudo leer el flyer; se usó el día del posteo.')
  })

  it('reason "legacy" con postedAt', () => {
    const result: DateConfirmationResult = { needed: true, reason: 'legacy', postedAt: POSTED_AT }
    expect(dateConfirmationText(result)).toBe('Borrador anterior a la marca de fecha: coincide con el día del posteo, 10/05.')
  })

  it('reason "legacy" sin postedAt', () => {
    const result: DateConfirmationResult = { needed: true, reason: 'legacy', postedAt: null }
    expect(dateConfirmationText(result)).toBe('Borrador anterior a la marca de fecha: coincide con el día del posteo.')
  })

  it('reason "unreadable": texto fijo, no depende de postedAt', () => {
    const result: DateConfirmationResult = { needed: true, reason: 'unreadable', postedAt: null }
    expect(dateConfirmationText(result)).toBe('No se pudo verificar de dónde salió la fecha.')
  })

  it('reason null (no hace falta confirmar): texto vacío', () => {
    const result: DateConfirmationResult = { needed: false, reason: null, postedAt: null }
    expect(dateConfirmationText(result)).toBe('')
  })
})

describe('isDateConfirmed', () => {
  it('no hace falta confirmar: siempre true, aunque no esté tildado ni haya fechas', () => {
    expect(isDateConfirmed({ needed: false, checked: false, originalStartISO: null, formStartISO: null })).toBe(true)
  })

  it('tildado: true aunque las fechas coincidan', () => {
    expect(
      isDateConfirmed({
        needed: true,
        checked: true,
        originalStartISO: '2029-05-10T03:00:00.000Z',
        formStartISO: '2029-05-10T03:00:00.000Z',
      }),
    ).toBe(true)
  })

  it('sin tildar, cambió el día: true (cambiar la fecha ya cuenta como confirmarla)', () => {
    expect(
      isDateConfirmed({
        needed: true,
        checked: false,
        originalStartISO: '2029-05-10T03:00:00.000Z',
        formStartISO: '2029-05-11T03:00:00.000Z',
      }),
    ).toBe(true)
  })

  it('sin tildar, cambió solo la hora (mismo día): true', () => {
    expect(
      isDateConfirmed({
        needed: true,
        checked: false,
        originalStartISO: '2029-05-10T03:00:00.000Z',
        formStartISO: '2029-05-10T23:30:00.000Z',
      }),
    ).toBe(true)
  })

  it('sin tildar, mismo instante con otro formato ISO (Z contra -03:00): false', () => {
    expect(
      isDateConfirmed({
        needed: true,
        checked: false,
        originalStartISO: '2029-05-10T03:00:00.000Z',
        formStartISO: '2029-05-10T00:00:00-03:00', // mismo instante exacto, otro formato
      }),
    ).toBe(false)
  })

  it('sin tildar, falta alguna de las dos fechas: false', () => {
    expect(
      isDateConfirmed({ needed: true, checked: false, originalStartISO: null, formStartISO: '2029-05-10T03:00:00.000Z' }),
    ).toBe(false)
    expect(
      isDateConfirmed({ needed: true, checked: false, originalStartISO: '2029-05-10T03:00:00.000Z', formStartISO: null }),
    ).toBe(false)
  })
})

describe('dateConfirmFormReducer', () => {
  it('check(true) y después eventsRefreshed: sigue tildado (el fix de hoy)', () => {
    let state = initialDateConfirmFormState
    state = dateConfirmFormReducer(state, { type: 'check', checked: true })
    state = dateConfirmFormReducer(state, { type: 'eventsRefreshed' })
    expect(state).toEqual({ checked: true })
  })

  it('el bug de ayer: si en vez de "eventsRefreshed" se disparara "select" con el mismo id (el patrón viejo del useEffect con deps [selectedEventId, events]), el tilde se perdía igual', () => {
    // El reducer no guarda el id seleccionado: `select` siempre resetea, sin comparar nada.
    // Por eso components/draft-events-manager.tsx depende de que React NO vuelva a correr el
    // efecto que dispara 'select' si `selectedEventId` no cambió (deps `[selectedEventId]`,
    // sin `events`); si el efecto tuviera `events` en las deps (el patrón de antes de la Ronda
    // 19), se dispararía 'select' con el mismo id cada vez que se refresca la lista
    // (p. ej. tras "Procesar con IA"), perdiendo el tilde aunque el admin no haya cambiado de
    // borrador. Lo comprobamos llamando al reducer directamente con esa secuencia.
    let state = initialDateConfirmFormState
    state = dateConfirmFormReducer(state, { type: 'check', checked: true })
    const conElPatronViejo = dateConfirmFormReducer(state, { type: 'select', id: 'mismo-id-de-prueba' })
    expect(conElPatronViejo).toEqual({ checked: false })
  })

  it('select(otroId): reinicia', () => {
    let state = initialDateConfirmFormState
    state = dateConfirmFormReducer(state, { type: 'check', checked: true })
    state = dateConfirmFormReducer(state, { type: 'select', id: 'otro-id-de-prueba' })
    expect(state).toEqual({ checked: false })
  })

  it('select(mismoId): en la app real no se dispara y por lo tanto no reinicia, porque el efecto que llama a dispatch depende solo de selectedEventId ([selectedEventId]): si el id no cambia, React no vuelve a correr el efecto. Simulamos ese gate (no es código de producción: imita la comparación de dependencias de React) para probarlo sin montar el componente.', () => {
    let previousId: string | null = null
    let state = initialDateConfirmFormState
    const selectIfIdChanged = (id: string | null) => {
      if (id === previousId) return // simula que React no vuelve a correr el efecto
      previousId = id
      state = dateConfirmFormReducer(state, { type: 'select', id })
    }

    selectIfIdChanged('id-de-prueba')
    state = dateConfirmFormReducer(state, { type: 'check', checked: true })

    selectIfIdChanged('id-de-prueba') // mismo id: no se dispara 'select'
    expect(state).toEqual({ checked: true })

    selectIfIdChanged('otro-id-de-prueba') // id distinto: sí se dispara y reinicia
    expect(state).toEqual({ checked: false })
  })
})
