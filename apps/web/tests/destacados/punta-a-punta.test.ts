/**
 * Punta a punta de "destacados" (R50, QPS-239/-240, tarea 50-q — cruza las
 * tareas 50-a/b/c): la cadena completa, con dobles, sin red ni base.
 *
 *   1. un admin destaca un evento hasta mañana (`destacarEvento`, con un
 *      cliente de Supabase falso) -> el `update` lleva el `featured_until`
 *      correcto;
 *   2. la fila que "ahora está en la base" (simulada a mano con ese mismo
 *      `featured_until`, SIN volver a llamar a ninguna acción) pasa por
 *      `transformEvent` (`@qps/core/home/transform`) y sale con
 *      `isFeatured: true`;
 *   3. `selectCarouselEvents` (`@qps/core/home/carousel`) la pone primera;
 *   4. `groupByCategory` (`@qps/core/home/filters`) también la pone primera
 *      en la fila de su categoría (en un modo que NO es "hoy": con "hoy",
 *      `arrangeRowsForToday` reordena por hora y pisa el "destacados
 *      primero" — ver el comentario de `groupByCategory` y el dato de la
 *      tarea 50-a en `ops/rondas/50-destacados/progreso.md`, no se repite
 *      ese caso acá);
 *   5. con "ahora" = pasado mañana, la MISMA fila cruda (nadie escribió nada
 *      en la base) ya no está destacada en ningún punto de la cadena. ESTE
 *      es el test que más vale del archivo: demuestra que el vencimiento es
 *      automático y que no hace falta ningún cron.
 *
 * TRAMPA DEL RELOJ (documentada en el encargo y en el progreso de 50-a):
 * `transformEvent` compara `featured_until` contra el RELOJ DEL SISTEMA (su
 * único `new Date()` sin argumento, que no se puede inyectar: ver el
 * comentario de esa función). Una fecha fija "futura" tipo "2030-..." se cae
 * sola con el paso del tiempo real. Por eso todo este archivo corre bajo
 * `vi.useFakeTimers()` + `vi.setSystemTime(...)`: el reloj del sistema queda
 * CONGELADO en el valor que elige cada test, sin importar qué año sea de
 * verdad cuando se corra el archivo. `vi.setSystemTime` es lo que mueve el
 * "ahora" entre los pasos 1-4 y el paso 5, no una fecha hardcodeada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

const createClient = vi.fn()
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- firma variádica a propósito
const createAdminClient = vi.fn((..._args: unknown[]) => {
  throw new Error('destacados-actions.ts no debería usar el cliente admin')
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...a: unknown[]) => createClient(...a),
  createAdminClient: (...a: unknown[]) => createAdminClient(...a),
}))

import { destacarEvento } from '@/lib/admin/destacados-actions'
import { finDeDiaSalta } from '@qps/core/events/destacados'
import { transformEvent } from '@qps/core/home/transform'
import { selectCarouselEvents } from '@qps/core/home/carousel'
import { groupByCategory } from '@qps/core/home/filters'
import type { EventWithRelations } from '@qps/core/home/types'
import type { Category, Venue } from '@qps/core/types'

// ---------------------------------------------------------------------------
// Fixtures locales (copia propia: QPS-250, no se importa de otro *.test.ts).
// ---------------------------------------------------------------------------

const ADMIN_USER = { id: '99999999-9999-4999-8999-999999999999' }
const EVENTO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function makeCategory(slug: string, name: string): Category {
  return { id: `cat-${slug}`, slug, name, color: null, icon: null, created_at: null }
}

function makeVenue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: overrides.id ?? 'venue-de-prueba',
    name: overrides.name ?? 'Venue de Prueba',
    address: overrides.address ?? 'Avenida de Prueba 123',
    canonical_venue_id: overrides.canonical_venue_id ?? null,
    capacity: overrides.capacity ?? null,
    created_at: overrides.created_at ?? null,
    geocode_source: overrides.geocode_source ?? null,
    geocoded_at: overrides.geocoded_at ?? null,
    google_maps_url: overrides.google_maps_url ?? null,
    is_placeholder: overrides.is_placeholder ?? false,
    latitude: overrides.latitude ?? null,
    longitude: overrides.longitude ?? null,
    merged_at: overrides.merged_at ?? null,
    phone: overrides.phone ?? null,
    slug: overrides.slug ?? null,
    updated_at: overrides.updated_at ?? '2026-01-01T00:00:00Z',
  }
}

function makeEvent(overrides: Partial<EventWithRelations> & { id: string; start_date: string }): EventWithRelations {
  const category = overrides.category ?? makeCategory('boliches', 'Boliches')
  const venue = overrides.venue !== undefined ? overrides.venue : makeVenue()
  return {
    id: overrides.id,
    title: overrides.title ?? 'Evento de Prueba',
    slug: overrides.slug ?? `evento-de-prueba-${overrides.id}`,
    description: overrides.description ?? null,
    short_description: overrides.short_description ?? null,
    category_id: category.id,
    venue_id: venue?.id ?? null,
    image_url: overrides.image_url ?? null,
    gallery_urls: overrides.gallery_urls ?? [],
    start_date: overrides.start_date,
    end_date: overrides.end_date ?? null,
    is_recurring: overrides.is_recurring ?? false,
    recurrence_rule: overrides.recurrence_rule ?? null,
    price_min: overrides.price_min ?? 0,
    price_max: overrides.price_max ?? null,
    is_free: overrides.is_free ?? false,
    ticket_url: overrides.ticket_url ?? null,
    age_restriction: overrides.age_restriction ?? 0,
    tags: overrides.tags ?? [],
    status: overrides.status ?? 'PUBLISHED',
    is_featured: overrides.is_featured ?? false,
    featured_until: overrides.featured_until ?? null,
    view_count: overrides.view_count ?? 0,
    created_by: overrides.created_by ?? null,
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-01-01T00:00:00Z',
    category,
    venue,
  }
}

/**
 * Cliente de Supabase falso: solo lo que necesita `destacarEvento` cuando
 * valida bien (sesión admin + el `update().eq('id', ...).select('id')` de
 * `events`). No reimplementa todo `construirCliente` de
 * `tests/admin/destacados-actions.test.ts` (ese archivo no es de esta
 * tarea, y QPS-250 prohíbe importar de otro `*.test.ts`): esta es una copia
 * mínima, propia, con solo el camino feliz que hace falta para este archivo.
 */
