import type { CookieParam, Page } from 'puppeteer'

export class PasslineSessionRequiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PasslineSessionRequiredError'
  }
}

function parseCookieHeader(cookieHeader: string): CookieParam[] {
  const cookies: CookieParam[] = []

  for (const rawPair of cookieHeader.split(';')) {
    const pair = rawPair.trim()
    if (!pair) continue

    const separatorIndex = pair.indexOf('=')
    if (separatorIndex <= 0) continue

    const name = pair.slice(0, separatorIndex).trim()
    const value = pair.slice(separatorIndex + 1).trim()
    if (!name || !value) continue

    cookies.push({
      name,
      value,
      domain: '.passline.com',
      path: '/',
    })
  }

  return cookies
}

function parseSameSite(value: unknown): CookieParam['sameSite'] {
  if (value === 'Lax' || value === 'Strict' || value === 'None' || value === 'Default') {
    return value
  }

  return undefined
}

function parseJsonCookies(rawJson: string): CookieParam[] {
  let parsed: unknown

  try {
    parsed = JSON.parse(rawJson)
  } catch {
    throw new PasslineSessionRequiredError(
      'PASSLINE_SESSION_COOKIES_JSON no tiene un JSON valido. Exporta cookies desde tu navegador y vuelve a intentarlo.',
    )
  }

  if (!Array.isArray(parsed)) {
    throw new PasslineSessionRequiredError(
      'PASSLINE_SESSION_COOKIES_JSON debe ser un arreglo de cookies.',
    )
  }

  const cookies: CookieParam[] = []

  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue

    const row = item as Record<string, unknown>
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    const value = typeof row.value === 'string' ? row.value.trim() : ''
    if (!name || !value) continue

    const domain = typeof row.domain === 'string' && row.domain.trim().length > 0
      ? row.domain.trim()
      : '.passline.com'
    const path = typeof row.path === 'string' && row.path.trim().length > 0
      ? row.path.trim()
      : '/'
    const expires = typeof row.expires === 'number' && Number.isFinite(row.expires)
      ? row.expires
      : undefined

    cookies.push({
      name,
      value,
      domain,
      path,
      expires,
      httpOnly: Boolean(row.httpOnly),
      secure: row.secure === undefined ? true : Boolean(row.secure),
      sameSite: parseSameSite(row.sameSite),
    })
  }

  return cookies
}

export function loadPasslineSessionCookies(): CookieParam[] {
  const rawJson = process.env.PASSLINE_SESSION_COOKIES_JSON?.trim()
  if (rawJson) {
    const parsed = parseJsonCookies(rawJson)
    if (parsed.length > 0) {
      return parsed
    }
  }

  const rawHeader = process.env.PASSLINE_SESSION_COOKIE_HEADER?.trim()
  if (rawHeader) {
    const parsed = parseCookieHeader(rawHeader)
    if (parsed.length > 0) {
      return parsed
    }
  }

  throw new PasslineSessionRequiredError(
    'Sesion de Passline no configurada. Define PASSLINE_SESSION_COOKIES_JSON (recomendado) o PASSLINE_SESSION_COOKIE_HEADER con cookies obtenidas manualmente tras validar Queue-it.',
  )
}

export async function applyPasslineSession(page: Page): Promise<void> {
  const cookies = loadPasslineSessionCookies()
  await page.setCookie(...cookies)
}
