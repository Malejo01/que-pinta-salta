/**
 * 52-q (QA, Ronda 52 — publicidad), guarda de la app.
 *
 * La mitad de app de la R52 (52-c: `lib/anuncios/` + `components/
 * BannerAnuncio.tsx`; 52-d: el interruptor `EXPO_PUBLIC_ADS_ENABLED` y
 * `anunciosHabilitados` en `lib/env.ts`) quedó para la Fase 2: el
 * `node_modules` de este worktree no tiene `react-native-google-mobile-ads`
 * instalado, así que nada que importe el SDK typechequea ni se puede
 * mockear esta noche.
 *
 * Este archivo no prueba ningún comportamiento de anuncios (no hay nada
 * todavía). Es la guarda que se pone en rojo el día que lleguen mal: ID de
 * AdMob escritos a mano fuera de la config, `TestIds` filtrándose a una
 * pantalla, o un import directo del SDK esquivando `lib/anuncios/`.
 *
 * Cuando llegue 52-c, `components/BannerAnuncio.tsx` va a existir y:
 * - va a importar `react-native-google-mobile-ads` (hoy ningún archivo lo
 *   hace: el segundo test de abajo tiene ese comentario);
 * - `TestIds` solo va a poder vivir ahí (o en `lib/anuncios/`), nunca en
 *   `apps/mobile/app/`: hay que sumar la excepción en el segundo `describe`
 *   cuando ese archivo exista.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = fileURLToPath(new URL('../', import.meta.url))

const DIRS_EXCLUIDOS = new Set(['node_modules', '.expo', '.turbo', 'dist'])

/**
 * Las entradas de un directorio con sus tipos (archivo/carpeta), o un arreglo
 * vacío si no se puede leer. Ojo: no se tipa con `ReturnType<typeof
 * readdirSync>` — por ser una función con sobrecargas, ese tipo resuelve a
 * la ÚLTIMA firma (`Dirent<Buffer>`), no a la que realmente devuelve esta
 * llamada (`Dirent<string>`, por `withFileTypes: true` sin `encoding`).
 */
function leerEntradas(dirAbsoluto: string) {
  try {
    return readdirSync(dirAbsoluto, { withFileTypes: true })
  } catch {
    return []
  }
}

function listarArchivos(dirAbsoluto: string, extensiones: string[]): string[] {
  const resultado: string[] = []
  for (const entrada of leerEntradas(dirAbsoluto)) {
    if (entrada.isDirectory()) {
      if (DIRS_EXCLUIDOS.has(entrada.name)) continue
      resultado.push(...listarArchivos(path.join(dirAbsoluto, entrada.name), extensiones))
    } else if (entrada.isFile() && extensiones.some((ext) => entrada.name.endsWith(ext))) {
      resultado.push(path.join(dirAbsoluto, entrada.name))
    }
  }
  return resultado
}

function relMobile(abs: string): string {
  return path.relative(MOBILE_ROOT, abs).replace(/\\/g, '/')
}

const ARCHIVOS_APP = listarArchivos(path.join(MOBILE_ROOT, 'app'), ['.ts', '.tsx'])
const ARCHIVOS_COMPONENTS = listarArchivos(path.join(MOBILE_ROOT, 'components'), ['.ts', '.tsx'])

describe('Guarda de anuncios (apps/mobile, sin SDK todavía — Fase 2)', () => {
  it('ningún archivo de apps/mobile/app/ ni de apps/mobile/components/ contiene "ca-app-pub-"', () => {
    // Sanity: estas dos carpetas existen y tienen contenido hoy.
    expect(ARCHIVOS_APP.length).toBeGreaterThan(0)
    expect(ARCHIVOS_COMPONENTS.length).toBeGreaterThan(0)

    for (const abs of [...ARCHIVOS_APP, ...ARCHIVOS_COMPONENTS]) {
      expect(readFileSync(abs, 'utf8'), relMobile(abs)).not.toContain('ca-app-pub-')
    }
  })

  // Nota: apps/mobile/app.config.ts SÍ tiene ca-app-pub- (los ID de prueba
  // oficiales de Google para el App ID del SDK, de chore/deps-etapa-2) — pero
  // ese archivo no es `apps/mobile/app/` (la carpeta de rutas de
  // expo-router), es la config de Expo en la raíz de apps/mobile/. No entra
  // en este barrido, y está bien que no entre.

  it('TestIds no aparece en ningún archivo de apps/mobile/app/', () => {
    // Cuando llegue 52-c, TestIds solo va a poder vivir en
    // components/BannerAnuncio.tsx (o en lib/anuncios/), nunca en una
    // pantalla de apps/mobile/app/.
    for (const abs of ARCHIVOS_APP) {
      expect(readFileSync(abs, 'utf8'), relMobile(abs)).not.toContain('TestIds')
    }
  })

  it('ningún archivo de apps/mobile/ importa react-native-google-mobile-ads fuera de lib/anuncios/ y components/BannerAnuncio.tsx', () => {
    const todos = listarArchivos(MOBILE_ROOT, ['.ts', '.tsx'])
    const patronImport = /from\s+['"]react-native-google-mobile-ads['"]|require\(\s*['"]react-native-google-mobile-ads['"]\s*\)/

    // Hoy (19/10) nadie lo importa: ni lib/anuncios/ ni components/
    // BannerAnuncio.tsx existen todavía (son de 52-c, Fase 2). Este test
    // pasa en verde por eso mismo, y queda de guarda para cuando se agreguen:
    // en ese momento, solo esos dos deberían aparecer acá.
    for (const abs of todos) {
      const rel = relMobile(abs)
      const esLugarPermitido = rel.startsWith('lib/anuncios/') || rel === 'components/BannerAnuncio.tsx'
      if (esLugarPermitido) continue
      expect(readFileSync(abs, 'utf8'), rel).not.toMatch(patronImport)
    }
  })
})
