import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// QPS-161: los endpoints que tocan red (los tres se invocan por HTTP en
// Vercel: `scrape` por vercel.json, `recurrentes` y `process-flyers` por
// workflows de GitHub Actions) necesitan `export const maxDuration = 60`
// para que Vercel no corte la función a mitad y deje la corrida en RUNNING.
//
// Nota: el endpoint real es app/api/ai/process-flyers/route.ts, NO
// app/api/cron/process-flyers/route.ts (ese archivo no existe). La lista de
// abajo es la lista real: si alguien la achica, este test se pone rojo.
const ARCHIVOS_CON_RED = [
  'app/api/cron/scrape/route.ts',
  'app/api/cron/recurrentes/route.ts',
  'app/api/ai/process-flyers/route.ts',
] as const

/** Saca comentarios de línea y de bloque, sin tocar el contenido de strings ni de template literals. */
function sacarComentarios(codigo: string): string {
  let salida = ''
  let i = 0
  let enComentarioDeLinea = false
  let enComentarioDeBloque = false
  let stringAbierto: string | null = null

  while (i < codigo.length) {
    const c = codigo[i]
    const siguiente = codigo[i + 1]

    if (enComentarioDeLinea) {
      if (c === '\n') {
        enComentarioDeLinea = false
        salida += c
      }
      i += 1
      continue
    }

    if (enComentarioDeBloque) {
      if (c === '*' && siguiente === '/') {
        enComentarioDeBloque = false
        i += 2
        continue
      }
      if (c === '\n') salida += c
      i += 1
      continue
    }

    if (stringAbierto) {
      salida += c
      if (c === '\\') {
        salida += codigo[i + 1] ?? ''
        i += 2
        continue
      }
      if (c === stringAbierto) stringAbierto = null
      i += 1
      continue
    }

    if (c === '/' && siguiente === '/') {
      enComentarioDeLinea = true
      i += 2
      continue
    }
    if (c === '/' && siguiente === '*') {
      enComentarioDeBloque = true
      i += 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      stringAbierto = c
      salida += c
      i += 1
      continue
    }

    salida += c
    i += 1
  }

  return salida
}

/** `true` solo si el código (ya sin comentarios) declara `export const maxDuration = 60` al inicio de una línea. */
function declaraMaxDuration60(codigoSinComentarios: string): boolean {
  return /^[ \t]*export const maxDuration[ \t]*=[ \t]*60;?[ \t]*$/m.test(codigoSinComentarios)
}

function leerArchivoDeTest(rutaRelativaAEsteArchivo: string): string {
  return readFileSync(fileURLToPath(new URL(rutaRelativaAEsteArchivo, import.meta.url)), 'utf-8')
}

describe('maxDuration en los crones que tocan red (QPS-161)', () => {
  it('la lista de archivos a comprobar es exactamente esta (si se achica, esto falla)', () => {
    expect(ARCHIVOS_CON_RED).toEqual([
      'app/api/cron/scrape/route.ts',
      'app/api/cron/recurrentes/route.ts',
      'app/api/ai/process-flyers/route.ts',
    ])
    expect(ARCHIVOS_CON_RED).toHaveLength(3)
  })

  it.each(ARCHIVOS_CON_RED)('%s exporta `maxDuration = 60` como código real (no comentado)', (rutaDesdeAppsWeb) => {
    // Lee desde la raíz de apps/web; si el archivo no existe, readFileSync
    // tira y el test falla (no se saltea).
    const fuente = leerArchivoDeTest(`../../${rutaDesdeAppsWeb}`)
    const sinComentarios = sacarComentarios(fuente)
    expect(declaraMaxDuration60(sinComentarios)).toBe(true)
  })
})

describe('el detector no se evade con comentarios ni con strings parecidos', () => {
  it('no cuenta una línea real pero comentada, aunque al lado haya una rota', () => {
    const trampa = `
      // export const maxDuration = 60
      export let maxDuration = 61
    `
    expect(declaraMaxDuration60(sacarComentarios(trampa))).toBe(false)
  })

  it('no cuenta un comentario de bloque con el texto correcto adentro', () => {
    const trampa = `
      /*
       * export const maxDuration = 60
       */
      export const maxDuration = 61
    `
    expect(declaraMaxDuration60(sacarComentarios(trampa))).toBe(false)
  })

  it('no cuenta el texto dentro de un string, aunque sea idéntico al real', () => {
    const trampa = `const log = "ojo: export const maxDuration = 60 (esto es un string)"`
    expect(declaraMaxDuration60(sacarComentarios(trampa))).toBe(false)
  })

  it('no cuenta un valor distinto de 60 (ej. 600 o 59)', () => {
    expect(declaraMaxDuration60('export const maxDuration = 600')).toBe(false)
    expect(declaraMaxDuration60('export const maxDuration = 59')).toBe(false)
  })

  it('sí cuenta la declaración real, con o sin punto y coma', () => {
    expect(declaraMaxDuration60('export const maxDuration = 60')).toBe(true)
    expect(declaraMaxDuration60('export const maxDuration = 60;')).toBe(true)
  })

  it('un archivo inexistente hace fallar el test, no lo saltea', () => {
    expect(() => leerArchivoDeTest('../../app/api/cron/no-existe-para-nada/route.ts')).toThrow()
  })
})
