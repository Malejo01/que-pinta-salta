import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  signUnsubscribe,
  verifyUnsubscribe,
  unsubscribeUrl,
  unsubscribeApiUrl,
  unsubscribeHeaders,
} from '@/lib/radar/baja'

const UID = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const SECRET = 'secreto-falso-de-prueba'
const original = process.env.RADAR_UNSUBSCRIBE_SECRET

beforeEach(() => {
  process.env.RADAR_UNSUBSCRIBE_SECRET = SECRET
})
afterEach(() => {
  if (original === undefined) delete process.env.RADAR_UNSUBSCRIBE_SECRET
  else process.env.RADAR_UNSUBSCRIBE_SECRET = original
})

function flip(s: string, i = 0) {
  const c = s[i] === 'a' ? 'b' : 'a'
  return s.slice(0, i) + c + s.slice(i + 1)
}

describe('signUnsubscribe / verifyUnsubscribe', () => {
  it('firma y verifica el mismo uuid', () => {
    const t = signUnsubscribe(UID)!
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(verifyUnsubscribe(UID, t)).toBe(true)
  })
  it('es determinista y acepta el uuid en mayúsculas', () => {
    const t = signUnsubscribe(UID)!
    expect(signUnsubscribe(UID)).toBe(t)
    const upper = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE'
    expect(signUnsubscribe(upper)).toBe(signUnsubscribe(upper.toLowerCase()))
    expect(verifyUnsubscribe(upper, signUnsubscribe(upper.toLowerCase())!)).toBe(true)
  })
  it('un carácter cambiado en el token da false', () => {
    const t = signUnsubscribe(UID)!
    for (const i of [0, 10, t.length - 1]) expect(verifyUnsubscribe(UID, flip(t, i))).toBe(false)
  })
  it('un carácter cambiado en el uuid da false', () => {
    const t = signUnsubscribe(UID)!
    expect(verifyUnsubscribe(UID.replace(/^1/, '3'), t)).toBe(false)
  })
  it('token de otro uuid da false', () => {
    expect(verifyUnsubscribe(UID, signUnsubscribe(OTHER)!)).toBe(false)
  })
  it('token vacío, truncado, largo o no string da false', () => {
    const t = signUnsubscribe(UID)!
    expect(verifyUnsubscribe(UID, '')).toBe(false)
    expect(verifyUnsubscribe(UID, t.slice(0, -1))).toBe(false)
    expect(verifyUnsubscribe(UID, t + 'x')).toBe(false)
    expect(verifyUnsubscribe(UID, undefined as unknown as string)).toBe(false)
    expect(verifyUnsubscribe(UID, null as unknown as string)).toBe(false)
  })
  it('uuid inválido da null / false', () => {
    for (const bad of ['', 'abc', 'no-es-uuid', UID + 'x', ' ' + UID, "' OR 1=1 --", undefined as unknown as string]) {
      expect(signUnsubscribe(bad)).toBeNull()
      expect(verifyUnsubscribe(bad, 'cualquiera')).toBe(false)
    }
  })
  it('sin secreto, vacío o en blanco: sign null y verify false', () => {
    const t = signUnsubscribe(UID)!
    for (const v of [undefined, '', '   ']) {
      if (v === undefined) delete process.env.RADAR_UNSUBSCRIBE_SECRET
      else process.env.RADAR_UNSUBSCRIBE_SECRET = v
      expect(signUnsubscribe(UID)).toBeNull()
      expect(verifyUnsubscribe(UID, t)).toBe(false)
      expect(unsubscribeUrl(UID)).toBeNull()
      expect(unsubscribeApiUrl(UID)).toBeNull()
      expect(unsubscribeHeaders(UID)).toBeUndefined()
    }
  })
  it('con otro secreto da false', () => {
    const t = signUnsubscribe(UID)!
    process.env.RADAR_UNSUBSCRIBE_SECRET = 'otro-secreto-falso'
    expect(verifyUnsubscribe(UID, t)).toBe(false)
  })
})

describe('URLs y headers', () => {
  it('las URLs llevan u y t, y no contienen @ ni email', () => {
    for (const url of [unsubscribeUrl(UID)!, unsubscribeApiUrl(UID)!]) {
      expect(url).not.toContain('@')
      expect(url).not.toContain('%40')
      const p = new URL(url)
      expect(p.protocol).toBe('https:')
      expect(p.searchParams.get('u')).toBe(UID)
      expect(verifyUnsubscribe(p.searchParams.get('u')!, p.searchParams.get('t')!)).toBe(true)
    }
    expect(new URL(unsubscribeUrl(UID)!).pathname).toBe('/radar/baja')
    expect(new URL(unsubscribeApiUrl(UID)!).pathname).toBe('/api/radar/baja')
  })
  it('con secreto: headers RFC 8058 con formato <https://...>', () => {
    const h = unsubscribeHeaders(UID)!
    expect(h['List-Unsubscribe']).toMatch(/^<https:\/\/[^<>\s]+>$/)
    expect(h['List-Unsubscribe']).toBe(`<${unsubscribeApiUrl(UID)}>`)
    expect(h['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
  })
  it('uuid inválido: sin URLs ni headers', () => {
    expect(unsubscribeUrl('x')).toBeNull()
    expect(unsubscribeHeaders('x')).toBeUndefined()
  })
})
