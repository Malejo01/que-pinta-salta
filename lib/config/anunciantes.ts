/**
 * Configuración de la página pública `/anunciantes` (QPS Ronda 20, tarea 20-a).
 *
 * `publicada` es el interruptor de indexación: mientras haya precios sin
 * completar (`precio: null` abajo, a propósito, por "no inventar datos") la
 * página sigue existiendo y respondiendo 200, pero no se indexa ni entra al
 * sitemap (ver app/anunciantes/page.tsx y app/sitemap.ts). Cuando Mauro fije
 * los precios reales, pasar esto a `true`.
 */
export interface PaqueteAnunciante {
  id: string
  nombre: string
  /** Qué incluye el paquete, en frases cortas. Solo cosas que el producto ya tiene hoy. */
  queIncluye: string[]
  /** En ARS, sin IVA/impuestos. `null` mientras no haya precio fijado: se muestra "Consultar". */
  precio: number | null
  /** Unidad del precio ("por evento", "por semana", etc.). `null` si `precio` es `null`. */
  periodo: string | null
  /** Resalta la tarjeta en la grilla de paquetes. */
  destacado?: boolean
}

export interface AnunciantesConfig {
  publicada: boolean
  paquetes: PaqueteAnunciante[]
}

export const ANUNCIANTES: AnunciantesConfig = {
  publicada: false,
  paquetes: [
    {
      id: "destacado",
      // [COMPLETAR: nombre comercial definitivo del paquete; "Evento destacado" es un nombre de trabajo]
      nombre: "Evento destacado",
      queIncluye: [
        "Tu evento como primera opción en la fila de su categoría en la portada.",
        "Un lugar en el carrusel principal (hero) de la portada, sujeto a disponibilidad.",
        "Rótulo de contenido patrocinado, igual que el resto de los destacados del sitio.",
        // [COMPLETAR: cuántos días de vigencia se venden por defecto (hoy el campo is_featured no tiene fecha de fin automática)]
      ],
      precio: null, // [COMPLETAR: precio en ARS]
      periodo: null, // [COMPLETAR: unidad del precio, p. ej. "por evento" o "por semana"]
      destacado: true,
    },
    {
      id: "radar",
      // [COMPLETAR: nombre comercial definitivo]
      nombre: "Presencia en el Radar",
      queIncluye: [
        "Tu evento entre los que se recomiendan a quienes siguen esa categoría o ese lugar en Mi Radar.",
        "Llega por el mail semanal, quincenal o mensual, según la frecuencia que haya elegido cada persona.",
      ],
      precio: null, // [COMPLETAR: precio en ARS]
      periodo: null, // [COMPLETAR: unidad del precio]
    },
    {
      id: "reporte",
      // [COMPLETAR: nombre comercial definitivo]
      nombre: "Reporte de vistas y clics",
      queIncluye: [
        "Cuántas veces se abrió la ficha de tu evento en el sitio.",
        "Cuántos clics se hicieron al botón de comprar entradas.",
        "Los números, no estimaciones ni proyecciones.",
      ],
      precio: null, // [COMPLETAR: precio en ARS]
      periodo: null, // [COMPLETAR: unidad del precio]
    },
  ],
}
