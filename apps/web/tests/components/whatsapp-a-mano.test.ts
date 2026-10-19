// Tarea 57-q (QA, QPS-176): detector estático — ningún archivo de la web arma a mano un link de
// WhatsApp (api.whatsapp.com, wa.me/, whatsapp://), salvo las dos excepciones declaradas más
// abajo. Recorre apps/web/app, apps/web/components y apps/web/lib (sin node_modules ni .next); los
// .html de lib/scraper/debug-* quedan afuera solos por extensión (capturas viejas, QPS-006, no
// código). Sin red ni base: la verificación es sobre el código fuente del repo.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// apps/web/tests/components -> apps/web/tests -> apps/web
const ROOT = join(__dirname, '..', '..')

const PATRONES_WHATSAPP = ['api.whatsapp.com', 'wa.me/', 'whatsapp://']

/**
 * Sin comentarios de línea ni de bloque. El `(?<!:)` antes de `//` es a propósito: sin él, el
 * propio "https://" de un link real (wa.me/contacto.ts es justamente una de las excepciones)
 * quedaría recortado como si fuera un comentario, y el detector se quedaría ciego justo en el
 * código que tiene que poder seguir viendo.
 */
function sinComentarios(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(?<!:)\/\/.*$/gm, ' ')
}

/**
 * Sin comillas (simples, dobles ni backtick) ni "+" de concatenación (con los espacios que lo
 * rodean): así, `'https://api.' + 'whatsapp.com'` queda como `https://api.whatsapp.com` antes de
 * buscar, y una concatenación partida no esconde el literal.
 */
function normalizarParaBuscar(code: string): string {
  return sinComentarios(code)
    .replace(/['"`]/g, '')
    .replace(/\s*\+\s*/g, '')
}

/** Función pura que usan tanto los casos inventados como el recorrido real del repo. */
function patronesWhatsAppAMano(code: string): string[] {
  const normalizado = normalizarParaBuscar(code)
  return PATRONES_WHATSAPP.filter((patron) => normalizado.includes(patron))
}

// Evasiones conocidas que este método NO detecta (quedan declaradas a propósito, para que el
// límite se vea acá y no se descubra el día que el detector no agarre algo):
//   - una cadena armada con `String.fromCharCode(...)` (o escapes \uXXXX / \xXX) para los
//     caracteres de "wa.me" o "whatsapp.com": nunca aparece como literal de texto reconocible,
//     la normalización no ejecuta ni reconstruye código;
//   - una concatenación repartida en dos statements, con una variable intermedia
//     (`const a = 'wa.m'; /* ... */ const b = a + 'e/'`): cada statement se normaliza por
//     separado y ninguno de los dos ve el texto completo junto;
//   - un carácter invisible o de ancho cero insertado en medio del literal (p. ej.
//     'w​a.me/') rompe el `includes()` exacto aunque se vea igual en el editor;
//   - texto armado en runtime desde una fuente externa (una variable de entorno, una respuesta de
//     red) nunca aparece como literal en el código fuente, así que no hay nada que leer acá.

describe('patronesWhatsAppAMano (función pura)', () => {
  it('código limpio: no encuentra nada', () => {
    const code = `
      const texto = "Hola, contactanos por mail a contacto@de-prueba-inventado.test"
      export function saludoDePrueba() {
        return texto
      }
    `
    expect(patronesWhatsAppAMano(code)).toEqual([])
  })

  it('el literal dentro de un comentario de línea no cuenta: un comentario no es código', () => {
    const code = `
      // hace tiempo esto armaba un link a mano con api.whatsapp.com, ya no: ver PRUEBA-999
      export const notaDePrueba = "listo"
    `
    expect(patronesWhatsAppAMano(code)).toEqual([])
  })

  it('el literal dentro de un comentario de bloque tampoco cuenta', () => {
    const code = `
      /* referencia vieja, ya no se usa: https://wa.me/00000000000 (ticket de prueba INV-123) */
      export const otraNotaDePrueba = "listo"
    `
    expect(patronesWhatsAppAMano(code)).toEqual([])
  })

  it('el literal partido en una concatenación sí se detecta (normalizando comillas y "+")', () => {
    const code = `
      const baseDePrueba = 'https://api.' + 'whatsapp.com' + '/send'
      export function armarUrlDePrueba() {
        return baseDePrueba
      }
    `
    expect(patronesWhatsAppAMano(code)).toContain('api.whatsapp.com')
  })

  it('el literal dentro de un template literal se detecta', () => {
    const code = [
      "const numeroDePrueba = '123456'",
      'const urlDePrueba = `https://wa.me/${numeroDePrueba}?text=hola`',
      'export function abrirDePrueba() { return urlDePrueba }',
    ].join('\n')
    expect(patronesWhatsAppAMano(code)).toContain('wa.me/')
  })
})

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    if (nombre === 'node_modules' || nombre === '.next') return []
    const ruta = join(dir, nombre)
    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta]
  })
}

