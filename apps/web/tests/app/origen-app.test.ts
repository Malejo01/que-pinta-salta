// 23-d: origen `app` en las métricas propias (QPS-027, R23). Sin red ni base:
// solo las funciones puras de lib/metricas/links.ts.
import { describe, expect, it } from 'vitest'
import { METRIC_ORIGINS, parseOrigin } from '@/lib/metricas/links'

describe('METRIC_ORIGINS', () => {
  it("incluye 'app'", () => {
    expect(METRIC_ORIGINS).toContain('app')
  })
})

describe('parseOrigin', () => {
  it("'app' se acepta tal cual", () => {
    expect(parseOrigin('app')).toBe('app')
  })

  it('un origen inventado cae en "directo", igual que antes de la R23', () => {
    expect(parseOrigin('inventado-no-existe')).toBe('directo')
    expect(parseOrigin('')).toBe('directo')
    expect(parseOrigin(undefined)).toBe('directo')
    expect(parseOrigin(123)).toBe('directo')
  })

  it('todos los orígenes de la lista se aceptan tal cual (ya cubría esto antes de la R23; lo repetimos acá porque "app" se suma a la misma lista)', () => {
    for (const origin of METRIC_ORIGINS) {
      expect(parseOrigin(origin)).toBe(origin)
    }
  })
})