function clienteAdminFalso() {
  const updateCalls: Array<{ valores: Record<string, unknown>; filtroId: string }> = []
  const client = {
    auth: { getUser: async () => ({ data: { user: ADMIN_USER } }) },
    from(tabla: string) {
      if (tabla === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { role: 'ADMIN' } }) }),
          }),
        }
      }
      if (tabla === 'events') {
        return {
          update: (valores: Record<string, unknown>) => ({
            eq: (columna: string, valor: string) => {
              if (columna !== 'id') throw new Error(`se esperaba filtrar por "id", filtró por "${columna}"`)
              updateCalls.push({ valores, filtroId: valor })
              return { select: async () => ({ data: [{ id: valor }], error: null }) }
            },
          }),
        }
      }
      throw new Error('tabla inesperada en el cliente falso: ' + tabla)
    },
  }
  return { client, updateCalls }
}

beforeEach(() => {
  createClient.mockReset()
  createAdminClient.mockClear()
  revalidatePath.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Punta a punta: destacar hasta mañana se refleja en toda la cadena, y vence solo (sin cron, sin reescribir nada)', () => {
  // "Ahora" congelado con fake timers (ver el comentario del encabezado):
  // CUALQUIER fecha fija sirve porque el reloj del sistema queda fijo en
  // este valor durante todo el test, no importa qué fecha sea de verdad.
  const AHORA_INICIAL = new Date('2030-10-10T12:00:00-03:00')
  const MANIANA = '2030-10-11' // día calendario siguiente, en Salta (UTC-3 fijo)
  const PASADO_MANIANA = new Date('2030-10-12T12:00:00-03:00')

  it('el evento destacado sale primero en el carrusel y en su fila; con "ahora" = pasado mañana, deja de estar destacado sin que nadie escriba nada', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(AHORA_INICIAL)

    const db = clienteAdminFalso()
    createClient.mockResolvedValue(db.client)

    // -----------------------------------------------------------------
    // 1. El admin destaca el evento hasta mañana.
    // -----------------------------------------------------------------
    const resultado = await destacarEvento({ eventId: EVENTO_ID, hasta: MANIANA })
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) throw new Error('no debería llegar acá: destacarEvento falló')

    const featuredUntilEsperado = finDeDiaSalta(MANIANA)
    expect(resultado.featuredUntil).toBe(featuredUntilEsperado)

    expect(db.updateCalls).toHaveLength(1)
    expect(db.updateCalls[0].filtroId).toBe(EVENTO_ID)
    expect(db.updateCalls[0].valores.featured_until).toBe(featuredUntilEsperado)

    // -----------------------------------------------------------------
    // 2-4. La fila que "ahora está en la base" (simulada con el MISMO
    // featured_until que acaba de escribir el update, sin volver a llamar a
    // ninguna acción) pasa por transformEvent, selectCarouselEvents y
    // groupByCategory. Un "sibling" en la misma categoría, nunca destacado,
    // sirve de testigo: si el destacado va "primero" es POR estar destacado,
    // no por casualidad del orden de entrada.
    // -----------------------------------------------------------------
    const categoria = makeCategory('boliches', 'Boliches')
    const sibling = makeEvent({
      id: 'sibling-nunca-destacado',
      category: categoria,
      start_date: '2030-11-15T21:00:00-03:00',
      featured_until: null,
    })
    const filaCruda = makeEvent({
      id: EVENTO_ID,
      category: categoria,
      start_date: '2030-11-20T21:00:00-03:00',
      // El update de destacarEvento() también escribe is_featured: true (ver
      // el comentario de destacados-actions.ts): se incluye acá para que el
      // fixture sea fiel a lo que de verdad queda en la base, aunque
      // transformEvent/estaDestacado NO lo miren (es legado).
      is_featured: true,
      featured_until: resultado.featuredUntil,
    })

    const displaySibling = transformEvent(sibling)
    const displayDestacado = transformEvent(filaCruda)

    expect(displaySibling.isFeatured).toBe(false)
    expect(displayDestacado.isFeatured).toBe(true)

    // 3. selectCarouselEvents lo pone primero.
    const carrusel = selectCarouselEvents([displaySibling, displayDestacado], [categoria], new Date())
    expect(carrusel.map((e) => e.id)).toEqual([EVENTO_ID, 'sibling-nunca-destacado'])

    // 4. groupByCategory también lo pone primero en su fila (modo "sin
    // filtro de fecha": NO es "hoy", así que arrangeRowsForToday no pisa el
    // orden — ver el comentario del encabezado).
    const filtrados = [displaySibling, displayDestacado] // orden de entrada: el que traería filterEvents ya ordenado por fecha asc
    const filas = groupByCategory([categoria], filtrados, null, null, new Date())
    expect(filas).toHaveLength(1)
    expect(filas[0].category).toBe('boliches')
    expect(filas[0].events.map((e) => e.id)).toEqual([EVENTO_ID, 'sibling-nunca-destacado'])

    // -----------------------------------------------------------------
    // 5. EL TEST QUE MÁS VALE: con "ahora" = pasado mañana, la MISMA fila
    // cruda (filaCruda, sin tocar) ya no está destacada en ningún punto de
    // la cadena. Nadie escribió nada en la base entre este paso y el
    // anterior: solo se movió el reloj del sistema con vi.setSystemTime.
    // -----------------------------------------------------------------
    vi.setSystemTime(PASADO_MANIANA)

    const displayVencido = transformEvent(filaCruda) // la MISMA fila cruda de arriba
    expect(displayVencido.isFeatured).toBe(false)

    // El carrusel ya no le da el cupo de "destacado": como sibling arranca
    // antes, el evento vencido pierde también el cupo de relleno por
    // categoría (ese cupo es uno solo por categoría, el más próximo) y
    // queda totalmente afuera del carrusel.
    const carruselVencido = selectCarouselEvents([displaySibling, displayVencido], [categoria], new Date())
    expect(carruselVencido.map((e) => e.id)).toEqual(['sibling-nunca-destacado'])

    // Y en su fila de categoría, vuelve a ordenarse por el criterio normal
    // (nadie destacado: se conserva el orden de entrada).
    const filasVencidas = groupByCategory([categoria], [displaySibling, displayVencido], null, null, new Date())
    expect(filasVencidas[0].events.map((e) => e.id)).toEqual(['sibling-nunca-destacado', EVENTO_ID])
  })
})

