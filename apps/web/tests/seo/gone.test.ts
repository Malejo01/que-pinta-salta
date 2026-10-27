// SEO (Search Console, 13/10): /flyer/<id> de un flyer archivado daba 404 (la
// RLS de anon solo deja leer los ACTIVE) y esos flyers estuvieron en el
// sitemap. Ahora: archivado con evento → 308 a la ficha; sin evento → 410.
// /evento/<id> borrado o cancelado → 410. Sin red ni base: el cliente de
// service role es un doble en memoria.
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  events: [] as Row[],
  flyers: [] as Row[],
  fail: false,
  selects: [] as Array<{ table: string; columns: string }>,
}))

function fakeClient() {
  return {
    from(table: string) {
      let id: unknown
      let columns = ''
      const q: Record<string, unknown> = {}
      q.select = (c: string) => {
        columns = c
        db.selects.push({ table, columns: c })
        return q
      }
      q.eq = (_c: string, v: unknown) => {
        id = v
        return q
      }
      q.maybeSingle = async () => {
        if (db.fail) return { data: null, error: { message: 'falla de red simulada' } }
        const rows = table === 'events' ? db.events : db.flyers
        const row = rows.find((r) => r.id === id)
        if (!row) return { data: null, error: null }
        if (table === 'instagram_flyers' && columns.includes('event_id:ai_metadata->>event_id')) {
          const meta = row.ai_metadata as Row | null
          return { data: { id: row.id, status: row.status, event_id: meta?.event_id ?? null }, error: null }
        }
        return { data: row, error: null }
      }
      return q
    },
  }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeClient() }))
vi.mock('@/lib/supabase/proxy', async () => {
  const { NextResponse } = await import('next/server')
  return {
    updateSession: async () => {
      const res = NextResponse.next()
      res.cookies.set('sb-x-auth-token', 'refrescada')
      return res
    },
  }
})

import { decideGone, parseGonePath } from '@/lib/seo/gone'
import { middleware } from '@/middleware'
import { NextRequest } from 'next/server'

const uid = (n: number) => `abcdabcd-abcd-4bcd-8bcd-${String(n).padStart(12, '0')}`
const FLYER = uid(1)
const EVENT = uid(2)
const KEEP = uid(3)

beforeEach(() => {
  db.events = []
  db.flyers = []
  db.fail = false
  db.selects = []
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ejemplo.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-falsa-de-test'
})

describe('parseGonePath', () => {
  it('solo /flyer/<uuid> y /evento/<uuid> exactos', () => {
    expect(parseGonePath(`/flyer/${FLYER}`)).toEqual({ kind: 'flyer', id: FLYER })
    expect(parseGonePath(`/evento/${EVENT.toUpperCase()}/`)).toEqual({ kind: 'evento', id: EVENT })
    expect(parseGonePath('/evento/no-es-uuid')).toBeNull()
    expect(parseGonePath(`/evento/${EVENT}/otra`)).toBeNull()
    expect(parseGonePath(`/go/${EVENT}`)).toBeNull()
    expect(parseGonePath('/')).toBeNull()
  })
})

