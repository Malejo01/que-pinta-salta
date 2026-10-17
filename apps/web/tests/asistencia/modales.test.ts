/**
 * "Voy / Me interesa" en los dos modales de la web (R38-c, tarea 38c-a):
 * el modal de la ruta interceptada (`app/@modal/(.)evento/[id]/page.tsx` +
 * `components/event-modal-wrapper.tsx`) y el de Buscar
 * (`components/event-modal.tsx` + `components/botones-asistencia-diferidos.tsx`).
 *
 * Sin jsdom ni Testing Library (no hay en `apps/web`): funciones puras y
 * detectores estáticos sobre el código real, con el mismo estilo que
 * `web.test.ts`.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

// El componente diferido importa la server action y los botones: no hace
// falta ni la base ni el árbol de React para probar la función pura.
vi.mock('@/lib/asistencia', () => ({ obtenerAsistencia: vi.fn() }))
vi.mock('@/components/botones-asistencia', () => ({ BotonesAsistencia: () => null }))

import { debeCargarAsistencia } from '../../components/botones-asistencia-diferidos'
import { transformEvent } from '@qps/core/home/transform'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function leer(ruta: string): string {
  return readFileSync(`${WEB_ROOT}/${ruta}`, 'utf8')
}

/** Comentarios de línea y de bloque (también los de JSX) vaciados. */
function sinComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')
}

const RUTA_MODAL_INTERCEPTADO = 'app/@modal/(.)evento/[id]/page.tsx'
const RUTA_WRAPPER = 'components/event-modal-wrapper.tsx'
const RUTA_EVENT_MODAL = 'components/event-modal.tsx'
const RUTA_DIFERIDOS = 'components/botones-asistencia-diferidos.tsx'

describe('debeCargarAsistencia', () => {
  it('abierto + PUBLISHED: true (el único caso)', () => {
    expect(debeCargarAsistencia({ abierto: true, status: 'PUBLISHED' })).toBe(true)
  })

  it('modal cerrado: false, aunque sea PUBLISHED', () => {
    expect(debeCargarAsistencia({ abierto: false, status: 'PUBLISHED' })).toBe(false)
  })

  it('sin status (flyer de Instagram o película): false', () => {
    expect(debeCargarAsistencia({ abierto: true })).toBe(false)
    expect(debeCargarAsistencia({ abierto: true, status: undefined })).toBe(false)
  })

  it.each(['CANCELLED', 'PAST', 'DRAFT', 'PENDING_REVIEW'])('%s: false', (status) => {
    expect(debeCargarAsistencia({ abierto: true, status })).toBe(false)
  })
})

describe('transformEvent copia status (lo que lee el modal de Buscar)', () => {
  it('el status del evento llega al DisplayEvent', () => {
    // Fixture mínimo e inventado: transformEvent solo lee estos campos.
    const evento = {
      id: 'evento-de-prueba-1',
      slug: 'evento-de-prueba-1',
      title: 'Evento de prueba',
      start_date: '2030-10-10T21:00:00-03:00',
      is_free: true,
      price_min: 0,
      image_url: null,
      description: null,
      short_description: null,
      ticket_url: null,
      age_restriction: null,
      is_featured: false,
      status: 'PUBLISHED',
      venue: null,
      category: { slug: 'musica', name: 'Música' },
    } as unknown as Parameters<typeof transformEvent>[0]
    expect(transformEvent(evento).status).toBe('PUBLISHED')
  })
})

