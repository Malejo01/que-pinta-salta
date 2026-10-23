/**
 * QPS-261 (Ronda 56, tarea 56-e): `testsQueLeen` y `quitarComentarios`.
 *
 * Sin red ni base: todo con fixtures en memoria, salvo el caso real de la
 * R47 (al final), que sí lee del disco los dos archivos reales para probar
 * la herramienta contra el motivo por el que existe.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { quitarComentarios, testsQueLeen } from '@/lib/rondas/tests-que-leen'

describe('testsQueLeen: import', () => {
  it('@/components/x en un test de apps/web resuelve al event-modal de la web; el mismo especificador en apps/mobile resuelve al de mobile (no al de la web)', () => {
    const testWeb = {
      ruta: 'apps/web/tests/componentes/event-modal-web.test.ts',
      texto: [
        "import { EventModal } from '@/components/event-modal'",
        '',
        "describe('algo', () => {",
        "  it('existe', () => { expect(EventModal).toBeDefined() })",
        '})',
      ].join('\n'),
    }
    const testMobile = {
      ruta: 'apps/mobile/tests/componentes/event-modal-mobile.test.ts',
      texto: [
        "import { EventModal } from '@/components/event-modal'",
        '',
        "describe('algo', () => {",
        "  it('existe', () => { expect(EventModal).toBeDefined() })",
        '})',
      ].join('\n'),
    }
    const objWeb = 'apps/web/components/event-modal.tsx'
    const objMobile = 'apps/mobile/components/event-modal.tsx'

    const hallazgos = testsQueLeen([objWeb, objMobile], [testWeb, testMobile])

    expect(hallazgos).toContainEqual({ objetivo: objWeb, test: testWeb.ruta, como: 'import' })
    expect(hallazgos).toContainEqual({ objetivo: objMobile, test: testMobile.ruta, como: 'import' })
    // Ninguno cruzado: el especificador de la web no resuelve al componente de mobile, ni viceversa.
    expect(hallazgos.find((h) => h.objetivo === objWeb && h.test === testMobile.ruta)).toBeUndefined()
    expect(hallazgos.find((h) => h.objetivo === objMobile && h.test === testWeb.ruta)).toBeUndefined()
  })

  it('relativo (../../lib/algo) sin extensión -> import', () => {
    const test = {
      ruta: 'apps/web/tests/lib/algo.test.ts',
      texto: "import { algo } from '../../lib/algo'\n\nit('anda', () => { algo() })",
    }
    const objetivo = 'apps/web/lib/algo.ts'

    const hallazgos = testsQueLeen([objetivo], [test])

    expect(hallazgos).toContainEqual({ objetivo, test: test.ruta, como: 'import' })
  })

  // El especificador de core de este fixture tiene que ser un submódulo que
  // EXISTA de verdad en `packages/core/src/`, y no uno inventado. Motivo:
  // `tests/core/exports.test.ts` (QPS-200) busca con una regex todos los
  // literales `@qps/core/<x>` del repo y exige que el mapa de `exports` de
  // core resuelva cada uno a un archivo real. Esa regex no distingue un
  // import de verdad de un fixture de un test, así que un
  // `'@qps/core/mapa/inventado'` acá pone en rojo un test ajeno sin que nada
  // esté mal. Es la misma familia que el falso positivo de voseo de la R51 y
  // el de los template literals de la R49: un detector que lee texto crudo.
  it('@qps/core/mapa/zona -> packages/core/src/mapa/zona.ts', () => {
    const test = {
      ruta: 'apps/web/tests/mapa/zona.test.ts',
      texto: "import { estaEnZona } from '@qps/core/mapa/zona'\n\nit('anda', () => { estaEnZona() })",
    }
    const objetivo = 'packages/core/src/mapa/zona.ts'

    const hallazgos = testsQueLeen([objetivo], [test])

    expect(hallazgos).toContainEqual({ objetivo, test: test.ruta, como: 'import' })
  })
})

describe('testsQueLeen: ruta', () => {
  it('readFileSync(join(WEB, "components", "event-modal.tsx")) -> ruta (segmentos consecutivos de una misma llamada)', () => {
    const test = {
      ruta: 'apps/web/tests/lib/otra-cosa.test.ts',
      texto: [
        "import { readFileSync } from 'node:fs'",
        "import { join } from 'node:path'",
        '',
        "const WEB = join(__dirname, '..', '..')",
        "const src = readFileSync(join(WEB, 'components', 'event-modal.tsx'), 'utf8')",
        '',
        "it('tiene algo', () => { expect(src).toContain('algo') })",
      ].join('\n'),
    }
    const objetivo = 'apps/web/components/event-modal.tsx'

    const hallazgos = testsQueLeen([objetivo], [test])

    expect(hallazgos).toContainEqual({ objetivo, test: test.ruta, como: 'ruta' })
  })

  it('new URL("../../components/event-modal.tsx", import.meta.url) -> ruta', () => {
    const test = {
      ruta: 'apps/web/tests/lib/otra-cosa-2.test.ts',
      texto: [
        "const archivo = new URL('../../components/event-modal.tsx', import.meta.url)",
        '',
        "it('anda', () => { expect(archivo).toBeDefined() })",
      ].join('\n'),
    }
    const objetivo = 'apps/web/components/event-modal.tsx'

    const hallazgos = testsQueLeen([objetivo], [test])

    expect(hallazgos).toContainEqual({ objetivo, test: test.ruta, como: 'ruta' })
  })
})

describe('testsQueLeen: posible', () => {
  it('solo el nombre del archivo, sin carpeta -> posible', () => {
    const test = {
      ruta: 'apps/web/tests/lib/nombre-suelto.test.ts',
      texto: "const nombreArchivo = 'event-modal.tsx'\n\nit('anda', () => { console.log(nombreArchivo) })",
    }
    const objetivo = 'apps/web/components/event-modal.tsx'

    const hallazgos = testsQueLeen([objetivo], [test])

    expect(hallazgos).toContainEqual({ objetivo, test: test.ruta, como: 'posible' })
  })
})

describe('testsQueLeen: lo que decidimos NO contar', () => {
  it('el mismo literal dentro de un comentario no cuenta, y una URL con // dentro de un string no rompe nada', () => {
    const test = {
      ruta: 'apps/web/tests/lib/comentario.test.ts',
      texto: [
        "// Ojo: 'event-modal.tsx' solo aparece en este comentario, no es una referencia real.",
        "const url = 'https://ejemplo.com/event-modal.tsx'",
        '',
        "describe('nada', () => {",
        "  it('no referencia nada de evento', () => { expect(1).toBe(1) })",
        '})',
      ].join('\n'),
    }
    const objetivo = 'apps/web/components/event-modal.tsx'

    const hallazgos = testsQueLeen([objetivo], [test])

    expect(hallazgos.find((h) => h.test === test.ruta)).toBeUndefined()
  })

  it('un test que no nombra el objetivo de ninguna forma no aparece (caso negativo)', () => {
    const test = {
      ruta: 'apps/web/tests/lib/sin-relacion.test.ts',
      texto: "import { otraCosa } from '@/lib/otra-cosa'\n\nit('anda', () => { otraCosa() })",
    }
    const objetivo = 'apps/web/components/event-modal.tsx'

    const hallazgos = testsQueLeen([objetivo], [test])

    expect(hallazgos.find((h) => h.test === test.ruta)).toBeUndefined()
  })
})

describe('quitarComentarios', () => {
  it('borra comentarios de línea y de bloque', () => {
    const texto = ["const a = 1 // comentario de línea", '/* comentario', 'de bloque */ const b = 2'].join('\n')

    const limpio = quitarComentarios(texto)

    expect(limpio).not.toContain('comentario de línea')
    expect(limpio).not.toContain('comentario')
    expect(limpio).toContain('const a = 1')
    expect(limpio).toContain('const b = 2')
  })

  it('no rompe una URL con // dentro de un string', () => {
    const texto = "const url = 'https://ejemplo.com/evento' // no es un comentario de la URL"

    const limpio = quitarComentarios(texto)

    expect(limpio).toContain("const url = 'https://ejemplo.com/evento'")
    expect(limpio).not.toContain('no es un comentario')
  })
})

