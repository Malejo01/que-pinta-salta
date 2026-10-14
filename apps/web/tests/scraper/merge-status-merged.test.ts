import { describe, expect, it } from 'vitest'
import { mergeEvents } from '@/lib/scraper/merge-events'

const START = '2026-11-20T23:00:00.000Z'
const TARGET = 'dddddddd-dddd-4ddd-8ddd-000000000001'

const base = (over: Record<string, unknown> = {}) => ({
  id: 'dddddddd-dddd-4ddd-8ddd-000000000002',
  title: 'Banda de Prueba',
  status: 'DRAFT',
  start_date: START,
  scrape_source_key: 'instagram-ai',
  ...over,
})
const incoming = (over: Record<string, unknown> = {}) => ({
  title: 'Banda de Prueba',
  status: 'PUBLISHED',
  start_date: START,
  ...over,
})
const opts = (src: string) => ({ incomingSource: src, dedupKey: 'banda de prueba|2026-11-20', context: 'ingest' as const })

describe('resolveStatus (vía mergeEvents) con fusionados', () => {
  it.each(['norteticket', 'entradauno', 'vamos'])(
    'DRAFT con merged_into_event_id + PUBLISHED de %s: el patch no trae status',
    (src) => {
      const b = base({ ai_metadata: { merged_into_event_id: TARGET } })
      const { patch } = mergeEvents(b, incoming(), opts(src))
      expect('status' in patch).toBe(false)
    }
  )

  it('fusionado con ai_metadata inválido no cuenta como fusionado (promueve)', () => {
    const b = base({ ai_metadata: { merged_into_event_id: 'no-es-uuid' } })
    expect(mergeEvents(b, incoming(), opts('norteticket')).patch.status).toBe('PUBLISHED')
  })

  it('no regresión: DRAFT sin merged_into_event_id + ticketera promueve a PUBLISHED', () => {
    expect(mergeEvents(base(), incoming(), opts('norteticket')).patch.status).toBe('PUBLISHED')
  })

  it('no regresión: DRAFT con ai_metadata sin fusión + portal promueve', () => {
    const b = base({ ai_metadata: { otra_clave: 1 } })
    expect(mergeEvents(b, incoming(), opts('vamos')).patch.status).toBe('PUBLISHED')
  })

  it('no regresión: DRAFT + Instagram no promueve', () => {
    expect('status' in mergeEvents(base(), incoming(), opts('instagram-ai')).patch).toBe(false)
  })

  it('no regresión: PENDING no se promueve', () => {
    expect('status' in mergeEvents(base({ status: 'PENDING' }), incoming(), opts('norteticket')).patch).toBe(false)
  })
})
