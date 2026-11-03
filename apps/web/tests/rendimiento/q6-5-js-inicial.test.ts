/**
 * Q6-5 (rendimiento, Lighthouse en celular): lo que monta el layout raíz (o
 * el navbar, que está en casi todas las páginas) no arrastra librerías
 * pesadas al JavaScript inicial. Medido antes del arreglo, cada página
 * descargaba ~400 KB comprimidos de JavaScript, y en la simulación de
 * Lighthouse ese peso cae antes del LCP. Lo que se sacó:
 *
 *  - supabase-js (~240 KB sin comprimir): navbar, pie y modal de ingreso lo
 *    cargan con `import()` (lib/supabase/cliente-diferido.ts).
 *  - framer-motion (~120 KB): el banner de cookies anima con CSS; el modal de
 *    donación se carga la primera vez que se abre.
 *  - Radix Tooltip/DropdownMenu (con floating-ui): solo con sesión
 *    (components/navbar-usuario.tsx).
 *  - Radix Toast: con el primer aviso (components/ui/toaster-contenido.tsx).
 *  - @next/third-parties (Google Tag Manager): con el consentimiento.
 *
 * Este detector fija que esos componentes no vuelvan a importarlos de forma
 * ESTÁTICA (un `import … from`). El `import()` diferido sí está permitido: es
 * justamente el arreglo. Lo que mide el peso de verdad es Lighthouse (ver el
 * PR de Q6-5); esto evita que se deshaga sin darse cuenta.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { quitarComentarios as sinComentarios } from '@qps/core/tests/convencion-entorno'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const leer = (ruta: string) => sinComentarios(readFileSync(path.join(WEB_ROOT, ruta), 'utf8'))

/** Los módulos que un archivo importa de forma estática (`from "…"`, también `import type`). */
function importsEstaticos(fuente: string): string[] {
  return [...fuente.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1])
}
/** Igual, sin los `import type` (que no dejan nada en el bundle). */
function importsDeValor(fuente: string): string[] {
  return [...fuente.matchAll(/^\s*import\s+(?!type\b)[^;]*?\bfrom\s+["']([^"']+)["']/gm)].map((m) => m[1])
}

// Lo que está en todas (o casi todas) las páginas: el layout raíz y el navbar.
const EN_TODAS_LAS_PAGINAS = [
  'components/navbar.tsx',
  'components/footer.tsx',
  'components/auth-modal.tsx',
  'components/consent-banner.tsx',
  'components/donation-modal.tsx',
  'components/ui/toaster.tsx',
  'components/analytics-consent.tsx',
]

const PESADOS = [
  '@/lib/supabase/client',
  '@supabase/supabase-js',
  '@supabase/ssr',
  'framer-motion',
  '@/components/ui/dropdown-menu',
  '@/components/ui/tooltip',
  '@/components/ui/toast',
  './toast',
  '@next/third-parties/google',
  '@/components/navbar-usuario',
  './donation-modal-contenido',
  './toaster-contenido',
  '@/components/ui/dialog',
]

