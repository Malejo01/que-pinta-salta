/**
 * R75-q (QPS-350): `dominio` de la fuente del próximo evento de un lugar.
 * Lógica pura + test de código fuente de la página. Sin red ni base.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { linkDeFuente, proximaFuentePorLugar } from '@/lib/admin/fuente-lugar'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

describe('linkDeFuente: dominio', () => {
  it('saca el www. inicial', () => {
    expect(linkDeFuente('https://www.sala.ejemplo.test/evento/1')?.dominio).toBe('sala.ejemplo.test')
  })

  it('sin www. queda igual', () => {
    expect(linkDeFuente('https://sala.ejemplo.test/evento/1')?.dominio).toBe('sala.ejemplo.test')
  })

  it('pasa a minúsculas', () => {
    expect(linkDeFuente('HTTPS://WWW.Sala.EJEMPLO.test/Evento')?.dominio).toBe('sala.ejemplo.test')
  })

  it('no incluye el puerto', () => {
    const fuente = linkDeFuente('http://sala.ejemplo.test:8080/evento')
    expect(fuente?.dominio).toBe('sala.ejemplo.test')
    expect(fuente?.dominio).not.toContain(':')
  })

  it('conserva los subdominios que no son www', () => {
    const fuente = linkDeFuente('https://m.instagram.com/p/abc/')
    expect(fuente?.dominio).toBe('m.instagram.com')
    expect(fuente?.rotulo).toBe('Entrada')
  })

  it('instagram.com con www: rótulo Instagram y dominio sin www', () => {
    const fuente = linkDeFuente('https://www.instagram.com/p/abc/')
    expect(fuente?.rotulo).toBe('Instagram')
    expect(fuente?.dominio).toBe('instagram.com')
  })

  it('solo saca un www. inicial, no uno en el medio', () => {
    expect(linkDeFuente('https://www.www.ejemplo.test/')?.dominio).toBe('www.ejemplo.test')
    expect(linkDeFuente('https://awww.ejemplo.test/')?.dominio).toBe('awww.ejemplo.test')
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'ftp://www.sala.ejemplo.test/x',
    'mailto:alguien@ejemplo.test',
    'www.sala.ejemplo.test/evento',
    'sala.ejemplo.test',
    'no es un url',
    '',
    '   ',
  ])('no http/https (%j): null, nunca un dominio', (entrada) => {
    expect(linkDeFuente(entrada)).toBeNull()
  })

  it('null devuelve null', () => {
    expect(linkDeFuente(null)).toBeNull()
  })
})

describe('proximaFuentePorLugar: salta los eventos sin link', () => {
  it('el evento más próximo no tiene link: elige el siguiente que sí', () => {
    const mapa = proximaFuentePorLugar([
      { venue_id: 'v1', start_date: '2026-11-01T22:00:00Z', ticket_url: null },
      { venue_id: 'v1', start_date: '2026-11-02T22:00:00Z', ticket_url: 'javascript:alert(1)' },
      { venue_id: 'v1', start_date: '2026-11-10T22:00:00Z', ticket_url: 'https://www.tercero.ejemplo.test/x' },
      { venue_id: 'v1', start_date: '2026-11-05T22:00:00Z', ticket_url: 'https://www.segundo.ejemplo.test/x' },
    ])
    expect(mapa.get('v1')?.dominio).toBe('segundo.ejemplo.test')
  })

  it('con el más próximo con link, gana ese aunque venga último en la lista', () => {
    const mapa = proximaFuentePorLugar([
      { venue_id: 'v1', start_date: '2026-11-10T22:00:00Z', ticket_url: 'https://b.ejemplo.test/' },
      { venue_id: 'v1', start_date: '2026-11-03T22:00:00Z', ticket_url: 'https://a.ejemplo.test/' },
    ])
    expect(mapa.get('v1')?.dominio).toBe('a.ejemplo.test')
  })

  it('lugares independientes; sin venue o sin link válido no aparecen', () => {
    const mapa = proximaFuentePorLugar([
      { venue_id: null, start_date: '2026-11-01T22:00:00Z', ticket_url: 'https://a.ejemplo.test/' },
      { venue_id: 'v2', start_date: '2026-11-01T22:00:00Z', ticket_url: null },
      { venue_id: 'v3', start_date: '2026-11-01T22:00:00Z', ticket_url: 'https://c.ejemplo.test/' },
    ])
    expect([...mapa.keys()]).toEqual(['v3'])
  })
})

describe('página admin/lugares: código fuente', () => {
  const codigo = readFileSync(path.join(WEB_ROOT, 'app/admin/lugares/page.tsx'), 'utf8')

  it('el rótulo dice "próximo evento con link"', () => {
    expect(codigo).toContain('Fuente (próximo evento con link)')
  })

  it('renderiza fuente.dominio como expresión JSX, sin dangerouslySetInnerHTML', () => {
    expect(codigo).toContain('{fuente.dominio}')
    expect(codigo).not.toContain('dangerouslySetInnerHTML')
  })

  it('valida `guardado` con isUuid', () => {
    expect(codigo).toMatch(/isUuid\(\s*params\?\.guardado\s*\)/)
  })
})
