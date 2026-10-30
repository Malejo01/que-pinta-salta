/**
 * `lib/admin/fuente-lugar.ts` (R65-c): el link de la fuente del próximo evento
 * de un lugar. Puro, entorno `node`. El `ticket_url` es dato externo: solo se
 * aceptan http/https.
 */
import { describe, expect, it } from 'vitest'
import { linkDeFuente, proximaFuentePorLugar, type FilaFuente } from '@/lib/admin/fuente-lugar'

describe('linkDeFuente: lo que no es un link web devuelve null', () => {
  it.each([
    ['null', null],
    ['vacío', ''],
    ['solo espacios', '   '],
    ['javascript:', 'javascript:alert(1)'],
    ['javascript: con mayúsculas', 'JavaScript:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['file:', 'file:///etc/passwd'],
    ['ftp:', 'ftp://ejemplo.test/archivo'],
    ['mailto:', 'mailto:alguien@ejemplo.test'],
    ['URL rota', 'esto no es una url'],
    ['sin protocolo', 'www.ejemplo.test/entradas'],
    ['solo el protocolo', 'https://'],
  ])('%s', (_nombre, entrada) => {
    expect(linkDeFuente(entrada)).toBeNull()
  })
})

describe('linkDeFuente: http y https', () => {
  it('https de una ticketera: rótulo Entrada', () => {
    expect(linkDeFuente('https://entradas.ejemplo.test/evento/123')).toEqual({
      href: 'https://entradas.ejemplo.test/evento/123',
      rotulo: 'Entrada',
    })
  })

  it('http también se acepta', () => {
    expect(linkDeFuente('http://entradas.ejemplo.test/evento')?.rotulo).toBe('Entrada')
  })

  it('instagram.com y www.instagram.com: rótulo Instagram (sin importar mayúsculas)', () => {
    expect(linkDeFuente('https://www.instagram.com/p/AbC123/')?.rotulo).toBe('Instagram')
    expect(linkDeFuente('https://instagram.com/venue_de_prueba')?.rotulo).toBe('Instagram')
    expect(linkDeFuente('https://WWW.Instagram.COM/p/AbC123/')?.rotulo).toBe('Instagram')
  })

  it('un host que solo contiene "instagram" NO es Instagram', () => {
    expect(linkDeFuente('https://instagram.com.malo.test/p/1')?.rotulo).toBe('Entrada')
    expect(linkDeFuente('https://falso-instagram.com/p/1')?.rotulo).toBe('Entrada')
    expect(linkDeFuente('https://ejemplo.test/instagram.com')?.rotulo).toBe('Entrada')
  })

  it('recorta espacios y devuelve la URL normalizada', () => {
    expect(linkDeFuente('  https://entradas.ejemplo.test/evento  ')?.href).toBe('https://entradas.ejemplo.test/evento')
  })
})

describe('proximaFuentePorLugar', () => {
  const fila = (venue_id: string | null, start_date: string, ticket_url: string | null): FilaFuente => ({
    venue_id,
    start_date,
    ticket_url,
  })

  it('por lugar elige el link del evento con start_date más chico, sin importar el orden de entrada', () => {
    const mapa = proximaFuentePorLugar([
      fila('lugar-a', '2026-11-20T23:00:00Z', 'https://entradas.ejemplo.test/tarde'),
      fila('lugar-a', '2026-11-01T23:00:00Z', 'https://www.instagram.com/p/temprano/'),
      fila('lugar-a', '2026-11-10T23:00:00Z', 'https://entradas.ejemplo.test/medio'),
      fila('lugar-b', '2026-12-01T23:00:00Z', 'https://entradas.ejemplo.test/b'),
    ])

    expect(mapa.get('lugar-a')).toEqual({ href: 'https://www.instagram.com/p/temprano/', rotulo: 'Instagram' })
    expect(mapa.get('lugar-b')).toEqual({ href: 'https://entradas.ejemplo.test/b', rotulo: 'Entrada' })
    expect(mapa.size).toBe(2)
  })

  it('un evento más cercano SIN link válido no tapa a uno posterior con link', () => {
    const mapa = proximaFuentePorLugar([
      fila('lugar-a', '2026-11-01T23:00:00Z', null),
      fila('lugar-a', '2026-11-02T23:00:00Z', 'javascript:alert(1)'),
      fila('lugar-a', '2026-11-15T23:00:00Z', 'https://entradas.ejemplo.test/ok'),
    ])

    expect(mapa.get('lugar-a')?.href).toBe('https://entradas.ejemplo.test/ok')
  })

  it('los lugares sin ningún link válido no aparecen en el mapa', () => {
    const mapa = proximaFuentePorLugar([
      fila('lugar-a', '2026-11-01T23:00:00Z', null),
      fila('lugar-b', '2026-11-01T23:00:00Z', 'data:text/html,hola'),
    ])

    expect(mapa.has('lugar-a')).toBe(false)
    expect(mapa.has('lugar-b')).toBe(false)
    expect(mapa.size).toBe(0)
  })

  it('ignora las filas sin venue_id y las de fecha inválida', () => {
    const mapa = proximaFuentePorLugar([
      fila(null, '2026-11-01T23:00:00Z', 'https://entradas.ejemplo.test/huerfano'),
      fila('lugar-a', 'no es una fecha', 'https://entradas.ejemplo.test/fecha-rota'),
      fila('lugar-a', '2026-11-05T23:00:00Z', 'https://entradas.ejemplo.test/ok'),
    ])

    expect([...mapa.keys()]).toEqual(['lugar-a'])
    expect(mapa.get('lugar-a')?.href).toBe('https://entradas.ejemplo.test/ok')
  })

  it('sin filas devuelve un mapa vacío', () => {
    expect(proximaFuentePorLugar([]).size).toBe(0)
  })

  it('con la misma fecha en dos eventos se queda con el primero que vio', () => {
    const mapa = proximaFuentePorLugar([
      fila('lugar-a', '2026-11-01T23:00:00Z', 'https://entradas.ejemplo.test/primero'),
      fila('lugar-a', '2026-11-01T23:00:00Z', 'https://entradas.ejemplo.test/segundo'),
    ])

    expect(mapa.get('lugar-a')?.href).toBe('https://entradas.ejemplo.test/primero')
  })
})