describe('flyers', () => {
  const flyer = { kind: 'flyer' as const, id: FLYER }

  it('activo: sigue a la página', async () => {
    db.flyers = [{ id: FLYER, status: 'ACTIVE', ai_metadata: null }]
    expect(await decideGone(fakeClient(), flyer, false)).toEqual({ kind: 'pass' })
  })

  it('archivado con evento publicado: 308 a la ficha', async () => {
    db.flyers = [{ id: FLYER, status: 'ARCHIVED', ai_metadata: { event_id: EVENT } }]
    db.events = [{ id: EVENT, status: 'PUBLISHED', ai_metadata: null }]
    expect(await decideGone(fakeClient(), flyer, false)).toEqual({ kind: 'redirect', location: `/evento/${EVENT}` })
  })

  it('archivado con evento fusionado: 308 al que quedó (siguiendo la cadena)', async () => {
    db.flyers = [{ id: FLYER, status: 'ARCHIVED', ai_metadata: { event_id: EVENT } }]
    db.events = [
      { id: EVENT, status: 'DRAFT', ai_metadata: { merged_into_event_id: KEEP } },
      { id: KEEP, status: 'PUBLISHED', ai_metadata: null },
    ]
    expect(await decideGone(fakeClient(), flyer, false)).toEqual({ kind: 'redirect', location: `/evento/${KEEP}` })
  })

  it('archivado con evento sin publicar: 410 (no se redirige a un borrador)', async () => {
    db.flyers = [{ id: FLYER, status: 'ARCHIVED', ai_metadata: { event_id: EVENT } }]
    db.events = [{ id: EVENT, status: 'DRAFT', ai_metadata: null }]
    expect(await decideGone(fakeClient(), flyer, false)).toEqual({ kind: 'gone' })
  })

  it('archivado sin evento: 410', async () => {
    db.flyers = [{ id: FLYER, status: 'ARCHIVED', ai_metadata: { message: 'Evento caducado' } }]
    expect(await decideGone(fakeClient(), flyer, false)).toEqual({ kind: 'gone' })
  })

  it('inexistente o con la base caída: sigue (404 de la página, como antes)', async () => {
    expect(await decideGone(fakeClient(), flyer, false)).toEqual({ kind: 'pass' })
    db.flyers = [{ id: FLYER, status: 'ARCHIVED', ai_metadata: null }]
    db.fail = true
    expect(await decideGone(fakeClient(), flyer, false)).toEqual({ kind: 'pass' })
  })

  it('pide solo las columnas mínimas del flyer', async () => {
    db.flyers = [{ id: FLYER, status: 'ARCHIVED', ai_metadata: null }]
    await decideGone(fakeClient(), flyer, false)
    expect(db.selects[0]).toEqual({ table: 'instagram_flyers', columns: 'id, status, event_id:ai_metadata->>event_id' })
  })
})

describe('eventos', () => {
  const evento = { kind: 'evento' as const, id: EVENT }

  it('borrado (no existe): 410', async () => {
    expect(await decideGone(fakeClient(), evento, false)).toEqual({ kind: 'gone' })
  })

  it('cancelado: 410 sin sesión; con sesión sigue (el admin lo puede ver)', async () => {
    db.events = [{ id: EVENT, status: 'CANCELLED', ai_metadata: null }]
    expect(await decideGone(fakeClient(), evento, false)).toEqual({ kind: 'gone' })
    expect(await decideGone(fakeClient(), evento, true)).toEqual({ kind: 'pass' })
  })

  it('fusionado, publicado o borrador: sigue (la página hace su 308 o su 404)', async () => {
    for (const row of [
      { id: EVENT, status: 'DRAFT', ai_metadata: { merged_into_event_id: KEEP } },
      { id: EVENT, status: 'PUBLISHED', ai_metadata: null },
      { id: EVENT, status: 'DRAFT', ai_metadata: null },
    ]) {
      db.events = [row]
      expect(await decideGone(fakeClient(), evento, false)).toEqual({ kind: 'pass' })
    }
  })

  it('con la base caída: sigue', async () => {
    db.fail = true
    expect(await decideGone(fakeClient(), evento, false)).toEqual({ kind: 'pass' })
  })
})

describe('middleware', () => {
  const req = (path: string) => new NextRequest(`https://www.quepintasalta.com.ar${path}`)

  it('410 con noindex, sin datos del flyer en el cuerpo, y conserva las cookies de sesión', async () => {
    db.flyers = [{ id: FLYER, status: 'ARCHIVED', ai_metadata: { secreto: 'no-sale' } }]
    const res = await middleware(req(`/flyer/${FLYER}`))
    expect(res.status).toBe(410)
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    const body = await res.text()
    expect(body).toContain('ya no está disponible')
    expect(body).not.toContain(FLYER)
    expect(body).not.toContain('no-sale')
    expect(res.cookies.get('sb-x-auth-token')?.value).toBe('refrescada')
  })

  it('308 a la ficha del evento', async () => {
    db.flyers = [{ id: FLYER, status: 'ARCHIVED', ai_metadata: { event_id: EVENT } }]
    db.events = [{ id: EVENT, status: 'PUBLISHED', ai_metadata: null }]
    const res = await middleware(req(`/flyer/${FLYER}`))
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe(`https://www.quepintasalta.com.ar/evento/${EVENT}`)
  })

  it('el resto de las rutas no consulta nada', async () => {
    const res = await middleware(req('/buscar'))
    expect(res.status).toBe(200)
    expect(db.selects).toEqual([])
  })
})

