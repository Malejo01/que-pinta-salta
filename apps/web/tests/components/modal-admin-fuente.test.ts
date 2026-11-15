import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Q7-4: chequeos sobre el código del modal de admin (el render está en
// tests/dom/modal-admin.dom.test.ts).
const leer = (ruta: string) => readFileSync(fileURLToPath(new URL(`../../${ruta}`, import.meta.url)), 'utf8')

describe('Q7-4 · modal del evento para un ADMIN (fuente)', () => {
  it('el control completo (ControlDestacado) no se duplica en el modal', () => {
    expect(leer('components/event-modal-wrapper.tsx')).not.toMatch(/<ControlDestacado\b/)
    expect(leer('components/admin/admin-modal-evento.tsx')).not.toMatch(/destacarEvento|quitarDestacado|<ControlDestacado\b/)
  })

  it('el link es un <a> común (no next/link): desde la ruta interceptada abre la ficha, no otra vez el modal', () => {
    expect(leer('components/admin/admin-modal-evento.tsx')).not.toMatch(/from ["']next\/link["']/)
  })

  it('la página del modal calcula isAdmin con profiles.role en el servidor (sin "use client")', () => {
    const pagina = leer('app/@modal/(.)evento/[id]/page.tsx')
    expect(pagina).not.toMatch(/^\s*["']use client["']/)
    expect(pagina).toMatch(/isAdmin = profileRes\.data\?\.role === 'ADMIN'/)
    expect(pagina).toMatch(/isAdmin=\{isAdmin\}/)
  })

  it('el bloque se monta solo con isAdmin', () => {
    expect(leer('components/event-modal-wrapper.tsx')).toMatch(/\{isAdmin && <AdminModalEvento eventId=\{event\.id\} featuredUntil=\{event\.featured_until\} \/>\}/)
  })
})
