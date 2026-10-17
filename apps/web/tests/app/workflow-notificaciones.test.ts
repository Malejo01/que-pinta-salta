/**
 * Detector de solo lectura sobre `.github/workflows/notificaciones.yml` (R39,
 * tarea 39-q), en el mismo espíritu que `tests/app/asset-links.test.ts`: lee
 * el archivo real del repo (nunca lo escribe) y chequea, sobre su TEXTO
 * (sin parser de YAML: ver la nota de abajo), tres cosas:
 *
 *   1. No tiene un `schedule` activo: el bloque está comentado a propósito,
 *      el workflow está apagado hasta que Mauro lo prenda (ver el comentario
 *      del propio archivo, encargo del 16/10).
 *   2. Llama a la ruta correcta, `/api/cron/notificaciones`.
 *   3. Manda el secreto por header `Authorization: Bearer`, nunca por query
 *      string.
 *
 * El detector (`tieneScheduleActivo`, etc., definidos acá abajo, no en
 * producción: son funciones de este archivo de test) tiene que resistir que
 * lo evadan. En las últimas nueve rondas seguidas apareció un detector nuevo
 * que se podía evadir, así que antes de darlo por bueno se armaron tres
 * variantes de YAML que DEBERÍAN hacerlo fallar (ver el describe de
 * "evasiones" más abajo) y se comprobó que efectivamente fallan:
 *
 *   - un `schedule:` activo escrito con otra indentación;
 *   - un `schedule` activo más abajo en el archivo (no en el primer bloque
 *     `on:` de arriba);
 *   - un `- cron:` descomentado dentro de un bloque que a primera vista
 *     parece comentado (la línea `schedule:` de arriba sí está comentada,
 *     pero la del `- cron:` no).
 *
 * Las tres pasan porque el detector no mira "el bloque que parece
 * comentado" como una unidad: evalúa LÍNEA POR LÍNEA si esa línea en
 * particular está comentada (`^\s*#`), y busca la clave `schedule:` o una
 * entrada `- cron:` activa en CUALQUIER línea del archivo, no solo en el
 * primer bloque `on:`.
 *
 * Lo que este enfoque de texto NO puede ver (a propósito: no se agrega un
 * parser de YAML sin el OK de Mauro):
 *   - un mapping "flow style" de una sola línea, p. ej.
 *     `on: { schedule: [{cron: "5 * * * *"}] }`: no hay línea que empiece
 *     con `schedule:` ni con `- cron:`, así que este detector no lo vería.
 *   - anchors/aliases de YAML (`<<: *algo`) que inyecten un `schedule` desde
 *     otro lado del archivo.
 *   - comentarios en bloque o directivas multi-documento (`---`): GitHub
 *     Actions no los usa en este repo, pero un YAML "legal" con eso
 *     tampoco se interpretaría bien acá.
 * Si algún día hace falta cubrir esos casos, hay que sumar un parser de YAML
 * (que no entra en los archivos permitidos de esta tarea) o pedirle a Mauro
 * el OK para la dependencia.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RUTA_WORKFLOW = fileURLToPath(new URL('../../../../.github/workflows/notificaciones.yml', import.meta.url))
const RUTA_CORRECTA = '/api/cron/notificaciones'

// ---------------------------------------------------------------------------
// El detector: funciones de este archivo de test, sobre el TEXTO del YAML.
// ---------------------------------------------------------------------------

/** Líneas del archivo que NO son un comentario (no empiezan, tras espacios, con "#"). */
function lineasActivas(yaml: string): string[] {
  return yaml.split('\n').filter((linea) => !/^\s*#/.test(linea))
}

/**
 * `true` si hay un `schedule` ACTIVO en cualquier parte del archivo: una
 * línea no comentada que es la clave `schedule:` (con cualquier indentación,
 * en cualquier lugar del archivo, no solo en el primer bloque `on:`), O una
 * línea no comentada con una entrada `- cron:` (que por sí sola, exista o no
 * una clave `schedule:` separada, ya es evidencia de un trigger de cron
 * activo — es exactamente el caso del "cron descomentado dentro de un
 * bloque que parece comentado").
 */
function tieneScheduleActivo(yaml: string): boolean {
  const activas = lineasActivas(yaml)
  const hayClaveSchedule = activas.some((linea) => /^\s*schedule\s*:/.test(linea))
  const hayEntradaCron = activas.some((linea) => /^\s*-\s*cron\s*:/.test(linea))
  return hayClaveSchedule || hayEntradaCron
}

/** `true` si alguna línea activa menciona la ruta correcta del cron. */
function llamaARutaCorrecta(yaml: string, ruta: string): boolean {
  return lineasActivas(yaml).some((linea) => linea.includes(ruta))
}

/** `true` si alguna línea activa manda el secreto por header `Authorization: Bearer`. */
function mandaElSecretoPorHeaderBearer(yaml: string): boolean {
  return lineasActivas(yaml).some((linea) => /Authorization:\s*Bearer\s+\$\{?CRON_SECRET\}?/.test(linea))
}

/**
 * `true` si el secreto (`$CRON_SECRET`) aparece metido en una URL de una
 * línea activa (query string), en vez de solo en un header. Cubre tanto
 * `?algo=$CRON_SECRET`/`&algo=$CRON_SECRET` como pegado directo a la URL
 * (`$SITE_URL...$CRON_SECRET` en la misma línea).
 */
function secretoEnQueryString(yaml: string): boolean {
  return lineasActivas(yaml).some((linea) => {
    if (!linea.includes('$CRON_SECRET') && !linea.includes('${CRON_SECRET}')) return false
    if (/Authorization:\s*Bearer/.test(linea)) return false // esa línea es justamente el header, no la URL
    return /[?&][a-zA-Z0-9_]*=\$\{?CRON_SECRET\}?/.test(linea) || /\$(SITE_URL|\{SITE_URL\})[^\n]*CRON_SECRET/.test(linea)
  })
}

// ---------------------------------------------------------------------------
// El archivo real
// ---------------------------------------------------------------------------

describe('.github/workflows/notificaciones.yml (solo lectura)', () => {
  const yaml = readFileSync(RUTA_WORKFLOW, 'utf8')

  it('no tiene un schedule activo: apagado a propósito hasta que Mauro lo prenda', () => {
    expect(tieneScheduleActivo(yaml)).toBe(false)
  })

  it('llama a la ruta correcta, /api/cron/notificaciones', () => {
    expect(llamaARutaCorrecta(yaml, RUTA_CORRECTA)).toBe(true)
  })

  it('manda el secreto por header Authorization: Bearer', () => {
    expect(mandaElSecretoPorHeaderBearer(yaml)).toBe(true)
  })

  it('el secreto nunca viaja en la URL (query string)', () => {
    expect(secretoEnQueryString(yaml)).toBe(false)
  })

  it('sigue usando workflow_dispatch (se puede disparar a mano mientras esté apagado el schedule)', () => {
    expect(lineasActivas(yaml).some((linea) => /^\s*workflow_dispatch\s*:/.test(linea))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Evasiones probadas contra el detector, antes de confiar en él (ver el
// comentario de arriba del archivo): las tres tienen que fallar la
// aserción "no tiene schedule activo", es decir, tieneScheduleActivo tiene
// que dar `true` para las tres.
// ---------------------------------------------------------------------------

describe('el detector resiste evasiones: estas tres variantes SÍ tienen que marcar schedule activo', () => {
  it('schedule activo con otra indentación (8 espacios en vez de 2)', () => {
    const variante = [
      'name: Notificaciones push',
      'on:',
      '        schedule:',
      '              - cron: "5 * * * *"',
      '  workflow_dispatch:',
    ].join('\n')

    expect(tieneScheduleActivo(variante)).toBe(true)
  })

  it('schedule activo más abajo en el archivo, no en el primer bloque `on:` de arriba', () => {
    const variante = [
      'name: Notificaciones push',
      'on:',
      '  # schedule:',
      '  #   - cron: "5 * * * *"',
      '  workflow_dispatch:',
      '',
      'jobs:',
      '  send:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: echo hola',
      '',
      '# agregado después, lejos del bloque on: de arriba',
      'schedule:',
      '  - cron: "0 * * * *"',
    ].join('\n')

    expect(tieneScheduleActivo(variante)).toBe(true)
  })

  it('un "- cron:" descomentado dentro de un bloque que a primera vista parece comentado', () => {
    const variante = [
      'name: Notificaciones push',
      'on:',
      '  # schedule:',
      '  - cron: "5 * * * *"', // esta línea NO tiene "#": está activa de verdad
      '  workflow_dispatch:',
    ].join('\n')

    expect(tieneScheduleActivo(variante)).toBe(true)
  })

  it('control: el archivo real (las dos líneas comentadas de punta a punta) no activa el detector', () => {
    const variante = [
      'name: Notificaciones push',
      'on:',
      '  # schedule:',
      '  #   - cron: "5 * * * *"',
      '  workflow_dispatch:',
    ].join('\n')

    expect(tieneScheduleActivo(variante)).toBe(false)
  })
})