describe('botones-asistencia-diferidos.tsx: detector estático', () => {
  const codigo = sinComentarios(leer(RUTA_DIFERIDOS))
  const efecto = /useEffect\(\s*\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[abierto,\s*eventId,\s*status\]\s*\)/.exec(codigo)

  it('es un componente cliente', () => {
    expect(leer(RUTA_DIFERIDOS).startsWith('"use client"')).toBe(true)
  })

  it('tiene un useEffect con dependencias [abierto, eventId, status]', () => {
    expect(efecto, 'no se encontró el useEffect esperado').not.toBeNull()
  })

  it('el efecto sale temprano con debeCargarAsistencia, antes de cualquier llamada a obtenerAsistencia', () => {
    const cuerpo = efecto![1]
    const salida = cuerpo.search(/if\s*\(\s*!debeCargarAsistencia\s*\(/)
    const llamada = cuerpo.search(/obtenerAsistencia\s*\(/)
    expect(salida).toBeGreaterThanOrEqual(0)
    expect(llamada).toBeGreaterThan(salida)
  })

  it('hay bandera de cancelación: se activa en el cleanup y se mira antes de guardar la respuesta', () => {
    const cuerpo = efecto![1]
    expect(cuerpo).toMatch(/let\s+cancelado\s*=\s*false/)
    expect(cuerpo).toMatch(/return\s*\(\)\s*=>\s*\{[\s\S]*?cancelado\s*=\s*true/)
    expect(cuerpo).toMatch(/if\s*\(\s*!cancelado\s*\)\s*setResultado/)
  })

  it('si la promesa tira, hace console.error con el prefijo del componente', () => {
    expect(codigo).toMatch(/\.catch\([\s\S]*?console\.error\(\s*"\[BotonesAsistenciaDiferidos\]/)
  })

  it('no dibuja <BotonesAsistencia mientras carga ni con ok: false (retorna null antes)', () => {
    const corte = codigo.search(/<BotonesAsistencia\b/)
    expect(corte).toBeGreaterThan(0)
    const antes = codigo.slice(0, corte)
    // Sin resultado, con el de OTRO evento (el modal cambió de evento) o con
    // ok: false, no se dibuja nada.
    expect(antes).toMatch(
      /if\s*\(\s*resultado\s*===\s*null\s*\|\|\s*resultado\.eventId\s*!==\s*eventId\s*\|\|\s*!resultado\.respuesta\.ok\s*\)\s*return\s+null/,
    )
    expect(antes).toMatch(/if\s*\(\s*!debeCargarAsistencia\([^)]*\)\s*\)\s*return\s+null/)
  })

  it('el gate sale de debenMostrarseBotonesAsistencia (import de "@/lib/asistencia-visibilidad")', () => {
    expect(codigo).toMatch(
      /import\s*\{[^}]*\bdebenMostrarseBotonesAsistencia\b[^}]*\}\s*from\s*['"]@\/lib\/asistencia-visibilidad['"]/,
    )
  })
})

describe('modal interceptado (app/@modal/(.)evento/[id]/page.tsx)', () => {
  const codigo = sinComentarios(leer(RUTA_MODAL_INTERCEPTADO))

  it('importa obtenerAsistencia de "@/lib/asistencia"', () => {
    expect(codigo).toMatch(/import\s*\{[^}]*\bobtenerAsistencia\b[^}]*\}\s*from\s*['"]@\/lib\/asistencia['"]/)
  })

  it('importa debenMostrarseBotonesAsistencia de "@/lib/asistencia-visibilidad"', () => {
    expect(codigo).toMatch(
      /import\s*\{[^}]*\bdebenMostrarseBotonesAsistencia\b[^}]*\}\s*from\s*['"]@\/lib\/asistencia-visibilidad['"]/,
    )
  })

  it('la llamada a obtenerAsistencia está condicionada por debenMostrarseBotonesAsistencia(', () => {
    expect(codigo).toMatch(/debenMostrarseBotonesAsistencia\([^)]*\)\s*\?\s*await\s+obtenerAsistencia\(/)
  })

  it('pasa haySesion={!!user} (no un literal) y las cantidades y la marca', () => {
    expect(codigo).toMatch(/haySesion=\{!!user\}/)
    expect(codigo).not.toMatch(/haySesion=\{true\}/)
    expect(codigo).toMatch(/cantidadesAsistencia=\{cantidadesAsistencia\}/)
    expect(codigo).toMatch(/marcaAsistencia=\{marcaAsistencia\}/)
  })
})

describe('event-modal-wrapper.tsx', () => {
  const codigo = sinComentarios(leer(RUTA_WRAPPER))

  it('misma condición que event-detail-page.tsx: cantidadesAsistencia && debenMostrarseBotonesAsistencia(...) && <BotonesAsistencia', () => {
    expect(codigo).toMatch(
      /\{\s*cantidadesAsistencia\s*&&\s*debenMostrarseBotonesAsistencia\s*\([^)]*\)\s*&&[\s\S]{0,80}?<BotonesAsistencia/,
    )
  })

  it('importa debenMostrarseBotonesAsistencia de "@/lib/asistencia-visibilidad"', () => {
    expect(codigo).toMatch(
      /import\s*\{[^}]*\bdebenMostrarseBotonesAsistencia\b[^}]*\}\s*from\s*['"]@\/lib\/asistencia-visibilidad['"]/,
    )
  })

  it('los botones van DESPUÉS de "Comprar tickets"', () => {
    expect(codigo.indexOf('Comprar tickets')).toBeGreaterThan(0)
    expect(codigo.indexOf('<BotonesAsistencia')).toBeGreaterThan(codigo.indexOf('Comprar tickets'))
  })
})

describe('event-modal.tsx (Buscar)', () => {
  const codigo = sinComentarios(leer(RUTA_EVENT_MODAL))

  it('usa <BotonesAsistenciaDiferidos con abierto={open} y haySesion={haySesion}', () => {
    expect(codigo).toMatch(/<BotonesAsistenciaDiferidos[\s\S]*?abierto=\{open\}[\s\S]*?haySesion=\{haySesion\}/)
  })

  it('pasa el status del evento', () => {
    expect(codigo).toMatch(/status=\{event\.status\}/)
  })

  it('los botones van DESPUÉS de "Comprar tickets"', () => {
    expect(codigo.indexOf('<BotonesAsistenciaDiferidos')).toBeGreaterThan(codigo.indexOf('Comprar tickets'))
  })

  it('no importa obtenerAsistencia directo (lo hace el diferido)', () => {
    expect(codigo).not.toMatch(/\bobtenerAsistencia\b/)
  })
})

describe('Buscar sabe si hay sesión', () => {
  it('page.tsx lee auth.getUser() y pasa haySesion={!!...} a BuscarContent', () => {
    const codigo = sinComentarios(leer('app/buscar/page.tsx'))
    expect(codigo).toMatch(/supabase\.auth\.getUser\(\)/)
    expect(codigo).toMatch(/haySesion=\{!!userResult\.data\.user\}/)
  })

  it('buscar-content.tsx se lo pasa a EventModal', () => {
    const codigo = sinComentarios(leer('app/buscar/buscar-content.tsx'))
    expect(codigo).toMatch(/<EventModal[\s\S]*?haySesion=\{haySesion\}/)
  })
})

describe('sin sesión no se escribe nada: ningún modal importa marcarAsistencia', () => {
  it.each([RUTA_MODAL_INTERCEPTADO, RUTA_WRAPPER, RUTA_EVENT_MODAL, RUTA_DIFERIDOS])('%s', (ruta) => {
    expect(sinComentarios(leer(ruta))).not.toMatch(/\bmarcarAsistencia\b/)
  })
})

describe('una sola copia de la lógica y de los textos', () => {
  it.each([RUTA_MODAL_INTERCEPTADO, RUTA_WRAPPER, RUTA_EVENT_MODAL, RUTA_DIFERIDOS])(
    '%s: ni === "PUBLISHED" ni textos propios de los botones',
    (ruta) => {
      const codigo = sinComentarios(leer(ruta))
      expect(codigo).not.toMatch(/===\s*['"]PUBLISHED['"]/)
      expect(codigo).not.toMatch(/['"`>]\s*Voy\s*['"`<]/)
      expect(codigo).not.toMatch(/Me interesa/)
      expect(codigo).not.toMatch(/Entrá para marcar/)
    },
  )
})

describe('sin caché: la asistencia se lee fresca en cada pedido', () => {
  const PROHIBIDO = [
    /\bcache\s*\(/,
    /\bunstable_cache\b/,
    /['"]use cache['"]/,
    /export\s+const\s+revalidate\b/,
    /export\s+const\s+dynamic\s*=\s*['"]force-static['"]/,
  ]

  it.each(['lib/asistencia.ts', RUTA_MODAL_INTERCEPTADO, 'app/evento/[id]/page.tsx'])('%s', (ruta) => {
    const codigo = sinComentarios(leer(ruta))
    for (const patron of PROHIBIDO) {
      expect(codigo, `${ruta} matchea ${patron}`).not.toMatch(patron)
    }
  })
})
