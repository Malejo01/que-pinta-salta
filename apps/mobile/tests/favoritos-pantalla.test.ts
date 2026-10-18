// R29, tarea 29-i (§3.7): el layout de "Mi Agenda de Eventos" en
// app/(tabs)/favoritos.tsx, copiado de apps/web/app/favoritos/favoritos-list.tsx.
//
// R47, tarea 47-g (QPS-197): la pantalla pasa a llamarse "Mis eventos" (solo
// en la app: la web sigue con "Mi Agenda de Eventos" hasta que una tarea de
// la web la actualice, fuera del alcance de esta tarea) y la `SectionList`
// arranca con la sección "Voy" (`seccionVoy`) antes de "Guardados"
// (`agruparFavoritosParaSecciones`). Se agregan tests para esas dos
// propiedades y para "sin repetidos entre las dos".
//
// Por qué los nuevos tests de "Voy" son detectores sobre el texto del
// archivo, no imports de `seccionVoy`/`agruparFavoritosParaSecciones`:
// mismo motivo, documentado con el mismo detalle, que
// `tests/fila-acciones.test.ts` para `FilaAccionesEvento.tsx`/`BotonSeguir.tsx`
// — `vitest.config.ts` corre en `environment: 'node'` ("sin React Native"),
// y `app/(tabs)/favoritos.tsx` importa 'react-native'/'expo-router' a nivel
// de módulo: importar cualquier símbolo de ese archivo (aunque sea una
// función pura) arrastra esos imports, que no hay runner que resuelva acá.
// "Sin repetidos entre voy y guardados" sí se prueba de verdad, pero contra
// `separarMisEventos` (`@qps/core/favoritos/mis-eventos`, sin React Native):
// es la función de la que depende esa garantía, y es importable.
//
// Dos partes más, mismo patrón que tests/pull-to-refresh.test.ts y
// tests/favoritos-armar.test.ts (lectura estática con `fs`, sin montar nada
// de React Native — no se importa `app/(tabs)/favoritos.tsx` como módulo:
// arrastra `react-native`, que Vitest no puede transformar en este entorno,
// mismo motivo por el que esos otros tests tampoco lo importan):
//   1. Los textos de la web están, literal, en la pantalla de la app (y
//      siguen estando en la web, para que el test note si alguien cambia el
//      texto de un lado y no del otro).
//   2. `armarMensajeWhatsApp` (@qps/core/favoritos/armar, movida a core en
//      esta tarea porque 29-a ya estaba commiteada) con fixtures inventadas:
//      ningún id, nombre ni dato real.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { armarMensajeWhatsApp } from '@qps/core/favoritos/armar'
import { idsDeEventosVoy, separarMisEventos, type FilaConKind } from '@qps/core/favoritos/mis-eventos'
import type { ResultadoFavoritosArmados } from '@qps/core/favoritos/armar'
import type { DisplayEvent } from '@qps/core/home/types'

const MOBILE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const PANTALLA = readFileSync(`${MOBILE_ROOT}/app/(tabs)/favoritos.tsx`, 'utf8')
const WEB_FAVORITOS_LIST = readFileSync(
  fileURLToPath(new URL('../../web/app/favoritos/favoritos-list.tsx', import.meta.url)),
  'utf8',
)

// ---------------------------------------------------------------------------
// 1. Textos copiados literal de la web.
// ---------------------------------------------------------------------------
describe('app/(tabs)/favoritos.tsx: textos copiados literal de favoritos-list.tsx (la web)', () => {
  it.each(['Compartir agenda por WhatsApp', 'Plan flexible'])(
    '"%s" está en la pantalla de la app y en la web',
    (texto) => {
      expect(PANTALLA).toContain(texto)
      expect(WEB_FAVORITOS_LIST).toContain(texto)
    },
  )

  it('"Ingresar" (sin sesión, logo al 30%) está en la pantalla', () => {
    expect(PANTALLA).toContain('Ingresar')
  })

  it('el logo (assets/logo-circular.png) se usa con opacity: 0.3 en el estado sin sesión', () => {
    expect(PANTALLA).toMatch(/LOGO_MARCA/)
    expect(PANTALLA).toMatch(/opacity:\s*0\.3/)
  })
})

// ---------------------------------------------------------------------------
// R47, 47-g: el título de la pantalla es "Mis eventos" (ya no "Mi Agenda de
// Eventos" — ese título sigue en la web a propósito, ver la cabecera).
// ---------------------------------------------------------------------------
describe('app/(tabs)/favoritos.tsx: el título de la pantalla es "Mis eventos" (R47, 47-g)', () => {
  it('el encabezado de la lista dice "Mis eventos"', () => {
    expect(PANTALLA).toMatch(/<Texto\s+peso="bold"\s+style=\{estilos\.titulo\}>\s*Mis eventos\s*<\/Texto>/)
  })

  it('ya no queda el título viejo ("Mi Agenda de Eventos") en el archivo', () => {
    expect(PANTALLA).not.toContain('Mi Agenda de Eventos')
  })

  it('el vacío (nada de nada) está ajustado al nombre nuevo: menciona "Mis eventos"', () => {
    expect(PANTALLA).toMatch(/<Vacio\s+mensaje="[^"]*Mis eventos[^"]*"/)
  })
})

