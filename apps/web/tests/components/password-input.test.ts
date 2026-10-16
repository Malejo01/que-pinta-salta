/**
 * `PasswordInput` (QPS-143-c): el ojito en los campos de contraseña.
 *
 * `apps/web` no tiene jsdom ni @testing-library/react instalados (vitest
 * corre con `environment: 'node'`, ver `apps/web/vitest.config.ts`), así que
 * no hay forma de montar el componente en un DOM real y disparar un click
 * sin agregar una dependencia nueva (no autorizado para esta tarea).
 *
 * Por eso `PasswordInputField` (la parte sin estado de `password-input.tsx`)
 * recibe `visible`/`onToggleVisible` como props: se puede invocar como una
 * función común (sin hooks, sin dispatcher de React) y revisar el árbol de
 * elementos que devuelve sin necesidad de renderizarlo. `PasswordInput` (la
 * envoltura con estado) sí usa `useState`, así que para probar que arranca
 * oculta se usa `react-dom/server` (funciona en Node puro, sin DOM).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { Input } from '@/components/ui/input'
import { PasswordInput, PasswordInputField } from '@/components/ui/password-input'

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url))

function readSource(relativePath: string): string {
  return readFileSync(path.join(WEB_ROOT, relativePath), 'utf8')
}

type ReactElementLike = { type: unknown; props: Record<string, unknown> }

function fieldChildren(el: ReactElementLike) {
  const children = el.props.children as [ReactElementLike, ReactElementLike]
  return { inputEl: children[0], buttonEl: children[1] }
}

describe('PasswordInputField: arranca oculto (visible=false)', () => {
  it('el <input> queda en type="password" y recibe exactamente las props que le pasa el formulario', () => {
    const onToggleVisible = vi.fn()
    const el = PasswordInputField({
      visible: false,
      onToggleVisible,
      id: 'password',
      name: 'password',
      autoComplete: 'new-password',
      required: true,
      minLength: 6,
      placeholder: 'Tu contraseña',
      className: 'custom-class',
    }) as unknown as ReactElementLike

    const { inputEl, buttonEl } = fieldChildren(el)

    expect(inputEl.type).toBe(Input)
    expect(inputEl.props.type).toBe('password')
    expect(inputEl.props.id).toBe('password')
    expect(inputEl.props.name).toBe('password')
    expect(inputEl.props.autoComplete).toBe('new-password')
    expect(inputEl.props.required).toBe(true)
    expect(inputEl.props.minLength).toBe(6)
    expect(inputEl.props.placeholder).toBe('Tu contraseña')
    expect(inputEl.props.className).toContain('custom-class')

    expect(buttonEl.type).toBe('button')
    expect(buttonEl.props['aria-label']).toBe('Mostrar contraseña')
    expect(buttonEl.props['aria-pressed']).toBe(false)
  })

  it('el botón es type="button": nunca puede disparar el submit del formulario', () => {
    const el = PasswordInputField({
      visible: false,
      onToggleVisible: vi.fn(),
    }) as unknown as ReactElementLike
    const { buttonEl } = fieldChildren(el)

    expect(buttonEl.props.type).toBe('button')
  })

  it('clickear el botón llama a onToggleVisible (lo que lo muestra/oculta)', () => {
    const onToggleVisible = vi.fn()
    const el = PasswordInputField({
      visible: false,
      onToggleVisible,
    }) as unknown as ReactElementLike
    const { buttonEl } = fieldChildren(el)

    expect(buttonEl.props.onClick).toBe(onToggleVisible)
    ;(buttonEl.props.onClick as () => void)()
    expect(onToggleVisible).toHaveBeenCalledTimes(1)
  })
})

describe('PasswordInputField: visible=true (después de clickear el ojito)', () => {
  it('el <input> pasa a type="text" y el botón queda presionado (aria-pressed), con el mismo aria-label', () => {
    const el = PasswordInputField({
      visible: true,
      onToggleVisible: vi.fn(),
    }) as unknown as ReactElementLike
    const { inputEl, buttonEl } = fieldChildren(el)

    expect(inputEl.props.type).toBe('text')
    // Patrón de botón de alternar (revisión del #54): el aria-label no cambia,
    // el estado lo dice aria-pressed.
    expect(buttonEl.props['aria-label']).toBe('Mostrar contraseña')
    expect(buttonEl.props['aria-pressed']).toBe(true)
  })

  it('el botón mide lo mismo que el campo: inset-y-0 y sin h-11 (antes sobresalía del h-9 del Input)', () => {
    const el = PasswordInputField({
      visible: false,
      onToggleVisible: vi.fn(),
    }) as unknown as ReactElementLike
    const { buttonEl } = fieldChildren(el)
    const clases = String(buttonEl.props.className)

    expect(clases).toContain('inset-y-0')
    expect(clases).not.toMatch(/(?:^|\s)h-11(?:\s|$)/)
    expect(clases).toContain('w-11')
  })

  it('clickear de nuevo también llama a onToggleVisible (vuelve a ocultar)', () => {
    const onToggleVisible = vi.fn()
    const el = PasswordInputField({
      visible: true,
      onToggleVisible,
    }) as unknown as ReactElementLike
    const { buttonEl } = fieldChildren(el)

    ;(buttonEl.props.onClick as () => void)()
    expect(onToggleVisible).toHaveBeenCalledTimes(1)
  })
})

describe('PasswordInput: la envoltura con estado arranca oculta', () => {
  it('renderToStaticMarkup muestra type="password" (nunca "text") en el primer render', () => {
    const html = renderToStaticMarkup(React.createElement(PasswordInput, { id: 'password' }))

    expect(html).toContain('type="password"')
    expect(html).not.toContain('type="text"')
  })

  it('no recuerda estado entre montajes: cada instancia nueva vuelve a arrancar oculta', () => {
    const htmlA = renderToStaticMarkup(React.createElement(PasswordInput, { id: 'a' }))
    const htmlB = renderToStaticMarkup(React.createElement(PasswordInput, { id: 'b' }))

    expect(htmlA).toContain('type="password"')
    expect(htmlB).toContain('type="password"')
  })
})

describe('PasswordInput: la envoltura usa useState(false) y delega en PasswordInputField', () => {
  const source = readSource('components/ui/password-input.tsx')

  it('arranca con useState(false)', () => {
    expect(source).toMatch(/useState\(false\)/)
  })

  it('pasa visible y onToggleVisible a PasswordInputField', () => {
    expect(source).toMatch(/<PasswordInputField/)
    expect(source).toMatch(/visible=\{visible\}/)
    expect(source).toMatch(/onToggleVisible=\{/)
  })
})

describe('Detector estático: los tres formularios usan PasswordInput y no tienen type="password" suelto', () => {
  const archivos = [
    'app/auth/sign-up/page.tsx',
    'components/auth-modal.tsx',
    'components/change-password-form.tsx',
  ]

  it.each(archivos)('%s importa y usa <PasswordInput />', (relativePath) => {
    const src = readSource(relativePath)
    expect(src).toMatch(/import\s*\{[^}]*PasswordInput[^}]*\}\s*from\s*['"]@\/components\/ui\/password-input['"]/)
    expect(src).toMatch(/<PasswordInput\b/)
  })

  it.each(archivos)('%s no tiene un type="password" suelto', (relativePath) => {
    const src = readSource(relativePath)
    expect(src).not.toMatch(/type=["']password["']/)
    expect(src).not.toMatch(/type=\{["']password["']\}/)
  })
})