// Q3: la ficha en inglés (/en/evento/<uuid>) hace lo mismo que la de
// castellano: 410 si el evento se borró o (sin sesión) se canceló, y sigue a
// la página en el resto (fusionado: la página hace su 308 a /en/evento/<otro>,
// ver tests/events/evento-en-merged-308.test.ts). /flyer existe solo en castellano.
describe('ficha en inglés', () => {
  const eventoEn = { kind: 'evento' as const, id: EVENT, idioma: 'en' as const }
  const req = (path: string) => new NextRequest(`https://www.quepintasalta.com.ar${path}`)

  it('parseGonePath: /en/evento/<uuid> exacto, con el idioma; /en/flyer no', () => {
    expect(parseGonePath(`/en/evento/${EVENT}`)).toEqual(eventoEn)
    expect(parseGonePath(`/en/evento/${EVENT.toUpperCase()}/`)).toEqual(eventoEn)
    expect(parseGonePath(`/en/flyer/${FLYER}`)).toBeNull()
    expect(parseGonePath('/en/evento/no-es-uuid')).toBeNull()
    expect(parseGonePath(`/en/evento/${EVENT}/otra`)).toBeNull()
    expect(parseGonePath(`/en/en/evento/${EVENT}`)).toBeNull()
    expect(parseGonePath(`/entradas/evento/${EVENT}`)).toBeNull()
    expect(parseGonePath('/en')).toBeNull()
  })

  it('borrado: 410; cancelado: 410 sin sesión y sigue con sesión', async () => {
    expect(await decideGone(fakeClient(), eventoEn, false)).toEqual({ kind: 'gone' })
    db.events = [{ id: EVENT, status: 'CANCELLED', ai_metadata: null }]
    expect(await decideGone(fakeClient(), eventoEn, false)).toEqual({ kind: 'gone' })
    expect(await decideGone(fakeClient(), eventoEn, true)).toEqual({ kind: 'pass' })
  })

  it('fusionado, publicado o borrador: sigue (la página hace su 308 o su 404)', async () => {
    for (const row of [
      { id: EVENT, status: 'DRAFT', ai_metadata: { merged_into_event_id: KEEP } },
      { id: EVENT, status: 'PUBLISHED', ai_metadata: null },
      { id: EVENT, status: 'DRAFT', ai_metadata: null },
    ]) {
      db.events = [row]
      expect(await decideGone(fakeClient(), eventoEn, false)).toEqual({ kind: 'pass' })
    }
  })

  it('un 308 que salga de la decisión conserva el /en del pedido', async () => {
    // Hoy ninguna decisión de /evento redirige (la del fusionado la hace la
    // página): se prueba con un doble de la decisión de flyer, la única que
    // devuelve un 308, marcada en inglés a mano.
    db.flyers = [{ id: FLYER, status: 'ARCHIVED', ai_metadata: { event_id: EVENT } }]
    db.events = [{ id: EVENT, status: 'PUBLISHED', ai_metadata: null }]
    expect(await decideGone(fakeClient(), { kind: 'flyer', id: FLYER, idioma: 'en' }, false)).toEqual({
      kind: 'redirect',
      location: `/en/evento/${EVENT}`,
    })
  })

  it('middleware: 410 con noindex para /en/evento/<borrado>, y conserva las cookies de sesión', async () => {
    const res = await middleware(req(`/en/evento/${EVENT}`))
    expect(res.status).toBe(410)
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    expect(await res.text()).not.toContain(EVENT)
    expect(res.cookies.get('sb-x-auth-token')?.value).toBe('refrescada')
  })

  it('middleware: /en/evento/<publicado> sigue a la página', async () => {
    db.events = [{ id: EVENT, status: 'PUBLISHED', ai_metadata: null }]
    const res = await middleware(req(`/en/evento/${EVENT}`))
    expect(res.status).toBe(200)
  })

  it('middleware: /en/flyer/<uuid> no consulta nada (no existe en inglés)', async () => {
    db.flyers = [{ id: FLYER, status: 'ARCHIVED', ai_metadata: null }]
    const res = await middleware(req(`/en/flyer/${FLYER}`))
    expect(res.status).toBe(200)
    expect(db.selects).toEqual([])
  })
})
