// Paridad de "Mis eventos" (R47, tarea 47-q, QPS-197): con los mismos datos
// de entrada, la web (`separarMisEventos` tal como la usa
// `apps/web/app/favoritos/page.tsx`: armarFavoritos + separarMisEventos
// sobre las filas crudas de la base) y la app (`obtenerFavoritos`,
// `lib/favoritos.ts`) tienen que dar los MISMOS ids en ✓ Voy y en
// ♥ Guardados.
//
// Las dos funciones de core (`armarFavoritos`, `separarMisEventos`,
// `idsDeEventosVoy`) son el mismo código para los dos lados; lo que este
// test verifica es que, con la MISMA fila cruda, la web (que llama a esas
// funciones directo) y la app (que las llama por dentro de
// `obtenerFavoritos`, después de leer de Supabase) terminan en el mismo
// resultado — no que cada una "calcule algo parecido".
import { describe, expect, it, vi } from 'vitest'
import { armarFavoritos, type EventoFavorito } from '@qps/core/favoritos/armar'
import { idsDeEventosVoy, separarMisEventos } from '@qps/core/favoritos/mis-eventos'
import type { FlyerWithAccount } from '@qps/core/instagram-config'
import type { CinemaMovie } from '@qps/core/types'

const USER_ID = 'usuario-paridad-mis-eventos'

// Tres eventos: E1 (favorito Y voy), E2 (solo favorito), E3 (solo voy, un
// "Voy viejo" sin su fila de favorito — tiene que aparecer igual, ver
// `separarMisEventos`/`idsDeEventosVoy`).
function filaEvento(id: string): EventoFavorito {
  return {
    id,
    slug: `evento-${id}`,
    title: `Evento de prueba ${id}`,
    description: null,
    short_description: null,
    start_date: '2099-01-01T20:00:00-03:00', // muy en el futuro: siempre vigente
    end_date: null,
    price_min: 0,
    is_free: true,
    image_url: null,
    ticket_url: null,
    age_restriction: 0,
    is_featured: false,
    status: 'PUBLISHED',
    category: { slug: 'teatro', name: 'Teatro' },
    venue: { name: 'Venue de Prueba', address: 'Calle de Prueba 123' },
  } as unknown as EventoFavorito
}

function filaFlyer(id: string): FlyerWithAccount {
  return {
    id,
    account_id: `cuenta-${id}`,
    ig_post_url: `https://instagram.com/p/${id}`,
    ig_post_type: 'IMAGE',
    caption: 'Caption de prueba',
    published_at: '2030-10-01T21:00:00-03:00',
    original_image_url: null,
    storage_image_path: null,
    storage_image_url: null,
    status: 'ACTIVE',
    fetched_at: '2030-10-01T21:05:00Z',
    archived_at: null,
    created_at: '2030-10-01T21:05:00Z',
    venue_name: null,
    maps_url: null,
    category: 'boliches',
    price_min: 0,
    is_free: false,
    account: {
      id: `cuenta-${id}`,
      username: `cuenta_${id}`,
      display_name: `Cuenta de prueba ${id}`,
      profile_pic_url: null,
      instagram_url: `https://instagram.com/cuenta_${id}`,
      is_active: true,
      notes: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      default_venue_name: null,
      default_maps_url: null,
      default_category: 'boliches',
    },
  } as unknown as FlyerWithAccount
}

function filaPelicula(id: string): CinemaMovie {
  return {
    id,
    slug: `pelicula-${id}`,
    title: `Película de prueba ${id}`,
    poster_url: null,
    is_currently_showing: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    showings: { 'cine-de-prueba': { name: 'Cine de Prueba', booking_url: 'https://cine-de-prueba.test', formats: [] } },
  } as unknown as CinemaMovie
}

const E1 = 'evento-1-voy-y-favorito'
const E2 = 'evento-2-solo-favorito'
const E3 = 'evento-3-voy-viejo-sin-favorito'
const F1 = 'flyer-1'
const M1 = 'pelicula-1'

const eventosRaw = [filaEvento(E1), filaEvento(E2), filaEvento(E3)]
const flyersRaw = [filaFlyer(F1)]
const peliculasRaw = [filaPelicula(M1)]
const favoritosRaw = [
  { event_id: E1, instagram_flyer_id: null, cinema_movie_id: null },
  { event_id: E2, instagram_flyer_id: null, cinema_movie_id: null },
  { event_id: null, instagram_flyer_id: F1, cinema_movie_id: null },
  { event_id: null, instagram_flyer_id: null, cinema_movie_id: M1 },
]
const voyRaw = [
  { event_id: E1, kind: 'voy' },
  { event_id: E3, kind: 'voy' },
]

