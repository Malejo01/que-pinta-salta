/**
 * "Voy" / "+ Seguir" en los dos modales de la web (R38-c, tarea 38c-a;
 * adaptado en la R47, tarea 47-c, QPS-197/QPS-199 — ver también
 * `fila-render.test.ts` y `orden-ficha.test.ts`): el modal de la ruta
 * interceptada (`app/@modal/(.)evento/[id]/page.tsx` +
 * `components/event-modal-wrapper.tsx`) y el de Buscar
 * (`components/event-modal.tsx` + `components/botones-asistencia-diferidos.tsx`).
 *
 * Sin DOM: funciones puras y detectores estáticos sobre el código real, con
 * el mismo estilo que `web.test.ts`. (Cuando se escribió, jsdom y Testing
 * Library no estaban instalados en `apps/web`; desde la R61 sí lo están y
 * hay tests con DOM real en `tests/dom/`. Para lo que fija este archivo —que
 * el modal importe y condicione la llamada— el detector estático sigue
 * siendo la herramienta correcta: un DOM no vería nada de eso.)
 *
 * Guardas del #65 que este archivo sigue fijando (no se pierden en esta
 * adaptación): que el modal interceptado importe `obtenerAsistencia` de
 * `"@/lib/asistencia"` y que la llamada esté condicionada por
 * `debenMostrarseBotonesAsistencia(...)`.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { es } from '@/lib/i18n/diccionarios/es'

// El componente diferido importa la server action, la fila y los botones de
// Seguir: no hace falta ni la base ni el árbol de React para probar la
// función pura (`debeCargarAsistencia`).
vi.mock('@/lib/asistencia', () => ({ obtenerAsistencia: vi.fn() }))
vi.mock('@/lib/actions/radar', () => ({ obtenerSeguimientoDeEvento: vi.fn(), cambiarSeguimiento: vi.fn() }))
vi.mock('@/components/fila-acciones-evento', () => ({ FilaAccionesEvento: () => null }))
vi.mock('@/components/boton-seguir', () => ({ BotonSeguir: () => null }))

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

/**
 * El recorte del código entre dos marcas (la segunda es opcional: hasta el
 * final si falta). Sin `expect` acá adentro a propósito: se llama durante
 * la ejecución del cuerpo de los `describe` (antes de cualquier `it`), y un
 * `expect` ahí arriba de un `it` reporta un error de colección confuso en
 * vez de una falla de test prolija. Si la marca no está, tira un `Error`
 * común (lo que corresponde a un bug en el propio test, no en el código
 * que se está probando).
 */
