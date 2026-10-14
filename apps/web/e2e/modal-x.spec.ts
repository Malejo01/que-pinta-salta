import { test, expect, type Page, type Locator } from "@playwright/test"

// e2e de la tarea 18-f (paso 3): el arreglo de `30c6583` en
// `lib/home/url-sync.ts` y `components/home-content.tsx`.
//
// Bug: al tocar la X de un modal (evento o flyer) abierto desde un
// `goto('/')` directo, el diálogo quedaba montado y la URL no volvía a
// `/` porque `home-content.tsx` pisaba `history.state` de la entrada `/`
// con un `replaceState(null, ...)` que corría antes del parche de
// Next.js, y el `popstate` del cierre llegaba sin estado.
//
// Reproducción previa (de día, contra producción, 4 corridas):
// ops/rondas/18-imagenes-rendimiento/repro-x.mjs
//
// Esta prueba NO corre de noche ni contra producción: `BASE_URL` se
// define por variable de entorno (ver playwright.config.ts) y el
// `beforeAll` de abajo falla con un mensaje claro si falta. La corrida
// final contra una preview la hace Mauro de día con un token propio.

// Sin escrituras: todo método que no sea GET a /api/*, todo /go (son los
// links de compra y suman métricas), GTM/GA, googlesyndication y la
// analítica de Vercel quedan bloqueados. Copiado de
// ops/rondas/18-imagenes-rendimiento/repro-x.mjs.
async function bloquearEscriturasYAnalitica(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const req = route.request()
    const url = req.url()

    if (
      /googletagmanager\.com|google-analytics\.com|\/_vercel\/insights|\/_vercel\/speed-insights|googlesyndication/.test(
        url
      )
    ) {
      return route.abort()
    }

    const pathname = new URL(url).pathname
    if (pathname.startsWith("/go")) return route.abort()
    if (pathname.startsWith("/api/") && req.method() !== "GET") return route.abort()

    return route.continue()
  })
}

// Primera card de la fila "Hoy en Salta"; si esa fila no tiene eventos
// (o no existe), la primera card de la portada. Si no hay ninguna card,
// falla con un mensaje explícito en vez de quedar en un `try` silencioso.
async function primeraCardDeLaPortada(page: Page): Promise<Locator> {
  const tituloHoy = page.getByRole("heading", { name: /hoy en salta/i })
  const hayTituloHoy = (await tituloHoy.count()) > 0

  let card: Locator | null = null

  if (hayTituloHoy) {
    const cardDeHoy = tituloHoy
      .locator(
        'xpath=ancestor::*[.//a[starts-with(@href,"/evento/") or starts-with(@href,"/flyer/")]][1]'
      )
      .locator('a[href^="/evento/"], a[href^="/flyer/"]')
      .first()
    if ((await cardDeHoy.count()) > 0) card = cardDeHoy
  }

  if (!card) {
    const cualquierCard = page.locator('a[href^="/evento/"], a[href^="/flyer/"]').first()
    if ((await cualquierCard.count()) > 0) card = cualquierCard
  }

  if (!card) {
    throw new Error(
      "No hay ninguna card en la portada (ni en 'Hoy en Salta' ni en el resto de la grilla): " +
        "no se puede abrir ningún modal. Revisar si hay eventos cargados en el entorno contra " +
        "el que corre esta prueba."
    )
  }

  return card
}

// Toca la card dada y espera el diálogo (evento o flyer) visible.
async function abrirModalDesdeCard(page: Page, card: Locator): Promise<Locator> {
  await card.scrollIntoViewIfNeeded()
  await card.tap()

  const dialog = page.getByRole("dialog")
  await dialog.waitFor({ state: "visible", timeout: 20000 })
  return dialog
}

// Toca la X del diálogo y verifica las 3 condiciones del arreglo:
// el diálogo cerrado en menos de 500 ms, la URL en `/` y
// `history.state.__NA` presente en esa entrada.
async function tocarXYVerificarCierreRapido(page: Page, dialog: Locator): Promise<void> {
  const botonCerrar = dialog.getByRole("button", { name: /close|cerrar/i }).last()
  await expect(botonCerrar).toHaveCount(1)

  const t0 = Date.now()
  await botonCerrar.tap()

  // Poll corto: ¿cuándo desaparece el diálogo? (igual que repro-x.mjs,
  // pero acotado a 2 s porque lo que nos interesa es que sea < 500 ms).
  let cerradoEnMs: number | null = null
  while (Date.now() - t0 < 2000) {
    const visible = await dialog.isVisible().catch(() => false)
    if (!visible) {
      cerradoEnMs = Date.now() - t0
      break
    }
    await page.waitForTimeout(20)
  }

  expect(
    cerradoEnMs,
    "el diálogo debería cerrarse en menos de 500 ms desde el toque en la X " +
      "(si quedó abierto a los 2 s, es el bug de home-content.tsx antes de 30c6583)"
  ).not.toBeNull()
  expect(cerradoEnMs as number).toBeLessThan(500)

  const pathname = new URL(page.url()).pathname
  expect(pathname).toBe("/")

  const tieneNA = await page.evaluate(() => {
    const state = window.history.state as { __NA?: unknown } | null
    return Boolean(state && state.__NA)
  })
  expect(
    tieneNA,
    "history.state.__NA debería estar presente en la entrada '/' (si no, el popstate del " +
      "cierre no tiene con qué restaurar el árbol de Next)"
  ).toBe(true)
}

test.beforeAll(() => {
  if (!process.env.BASE_URL) {
    throw new Error(
      "Falta BASE_URL: esta prueba no corre contra producción por defecto. " +
        "Definí BASE_URL (preview de Vercel) antes de ejecutar `npm run e2e`. " +
        "Ver playwright.config.ts."
    )
  }
})

test.describe("Modal: la X vuelve a / sin dejar el diálogo abierto (18-f)", () => {
  test("caso: goto('/') directo, tocar una card de la portada y cerrar con la X", async ({
    page,
  }) => {
    await bloquearEscriturasYAnalitica(page)

    await page.goto("/")

    const card = await primeraCardDeLaPortada(page)
    const dialog = await abrirModalDesdeCard(page, card)
    await tocarXYVerificarCierreRapido(page, dialog)
  })

  test("control: llegar a / desde /buscar tocando 'Inicio' (navegación suave de Next) y cerrar con la X", async ({
    page,
  }) => {
    await bloquearEscriturasYAnalitica(page)

    await page.goto("/buscar")
    const inicio = page.getByRole("link", { name: "Inicio", exact: true })
    await inicio.tap()
    await page.waitForURL((url) => url.pathname === "/", { timeout: 20000 })

    const card = await primeraCardDeLaPortada(page)
    const dialog = await abrirModalDesdeCard(page, card)
    await tocarXYVerificarCierreRapido(page, dialog)
  })
})
