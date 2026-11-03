// Q5-1 · Lectura del formulario de la ficha (sin base ni sesión).
import { describe, expect, it } from 'vitest'
import { leerFicha, leerFuenteVerificada, leerHorarios, normalizarInstagram, normalizarWeb } from '@/lib/lugares-chicos/formulario'
import { slugDeLugar } from '@/lib/lugares-chicos/slug'

const leer = (datos: Record<string, string>) => (k: string) => datos[k] ?? null

describe('leerFicha', () => {
  it('lee una ficha completa', () => {
    const r = leerFicha(
      leer({
        tipo: 'pelotero',
        acceso: 'pago',
        edad_min: '2',
        edad_max: '10',
        techado: 'techado',
        descripcion_corta: '  Pelotero con juegos para los más chicos.  ',
        tiene_rampa: 'si',
        tiene_bano_adaptado: 'no',
        tiene_cambiador: '',
        contacto_web: 'pelotero.example.com',
        contacto_instagram: '@pelotero.salta',
        contacto_telefono: '+54 387 400-0000',
        h_mar_modo: 'franjas',
        h_mar_1_desde: '16:00',
        h_mar_1_hasta: '20:30',
        h_lun_modo: 'cerrado',
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.datos).toMatchObject({
      tipo: 'pelotero',
      acceso: 'pago',
      edad_min: 2,
      edad_max: 10,
      techado: 'techado',
      descripcion_corta: 'Pelotero con juegos para los más chicos.',
      tiene_rampa: true,
      tiene_bano_adaptado: false,
      tiene_cambiador: null,
      contacto_web: 'https://pelotero.example.com/',
      contacto_instagram: 'https://www.instagram.com/pelotero.salta/',
      horarios: { version: 1, semana: { lun: [], mar: [{ desde: '16:00', hasta: '20:30' }] } },
    })
  })

  it.each([
    [{ tipo: 'cancha' }, /tipo/],
    [{ tipo: 'pelotero', acceso: 'barato' }, /acceso/],
    [{ tipo: 'pelotero', edad_min: '20' }, /0 a 17/],
    [{ tipo: 'pelotero', edad_min: '10', edad_max: '3' }, /mínima/],
    [{ tipo: 'pelotero', contacto_instagram: 'https://evil.example.com/x' }, /Instagram/],
    [{ tipo: 'pelotero', contacto_telefono: 'llamame' }, /teléfono/],
    [{ tipo: 'pelotero', h_mar_modo: 'franjas' }, /franja/],
    [{ tipo: 'pelotero', h_mar_modo: 'franjas', h_mar_1_desde: '21:00', h_mar_1_hasta: '02:00' }, /medianoche/],
  ])('rechaza %j', (datos, mensaje) => {
    const r = leerFicha(leer(datos as Record<string, string>))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(mensaje)
  })

  it('el tope de 280 de la descripción', () => {
    const r = leerFicha(leer({ tipo: 'plaza_juegos', descripcion_corta: 'x'.repeat(400) }))
    expect(r.ok && r.datos.descripcion_corta?.length).toBe(280)
  })
})

describe('horarios desde la grilla', () => {
  it('siempre abierto y con reserva vienen de los checkbox', () => {
    expect(leerHorarios(leer({ h_siempre_abierto: 'on' }))).toEqual({ ok: true, horarios: { version: 1, siempre_abierto: true, semana: {} } })
    expect(leerHorarios(leer({ h_solo_con_reserva: 'on', h_nota: 'Turnos por WhatsApp' }))).toEqual({
      ok: true,
      horarios: { version: 1, solo_con_reserva: true, semana: {}, nota: 'Turnos por WhatsApp' },
    })
  })
})

describe('normalizaciones', () => {
  it('instagram', () => {
    expect(normalizarInstagram('https://instagram.com/lugar/')).toBe('https://www.instagram.com/lugar/')
    expect(normalizarInstagram('lugar_kids')).toBe('https://www.instagram.com/lugar_kids/')
    expect(normalizarInstagram('javascript:alert(1)')).toBe('invalida')
  })
  it('web', () => {
    expect(normalizarWeb('javascript:alert(1)')).toBe('invalida')
    expect(normalizarWeb('localhost')).toBe('invalida')
    expect(normalizarWeb('https://ejemplo.com.ar/x')).toBe('https://ejemplo.com.ar/x')
  })
  it('la fuente de verificación no acepta OSM ni pedido público', () => {
    expect(leerFuenteVerificada(leer({ fuente: 'visita' }))).toBe('visita')
    expect(leerFuenteVerificada(leer({ fuente: 'openstreetmap' }))).toBeNull()
    expect(leerFuenteVerificada(leer({ fuente: 'pedido_publico' }))).toBeNull()
  })
  it('slug como venue_slugify', () => {
    expect(slugDeLugar('Plaza Güemes — Juegos!')).toBe('plaza-guemes-juegos')
  })
})
