/**
 * La ficha del evento y sus modales en inglés (Q3): los textos de la
 * interfaz salen del diccionario (`ficha`, `asistencia`, `seguir`). El
 * castellano tiene que seguir EXACTAMENTE igual que antes (los compartidos
 * con la app, los de core), y ningún componente puede quedarse con un
 * literal suelto que no pase por el diccionario. Las vistas sin hooks
 * (`FilaAccionesEventoVista`, `BotonSeguirVista`, `VerEnElMapa`) reciben el
 * idioma por prop: se prueban con `renderToStaticMarkup`, en Node.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  MENSAJE_EVENTO_NO_DISPONIBLE,
  TEXTO_ENTRAR_PARA_MARCAR,
  TEXTO_SACASTE_GUARDADO_CON_VOY,
  textoBotonVoy,
} from '@qps/core/asistencia'
import { textoSeguir, textoSeguirCuenta } from '@qps/core/radar/seguimiento'
import { vibeLabels } from '@qps/core/types'
import { saltaWallClockToDate } from '@qps/core/date-format'
import { es } from '@/lib/i18n/diccionarios/es'
import { en } from '@/lib/i18n/diccionarios/en'
import { FilaAccionesEventoVista } from '@/components/fila-acciones-evento'
import { BotonSeguirVista } from '@/components/boton-seguir'
import { VerEnElMapa } from '@/components/ver-en-el-mapa'
import type { Venue } from '@/lib/types'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const sinComentarios = (fuente: string) => fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1')

describe('el castellano no cambió', () => {
  it('ficha', () => {
    expect(es.ficha.volverAEventos).toBe('Volver a eventos')
    expect(es.ficha.sinCategorizar).toBe('Sin categorizar')
    expect(es.ficha.horaDelEvento('21:30')).toBe('21:30 hs')
    expect(es.ficha.precioDeEntrada).toBe('Precio de entrada')
    expect(es.ficha.comoLlegar).toBe('Cómo llegar')
    expect(es.ficha.comprarTickets).toBe('Comprar tickets')
    expect(es.ficha.verEnElMapa).toBe('Ver en el mapa')
    expect(es.ficha.etiquetasVibe).toEqual(vibeLabels)
    expect(es.portada.entradaGratuita).toBe('Entrada Gratuita')
    expect(es.portada.lugarPorConfirmar).toBe('Lugar por confirmar')
  })

  it('asistencia: los textos que comparte con la app salen de core', () => {
    expect(es.asistencia.guardar).toBe('Guardar')
    expect(es.asistencia.guardado).toBe('Guardado')
    expect(es.asistencia.ariaGuardar('X')).toBe('Guardar X')
    expect(es.asistencia.ariaQuitarGuardado('X')).toBe('Quitar X de tus guardados')
    expect(es.asistencia.esteEvento).toBe('este evento')
    expect(es.asistencia.botonVoy).toBe(textoBotonVoy)
    expect(es.asistencia.ariaVoy('X')).toBe('Marcar que vas a X')
    expect(es.asistencia.ariaNoVoy('X')).toBe('Marcar que no vas a X')
    expect(es.asistencia.entrarParaMarcar).toBe(TEXTO_ENTRAR_PARA_MARCAR)
    expect(es.asistencia.errorTitulo).toBe('Error')
    expect(es.asistencia.errorGuardados).toBe('No pudimos actualizar tus guardados. Probá de nuevo.')
    expect(es.asistencia.errorMarca).toBe('No pudimos guardar tu marca. Probá de nuevo.')
    expect(es.asistencia.eventoNoDisponible).toBe(MENSAJE_EVENTO_NO_DISPONIBLE)
    expect(es.asistencia.sacasteGuardadoConVoy).toBe(TEXTO_SACASTE_GUARDADO_CON_VOY)
    expect(es.asistencia.errorConexionTitulo).toBe('Error de conexión')
    expect(es.asistencia.errorConexionTexto).toBe('No pudimos conectarnos al servidor. Probá de nuevo.')
  })

  it('seguir: los de core', () => {
    expect(es.seguir.lugar).toBe(textoSeguir)
    expect(es.seguir.cuenta).toBe(textoSeguirCuenta)
    expect(es.seguir.error).toBe('No pudimos guardar el seguimiento. Probá de nuevo.')
  })
})

describe('el inglés', () => {
  it('Voy con el mismo umbral que el castellano', () => {
    for (const n of [0, 2, 3, 12]) {
      const conNumero = textoBotonVoy(n) !== 'Voy'
      expect(en.asistencia.botonVoy(n)).toBe(conNumero ? `I'm going · ${n} going` : "I'm going")
    }
  })

  it('hora sin sufijo (ya va en 12 h) y Seguir', () => {
    expect(en.ficha.horaDelEvento('9:30 PM')).toBe('9:30 PM')
    expect(en.seguir.lugar(false)).toBe('+ Follow')
    expect(en.seguir.lugar(true)).toBe('✓ Following')
    expect(en.seguir.cuenta('lugar', false)).toBe('Follow @lugar')
  })
})

// Los textos de interfaz (hojas string) que ya no pueden aparecer sueltos en el código.
const LITERALES = [
  ...Object.values(es.ficha).filter((v): v is string => typeof v === 'string'),
  ...Object.values(es.asistencia).filter((v): v is string => typeof v === 'string' && v !== 'Error'),
  es.seguir.error,
  'Entrada Gratuita',
  'Lugar por confirmar',
]

/**
 * La ficha y el modal interceptado tienen el bloque de admin de la categoría,
 * que queda en castellano a propósito (es solo para el equipo: su botón
 * "Guardar"), y el `displayEvent` interno, que sigue usando "Lugar por
 * confirmar" y "Sin categorizar" para ese bloque y para la búsqueda de "Cómo
 * llegar" (sin cambios). Lo que ve el público sale de `lugarVisible` y
 * `categoriaVisible` (ver el último test).
 */