describe('Caso real de la R47 (QPS-158): event-modal.tsx', () => {
  // apps/web/tests/rondas -> apps/web/tests -> apps/web
  const APPS_WEB = join(__dirname, '..', '..')
  const ARCHIVOS_R47 = ['tests/components/favorito-sincronizado.test.ts', 'tests/components/modal-favorito.test.ts']
  const existentes = ARCHIVOS_R47.filter((rel) => existsSync(join(APPS_WEB, rel)))

  it('los dos archivos de la R47 existen en este checkout', () => {
    expect(existentes).toEqual(ARCHIVOS_R47)
  })

  it('favorito-sincronizado.test.ts y modal-favorito.test.ts aparecen como import o ruta sobre apps/web/components/event-modal.tsx', () => {
    const objetivo = 'apps/web/components/event-modal.tsx'
    const tests = existentes.map((rel) => ({
      ruta: `apps/web/${rel}`,
      texto: readFileSync(join(APPS_WEB, rel), 'utf8'),
    }))

    const hallazgos = testsQueLeen([objetivo], tests)

    for (const rel of existentes) {
      const ruta = `apps/web/${rel}`
      const h = hallazgos.find((x) => x.test === ruta)
      expect(h, `se esperaba un hallazgo para ${ruta}`).toBeDefined()
      expect(['import', 'ruta']).toContain(h!.como)
    }
  })
})
