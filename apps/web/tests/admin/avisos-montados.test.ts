// Hotfix 13/10: los avisos de /admin/revision y /admin/duplicados no se veían.
// Usaban `toast` de 'sonner', pero app/layout.tsx solo monta el Toaster de
// shadcn (components/ui/toaster.tsx, que escucha a @/hooks/use-toast). Estos
// tests fallan si una pantalla vuelve a usar un sistema de avisos cuyo
// Toaster no está montado. Sin red ni base: lectura de código y la fachada
// `notify` con @/hooks/use-toast mockeado.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const CARPETAS = ['app', 'components', 'hooks', 'lib']

function archivos(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...archivos(full))
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

const fuentes = CARPETAS.flatMap((c) => archivos(join(ROOT, c))).map((f) => ({
  file: relative(ROOT, f).replace(/\\/g, '/'),
  src: readFileSync(f, 'utf8'),
}))

const layout = readFileSync(join(ROOT, 'app', 'layout.tsx'), 'utf8')
const toaster = readFileSync(join(ROOT, 'components', 'ui', 'toaster.tsx'), 'utf8')

const importa = (src: string, modulo: string) =>
  new RegExp(`from\\s+['"]${modulo.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}['"]`).test(src)

describe('un solo sistema de avisos, y montado', () => {
  it('app/layout.tsx monta <Toaster /> de @/components/ui/toaster', () => {
    expect(importa(layout, '@/components/ui/toaster')).toBe(true)
    expect(layout).toMatch(/<Toaster\s*\/>/)
  })

  it('ese Toaster escucha a @/hooks/use-toast', () => {
    expect(importa(toaster, '@/hooks/use-toast')).toBe(true)
  })

  it("nadie importa 'sonner' (su Toaster no está montado en el layout)", () => {
    const conSonner = fuentes.filter((f) => importa(f.src, 'sonner')).map((f) => f.file)
    // Si algún día se monta el Toaster de sonner en el layout, este test se
    // actualiza a propósito; mientras no esté montado, cualquier uso es un aviso que no se ve.
    expect(importa(layout, 'sonner') || importa(layout, '@/components/ui/sonner')).toBe(false)
    expect(conSonner).toEqual([])
  })

  it('nadie importa la copia @/components/ui/use-toast (tiene su propio estado: sus avisos no llegan al Toaster)', () => {
    const conCopia = fuentes.filter((f) => importa(f.src, '@/components/ui/use-toast')).map((f) => f.file)
    expect(conCopia).toEqual([])
  })

  it.each([
    'components/draft-events-manager.tsx',
    'components/admin/duplicate-pair-actions.tsx',
    'components/change-password-form.tsx',
  ])('%s avisa con notify o con @/hooks/use-toast', (file) => {
    const src = fuentes.find((f) => f.file === file)?.src ?? ''
    expect(importa(src, '@/hooks/notify') || importa(src, '@/hooks/use-toast')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// La fachada notify, sobre el toast de shadcn (mockeado).
// ---------------------------------------------------------------------------
const calls = vi.hoisted(() => ({
  toast: [] as Array<Record<string, unknown>>,
  update: [] as Array<{ id: string; props: Record<string, unknown> }>,
  n: 0,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: (props: Record<string, unknown>) => {
    calls.toast.push(props)
    const id = String(++calls.n)
    return {
      id,
      dismiss: () => {},
      update: (p: Record<string, unknown>) => calls.update.push({ id, props: p }),
    }
  },
}))

import { notify } from '@/hooks/notify'

describe('notify', () => {
  beforeEach(() => {
    calls.toast.length = 0
    calls.update.length = 0
  })

  it('error usa la variante destructive y success la normal', () => {
    notify.error('Este evento ya pasó; no se puede publicar')
    notify.success('Publicado')
    expect(calls.toast).toEqual([
      { title: 'Este evento ya pasó; no se puede publicar', variant: 'destructive', duration: undefined },
      { title: 'Publicado', variant: 'default', duration: undefined },
    ])
  })

  it('loading queda abierto y el success con su id lo reemplaza (no abre otro)', () => {
    const id = notify.loading('Procesando…')
    expect(calls.toast).toHaveLength(1)
    expect(calls.toast[0].duration).toBe(Number.POSITIVE_INFINITY)

    expect(notify.success('Listo', { id })).toBe(id)
    expect(calls.toast).toHaveLength(1)
    expect(calls.update).toEqual([{ id, props: { id, title: 'Listo', variant: 'default', duration: undefined, open: true } }])
  })

  it('un error con un id que ya no está abierto abre un aviso nuevo', () => {
    const id = notify.loading('Procesando…')
    notify.error('Falló', { id })
    notify.error('Otra vez', { id })
    expect(calls.update).toHaveLength(1)
    expect(calls.toast).toHaveLength(2)
    expect(calls.toast[1]).toMatchObject({ title: 'Otra vez', variant: 'destructive' })
  })
})