const DEL_ADMIN = ['Guardar', 'Sin categorizar', 'Lugar por confirmar']
const CON_BLOQUE_DE_ADMIN = ['components/event-detail-page.tsx', 'components/event-modal-wrapper.tsx']

describe.each([
  'components/event-detail-page.tsx',
  'components/event-modal-wrapper.tsx',
  'components/event-modal.tsx',
  'components/ver-en-el-mapa.tsx',
  'components/fila-acciones-evento.tsx',
  'components/botones-asistencia.tsx',
  'components/boton-seguir.tsx',
])('%s usa el diccionario', (archivo) => {
  const fuente = sinComentarios(read(archivo))
  const literales = CON_BLOQUE_DE_ADMIN.includes(archivo) ? LITERALES.filter((t) => !DEL_ADMIN.includes(t)) : LITERALES

  it.each(literales)('no tiene el literal "%s"', (texto) => {
    expect(fuente).not.toContain(`"${texto}"`)
    expect(fuente).not.toContain(`'${texto}'`)
    expect(fuente).not.toMatch(new RegExp(`>\\s*${texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<`))
  })

  it('no arma " hs" ni el precio en pesos a mano', () => {
    expect(fuente).not.toMatch(/\}\s*hs</)
    expect(fuente).not.toContain('toLocaleString("es-AR")')
  })
})

describe.each(CON_BLOQUE_DE_ADMIN)('%s: lo que ve el público sale del diccionario', (archivo) => {
  const fuente = sinComentarios(read(archivo))

  it('el lugar y la categoría visibles son los traducidos', () => {
    expect(fuente).toContain('lugarSinNombre ? textos.portada.lugarPorConfirmar : displayEvent.venue')
    expect(fuente).toContain(': textos.ficha.sinCategorizar')
    expect(fuente).toMatch(/\{categoriaVisible\}\s*<\/Badge>/)
    expect(fuente).toMatch(/>\s*\{lugarVisible\}\s*</)
  })

  it('el aviso de contenido en castellano va solo fuera del castellano', () => {
    expect(fuente).toContain('{idioma !== "es" && <AvisoContenidoEs')
  })
})

