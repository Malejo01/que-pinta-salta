import { setWorkerUrl } from "maplibre-gl"

// La URL del worker de MapLibre, dicha a mano. MapLibre (6.x) la calcula
// desde su propio `import.meta.url`, pero Turbopack (`next build` y
// `next dev`) lo reemplaza por un `file:///…` del servidor: la URL queda
// vacía, `new Worker("")` carga el HTML de la página y el mapa no arranca
// («Worker failed to load» y el aviso «No pudimos cargar el mapa»).
//
// `new URL("<archivo del paquete>", import.meta.url)` es el patrón que
// Turbopack sí reconoce: copia el archivo como asset y deja su URL pública.
// Lo carga `mapa-diferido.tsx` con `import()` ANTES que `mapa-maplibre`, así
// que corre una sola vez y antes de crear el primer mapa; y como es el mismo
// módulo `maplibre-gl`, la configuración le llega al mapa.
setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href)
