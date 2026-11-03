// Q5-3 · «Sumá un lugar para chicos»: validación y anti-spam (puros), y
// detectores de la server action y del formulario.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TIEMPO_MAXIMO_MS, TIEMPO_MINIMO_MS, evaluarAntiSpam, validarPedido } from '@/lib/lugares-chicos/pedido'
import { tieneVersionEnIngles } from '@/lib/i18n/rutas'

const leer = (datos: Record<string, string>) => (k: string) => datos[k] ?? null
const AHORA = 1_800_000_000_000

describe('anti-spam', () => {
  it('honeypot con algo: bot', () => {
    expect(evaluarAntiSpam(leer({ sitio: 'http://spam', iniciado: String(AHORA - 60_000) }), AHORA)).toBe('bot')
  })
  it('sin iniciado o menos del tiempo mínimo: bot', () => {
    expect(evaluarAntiSpam(leer({}), AHORA)).toBe('bot')
    expect(evaluarAntiSpam(leer({ iniciado: 'x' }), AHORA)).toBe('bot')
    expect(evaluarAntiSpam(leer({ iniciado: String(AHORA - TIEMPO_MINIMO_MS + 1) }), AHORA)).toBe('bot')
  })
  it('formulario muy viejo: vencido (se pide recargar)', () => {
    expect(evaluarAntiSpam(leer({ iniciado: String(AHORA - TIEMPO_MAXIMO_MS - 1) }), AHORA)).toBe('vencido')
  })
  it('una persona: ok', () => {
    expect(evaluarAntiSpam(leer({ sitio: '', iniciado: String(AHORA - 30_000) }), AHORA)).toBe('ok')
  })
})

describe('validarPedido', () => {
  it('lo mínimo: nombre y dirección del LUGAR (nada personal obligatorio)', () => {
    expect(validarPedido(leer({ nombre: '  Plaza   Alvarado ', direccion: 'Alvarado y Lerma' }))).toEqual({
      ok: true,
      datos: { nombre: 'Plaza Alvarado', direccion: 'Alvarado y Lerma', tipo: null, comentario: null, link: null, contacto: null },
    })
  })
  it('completo', () => {
    const r = validarPedido(leer({ nombre: 'Pelotero X', direccion: 'Calle 1', tipo: 'pelotero', link: 'instagram.com/peloterox', comentario: 'Abre de tarde', contacto: 'yo@example.com' }))
    expect(r).toEqual({
      ok: true,
      datos: { nombre: 'Pelotero X', direccion: 'Calle 1', tipo: 'pelotero', comentario: 'Abre de tarde', link: 'https://instagram.com/peloterox', contacto: 'yo@example.com' },
    })
  })
  it.each([
    [{ nombre: 'ab', direccion: 'Calle 1' }, 'nombre'],
    [{ nombre: 'Plaza', direccion: '' }, 'direccion'],
    [{ nombre: 'Plaza', direccion: 'Calle 1', tipo: 'cancha' }, 'tipo'],
    [{ nombre: 'Plaza', direccion: 'Calle 1', link: 'javascript:alert(1)' }, 'link'],
    [{ nombre: 'Plaza', direccion: 'Calle 1', contacto: 'abc' }, 'contacto'],
    [{ nombre: 'Plaza', direccion: 'Calle 1', comentario: 'x'.repeat(1001) }, 'comentario'],
  ])('rechaza %j → %s', (datos, codigo) => {
    expect(validarPedido(leer(datos as Record<string, string>))).toEqual({ ok: false, codigo })
  })
})

describe('server action y formulario', () => {
  const accion = readFileSync(join(process.cwd(), 'lib', 'actions', 'sumar-lugar-chicos.ts'), 'utf8')
  const formulario = readFileSync(join(process.cwd(), 'components', 'lugares-chicos', 'formulario-sumar.tsx'), 'utf8')
  it('el orden: anti-spam, límite por IP, validación y recién ahí la base', () => {
    const i = (t: string) => accion.indexOf(t)
    expect(i('evaluarAntiSpam(')).toBeGreaterThan(0)
    expect(i('evaluarAntiSpam(')).toBeLessThan(i('porIp.permitir('))
    expect(i('porIp.permitir(')).toBeLessThan(i('validarPedido('))
    expect(i('validarPedido(')).toBeLessThan(i('createAdminClient()'))
    expect(accion).toMatch(/if \(antiSpam === 'bot'\) return \{ estado: 'enviado' \}/)
  })
  it('no loguea lo que escribió la persona', () => {
    for (const linea of accion.split('\n').filter((l) => l.includes('console.'))) {
      expect(linea).not.toMatch(/datos|contacto|nombre|ip|leer\(/i)
    }
  })
  it('el honeypot no se ve ni se llega con Tab', () => {
    expect(formulario).toMatch(/aria-hidden="true"[^>]*-left-\[10000px\]/)
    expect(formulario).toMatch(/name="sitio" tabIndex=\{-1\} autoComplete="off"/)
  })
  it('el contacto es opcional y dice para qué se usa', () => {
    expect(formulario).not.toMatch(/name="contacto"[^>]*required/)
    expect(formulario).toMatch(/aria-describedby=\{\["ayuda-contacto"/)
  })
  it('la página existe en castellano y en inglés', () => {
    expect(tieneVersionEnIngles('/lugares-chicos/sumar')).toBe(true)
  })
})