const rel = (ruta: string) => relative(ROOT, ruta).split(sep).join('/')

// Sólo .ts/.tsx: los .html de lib/scraper/debug-* (capturas viejas, QPS-006) quedan afuera solos,
// por extensión, sin necesidad de una lista de exclusión aparte.
const archivosDeCodigo = ['app', 'components', 'lib']
  .map((carpeta) => join(ROOT, carpeta))
  .flatMap(archivos)
  .filter((ruta) => /\.tsx?$/.test(ruta))

/**
 * Las dos únicas excepciones declaradas. Cada motivo está escrito para leerse como la razón real
 * de por qué ese archivo puede seguir armando el link a mano, no como un simple `skip`.
 */
const EXCEPCIONES: Record<string, string> = {
  'app/favoritos/favoritos-list.tsx':
    'El botón "Compartir agenda por WhatsApp" manda la agenda ENTERA en un solo mensaje con ' +
    'varios links (uno por evento guardado); el ShareButton comparte un solo evento, así que ' +
    'pasar este caso por el componente compartido perdería justo lo que hace útil a este botón. ' +
    'Es la recomendación del revisor de la R35, adoptada como decisión en el plan de la R57: ' +
    'QPS-176 y QPS-159 se cierran con esta nota, no con un cambio de código.',
  'lib/contacto.ts':
    'El wa.me que arma whatsappUrl() apunta al número de contacto comercial DE Qué Pinta Salta ' +
    '(CONTACT_WHATSAPP), no es compartir un evento: no hay "un solo evento" que pasarle a ningún ' +
    'componente compartido, así que no aplica el mismo argumento que en favoritos-list.tsx.',
}

describe('nadie arma un link de WhatsApp a mano, salvo las dos excepciones declaradas (QPS-176)', () => {
  it('ningún archivo fuera de las excepciones tiene api.whatsapp.com / wa.me/ / whatsapp://', () => {
    const hallazgos = archivosDeCodigo
      .map((ruta) => ({ ruta: rel(ruta), patrones: patronesWhatsAppAMano(readFileSync(ruta, 'utf8')) }))
      .filter((resultado) => resultado.patrones.length > 0 && !(resultado.ruta in EXCEPCIONES))

    expect(hallazgos).toEqual([])
  })

  it('las excepciones encontradas son exactamente las dos declaradas (una tercera es un hallazgo, no un caso para agregar)', () => {
    const conPatron = archivosDeCodigo
      .map((ruta) => rel(ruta))
      .filter((ruta) => patronesWhatsAppAMano(readFileSync(join(ROOT, ruta), 'utf8')).length > 0)
      .sort()

    expect(conPatron).toEqual(Object.keys(EXCEPCIONES).sort())
  })

  it.each(Object.entries(EXCEPCIONES))(
    'la excepción de %s sigue vigente: el archivo todavía contiene el patrón que la justifica',
    (ruta) => {
      const contenido = readFileSync(join(ROOT, ruta), 'utf8')
      // Si esto da 0, la excepción quedó como un permiso muerto (el botón o la función que la
      // justificaba ya no existe) y hay que sacarla del mapa en vez de dejarla ahí.
      expect(patronesWhatsAppAMano(contenido).length).toBeGreaterThan(0)
    }
  )
})