// ---------------------------------------------------------------------------
// 2. armarMensajeWhatsApp: función pura, fixtures inventadas.
// ---------------------------------------------------------------------------
function makeItem(overrides: Partial<DisplayEvent> = {}): DisplayEvent {
  return {
    id: 'evento-de-prueba-1',
    slug: 'evento-de-prueba-1',
    title: 'Evento de Prueba',
    venue: 'Lugar de Prueba',
    date: '2030-12-31',
    time: '21:00',
    category: 'musica',
    categoryName: 'Música',
    price: 'gratis',
    image: '',
    description: '',
    address: '',
    startDateTime: '2030-12-31T21:00:00-03:00',
    isFeatured: false,
    ...overrides,
  }
}

describe('armarMensajeWhatsApp (fixtures inventadas, función pura)', () => {
  it('arma el mensaje con las tres secciones (eventos, cine y boliches), en ese orden', () => {
    const evento = makeItem({
      id: 'id-evento-ficticio',
      title: 'Recital Ficticio',
      venue: 'Club Ficticio',
      date: '2030-11-05',
    })
    const pelicula = makeItem({ id: 'movie-id-ficticio', title: 'Película Ficticia', isCinemaMovie: true })
    const flyer = makeItem({
      id: 'ig-id-ficticio',
      title: 'Boliche Ficticio',
      venue: 'Boliche de Prueba',
      isInstagramFlyer: true,
      flyerId: 'flyer-ficticio-1',
    })

    const mensaje = armarMensajeWhatsApp([evento, pelicula, flyer], 'https://app.test')

    const esperado = [
      '¡Che! Este es mi plan para el finde en Salta:',
      '',
      '📅 *Eventos:*',
      '- *Recital Ficticio* (05/11 en Club Ficticio)',
      '  🔗 https://app.test/evento/id-evento-ficticio',
      '',
      '🎬 *Cine:*',
      '- *Película Ficticia*',
      '  🔗 https://app.test/cines',
      '',
      '🍻 *Boliches / Salidas:*',
      '- *Boliche Ficticio* (en Boliche de Prueba)',
      '  🔗 https://app.test/flyer/flyer-ficticio-1',
      '',
      'Organizá tu salida en quepintasalta.com.ar 🎸',
    ].join('\n')

    expect(mensaje).toBe(esperado)
  })

  it('sin favoritos: solo el saludo y el cierre', () => {
    expect(armarMensajeWhatsApp([], 'https://app.test')).toBe(
      ['¡Che! Este es mi plan para el finde en Salta:', '', 'Organizá tu salida en quepintasalta.com.ar 🎸'].join('\n'),
    )
  })

  it('sin pasar "sitio", usa el dominio de producción (SITIO de @qps/core/metricas/links)', () => {
    const evento = makeItem({ id: 'id-evento-default', date: '2030-01-01' })
    const mensaje = armarMensajeWhatsApp([evento])
    expect(mensaje).toContain('https://www.quepintasalta.com.ar/evento/id-evento-default')
  })

  it('una película ignora el id (siempre linkea a /cines, no a /pelicula/<id>)', () => {
    const pelicula = makeItem({ id: 'movie-otra-pelicula-ficticia', title: 'Otra Película', isCinemaMovie: true })
    const mensaje = armarMensajeWhatsApp([pelicula], 'https://app.test')
    expect(mensaje).toContain('https://app.test/cines')
    expect(mensaje).not.toContain('movie-otra-pelicula-ficticia')
  })

  it('"Voy" y "Guardados" juntos (como los manda la pantalla, sin repetir): arma igual las tres secciones', () => {
    // Simula lo que hace compartirPorWhatsApp: [...estado.voy, ...estado.eventos].
    const conVoy = makeItem({ id: 'id-con-voy', title: 'Evento Con Voy', date: '2030-11-01' })
    const soloGuardado = makeItem({ id: 'id-solo-guardado', title: 'Evento Solo Guardado', date: '2030-11-02' })
    const mensaje = armarMensajeWhatsApp([conVoy, soloGuardado], 'https://app.test')
    expect(mensaje).toContain('Evento Con Voy')
    expect(mensaje).toContain('Evento Solo Guardado')
    // Cada evento aparece una sola vez (una sola línea "- *título*").
    expect(mensaje.match(/- \*Evento Con Voy\*/g)).toHaveLength(1)
    expect(mensaje.match(/- \*Evento Solo Guardado\*/g)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// R47, 47-g: "Voy" antes de "Guardados", sin repetidos, sección vacía sin
// encabezado.
// ---------------------------------------------------------------------------

// "Sin repetidos entre voy y guardados" se prueba contra separarMisEventos
// (core, importable: no toca react-native), que es la función de la que
// depende esa garantía — la pantalla no vuelve a filtrar nada (ver el
// detector de más abajo).
describe('separarMisEventos (core): "voy" y "guardados" nunca comparten un id (la garantía de la que depende la pantalla)', () => {
  it('un evento con Voy desaparece de "guardados" y aparece (una sola vez) en "voy"', () => {
    const conVoy = makeItem({ id: 'ev-con-voy', date: '2030-11-10' })
    const sinVoy = makeItem({ id: 'ev-sin-voy', date: '2030-11-11' })
    const armado: ResultadoFavoritosArmados = {
      flexibles: [],
      porDia: [
        { dia: '2030-11-10', items: [conVoy] },
        { dia: '2030-11-11', items: [sinVoy] },
      ],
    }

    const { voy, guardados } = separarMisEventos(armado, ['ev-con-voy'])

    const idsVoy = voy.map((item) => item.id)
    const idsGuardados = [...guardados.flexibles, ...guardados.porDia.flatMap((g) => g.items)].map((item) => item.id)

    expect(idsVoy).toEqual(['ev-con-voy'])
    expect(idsGuardados).toEqual(['ev-sin-voy'])
    // Ningún id en las dos listas a la vez.
    expect(idsVoy.filter((id) => idsGuardados.includes(id))).toEqual([])
  })

  it('un día que se queda sin eventos (todos con Voy) desaparece entero de "guardados" (no queda un grupo vacío)', () => {
    const conVoy = makeItem({ id: 'ev-unico-del-dia', date: '2030-11-12' })
    const armado: ResultadoFavoritosArmados = {
      flexibles: [],
      porDia: [{ dia: '2030-11-12', items: [conVoy] }],
    }

    const { guardados } = separarMisEventos(armado, ['ev-unico-del-dia'])
    expect(guardados.porDia).toEqual([])
  })

  it('idsDeEventosVoy (la otra mitad de la garantía): descarta kind distinto de "voy", nulos y repetidos', () => {
    const filas: FilaConKind[] = [
      { event_id: 'e1', kind: 'voy' },
      { event_id: 'e1', kind: 'voy' }, // repetido
      { event_id: 'e2', kind: 'me_interesa' }, // modelo viejo: no cuenta
      { event_id: null, kind: 'voy' },
    ]
    expect(idsDeEventosVoy(filas)).toEqual(['e1'])
  })

  it('sin eventos ni ids de Voy: las dos listas vacías', () => {
    expect(separarMisEventos({ flexibles: [], porDia: [] }, [])).toEqual({
      voy: [],
      guardados: { flexibles: [], porDia: [] },
    })
  })
})

// Detectores sobre el archivo real: la pantalla arma "Voy" antes de
// "Guardados" y no vuelve a filtrar nada entre las dos listas (confía en la
// garantía de separarMisEventos, probada arriba).
describe('app/(tabs)/favoritos.tsx: "Voy" primero, sin re-filtrar entre listas, sección vacía sin encabezado (detectores)', () => {
  it('seccionVoy devuelve null (no dibuja nada) con la lista vacía', () => {
    expect(PANTALLA).toMatch(/function seccionVoy\([^)]*\)[^{]*\{\s*if\s*\(\s*voy\.length\s*===\s*0\s*\)\s*return\s*null/)
  })

  it('agruparFavoritosParaSecciones solo agrega la sección "flexibles" si hay al menos un elemento', () => {
    expect(PANTALLA).toMatch(/if\s*\(\s*flexibles\.length\s*>\s*0\s*\)\s*\{/)
  })

  it('agruparFavoritosParaSecciones solo crea un grupo por día cuando ya tiene al menos un elemento adentro (Map.set solo al agregar)', () => {
    // El Map nunca se "crea vacío y después se filtra": una clave de día
    // solo existe en `porDia` desde el momento en que entra su primer
    // elemento (`else porDia.set(item.date, [item])`), así que recorrer sus
    // entradas nunca puede producir un grupo con 0 items.
    expect(PANTALLA).toMatch(/else\s+porDia\.set\(item\.date,\s*\[item\]\)/)
  })

  it('"Voy" se arma antes que "Guardados" en el array de secciones que recibe la SectionList', () => {
    expect(PANTALLA).toMatch(/voy\s*\?\s*\[\s*voy\s*,\s*\.\.\.guardados\s*\]\s*:\s*guardados/)
  })

  it('la pantalla pasa estado.voy y estado.eventos directo (sin un .filter/.concat propio entre las dos: confía en separarMisEventos)', () => {
    expect(PANTALLA).toMatch(/seccionVoy\(estado\.voy\)/)
    expect(PANTALLA).toMatch(/agruparFavoritosParaSecciones\(estado\.eventos\)/)
    // Si alguien agregara un filtro manual entre las dos listas (por
    // ejemplo, para "no repetir"), sería una señal de que ya no confía en
    // separarMisEventos: no debería existir ese código acá.
    expect(PANTALLA).not.toMatch(/estado\.voy\.filter/)
    expect(PANTALLA).not.toMatch(/estado\.eventos\.filter\(\s*\(?\w*\)?\s*=>\s*!estado\.voy/)
  })
})
