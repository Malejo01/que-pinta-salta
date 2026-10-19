/**
 * tests/anunciantes/publicita.test.ts (R50, tarea 50-d): verifica que
 * `/anunciantes` ("Publicitá tu evento") no promete nada que el producto no
 * tenga hoy y que el mail de contacto sale de `CONTACTO_EMAIL`
 * (`@qps/core/contacto`), nunca de un literal repetido en la página.
 *
 * Igual que `tests/asistencia/sin-me-interesa.test.ts`, `page.tsx` se lee
 * como texto (no se importa el módulo): así no hace falta levantar ningún
 * cliente de Supabase ni nada "vivo" para probar prosa y estructura.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ANUNCIANTES, type PaqueteAnunciante } from '@/lib/config/anunciantes'

// apps/web/tests/anunciantes -> apps/web/tests -> apps/web -> apps -> raíz del worktree
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

const RUTA_PAGINA = 'apps/web/app/anunciantes/page.tsx'
const RUTA_CONFIG = 'apps/web/lib/config/anunciantes.ts'

function leer(rutaRelativa: string): string {
  return readFileSync(ROOT + rutaRelativa, 'utf8')
}

const paginaFuente = leer(RUTA_PAGINA)
const configFuente = leer(RUTA_CONFIG)

function paquete(id: string): PaqueteAnunciante {
  const encontrado = ANUNCIANTES.paquetes.find((p) => p.id === id)
  if (!encontrado) throw new Error(`No existe el paquete "${id}" en ANUNCIANTES.paquetes`)
  return encontrado
}

describe('/anunciantes: mail de contacto desde CONTACTO_EMAIL, nunca un literal', () => {
  it('importa mailtoContacto y CONTACTO_EMAIL de @qps/core/contacto', () => {
    expect(paginaFuente).toMatch(/import\s*\{[^}]*mailtoContacto[^}]*\}\s*from\s*["']@qps\/core\/contacto["']/)
    expect(paginaFuente).toMatch(/import\s*\{[^}]*CONTACTO_EMAIL[^}]*\}\s*from\s*["']@qps\/core\/contacto["']/)
  })

  it('usa mailtoContacto para armar el link del botón de mail', () => {
    expect(paginaFuente).toMatch(/mailtoContacto\(/)
  })

  it('no contiene "@quepintasalta.com.ar" como literal (la única fuente es packages/core/src/contacto.ts)', () => {
    expect(paginaFuente).not.toContain('@quepintasalta.com.ar')
  })
})

describe('/anunciantes: título "Publicitá tu evento"', () => {
  it('el <h1> dice exactamente "Publicitá tu evento"', () => {
    const match = paginaFuente.match(/<h1[^>]*>([^<]*)<\/h1>/)
    expect(match).not.toBeNull()
    expect(match?.[1].trim()).toBe('Publicitá tu evento')
  })

  it('metadata.title incluye "Publicitá tu evento"', () => {
    const match = paginaFuente.match(/title:\s*["']([^"']*)["']/)
    expect(match).not.toBeNull()
    expect(match?.[1]).toContain('Publicitá tu evento')
  })
})

describe('/anunciantes: ningún paquete tiene un precio inventado', () => {
  it('todos los paquetes tienen precio y periodo en null (nunca un número ni un string de plata)', () => {
    expect(ANUNCIANTES.paquetes.length).toBeGreaterThan(0)
    for (const p of ANUNCIANTES.paquetes) {
      expect(p.precio).toBeNull()
      expect(p.periodo).toBeNull()
    }
  })

  it('cada paquete deja un [COMPLETAR: precio…] y un [COMPLETAR: …unidad del precio…] junto a precio/periodo', () => {
    // Una ocurrencia de cada marca por paquete: 3 paquetes hoy (destacado,
    // radar, reporte). Si se agrega o se saca un paquete, este número tiene
    // que moverse junto con ANUNCIANTES.paquetes.length.
    const precioCompletar = configFuente.match(/precio:\s*null,\s*\/\/\s*\[COMPLETAR: precio/g) ?? []
    const periodoCompletar = configFuente.match(/periodo:\s*null,\s*\/\/\s*\[COMPLETAR:[^\n]*unidad del precio/g) ?? []
    expect(precioCompletar.length).toBe(ANUNCIANTES.paquetes.length)
    expect(periodoCompletar.length).toBe(ANUNCIANTES.paquetes.length)
  })

  it('ningún texto visible (nombre ni queIncluye) contiene un monto en pesos ("$" seguido de un dígito)', () => {
    for (const p of ANUNCIANTES.paquetes) {
      for (const texto of [p.nombre, ...p.queIncluye]) {
        expect(texto).not.toMatch(/\$\s*\d/)
        expect(texto).not.toMatch(/\bARS\b/)
      }
    }
  })
})

describe('/anunciantes: publicada en false -> noindex, sin tocar esa lógica', () => {
  it('ANUNCIANTES.publicada sigue en false', () => {
    expect(ANUNCIANTES.publicada).toBe(false)
  })

  it('page.tsx condiciona robots a ANUNCIANTES.publicada (noindex mientras sea false)', () => {
    expect(paginaFuente).toMatch(
      /\.\.\.\(ANUNCIANTES\.publicada\s*\?\s*\{\}\s*:\s*\{\s*robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}\s*\}\)/,
    )
  })
})

describe('/anunciantes: el paquete "destacado" promete solo lo que existe hoy', () => {
  const destacado = paquete('destacado')
  const texto = destacado.queIncluye.join(' \n ')

  it('no promete "Patrocinado": la insignia real dice "Destacado"', () => {
    expect(texto).not.toMatch(/patrocinad/i)
  })

  it('promete la insignia "★ Destacado" en la tarjeta, la ficha y el Hero', () => {
    expect(texto).toMatch(/★ Destacado/)
    expect(texto).toMatch(/tarjeta/i)
    expect(texto).toMatch(/ficha/i)
    expect(texto).toMatch(/hero/i)
  })

  it('promete un lugar en el carrusel principal, sujeto a disponibilidad (6 cupos)', () => {
    expect(texto).toMatch(/carrusel principal/i)
    expect(texto).toMatch(/sujeto a disponibilidad/i)
    expect(texto).toMatch(/6 cupos/i)
  })

  it('promete ser primero en la fila de su categoría', () => {
    expect(texto).toMatch(/primero en la fila de su categoría/i)
  })

  it('incluye la salvedad del filtro "Hoy": ahí el orden por hora de inicio pisa el "destacados primero"', () => {
    expect(texto).toMatch(/"Hoy"/)
    expect(texto).toMatch(/hora de inicio/i)
  })

  it('promete la vigencia real (vence solo en la fecha elegida) y no un número de días inventado', () => {
    expect(texto).toMatch(/vigencia/i)
    expect(texto).toMatch(/vence solo/i)
    expect(texto).not.toMatch(/\[COMPLETAR/)
  })

  it('no deja ningún [COMPLETAR] en queIncluye (los únicos pendientes son precio y periodo)', () => {
    for (const item of destacado.queIncluye) {
      expect(item).not.toContain('[COMPLETAR')
    }
  })
})

describe('/anunciantes: el paquete de "Aviso patrocinado" (R51) no está, solo el comentario', () => {
  it('ANUNCIANTES.paquetes no tiene ningún paquete con id "aviso-patrocinado" ni nombre que diga "Aviso patrocinado"', () => {
    const porNombre = ANUNCIANTES.paquetes.find((p) => /aviso patrocinado/i.test(p.nombre))
    const porId = ANUNCIANTES.paquetes.find((p) => /aviso.?patrocinado/i.test(p.id))
    expect(porNombre).toBeUndefined()
    expect(porId).toBeUndefined()
  })

  it('el archivo de config deja el comentario que marca cuándo sumarlo (R51 en main)', () => {
    expect(configFuente).toMatch(/R51:.*Aviso patrocinado/)
    expect(configFuente).toMatch(/cuando la R51 esté en main/)
  })
})

describe('/anunciantes: "Cómo funciona" (3 pasos)', () => {
  it('tiene el título de la sección', () => {
    expect(paginaFuente).toContain('Cómo funciona')
  })

  it('menciona elegir el paquete y la fecha, el pago por transferencia o Mercado Pago, y que vence solo', () => {
    expect(paginaFuente).toMatch(/elegís el paquete y la fecha/i)
    expect(paginaFuente).toMatch(/transferencia o Mercado Pago/i)
    expect(paginaFuente).toMatch(/vence solo/i)
  })
})
