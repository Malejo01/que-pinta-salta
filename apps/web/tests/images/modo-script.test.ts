/**
 * QPS-105: `scripts/imagenes-variantes.ts` imprimía "DRY-RUN" como primera
 * línea de `main()`, antes de leer la bandera `--apply` — así que el script
 * que escribe en el Storage de producción decía "DRY-RUN" aunque se lo
 * corriera con `--apply`. `avisoDeModo` se testea sola (sin ejecutar el
 * script, que corre `main()` al importarse) y además se verifica, sobre el
 * texto del script despojado de comentarios, que el aviso se imprima
 * después de leer `apply`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { avisoDeModo } from '@/lib/images/modo-script'

describe('avisoDeModo', () => {
  it('con apply=false da el texto exacto de dry-run', () => {
    expect(avisoDeModo('imagenes-variantes', false)).toBe(
      '[imagenes-variantes] DRY-RUN: sin --apply no se escribe nada en Storage.'
    )
  })

  it('con apply=true da el texto exacto de apply, sin mencionar DRY-RUN', () => {
    const texto = avisoDeModo('imagenes-variantes', true)
    expect(texto).toBe(
      '[imagenes-variantes] APPLY: escribe en Storage (producción). Cortá con Ctrl+C si no era lo que querías.'
    )
    expect(texto).not.toContain('DRY-RUN')
  })
})

/** Saca comentarios de bloque y de línea para que no afecten las búsquedas de texto. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('scripts/imagenes-variantes.ts avisa el modo después de leer --apply', () => {
  const srcCompleto = readFileSync(
    join(__dirname, '..', '..', 'scripts', 'imagenes-variantes.ts'),
    'utf8'
  )
  const src = sinComentarios(srcCompleto)

  it('llama a avisoDeModo con apply como segundo argumento', () => {
    expect(src).toMatch(/avisoDeModo\([^)]*,\s*apply\s*\)/)
  })

  it('la llamada a avisoDeModo aparece después de declarar const apply', () => {
    const posConst = src.indexOf('const apply =')
    const posAviso = src.indexOf('avisoDeModo(')
    expect(posConst).toBeGreaterThan(-1)
    expect(posAviso).toBeGreaterThan(-1)
    expect(posAviso).toBeGreaterThan(posConst)
  })

  it('no queda ningún literal "DRY-RUN por defecto"', () => {
    expect(src).not.toContain('DRY-RUN por defecto')
  })
})