function recorte(codigo: string, desde: string, hasta?: string): string {
  const inicio = codigo.indexOf(desde)
  if (inicio < 0) throw new Error(`recorte: no se encontró "${desde}"`)
  const fin = hasta ? codigo.indexOf(hasta, inicio + desde.length) : -1
  return codigo.slice(inicio, fin === -1 ? codigo.length : fin)
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
  // Dos componentes en el archivo (47-c): la fila (♥/Voy/Compartir) y los
  // botones de Seguir. Se recortan por separado para no mezclar sus efectos.
  const bloqueFila = recorte(
    codigo,
    'export function BotonesAsistenciaDiferidos',
    'export function BotonesSeguirDiferidos',
  )
  const bloqueSeguir = recorte(codigo, 'export function BotonesSeguirDiferidos')

  it('es un componente cliente', () => {
    expect(leer(RUTA_DIFERIDOS).startsWith('"use client"')).toBe(true)
  })

  it('exporta debeCargarAsistencia (el gate que comparten los dos componentes)', () => {
    expect(codigo).toMatch(/export function debeCargarAsistencia/)
  })

  describe('BotonesAsistenciaDiferidos (la fila: ♥ Guardar / ✓ Voy / Compartir)', () => {
    const efecto = /useEffect\(\s*\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[abierto,\s*eventId,\s*status\]\s*\)/.exec(
      bloqueFila,
    )

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
      expect(bloqueFila).toMatch(/\.catch\([\s\S]*?console\.error\(\s*"\[BotonesAsistenciaDiferidos\]/)
    })

    it('dibuja <FilaAccionesEvento SIEMPRE (nunca un return null): el ♥ y Compartir no esperan a la asistencia', () => {
      expect(bloqueFila).toMatch(/<FilaAccionesEvento\b/)
      expect(bloqueFila).not.toMatch(/return\s+null/)
    })

    it('mostrarVoy solo es true con el resultado del evento abierto y ok: true', () => {
      expect(bloqueFila).toMatch(
        /if\s*\(\s*resultado\s*!==\s*null\s*&&\s*resultado\.eventId\s*===\s*eventId\s*&&\s*resultado\.respuesta\.ok\s*\)/,
      )
      expect(bloqueFila).toMatch(/mostrarVoy\s*=\s*true/)
    })
  })

  describe('BotonesSeguirDiferidos (+ Seguir, lugar y cuenta)', () => {
    const efecto = /useEffect\(\s*\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[abierto,\s*eventId,\s*status\]\s*\)/.exec(
      bloqueSeguir,
    )

    it('tiene un useEffect con dependencias [abierto, eventId, status]', () => {
      expect(efecto, 'no se encontró el useEffect esperado').not.toBeNull()
    })

    it('el efecto sale temprano con debeCargarAsistencia, antes de cualquier llamada a obtenerSeguimientoDeEvento', () => {
      const cuerpo = efecto![1]
      const salida = cuerpo.search(/if\s*\(\s*!debeCargarAsistencia\s*\(/)
      const llamada = cuerpo.search(/obtenerSeguimientoDeEvento\s*\(/)
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
      expect(bloqueSeguir).toMatch(/\.catch\([\s\S]*?console\.error\(\s*"\[BotonesSeguirDiferidos\]/)
    })

    it('no dibuja <BotonSeguir mientras carga, sin resultado del evento abierto, ni sin lugar y sin cuenta (retorna null antes)', () => {
      const corte = bloqueSeguir.search(/<BotonSeguir\b/)
      expect(corte).toBeGreaterThan(0)
      const antes = bloqueSeguir.slice(0, corte)
      expect(antes).toMatch(/if\s*\(\s*!debeCargarAsistencia\([^)]*\)\s*\)\s*return\s+null/)
      expect(antes).toMatch(
        /if\s*\(\s*resultado\s*===\s*null\s*\|\|\s*resultado\.eventId\s*!==\s*eventId\s*\)\s*return\s+null/,
      )
      expect(antes).toMatch(/if\s*\(\s*!lugar\s*&&\s*!cuenta\s*\)\s*return\s+null/)
    })
  })

  it('el gate sale de debenMostrarseBotonesAsistencia (import de "@/lib/asistencia-visibilidad")', () => {
    expect(codigo).toMatch(
      /import\s*\{[^}]*\bdebenMostrarseBotonesAsistencia\b[^}]*\}\s*from\s*['"]@\/lib\/asistencia-visibilidad['"]/,
    )
  })
})

describe('modal interceptado (app/@modal/(.)evento/[id]/page.tsx)', () => {
  const codigo = sinComentarios(leer(RUTA_MODAL_INTERCEPTADO))

  // R56 (tarea 56-a, QPS-196): el modal pasó de llamar a la server action
  // `obtenerAsistencia` (que creaba SU PROPIO cliente y volvía a llamar a
  // Auth) a `leerAsistencia` de `@/lib/asistencia-lectura`, con el mismo
  // cliente y el mismo `auth.getUser()` que ya usa el resto de la página.
  // Estas dos aserciones se actualizaron para seguir ese cambio real (no se
  // aflojó ninguna: siguen exigiendo un import y una condición exactos,
  // solo que ahora apuntan a la función nueva).
  it('importa leerAsistencia de "@/lib/asistencia-lectura"', () => {
    expect(codigo).toMatch(/import\s*\{[^}]*\bleerAsistencia\b[^}]*\}\s*from\s*['"]@\/lib\/asistencia-lectura['"]/)
  })

  it('importa debenMostrarseBotonesAsistencia de "@/lib/asistencia-visibilidad"', () => {
    expect(codigo).toMatch(
      /import\s*\{[^}]*\bdebenMostrarseBotonesAsistencia\b[^}]*\}\s*from\s*['"]@\/lib\/asistencia-visibilidad['"]/,
    )
  })

  it('la llamada a leerAsistencia está condicionada por debenMostrarseBotonesAsistencia(', () => {
    expect(codigo).toMatch(/debenMostrarseBotonesAsistencia\([^)]*\)\s*\?\s*await\s+leerAsistencia\(/)
  })

  it('importa y llama a obtenerSeguimientoDeEvento, en el mismo Promise.all que ya existía', () => {
    expect(codigo).toMatch(
      /import\s*\{[^}]*\bobtenerSeguimientoDeEvento\b[^}]*\}\s*from\s*['"]@\/lib\/actions\/radar['"]/,
    )
    const promiseAll = /Promise\.all\(\s*\[([\s\S]*?)\]\s*\)/.exec(codigo)
    expect(promiseAll, 'no se encontró el Promise.all').not.toBeNull()
    expect(promiseAll![1]).toMatch(/obtenerSeguimientoDeEvento\(/)
  })

  it('pasa haySesion={!!user} (no un literal) y las cantidades, la marca y el seguimiento', () => {
    expect(codigo).toMatch(/haySesion=\{!!user\}/)
    expect(codigo).not.toMatch(/haySesion=\{true\}/)
    expect(codigo).toMatch(/cantidadesAsistencia=\{cantidadesAsistencia\}/)
    expect(codigo).toMatch(/marcaAsistencia=\{marcaAsistencia\}/)
    expect(codigo).toMatch(/seguimiento=\{seguimiento\}/)
  })
})

describe('event-modal-wrapper.tsx', () => {
  const codigo = sinComentarios(leer(RUTA_WRAPPER))

  it('misma función de visibilidad que event-detail-page.tsx: mostrarVoy sale de cantidadesAsistencia && debenMostrarseBotonesAsistencia(...)', () => {
    expect(codigo).toMatch(
      /mostrarVoy=\{Boolean\(cantidadesAsistencia\)\s*&&\s*debenMostrarseBotonesAsistencia\([^)]*\)\}/,
    )
  })

  it('importa debenMostrarseBotonesAsistencia de "@/lib/asistencia-visibilidad"', () => {
    expect(codigo).toMatch(
      /import\s*\{[^}]*\bdebenMostrarseBotonesAsistencia\b[^}]*\}\s*from\s*['"]@\/lib\/asistencia-visibilidad['"]/,
    )
  })

  // Q3: el texto sale del diccionario (`textos.ficha.comprarTickets`, que en
  // castellano sigue siendo "Comprar tickets").
  it('la fila va DESPUÉS de "Comprar tickets"', () => {
    expect(es.ficha.comprarTickets).toBe('Comprar tickets')
    expect(codigo.indexOf('textos.ficha.comprarTickets')).toBeGreaterThan(0)
    expect(codigo.indexOf('<FilaAccionesEvento')).toBeGreaterThan(codigo.indexOf('textos.ficha.comprarTickets'))
  })

  it('le pasa el ShareButton a la fila por la prop compartir (no queda un ShareButton suelto en el encabezado)', () => {
    expect(codigo).toMatch(/compartir=\{\s*<ShareButton/)
  })
})

describe('event-modal.tsx (Buscar)', () => {
  const codigo = sinComentarios(leer(RUTA_EVENT_MODAL))

  it('usa <BotonesAsistenciaDiferidos con abierto={open} y haySesion={haySesion}', () => {
    expect(codigo).toMatch(/<BotonesAsistenciaDiferidos[\s\S]*?abierto=\{open\}[\s\S]*?haySesion=\{haySesion\}/)
  })

  it('usa <BotonesSeguirDiferidos con el status del evento', () => {
    expect(codigo).toMatch(/<BotonesSeguirDiferidos[\s\S]*?status=\{event\.status\}/)
  })

  it('pasa el status del evento a BotonesAsistenciaDiferidos', () => {
    expect(codigo).toMatch(/<BotonesAsistenciaDiferidos[\s\S]*?status=\{event\.status\}/)
  })

  it('la fila va DESPUÉS de "Comprar tickets"', () => {
    expect(codigo.indexOf('textos.ficha.comprarTickets')).toBeGreaterThan(0)
    expect(codigo.indexOf('<BotonesAsistenciaDiferidos')).toBeGreaterThan(codigo.indexOf('textos.ficha.comprarTickets'))
  })

  it('no importa obtenerAsistencia directo (lo hace el diferido)', () => {
    expect(codigo).not.toMatch(/\bobtenerAsistencia\b/)
  })

  it('no tiene FavoriteButton en el encabezado (el ♥ vive en la fila, vía el diferido)', () => {
    expect(codigo).not.toMatch(/<FavoriteButton\b/)
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

describe('sin sesión no se escribe nada: ningún modal importa marcarAsistencia ni cambiarSeguimiento', () => {
  it.each([RUTA_MODAL_INTERCEPTADO, RUTA_WRAPPER, RUTA_EVENT_MODAL, RUTA_DIFERIDOS])('%s', (ruta) => {
    const codigo = sinComentarios(leer(ruta))
    expect(codigo).not.toMatch(/\bmarcarAsistencia\b/)
    expect(codigo).not.toMatch(/\bcambiarSeguimiento\b/)
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