describe('is_featured: true con featured_until: null no está destacado en ningún punto de la cadena', () => {
  const AHORA = new Date('2030-10-10T12:00:00-03:00')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AHORA)
  })

  it('transformEvent -> isFeatured: false, y nunca gana el cupo "primero" contra un destacado real', () => {
    const categoria = makeCategory('teatro', 'Teatro')

    // Legado: is_featured quedó en true (por ejemplo, de antes de QPS-239),
    // pero featured_until es null: NO cuenta como destacado hoy.
    const legado = makeEvent({
      id: 'legado-is-featured-true',
      category: categoria,
      start_date: '2030-11-05T21:00:00-03:00', // arranca ANTES que el destacado real
      is_featured: true,
      featured_until: null,
    })
    const destacadoReal = makeEvent({
      id: 'destacado-real',
      category: categoria,
      start_date: '2030-11-20T21:00:00-03:00', // arranca DESPUÉS, pero está destacado
      is_featured: true,
      featured_until: new Date('2030-12-01T00:00:00-03:00').toISOString(),
    })

    const displayLegado = transformEvent(legado)
    const displayDestacadoReal = transformEvent(destacadoReal)

    // El punto central del test: is_featured: true no alcanza.
    expect(displayLegado.isFeatured).toBe(false)
    expect(displayDestacadoReal.isFeatured).toBe(true)

    // En el carrusel: el legado NO entra por la vía "destacado" (nowMs
    // relativo a AHORA, los dos eventos son futuros). SÍ puede entrar por el
    // relleno de categoría (como cualquier evento próximo no destacado), pero
    // nunca gana el cupo "destacado" ni el primer lugar: ese cupo es,
    // siempre, para `destacado-real` (el único con `featured_until` vigente).
    const carrusel = selectCarouselEvents([displayLegado, displayDestacadoReal], [categoria], new Date())
    expect(carrusel.map((e) => e.id)).toEqual(['destacado-real', 'legado-is-featured-true'])

    // En su fila de categoría: el legado (con fecha ANTERIOR) quedaría
    // primero si is_featured mandara algo; como no manda nada, el destacado
    // real (con featured_until vigente) va primero igual.
    const filas = groupByCategory([categoria], [displayLegado, displayDestacadoReal], null, null, new Date())
    expect(filas[0].events.map((e) => e.id)).toEqual(['destacado-real', 'legado-is-featured-true'])
  })
})
