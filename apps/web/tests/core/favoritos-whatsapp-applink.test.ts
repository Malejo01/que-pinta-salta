/**
 * 36-q (cierre de la R36, G4): el link de evento que arma "Compartir agenda
 * por WhatsApp" de Favoritos tiene que cumplir el `intentFilter` de App
 * Links de la app (mismo host, mismo prefijo de ruta) — si no, tocar el link
 * en WhatsApp abre el navegador en vez de la app, que es justo lo que Mauro
 * probó en el teléfono (G4, `ops/rondas/36-feedback-telefono-2/plan.md`).
 *
 * Dos lados, cada uno de su propia fuente real (nada copiado a mano):
 *  - La app: `apps/mobile/app.config.ts`, el `intentFilter` con
 *    `autoVerify: true` (mismo que verifica `apps/mobile/tests/config.test.ts`).
 *  - El link: `armarMensajeWhatsApp` (`@qps/core/favoritos/armar`), que es la
 *    función real que usa `apps/mobile/app/(tabs)/favoritos.tsx` para "Compartir
 *    agenda por WhatsApp", y que el comentario del propio archivo dice que
 *    reproduce "el mismo texto, emoji por emoji" que `handleShareWhatsApp` en
 *    `apps/web/app/favoritos/favoritos-list.tsx` (la web arma el link inline
 *    con `window.location.origin`, que en producción es el mismo dominio que
 *    `SITIO`/`armarMensajeWhatsApp` usa por defecto — no hay forma de probar
 *    `window.location.origin` sin un navegador real, así que el detector de
 *    abajo cubre el lado que sí se puede probar sin red: que el literal de
 *    ruta de `favoritos-list.tsx` sea el mismo prefijo que el `intentFilter`).
 *
 * Si algún día cambia el host o el prefijo de cualquiera de los dos lados
 * (la app deja de pedir `www.quepintasalta.com.ar` + `/evento/`, o el link
 * de "Compartir agenda" deja de apuntar ahí), este archivo se rompe.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import config from '../../../mobile/app.config'
import { armarMensajeWhatsApp } from '@qps/core/favoritos/armar'
import { SITIO } from '@qps/core/metricas/links'
import type { DisplayEvent } from '@qps/core/home/types'

// apps/web/tests/core -> apps/web/tests -> apps/web -> apps
const APPS_DIR = fileURLToPath(new URL('../../../', import.meta.url))

/** El/los `intentFilter` de App Links con `autoVerify: true` (los mismos que exige tests/config.test.ts en mobile). */
function intentFiltersDeAppLinks() {
  const filtros = config.android?.intentFilters ?? []
  return filtros.filter((f) => f.autoVerify === true)
}

function datosDe(filtro: ReturnType<typeof intentFiltersDeAppLinks>[number]) {
  return Array.isArray(filtro.data) ? filtro.data : [filtro.data]
}

function eventoDeAgenda(overrides: Partial<DisplayEvent> & { id: string; date: string }): DisplayEvent {
  return {
    slug: overrides.id,
    title: `Evento ${overrides.id}`,
    venue: 'Venue de Prueba',
    time: '21:00',
    category: 'teatro',
    categoryName: 'Teatro',
    price: 'confirmar',
    image: '',
    description: '',
    address: '',
    startDateTime: `${overrides.date}T21:00:00-03:00`,
    isFeatured: false,
    ...overrides,
  } as DisplayEvent
}

describe('la app pide verificar al menos un host https con prefijo /evento/ (fuente: app.config.ts)', () => {
  it('hay al menos un intentFilter con autoVerify, scheme https y pathPrefix /evento/', () => {
    const filtros = intentFiltersDeAppLinks()
    expect(filtros.length).toBeGreaterThan(0)

    const conEvento = filtros
      .flatMap((f) => datosDe(f))
      .filter((d) => d?.scheme === 'https' && d?.pathPrefix === '/evento/')

    expect(conEvento.length).toBeGreaterThan(0)
  })
})

describe('armarMensajeWhatsApp (la función real que usa la app para "Compartir agenda por WhatsApp") cumple ese intentFilter', () => {
  it('el link de un evento con fecha cae en el mismo host y el mismo pathPrefix que pide la app', () => {
    const filtros = intentFiltersDeAppLinks()
    const hostsEsperados = new Set(
      filtros
        .flatMap((f) => datosDe(f))
        .filter((d) => d?.scheme === 'https' && d?.pathPrefix === '/evento/')
        .map((d) => d?.host),
    )
    expect(hostsEsperados.size).toBeGreaterThan(0)

    const evento = eventoDeAgenda({ id: '11111111-1111-4111-8111-111111111111', date: '2030-10-12' })
    // Sin pasar `sitio`: el default es SITIO, el mismo dominio que usa
    // `urlEvento` en el resto de la web (apps/web/tests/core/links.test.ts).
    const mensaje = armarMensajeWhatsApp([evento])

    const [, link] = mensaje.match(/🔗 (\S+)/) ?? []
    expect(link).toBeTruthy()

    const url = new URL(link!)
    expect(hostsEsperados.has(url.host)).toBe(true)
    expect(url.pathname.startsWith('/evento/')).toBe(true)
    expect(url.pathname).toBe(`/evento/${evento.id}`)
  })

  it('SITIO (el default de armarMensajeWhatsApp) tiene el mismo host que pide el intentFilter', () => {
    const filtros = intentFiltersDeAppLinks()
    const hostsEsperados = new Set(
      filtros
        .flatMap((f) => datosDe(f))
        .filter((d) => d?.scheme === 'https' && d?.pathPrefix === '/evento/')
        .map((d) => d?.host),
    )
    expect(hostsEsperados.has(new URL(SITIO).host)).toBe(true)
  })
})

describe('apps/web/app/favoritos/favoritos-list.tsx: "Compartir agenda por WhatsApp" arma el link de evento con el mismo prefijo /evento/ que pide la app', () => {
  it('el literal de ruta usado junto a window.location.origin es /evento/ (el mismo pathPrefix del intentFilter)', () => {
    const filtros = intentFiltersDeAppLinks()
    const pathPrefixEsperado = filtros
      .flatMap((f) => datosDe(f))
      .find((d) => d?.scheme === 'https')?.pathPrefix
    expect(pathPrefixEsperado).toBeTruthy()

    const src = readFileSync(`${APPS_DIR}/web/app/favoritos/favoritos-list.tsx`, 'utf8')
    const m = src.match(/\$\{window\.location\.origin\}([^$`]*)\$\{item\.id\}/)
    expect(m).not.toBeNull()
    expect(m![1]).toBe(pathPrefixEsperado)
  })
})