describe('Q6-5: el JavaScript inicial de todas las páginas no trae librerías pesadas', () => {
  it.each(EN_TODAS_LAS_PAGINAS)('%s no importa de forma estática ninguna de las pesadas', (archivo) => {
    const deValor = importsDeValor(leer(archivo))
    expect(deValor.length, `${archivo}: el detector no encontró ningún import (¿cambió la forma?)`).toBeGreaterThan(0)
    for (const pesado of PESADOS) {
      expect(deValor, `${archivo} importa ${pesado}`).not.toContain(pesado)
    }
  })

  it('el layout raíz sigue montando esos mismos componentes (si se muda alguno, este detector se actualiza)', () => {
    const layout = leer('app/layout.tsx')
    for (const modulo of [
      '@/components/footer',
      '@/components/auth-modal',
      '@/components/consent-banner',
      '@/components/donation-modal',
      '@/components/ui/toaster',
      '@/components/analytics-consent',
    ]) {
      expect(importsEstaticos(layout)).toContain(modulo)
    }
  })

  it('navbar, pie y modal de ingreso piden supabase-js con el cargador diferido', () => {
    for (const archivo of ['components/navbar.tsx', 'components/footer.tsx', 'components/auth-modal.tsx']) {
      expect(importsDeValor(leer(archivo)), archivo).toContain('@/lib/supabase/cliente-diferido')
    }
    expect(leer('lib/supabase/cliente-diferido.ts')).toMatch(/import\(\s*["']\.\/client["']\s*\)/)
  })

  it('el menú de usuario, el modal de donación, los avisos y GTM se cargan con next/dynamic', () => {
    expect(leer('components/navbar.tsx')).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(\s*["']@\/components\/navbar-usuario["']\s*\)/)
    expect(leer('components/donation-modal.tsx')).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(\s*["']\.\/donation-modal-contenido["']\s*\)/)
    expect(leer('components/ui/toaster.tsx')).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(\s*["']\.\/toaster-contenido["']\s*\)/)
    expect(leer('components/analytics-consent.tsx')).toMatch(/import\(\s*["']@next\/third-parties\/google["']\s*\)/)
  })

  it('los módulos diferidos son los que tienen las librerías (no se perdió nada en la mudanza)', () => {
    expect(importsDeValor(leer('components/navbar-usuario.tsx'))).toEqual(
      expect.arrayContaining(['@/components/ui/dropdown-menu', '@/components/ui/tooltip']),
    )
    expect(importsDeValor(leer('components/donation-modal-contenido.tsx'))).toContain('framer-motion')
    expect(importsDeValor(leer('components/ui/toaster-contenido.tsx'))).toContain('@/components/ui/toast')
  })

  it('el modal de ingreso usa el diálogo diferido y lo monta recién al abrirse', () => {
    const modal = leer('components/auth-modal.tsx')
    expect(importsDeValor(modal)).toContain('@/components/ui/dialog-diferido')
    expect(modal).toMatch(/\{seAbrio && \(\s*<PiezasDeDialogo>\{\(\{ Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription \}\) => \(\s*<Dialog open=\{isOpen\}/)
    expect(leer('components/ui/dialog-diferido.tsx')).toMatch(/import\(\s*["']\.\/dialog["']\s*\)/)
  })

  it('la ficha de un evento no trae Radix Select (solo el admin, al editar la categoría)', () => {
    const ficha = leer('components/event-detail-page.tsx')
    expect(importsDeValor(ficha)).not.toContain('@/components/ui/select')
    expect(ficha).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(\s*["']@\/components\/admin\/selector-categoria["']\s*\)/)
    expect(importsDeValor(leer('components/admin/selector-categoria.tsx'))).toContain('@/components/ui/select')
  })

  it('el botón de favorito no trae Radix Toast de entrada (el botón del aviso se pide si hace falta)', () => {
    const boton = leer('components/favorite-button.tsx')
    expect(importsDeValor(boton)).not.toContain('@/components/ui/toast')
    expect(boton).toMatch(/await import\(\s*["']@\/components\/ui\/toast["']\s*\)/)
  })

  it('el logo del navbar y del pie es el WebP liviano, y el del navbar no se precarga', () => {
    const navbar = leer('components/navbar.tsx')
    const logoNavbar = navbar.slice(navbar.indexOf('<Image'), navbar.indexOf('/>', navbar.indexOf('<Image')))
    expect(logoNavbar).toContain('src="/brand/logo-circular-128.webp"')
    expect(logoNavbar).not.toMatch(/\bpriority\b|\bpreload\b|fetchPriority/)
    expect(leer('components/footer.tsx')).toContain('src="/brand/logo-circular-128.webp"')
    expect(existsSync(path.join(WEB_ROOT, 'public/brand/logo-circular-128.webp'))).toBe(true)
  })

  it('el banner de cookies anima con CSS y respeta «reducir movimiento»', () => {
    const banner = leer('components/consent-banner.tsx')
    expect(banner).toMatch(/animate-in fade-in slide-in-from-bottom-4/)
    expect(banner).toContain('motion-reduce:animate-none')
  })
})
