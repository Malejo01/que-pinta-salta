import { defineConfig, devices } from "@playwright/test"

// e2e de la tarea 18-f (paso 3): la X de los modales vuelve a `/` sin
// dejar el diálogo abierto. Reproducción previa en
// ops/rondas/18-imagenes-rendimiento/repro-x.mjs.
//
// `BASE_URL` viene solo por variable de entorno: no hay ningún valor por
// defecto que apunte a producción ni a ninguna preview. Si no está
// definida, `use.baseURL` queda `undefined`: Playwright no tiene cómo
// resolver una ruta relativa (`page.goto('/')`) y la corrida falla de
// entrada en vez de caer en algún sitio por accidente. Ver además el
// `test.beforeAll` de `e2e/modal-x.spec.ts`, que lo deja explícito con un
// mensaje claro antes de intentar navegar — ese chequeo no corre con
// `--list`, así que listar los tests nunca requiere `BASE_URL`.
const BASE_URL = process.env.BASE_URL

// Bypass de "Vercel Authentication" en las previews: sin este header se
// ve la pantalla de login en vez del sitio. Solo se agrega si la
// variable existe; el valor nunca se imprime ni se escribe en ningún
// archivo ni reporte.
const VERCEL_BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  // Reporte simple: sin reintentos silenciosos que oculten una falla
  // intermitente.
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    ...(VERCEL_BYPASS_SECRET
      ? {
          extraHTTPHeaders: {
            "x-vercel-protection-bypass": VERCEL_BYPASS_SECRET,
          },
        }
      : {}),
  },
  projects: [
    {
      name: "Pixel 7",
      use: { ...devices["Pixel 7"] },
    },
  ],
})
