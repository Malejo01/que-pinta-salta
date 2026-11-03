// @vitest-environment jsdom
//
// Q5-2 · La sección «Lugares para chicos» de /mapa en un DOM real: encabezados,
// datos visibles, «Cerca mío» con la geolocalización simulada, «Elegí tu
// barrio», atribución de OSM y la versión en inglés.
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { SeccionLugaresChicos, urlComoLlegar } from '@/components/mapa/seccion-lugares-chicos'
import type { LugarChicosMapa } from '@qps/core/mapa/lugares-chicos'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Martes 3/11/2026, 17:00 en Salta.
const AHORA_ISO = '2026-11-03T20:00:00.000Z'

function lugar(n: number, cambios: Partial<LugarChicosMapa> = {}): LugarChicosMapa {
  return {
    id: `f${n}`,
    venueId: `v${n}`,
    nombre: `Lugar ${n}`,
    direccion: `Calle ${n}`,
    slug: null,
    lat: -24.7883,
    lng: -65.4106,
    tipo: 'pelotero',
    descripcion: null,
    edadMin: 2,
    edadMax: 10,
    horarios: { version: 1, semana: { mar: [{ desde: '16:00', hasta: '20:30' }] } },
    acceso: 'pago',
    notaPrecio: null,
    techado: 'techado',
    tieneRampa: true,
    tieneBanoAdaptado: null,
    tieneCambiador: false,
    telefono: null,
    web: 'https://ejemplo.com.ar/',
    instagram: null,
    verificadoAt: '2026-10-20T12:00:00Z',
    deOsm: false,
    ...cambios,
  }
}

function montar(lugares: LugarChicosMapa[], idioma: 'es' | 'en' = 'es', onVerEnElMapa = vi.fn()) {
  render(
    React.createElement(SeccionLugaresChicos, {
      lugares,
      ahoraISO: AHORA_ISO,
      seleccionado: null,
      conEventos: new Set(['v2']),
      onVerEnElMapa,
      mapaDisponible: true,
      idioma,
    }),
  )
  return { onVerEnElMapa }
}

describe('SeccionLugaresChicos', () => {
  it('h2 de la sección, h3 por lugar, y solo lo verificado de accesibilidad', () => {
    montar([lugar(1), lugar(2, { tipo: 'plaza_juegos', horarios: { version: 1, siempre_abierto: true, semana: {} }, acceso: 'gratis' })])
    expect(screen.getByRole('heading', { level: 2, name: 'Lugares para chicos' })).toBeTruthy()
    const items = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(items).toEqual(['Lugar 1', 'Lugar 2'])
    const primero = screen.getByRole('heading', { level: 3, name: 'Lugar 1' }).closest('li')!
    expect(within(primero).getByText('Pelotero · De 2 a 10 años')).toBeTruthy()
    expect(within(primero).getByText('Hoy: 16:00 a 20:30')).toBeTruthy()
    expect(within(primero).getByText('Rampa')).toBeTruthy()
    expect(within(primero).queryByText(/Cambiador/)).toBeNull()
    expect(within(primero).getByText('Verificado el 20/10/2026')).toBeTruthy()
    const segundo = screen.getByRole('heading', { level: 3, name: 'Lugar 2' }).closest('li')!
    expect(within(segundo).getByText('Espacio abierto')).toBeTruthy()
    expect(within(segundo).getByText('Este lugar también tiene eventos en el mapa')).toBeTruthy()
    expect(screen.getByText(/No inspeccionamos los lugares/)).toBeTruthy()
  })

  it('«Ver en el mapa» lleva el nombre para el lector de pantalla y avisa el venue', () => {
    const { onVerEnElMapa } = montar([lugar(1)])
    const boton = screen.getByRole('button', { name: 'Ver en el mapa Lugar 1' })
    fireEvent.click(boton)
    expect(onVerEnElMapa).toHaveBeenCalledWith('v1')
  })

  it('«Cómo llegar» abre Google Maps con la dirección (nunca con la posición de nadie)', () => {
    expect(urlComoLlegar({ nombre: 'Plaza', direccion: 'Belgrano 100' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=Plaza%2C%20Belgrano%20100%2C%20Salta',
    )
  })

  it('«Elegí tu barrio» ordena por cercanía y lo dice', () => {
    montar([lugar(1, { nombre: 'Lejos', lat: -24.74, lng: -65.4 }), lugar(2, { nombre: 'Cerca', lat: -24.788, lng: -65.411 })])
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Lejos', 'Cerca'])
    fireEvent.change(screen.getByLabelText('O elegí tu barrio'), { target: { value: 'centro' } })
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Cerca', 'Lejos'])
    expect(screen.getByText('Ordenados por cercanía a Centro.')).toBeTruthy()
    expect(screen.getByText(/a \d+ m en línea recta/)).toBeTruthy()
  })

  it('«Cerca mío» pide la posición solo al tocar, y si no hay permiso lo dice', () => {
    const getCurrentPosition = vi.fn((_ok: PositionCallback, error?: PositionErrorCallback | null) => error?.({ code: 1 } as GeolocationPositionError))
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
    montar([lugar(1)])
    expect(getCurrentPosition).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cerca mío' }))
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(screen.getByText('No pudimos usar tu ubicación. Podés elegir un barrio.')).toBeTruthy()
  })

  it('«Cerca mío» con permiso ordena por distancia', () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) => ok({ coords: { latitude: -24.74, longitude: -65.4 } } as GeolocationPosition))
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
    montar([lugar(1, { nombre: 'Centro' }), lugar(2, { nombre: 'Norte', lat: -24.741, lng: -65.401 })])
    fireEvent.click(screen.getByRole('button', { name: 'Cerca mío' }))
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Norte', 'Centro'])
    expect(screen.getByText('Ordenados por cercanía a tu ubicación.')).toBeTruthy()
  })

  it('los datos de OSM llevan la atribución', () => {
    montar([lugar(1, { deOsm: true })])
    const link = screen.getByRole('link', { name: '© colaboradores de OpenStreetMap' })
    expect(link.getAttribute('href')).toBe('https://www.openstreetmap.org/copyright')
    expect(screen.getByRole('link', { name: 'Cómo llegar Lugar 1' })).toBeTruthy()
  })

  it('en inglés', () => {
    montar([lugar(1, { deOsm: true })], 'en')
    expect(screen.getByRole('heading', { level: 2, name: 'Places for kids' })).toBeTruthy()
    expect(screen.getByText('Indoor playground · Ages 2 to 10')).toBeTruthy()
    expect(screen.getByText('Today: 16:00–20:30')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Near me' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '© OpenStreetMap contributors' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Lugar 1' }).getAttribute('lang')).toBe('es')
  })

  it('vacío', () => {
    montar([])
    expect(screen.getByText('Todavía no hay lugares para chicos verificados con estos filtros.')).toBeTruthy()
  })
})
