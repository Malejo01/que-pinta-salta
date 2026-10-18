// 42-b: `mensajeCompartirEvento` y `datosTarjetaCompartir` (`lib/compartir.ts`).
// Sin red ni RN: todo son strings/fixtures fijos.
import { describe, expect, it } from 'vitest'
import {
  datosTarjetaCompartir,
  mensajeCompartirEvento,
  MAX_LUGAR_TARJETA,
  MAX_TITULO_TARJETA,
} from '../lib/compartir'

const UUID = '0b9d4f5a-6a2b-4c1e-8f3d-9a7b6c5d4e3f'

describe('mensajeCompartirEvento', () => {
  it('con hora: texto idéntico al que armaba BotonCompartir.tsx inline', () => {
    const mensaje = mensajeCompartirEvento({
      eventId: UUID,
      titulo: 'Peña en el club',
      fecha: 'Viernes 7 de agosto',
      hora: '21:00',
      lugar: 'Club Social',
    })
    expect(mensaje).toBe(
      `Peña en el club\nViernes 7 de agosto · 21:00 hs · Club Social\nhttps://www.quepintasalta.com.ar/evento/${UUID}?o=app`
    )
  })

  it('sin hora: no agrega " · <hora> hs"', () => {
    const mensaje = mensajeCompartirEvento({
      eventId: UUID,
      titulo: 'Muestra de arte',
      fecha: 'Sábado 8 de agosto',
      hora: null,
      lugar: 'Museo MAC',
    })
    expect(mensaje).toBe(
      `Muestra de arte\nSábado 8 de agosto · Museo MAC\nhttps://www.quepintasalta.com.ar/evento/${UUID}?o=app`
    )
  })

  it('el link es urlEvento(id, "app") y termina en ?o=app', () => {
    const mensaje = mensajeCompartirEvento({
      eventId: UUID,
      titulo: 'T',
      fecha: 'F',
      hora: null,
      lugar: 'L',
    })
    expect(mensaje).toContain(`https://www.quepintasalta.com.ar/evento/${UUID}?o=app`)
    expect(mensaje?.endsWith('?o=app')).toBe(true)
  })

  it('un id inválido (no uuid) da null', () => {
    const mensaje = mensajeCompartirEvento({
      eventId: 'no-es-un-uuid',
      titulo: 'T',
      fecha: 'F',
      hora: null,
      lugar: 'L',
    })
    expect(mensaje).toBeNull()
  })
})

describe('datosTarjetaCompartir', () => {
  const base = {
    id: UUID,
    title: 'Peña en el club',
    start_date: '2026-08-07T21:00:00-03:00',
    image_url: 'https://ejemplo.supabase.co/storage/v1/object/public/flyers/foto.png',
    venue: { name: 'Club Social' },
  }

  it('un título de 100 caracteres queda en 72 y termina en "…"', () => {
    const titulo = 'A'.repeat(100)
    const datos = datosTarjetaCompartir({ ...base, title: titulo })
    expect(datos).not.toBeNull()
    expect(datos!.titulo.length).toBeLessThanOrEqual(MAX_TITULO_TARJETA)
    expect(datos!.titulo.endsWith('…')).toBe(true)
    expect(datos!.titulo.length).toBe(MAX_TITULO_TARJETA)
  })

  it('un lugar de 60 caracteres queda en 48', () => {
    const lugar = 'B'.repeat(60)
    const datos = datosTarjetaCompartir({ ...base, venue: { name: lugar } })
    expect(datos).not.toBeNull()
    expect(datos!.lugar.length).toBeLessThanOrEqual(MAX_LUGAR_TARJETA)
    expect(datos!.lugar.endsWith('…')).toBe(true)
    expect(datos!.lugar.length).toBe(MAX_LUGAR_TARJETA)
  })

  it('sin venue: "Lugar por confirmar"', () => {
    const datos = datosTarjetaCompartir({ ...base, venue: null })
    expect(datos?.lugar).toBe('Lugar por confirmar')
  })

  it('un evento a las 00:00 de Salta: "· Sin hora"', () => {
    const datos = datosTarjetaCompartir({ ...base, start_date: '2026-08-07T00:00:00-03:00' })
    expect(datos).not.toBeNull()
    expect(datos!.fechaHora.endsWith('· Sin hora')).toBe(true)
  })

  it('con hora explícita: "<fecha> · <hora> hs"', () => {
    const datos = datosTarjetaCompartir({ ...base, start_date: '2026-08-07T21:30:00-03:00' })
    expect(datos).not.toBeNull()
    expect(datos!.fechaHora.endsWith('· 21:30 hs')).toBe(true)
  })

  it('linkVisible empieza con www.quepintasalta.com.ar/evento/ y no tiene https:// ni ?o=', () => {
    const datos = datosTarjetaCompartir(base)
    expect(datos).not.toBeNull()
    expect(datos!.linkVisible.startsWith('www.quepintasalta.com.ar/evento/')).toBe(true)
    expect(datos!.linkVisible).not.toContain('https://')
    expect(datos!.linkVisible).not.toContain('?o=')
    expect(datos!.linkVisible).toBe(`www.quepintasalta.com.ar/evento/${UUID}`)
  })

  it('la marca es "QUÉ PINTA SALTA"', () => {
    const datos = datosTarjetaCompartir(base)
    expect(datos?.marca).toBe('QUÉ PINTA SALTA')
  })

  it('imagenUrl se devuelve tal cual, sin validar (lo hace Afiche)', () => {
    const datos = datosTarjetaCompartir(base)
    expect(datos?.imagenUrl).toBe(base.image_url)
  })

  it('un id inválido (no uuid) da null', () => {
    expect(datosTarjetaCompartir({ ...base, id: 'no-es-un-uuid' })).toBeNull()
  })

  it('un start_date inválido da null (formatEventDate/formatEventTimeDisplay tirarían RangeError)', () => {
    expect(datosTarjetaCompartir({ ...base, start_date: 'fecha-invalida' })).toBeNull()
  })
})