// ---------------------------------------------------------------------------
// El lado "web": armarFavoritos + separarMisEventos directo sobre las filas
// crudas, igual que app/favoritos/page.tsx (sin red, sin Supabase: esas
// funciones son puras).
// ---------------------------------------------------------------------------
function calcularComoLaWeb() {
  const ahora = new Date()
  const armado = armarFavoritos(
    { eventos: eventosRaw, flyers: flyersRaw, peliculas: peliculasRaw, categoryNameBySlug: new Map() },
    ahora,
  )
  const idsVoy = idsDeEventosVoy(voyRaw)
  const { voy, guardados } = separarMisEventos(armado, idsVoy)
  const idsGuardados = [...guardados.flexibles, ...guardados.porDia.flatMap((grupo) => grupo.items)].map((e) => e.id)
  return { idsVoy: voy.map((e) => e.id), idsGuardados }
}

// ---------------------------------------------------------------------------
// El lado "app": obtenerFavoritos (lib/favoritos.ts) con un doble de
// Supabase que devuelve EXACTAMENTE las mismas filas crudas de arriba.
// ---------------------------------------------------------------------------
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      const builder: Record<string, unknown> = {}
      if (tabla === 'user_favorites') {
        builder.select = () => builder
        builder.eq = () => builder
        builder.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: favoritosRaw, error: null }).then(resolve)
        return builder
      }
      if (tabla === 'event_attendance') {
        builder.select = () => builder
        builder.eq = () => builder
        builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: voyRaw, error: null }).then(resolve)
        return builder
      }
      if (tabla === 'events') {
        builder.select = () => builder
        builder.in = () => builder
        builder.eq = () => builder
        builder.or = () => builder
        builder.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: eventosRaw, error: null }).then(resolve)
        return builder
      }
      if (tabla === 'instagram_flyers') {
        builder.select = () => builder
        builder.in = () => builder
        builder.eq = () => builder
        builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: flyersRaw, error: null }).then(resolve)
        return builder
      }
      if (tabla === 'cinema_movies') {
        builder.select = () => builder
        builder.in = () => builder
        builder.eq = () => builder
        builder.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: peliculasRaw, error: null }).then(resolve)
        return builder
      }
      if (tabla === 'categories') {
        builder.select = () => builder
        builder.order = () => builder
        builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
        return builder
      }
      throw new Error(`tabla inesperada en el doble de paridad-mis-eventos: ${tabla}`)
    },
  },
}))

import { obtenerFavoritos } from '../lib/favoritos'

describe('paridad "Mis eventos": web (armarFavoritos + separarMisEventos) vs app (obtenerFavoritos)', () => {
  it('dan los mismos ids en ✓ Voy', async () => {
    const web = calcularComoLaWeb()
    const app = await obtenerFavoritos(USER_ID)

    expect(app.ok).toBe(true)
    if (!app.ok) throw new Error('no debería fallar')
    expect(app.voy.map((e) => e.id).sort()).toEqual(web.idsVoy.sort())
    // Sanidad: el fixture tiene que producir Voy (si no, la comparación de
    // arriba pasaría en verde con dos arreglos vacíos sin haber probado nada).
    expect(web.idsVoy.length).toBeGreaterThan(0)
    expect(web.idsVoy.sort()).toEqual([E1, E3].sort())
  })

  it('dan los mismos ids en ♥ Guardados (sin repetir los que ya están en Voy)', async () => {
    const web = calcularComoLaWeb()
    const app = await obtenerFavoritos(USER_ID)

    expect(app.ok).toBe(true)
    if (!app.ok) throw new Error('no debería fallar')
    expect(app.eventos.map((e) => e.id).sort()).toEqual(web.idsGuardados.sort())
    expect(web.idsGuardados.length).toBeGreaterThan(0)
    // E2 (solo favorito), el flyer y la película: nunca E1 (que está en Voy).
    expect(web.idsGuardados).not.toContain(E1)
    expect(web.idsGuardados).toContain(E2)
  })

  it('juntos, Voy y Guardados cubren exactamente los mismos ids en los dos lados (ninguno se pierde, ninguno se duplica entre listas)', async () => {
    const web = calcularComoLaWeb()
    const app = await obtenerFavoritos(USER_ID)
    expect(app.ok).toBe(true)
    if (!app.ok) throw new Error('no debería fallar')

    const todosWeb = new Set([...web.idsVoy, ...web.idsGuardados])
    const todosApp = new Set([...app.voy.map((e) => e.id), ...app.eventos.map((e) => e.id)])
    expect([...todosApp].sort()).toEqual([...todosWeb].sort())
    // E1, E2, E3, el flyer y la película: 5 ids en total, cada uno una sola vez.
    expect(todosWeb.size).toBe(5)
    expect(web.idsVoy.length + web.idsGuardados.length).toBe(todosWeb.size)
  })
})
