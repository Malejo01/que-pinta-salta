/**
 * Detector de solo lectura sobre el workflow de publicidad (R58, tarea 58-b), en
 * el espíritu de `workflow-notificaciones.test.ts`: lee el archivo como TEXTO
 * (sin parser de YAML) y chequea el schedule diario, `workflow_dispatch`,
 * `permissions: {}`, la lista cerrada de `SITE_URL`, el Bearer por header
 * (nunca `?secret=`) y la ruta `/api/cron/publicidad`.
 *
 * De dónde lee: de noche `.github/**` está denegado, así que el workflow vive
 * en `ops/rondas/58-precios-automaticos/publicidad.yml.propuesto` hasta que el
 * lead de día lo copie a `.github/workflows/publicidad.yml`. Cuando exista ese,
 * el test lee ese (se prefiere); si no, el `.propuesto`. El CI no tiene `ops/`:
 * si no existe ninguno de los dos, los tests se saltean (no fallan).
 * Una vez copiado el archivo a `.github/`, se puede borrar el `.propuesto` y la
 * ruta de `ops/` de acá.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RUTA_GITHUB = fileURLToPath(new URL('../../../../.github/workflows/publicidad.yml', import.meta.url))
// QPS-342: el workflow ya vive en .github/; si falta, el test falla (nunca se saltea).
const RUTA = RUTA_GITHUB

function lineasActivas(yaml: string): string[] {
  return yaml.split('\n').filter((linea) => !/^\s*#/.test(linea))
}

describe('workflow de publicidad (solo lectura)', () => {
  it('el archivo existe en .github/workflows/publicidad.yml', () => {
    expect(existsSync(RUTA)).toBe(true)
  })

  const yaml = existsSync(RUTA) ? readFileSync(RUTA, 'utf8') : ''
  const activas = lineasActivas(yaml)

  it('tiene el schedule diario activo, a las 09:00 UTC (06:00 de Salta)', () => {
    expect(activas.some((l) => /^\s*schedule\s*:/.test(l))).toBe(true)
    const crons = activas.filter((l) => /^\s*-\s*cron\s*:/.test(l))
    expect(crons).toHaveLength(1)
    expect(crons[0]).toMatch(/cron:\s*"0 9 \* \* \*"/)
  })

  it('se puede disparar a mano (workflow_dispatch)', () => {
    expect(activas.some((l) => /^\s*workflow_dispatch\s*:/.test(l))).toBe(true)
  })

  it('no da permisos al token: permissions: {}', () => {
    expect(activas.some((l) => /^permissions:\s*\{\}\s*$/.test(l))).toBe(true)
  })

  it('no se pisa con otra corrida (concurrency sin cancelar)', () => {
    expect(activas.some((l) => /^\s*group:\s*publicidad\s*$/.test(l))).toBe(true)
    expect(activas.some((l) => /^\s*cancel-in-progress:\s*false\s*$/.test(l))).toBe(true)
  })

  it('SITE_URL se valida contra la lista cerrada de hosts propios', () => {
    expect(yaml).toContain('https://www.quepintasalta.com.ar|https://quepintasalta.com.ar')
    expect(activas.some((l) => /\*\)\s*echo "::error::SITE_URL no permitido"/.test(l))).toBe(true)
  })

  it('llama a /api/cron/publicidad', () => {
    expect(activas.some((l) => l.includes('/api/cron/publicidad'))).toBe(true)
  })

  it('manda el secreto por header Authorization: Bearer y con x-job-trigger', () => {
    expect(activas.some((l) => /Authorization:\s*Bearer\s+\$\{?CRON_SECRET\}?/.test(l))).toBe(true)
    expect(activas.some((l) => /x-job-trigger:\s*github-actions/.test(l))).toBe(true)
  })

  it('el secreto nunca viaja en la URL (query string)', () => {
    const enUrl = activas.some((l) => {
      if (!/\$\{?CRON_SECRET\}?/.test(l) || /Authorization:\s*Bearer/.test(l)) return false
      return /[?&][a-zA-Z0-9_]*=\$\{?CRON_SECRET\}?/.test(l) || /\$\{?SITE_URL\}?[^\n]*CRON_SECRET/.test(l)
    })
    expect(enUrl).toBe(false)
    expect(yaml).not.toMatch(/\?secret=/)
  })

  it('falla si el status de la corrida es FAILED', () => {
    expect(activas.some((l) => /"FAILED"/.test(l) && /status/.test(l))).toBe(true)
  })
})