describe('las vistas sin hooks, en inglés por prop', () => {
  const baseFila = {
    guardado: false,
    voy: false,
    cantidadVoy: 12,
    mostrarVoy: true,
    haySesion: false,
    pendiente: false,
    onClickGuardar: () => {},
    onClickVoy: () => {},
    titulo: 'Peña de Prueba',
  }

  it('FilaAccionesEventoVista: Save, I’m going y la invitación a entrar', () => {
    const html = renderToStaticMarkup(React.createElement(FilaAccionesEventoVista, { ...baseFila, idioma: 'en' }))
    expect(html).toContain('>Save<')
    expect(html).toContain("I&#x27;m going · 12 going")
    expect(html).toContain('aria-label="Save Peña de Prueba"')
    expect(html).toContain('aria-label="Mark that you are going to Peña de Prueba"')
    expect(html).toContain(en.asistencia.entrarParaMarcar)
    expect(html).not.toContain('Guardar')
    expect(html).not.toContain('Voy')
  })

  it('FilaAccionesEventoVista: sin idioma, el castellano de siempre', () => {
    const html = renderToStaticMarkup(React.createElement(FilaAccionesEventoVista, baseFila))
    expect(html).toContain('>Guardar<')
    expect(html).toContain('Voy · 12 van')
    expect(html).toContain('aria-label="Guardar Peña de Prueba"')
    expect(html).toContain(TEXTO_ENTRAR_PARA_MARCAR)
  })

  it('BotonSeguirVista: + Follow / Follow @cuenta en inglés; + Seguir sin idioma', () => {
    const vista = (props: Partial<React.ComponentProps<typeof BotonSeguirVista>>) =>
      renderToStaticMarkup(
        React.createElement(BotonSeguirVista, {
          tipo: 'lugar',
          etiqueta: 'lugar',
          siguiendo: false,
          pendiente: false,
          onClick: () => {},
          ...props,
        }),
      )
    expect(vista({ idioma: 'en' })).toContain('>+ Follow<')
    expect(vista({ idioma: 'en', tipo: 'cuenta' })).toContain('>Follow @lugar<')
    expect(vista({})).toContain('>+ Seguir<')
  })

  it('VerEnElMapa: "View on the map", con hrefLang porque /mapa existe solo en castellano', () => {
    const venue = { id: 'v1', latitude: -24.78, longitude: -65.41 } as unknown as Venue
    const startDate = saltaWallClockToDate('2026-03-10T20:00:00')
    const html = renderToStaticMarkup(React.createElement(VerEnElMapa, { venue, startDate, idioma: 'en' }))
    expect(html).toContain('View on the map')
    expect(html).toContain('hrefLang="es-AR"')
    expect(html).toContain('href="/mapa?cuando=fecha&amp;dia=2026-03-10&amp;lugar=v1"')
    const htmlEs = renderToStaticMarkup(React.createElement(VerEnElMapa, { venue, startDate }))
    expect(htmlEs).toContain('Ver en el mapa')
    expect(htmlEs).not.toContain('hrefLang')
  })
})

describe('las rutas en inglés reusan las de castellano', () => {
  it('/en/evento/[id] dibuja el cuerpo de app/evento/[id]/page.tsx (con su JSON-LD)', () => {
    const fuente = read('app/en/evento/[id]/page.tsx')
    expect(fuente).toContain('import EventPage from "@/app/evento/[id]/page"')
    expect(fuente).toMatch(/return await EventPage\(props\)/)
  })

  it('el modal: (.)en/evento/[id] intercepta /en/evento/<id> con el mismo modal', () => {
    const fuente = read('app/@modal/(.)en/evento/[id]/page.tsx')
    expect(fuente).toContain('import ModalEventPage from "@/app/@modal/(.)evento/[id]/page"')
    expect(fuente).toMatch(/<ModalEventPage \{\.\.\.props\} \/>/)
  })
})
