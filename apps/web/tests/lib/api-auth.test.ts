// Tarea 32-q (QA): lib/api-auth.ts no tenía test unitario dedicado (sólo se ejercía de forma
// indirecta, "sin Bearer: 401", en cada route handler de cron/webhook). Caracteriza la falla
// cerrada: sin secreto configurado se rechaza todo, aunque el llamador mande cualquier cosa.
// Sin red ni base: Request de la Web API nativa, variables de entorno de prueba.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hasApifyWebhookSecret, hasBearerSecret } from '@/lib/api-auth'

const CRON_ENV = process.env.CRON_SECRET
const APIFY_ENV = process.env.APIFY_WEBHOOK_SECRET
const SECRET = 'secreto-de-prueba-no-real'

const req = (headers: Record<string, string> = {}, url = 'http://localhost/api/cron/prueba') =>
  new Request(url, { headers })

beforeEach(() => {
  delete process.env.CRON_SECRET
  delete process.env.APIFY_WEBHOOK_SECRET
})
afterEach(() => {
  if (CRON_ENV === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = CRON_ENV
  if (APIFY_ENV === undefined) delete process.env.APIFY_WEBHOOK_SECRET
  else process.env.APIFY_WEBHOOK_SECRET = APIFY_ENV
})

describe('hasBearerSecret: falla cerrado', () => {
  it('CRON_SECRET no definida: rechaza aunque no haya ningún header', () => {
    expect(hasBearerSecret(req(), 'CRON_SECRET')).toBe(false)
  })

  it('CRON_SECRET vacía o solo espacios: rechaza igual que si no estuviera definida', () => {
    process.env.CRON_SECRET = ''
    expect(hasBearerSecret(req({ authorization: 'Bearer cualquier-cosa' }), 'CRON_SECRET')).toBe(false)
    process.env.CRON_SECRET = '   '
    expect(hasBearerSecret(req({ authorization: 'Bearer cualquier-cosa' }), 'CRON_SECRET')).toBe(false)
  })

  it('CRON_SECRET no definida: ni siquiera el secreto "correcto" por casualidad (undefined) pasa', () => {
    // Si el código comparara contra `undefined` con == en vez de fallar antes, un header
    // "Bearer undefined" podría colarse. No es el caso: se rechaza antes de comparar.
    expect(hasBearerSecret(req({ authorization: 'Bearer undefined' }), 'CRON_SECRET')).toBe(false)
  })
})

describe('hasBearerSecret: con secreto configurado', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET
  })

  it('Bearer con el secreto exacto: acepta', () => {
    expect(hasBearerSecret(req({ authorization: `Bearer ${SECRET}` }), 'CRON_SECRET')).toBe(true)
  })

  it('sin header Authorization: rechaza', () => {
    expect(hasBearerSecret(req(), 'CRON_SECRET')).toBe(false)
  })

  it('secreto incorrecto: rechaza', () => {
    expect(hasBearerSecret(req({ authorization: 'Bearer otro-secreto' }), 'CRON_SECRET')).toBe(false)
  })

  it('secreto correcto pero más corto o más largo (longitud distinta): rechaza sin tirar', () => {
    expect(hasBearerSecret(req({ authorization: 'Bearer secreto-de-prueba-no-real-extra' }), 'CRON_SECRET')).toBe(false)
    expect(hasBearerSecret(req({ authorization: 'Bearer secreto' }), 'CRON_SECRET')).toBe(false)
  })

  it('sin el prefijo "Bearer ": rechaza aunque el valor sea correcto', () => {
    expect(hasBearerSecret(req({ authorization: SECRET }), 'CRON_SECRET')).toBe(false)
  })

  it('prefijo con mayúsculas distintas ("bearer"): rechaza (case-sensitive)', () => {
    expect(hasBearerSecret(req({ authorization: `bearer ${SECRET}` }), 'CRON_SECRET')).toBe(false)
  })

  it('espacios extra alrededor del secreto en el header: se recortan y acepta', () => {
    expect(hasBearerSecret(req({ authorization: `Bearer  ${SECRET}  ` }), 'CRON_SECRET')).toBe(true)
  })

  it('el secreto por query string no alcanza: solo se acepta por header', () => {
    expect(hasBearerSecret(req({}, `http://localhost/api/cron/prueba?secret=${SECRET}`), 'CRON_SECRET')).toBe(false)
  })

  it('APIFY_WEBHOOK_SECRET no está configurada: no filtra hacia el chequeo de CRON_SECRET', () => {
    // Pide explícitamente CRON_SECRET: que exista APIFY_WEBHOOK_SECRET (o no) no cambia nada.
    process.env.APIFY_WEBHOOK_SECRET = 'otro-secreto-de-prueba'
    expect(hasBearerSecret(req({ authorization: `Bearer ${SECRET}` }), 'CRON_SECRET')).toBe(true)
    expect(hasBearerSecret(req({ authorization: 'Bearer otro-secreto-de-prueba' }), 'CRON_SECRET')).toBe(false)
  })
})

describe('hasApifyWebhookSecret: falla cerrado', () => {
  it('APIFY_WEBHOOK_SECRET no definida: rechaza', () => {
    expect(hasApifyWebhookSecret(req())).toBe(false)
  })

  it('APIFY_WEBHOOK_SECRET vacía: rechaza', () => {
    process.env.APIFY_WEBHOOK_SECRET = ''
    expect(hasApifyWebhookSecret(req({ 'x-apify-webhook-secret': 'lo-que-sea' }))).toBe(false)
  })
})

describe('hasApifyWebhookSecret: con secreto configurado', () => {
  beforeEach(() => {
    process.env.APIFY_WEBHOOK_SECRET = SECRET
  })

  it('header x-apify-webhook-secret con el valor exacto: acepta', () => {
    expect(hasApifyWebhookSecret(req({ 'x-apify-webhook-secret': SECRET }))).toBe(true)
  })

  it('sin el header: rechaza', () => {
    expect(hasApifyWebhookSecret(req())).toBe(false)
  })

  it('valor incorrecto: rechaza', () => {
    expect(hasApifyWebhookSecret(req({ 'x-apify-webhook-secret': 'otro-valor' }))).toBe(false)
  })

  it('no usa el header Authorization (no se mezcla con hasBearerSecret)', () => {
    expect(hasApifyWebhookSecret(req({ authorization: `Bearer ${SECRET}` }))).toBe(false)
  })
})
